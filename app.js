// Browser shell: DOM only. All planner logic lives in lib/planner.js and is unit tested.

import {
  MODS, COMMANDS, BARS, SLOT_PLAN, SLOT_ORDER, blankSlots, newCharacter, BASE_LABELS,
  actionLabel, bindingFor, autoPlace, toBindings, toMacroText, findPlacement,
} from "./lib/planner.js";

const UNIT = 88;
const GAP = 12;
const STORE = "zerosprey-binds-v4";

const state = { board: null, boards: [], boardId: "zerosprey42", classes: {}, profile: null };
const el = (id) => document.getElementById(id);
const newId = () => Math.random().toString(36).slice(2, 9);

const active = () => state.profile.characters.find((c) => c.id === state.profile.active);

// Every board is a plain JSON file listed in assets/boards/index.json; the default one is the
// keyboard's own PCB layout.
async function loadBoard(id) {
  const entry = state.boards.find((board) => board.id === id) ?? state.boards[0];
  state.board = await fetch(entry.file, { cache: "no-store" }).then((response) => response.json());
  state.boardId = entry.id;
  return state.board;
}
const save = () => localStorage.setItem(STORE, JSON.stringify(state.profile));

function actionIcon(action) {
  if (!action) return null;
  if (action.icon) return `assets/icons/${action.icon}.jpg`;
  if (action.k === "macro") {
    const macro = state.profile.macros.find((m) => m.id === action.id);
    return macro?.icon ? `assets/icons/${macro.icon}.jpg` : null;
  }
  return null;
}

const placedCount = (profile) =>
  (profile?.characters ?? []).reduce(
    (total, character) =>
      total +
      Object.values(character.slots ?? {}).reduce(
        (count, slots) => count + Object.values(slots).filter(Boolean).length,
        0,
      ),
    0,
  );

async function shippedProfile() {
  try {
    const response = await fetch("assets/profiles/barry.json", { cache: "no-store" });
    if (!response.ok) return null;
    const profile = await response.json();
    return profile?.characters?.length ? profile : null;
  } catch {
    return null;
  }
}

// A stored profile that binds nothing is never what someone meant to keep: it is the mark of a load
// that failed once, so the shipped profile wins and the empty one is not saved back.
async function load() {
  const raw = localStorage.getItem(STORE);
  let stored = null;
  if (raw) {
    try {
      stored = JSON.parse(raw);
    } catch {
      stored = null;
    }
  }
  if (stored?.characters?.length && placedCount(stored) > 0) return stored;
  const shipped = await shippedProfile();
  if (shipped) return shipped;
  if (stored?.characters?.length) return stored;
  const character = newCharacter(state.board, "Barry Buckfast", "hunter", 60);
  return { characters: [character], macros: [], active: character.id };
}

// ---------- characters ----------

function renderChars() {
  const box = el("chars");
  box.innerHTML = "";
  for (const character of state.profile.characters) {
    const pill = document.createElement("button");
    pill.textContent = character.name;
    if (character.id === state.profile.active) pill.classList.add("on");
    pill.onclick = () => {
      state.profile.active = character.id;
      save();
      renderAll();
    };
    box.append(pill);
  }
  const reset = document.createElement("button");
  reset.className = "add";
  reset.textContent = "reset";
  reset.title = "Load the shipped hunter profile";
  reset.onclick = async () => {
    const shipped = await shippedProfile();
    if (!shipped) return alert("The shipped profile could not be loaded.");
    state.profile = shipped;
    await loadBoard(state.profile.board ?? "zerosprey42");
    save();
    renderAll();
  };
  box.append(reset);

  const add = document.createElement("button");
  add.className = "add";
  add.textContent = "+ character";
  add.onclick = () => {
    const name = prompt("Name");
    if (!name) return;
    const klass = (prompt("Class", "hunter") || "hunter").toLowerCase();
    const character = newCharacter(state.board, name, klass, 1);
    state.profile.characters.push(character);
    state.profile.active = character.id;
    save();
    renderAll();
  };
  box.append(add);

  const label = document.createElement("label");
  label.textContent = "level";
  const input = document.createElement("input");
  input.type = "number";
  input.min = "1";
  input.max = "60";
  input.value = active().level;
  input.onchange = () => {
    active().level = Number(input.value) || 1;
    save();
    renderPlan();
  };
  label.append(input);
  box.append(label);

  const keyboard = document.createElement("label");
  keyboard.textContent = "keyboard";
  const select = document.createElement("select");
  select.className = "board-pick";
  for (const board of state.boards) {
    const option = document.createElement("option");
    option.value = board.id;
    option.textContent = `${board.name} (${board.keys})`;
    option.selected = board.id === state.boardId;
    select.append(option);
  }
  select.onchange = async () => {
    await loadBoard(select.value);
    state.profile.board = state.boardId;
    save();
    renderAll();
  };
  keyboard.append(select);
  box.append(keyboard);
}

// ---------- board ----------

function renderBoard() {
  const board = el("board");
  board.innerHTML = "";
  const character = active();
  // board.json carries the box, including the room rotated keycaps need at the edges.
  const right = (state.board.width ?? Math.max(...state.board.keys.map((k) => (k.x + (k.w ?? 1)) * UNIT))) * UNIT;
  const bottom = (state.board.height ?? Math.max(...state.board.keys.map((k) => k.y * UNIT + UNIT))) * UNIT;
  board.style.width = `${right}px`;
  board.style.height = `${bottom}px`;

  // The board is laid out at its own scale, then fitted once the keys exist.
  for (const key of state.board.keys) {
    const slots = character.slots[key.legend] ?? { bare: null, shift: null, ctrl: null, alt: null };
    const cap = document.createElement("div");
    cap.className =
      "key" + (MODS.some((m) => slots[m.id]) ? " assigned" : "") + (key.rot ? " tilted" : "");
    cap.style.left = `${key.x * UNIT}px`;
    cap.style.top = `${key.y * UNIT}px`;
    cap.style.width = `${key.w * UNIT - GAP}px`;
    cap.style.height = `${UNIT - GAP}px`;
    cap.style.setProperty("--rot", `${key.rot ?? 0}deg`);
    if (key.rot) cap.style.transform = `rotate(${key.rot}deg)`;
    // The keycap turns with the board, the writing on it does not: keep the label and icons upright.
    const body = document.createElement("div");
    body.className = "body";

    const legend = document.createElement("div");
    legend.className = "legend";
    legend.textContent = key.legend;

    const primary = document.createElement("div");
    const base = BASE_LABELS[key.legend];
    primary.className = "primary" + (slots.bare ? "" : base ? " base" : " empty");
    if (slots.bare) {
      const icon = actionIcon(slots.bare);
      if (icon) {
        const img = document.createElement("img");
        img.src = icon;
        img.alt = "";
        img.onerror = () => img.remove();
        primary.append(img);
      }
      const name = document.createElement("span");
      name.textContent = actionLabel(slots.bare, state.profile.macros);
      primary.append(name);
    } else if (!base && key.legend.length > 3) {
      // Named keys (Super, Lower, Space, Tab) read better in the middle than as an "empty" key with
      // their name in the corner, and a turned key clips that corner anyway.
      primary.textContent = key.legend;
      cap.classList.add("named");
    } else {
      primary.textContent = base ?? "empty";
    }
    primary.title = slots.bare
      ? `${key.legend}: ${actionLabel(slots.bare, state.profile.macros)}`
      : `${key.legend}: ${base ?? "empty"}`;
    primary.onclick = (event) => {
      event.stopPropagation();
      openPalette(event, key.legend, "bare");
    };
    body.append(primary);

    const mods = document.createElement("div");
    mods.className = "mods";
    for (const mod of MODS.slice(1)) {
      const action = slots[mod.id];
      const chip = document.createElement("div");
      chip.className = "mod" + (action ? " has" : "");
      const mini = action ? actionIcon(action) : null;
      if (mini) {
        const img = document.createElement("img");
        img.src = mini;
        img.alt = "";
        img.onerror = () => {
          img.remove();
          chip.textContent = mod.label;
        };
        chip.append(img);
      } else {
        chip.textContent = action ? mod.label : "·";
      }
      chip.title = `${mod.id}: ${action ? actionLabel(action, state.profile.macros) : "empty"}`;
      chip.onclick = (event) => {
        event.stopPropagation();
        openPalette(event, key.legend, mod.id);
      };
      mods.append(chip);
    }
    body.append(mods);
    body.append(legend);
    cap.append(body);
    board.append(cap);
  }
  fitBoard();
}

function fitBoard() {
  const board = el("board");
  const fit = el("fit");
  const stage = fit?.parentElement;
  if (!board || !fit || !stage) return;
  const style = getComputedStyle(stage);
  const padding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
  const available = stage.clientWidth - padding;
  if (available <= 0) return; // the tab is hidden; fit again when it is shown
  const width = board.offsetWidth || 1;
  const height = board.offsetHeight || 1;
  const scale = Math.min(1, available / width);
  board.style.transform = `scale(${scale})`;
  fit.style.width = `${width * scale}px`;
  fit.style.height = `${height * scale}px`;
}

// ---------- palette ----------

function openPalette(event, legend, modId) {
  const palette = el("palette");
  const character = active();
  const plan = SLOT_PLAN[`${modId}:${legend}`];
  palette.innerHTML = "";

  const heading = (text) => {
    const node = document.createElement("h3");
    node.textContent = text;
    palette.append(node);
    return node;
  };
  heading(`${legend} · ${modId === "bare" ? "no modifier" : modId}`);

  const abilities = state.classes[character.class]?.abilities ?? [];
  if (abilities.length) {
    heading(plan ? `spells · this key drives ${BARS[plan.bar].label} ${plan.slot}` : "spells · no slot on this key");
    const grid = document.createElement("div");
    grid.className = "grid";
    for (const ability of abilities) {
      const button = document.createElement("button");
      if (ability.icon) {
        const img = document.createElement("img");
        img.src = `assets/icons/${ability.icon}.jpg`;
        img.alt = "";
        img.onerror = () => img.remove();
        button.append(img);
      }
      const text = document.createElement("span");
      text.textContent = ability.name;
      button.append(text);
      if (!plan) {
        button.disabled = true;
        button.title = "This key has no bar slot: give it a command or a macro instead.";
      }
      button.onclick = () => {
        if (!plan) return;
        character.slots[legend][modId] = {
          k: "bar", bar: plan.bar, slot: plan.slot, ability: ability.name, icon: ability.icon,
        };
        save();
        palette.hidden = true;
        renderBoard();
        renderPlan();
      };
      grid.append(button);
    }
    palette.append(grid);
  }

  for (const bar of [1, 2, 3]) {
    heading(BARS[bar].label);
    const grid = document.createElement("div");
    grid.className = "grid";
    for (let slot = 1; slot <= 12; slot += 1) {
      const button = document.createElement("button");
      button.textContent = `slot ${slot}`;
      button.onclick = () => {
        character.slots[legend][modId] = { k: "bar", bar, slot };
        save();
        palette.hidden = true;
        renderBoard();
        renderPlan();
      };
      grid.append(button);
    }
    palette.append(grid);
  }

  heading("commands");
  const commandGrid = document.createElement("div");
  commandGrid.className = "grid";
  for (const [binding, label] of COMMANDS) {
    const button = document.createElement("button");
    button.textContent = label;
    button.onclick = () => {
      character.slots[legend][modId] = { k: "cmd", binding, label };
      save();
      palette.hidden = true;
      renderBoard();
    };
    commandGrid.append(button);
  }
  palette.append(commandGrid);

  if (state.profile.macros.length) {
    heading("macros");
    const grid = document.createElement("div");
    grid.className = "grid";
    for (const macro of state.profile.macros) {
      const button = document.createElement("button");
      button.textContent = macro.name;
      button.onclick = () => {
        character.slots[legend][modId] = { k: "macro", id: macro.id };
        save();
        palette.hidden = true;
        renderBoard();
      };
      grid.append(button);
    }
    palette.append(grid);
  }

  heading(" ");
  const clearGrid = document.createElement("div");
  clearGrid.className = "grid";
  const clear = document.createElement("button");
  clear.className = "clear";
  clear.textContent = "clear this key";
  clear.onclick = () => {
    character.slots[legend][modId] = null;
    save();
    palette.hidden = true;
    renderBoard();
    renderPlan();
  };
  clearGrid.append(clear);
  palette.append(clearGrid);

  palette.hidden = false;
  const rect = event.currentTarget.getBoundingClientRect();
  const left = Math.min(rect.left + window.scrollX, window.innerWidth - 450);
  const below = rect.bottom + window.scrollY + 8;
  palette.style.left = `${Math.max(12, left)}px`;
  palette.style.top =
    below + 460 > window.scrollY + window.innerHeight
      ? `${Math.max(12, rect.top + window.scrollY - 470)}px`
      : `${below}px`;
}

// ---------- level plan ----------

function renderPlan() {
  const character = active();
  const select = el("plan-class");
  select.innerHTML = "";
  for (const name of Object.keys(state.classes)) {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    option.selected = name === character.class;
    select.append(option);
  }
  el("plan-level").value = character.level;

  const list = el("plan-list");
  list.innerHTML = "";
  const abilities = (state.classes[character.class]?.abilities ?? [])
    .slice()
    .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
  if (!abilities.length) {
    list.innerHTML = '<p class="hint">No abilities for this class yet.</p>';
    return;
  }
  for (const ability of abilities) {
    const where = findPlacement(character, ability.name);
    const row = document.createElement("div");
    row.className = "plan-row" + (ability.level <= character.level ? " known" : "");
    if (ability.level <= character.level && !where) row.classList.add("unplaced");
    if (ability.icon) {
      const img = document.createElement("img");
      img.src = `assets/icons/${ability.icon}.jpg`;
      img.alt = "";
      img.onerror = () => img.remove();
      row.append(img);
    } else {
      row.append(document.createElement("span"));
    }
    const level = document.createElement("span");
    level.className = "lvl";
    level.textContent = ability.level;
    const name = document.createElement("span");
    name.textContent = ability.name;
    const place = document.createElement("span");
    place.className = "where";
    place.textContent = where ?? (ability.level <= character.level ? "not placed" : "not yet");
    row.append(level, name, place);
    list.append(row);
  }
}

function autoPlaceAll() {
  const character = active();
  autoPlace(character, state.classes[character.class]?.abilities ?? []);
  save();
  renderBoard();
  renderPlan();
}

function clearPlaces() {
  const character = active();
  for (const slots of Object.values(character.slots)) {
    for (const mod of MODS) if (slots[mod.id]?.ability) slots[mod.id] = null;
  }
  save();
  renderBoard();
  renderPlan();
}

// ---------- macros ----------

function renderMacros() {
  const list = el("macro-list");
  list.innerHTML = "";
  for (const macro of state.profile.macros) {
    const item = document.createElement("li");
    const remove = document.createElement("button");
    remove.textContent = "delete";
    remove.onclick = () => {
      state.profile.macros = state.profile.macros.filter((m) => m.id !== macro.id);
      save();
      renderMacros();
      renderBoard();
    };
    const name = document.createElement("div");
    name.className = "name";
    name.textContent = `${macro.name} · ${macro.icon}`;
    const body = document.createElement("pre");
    body.textContent = macro.body;
    item.append(remove, name, body);
    list.append(item);
  }
}

function addMacro() {
  const name = el("macro-name").value.trim();
  const icon = el("macro-icon").value.trim() || "inv_misc_questionmark";
  const body = el("macro-body").value;
  if (!name || !body.trim()) return;
  state.profile.macros.push({ id: newId(), name, icon, body });
  el("macro-name").value = "";
  el("macro-icon").value = "";
  el("macro-body").value = "";
  save();
  renderMacros();
}

// ---------- export ----------

function renderExport() {
  el("out-bindings").textContent = toBindings(active(), state.board);
  el("out-macros").textContent = toMacroText(state.profile);
}

// ---------- boot ----------

async function boot() {
  const [index, board, hunter] = await Promise.all([
    fetch("assets/boards/index.json").then((r) => r.json()),
    fetch("assets/board.json").then((r) => r.json()),
    fetch("assets/classes/hunter.json").then((r) => r.json()).catch(() => null),
  ]);
  state.boards = index.boards;
  state.board = board;
  state.classes = hunter ? { hunter } : {};
  state.profile = await load();
  state.profile.board ??= "zerosprey42";
  if (state.profile.board !== "zerosprey42") await loadBoard(state.profile.board);
  save();
  renderAll();

  for (const button of document.querySelectorAll(".tabs button")) {
    button.onclick = () => {
      for (const other of document.querySelectorAll(".tabs button")) other.classList.remove("on");
      button.classList.add("on");
      for (const id of ["binds", "plan", "macros", "export"]) {
        el(`tab-${id}`).hidden = id !== button.dataset.tab;
      }
      if (button.dataset.tab === "binds") requestAnimationFrame(fitBoard);
      if (button.dataset.tab === "export") renderExport();
      if (button.dataset.tab === "plan") renderPlan();
      if (button.dataset.tab === "macros") renderMacros();
    };
  }

  el("plan-auto").onclick = autoPlaceAll;
  el("plan-clear").onclick = clearPlaces;
  el("macro-add").onclick = addMacro;

  el("io-save").onclick = () => {
    const blob = new Blob([JSON.stringify(state.profile, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "zerosprey-binds.json";
    link.click();
  };
  el("io-file").onchange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    state.profile = JSON.parse(await file.text());
    state.profile.board ??= "zerosprey42";
    await loadBoard(state.profile.board);
    save();
    renderAll();
  };

  window.addEventListener("resize", fitBoard);

  document.addEventListener("click", (event) => {
    const palette = el("palette");
    if (palette.hidden) return;
    if (palette.contains(event.target) || event.target.closest(".key")) return;
    palette.hidden = true;
  });
}

function renderAll() {
  const boardName = state.board?.name ?? "Zerosprey42";
  el("board-name").textContent = boardName;
  document.title = `${boardName} · WoW binds`;
  renderChars();
  renderBoard();
  renderPlan();
  renderMacros();
  renderExport();
}

boot();
