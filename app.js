// Browser shell: DOM only. All planner logic lives in lib/planner.js and is unit tested.

import {
  MODS, COMMANDS, BARS, SLOT_PLAN, SLOT_ORDER, blankSlots, newCharacter, BASE_LABELS,
  actionLabel, bindingFor, autoPlace, toBindings, toMacroText, findPlacement, COMMAND_ART,
  availableAbilities, placedAbilityNames, placeAbility, applyBindings,
} from "./lib/planner.js";

const UNIT = 88;
const GAP = 12;
const STORE = "zerosprey-binds-v6";

const state = { board: null, boards: [], boardId: "zerosprey42", layer: "bare", classes: {}, profile: null };

// One layer on screen at a time. The bar plan is per layer, so the tabs double as a reminder of where
// each layer's slots live.
const LAYER_LABEL = { bare: "bare", shift: "Shift", ctrl: "Ctrl", ctrlshift: "Ctrl+Shift", alt: "Alt" };
const LAYER_HINT = {
  bare: "bar 1, slots 1 to 8",
  shift: "bar 1 slots 9 to 12 and bar 2 slots 1 to 4",
  ctrl: "bar 2, slots 5 to 12",
  ctrlshift: "bar 3 slots 9 to 12 and bar 4 slots 1 to 4",
  alt: "mounts, food, potions and other items",
};
// Blizzard's vehicle UI only carries a pitch-up and a pitch-down button, so the strafe arrows are
// quarter turns of the pitch-up tile. The pitch-down texture is the button's down-facing state.
const MOVEMENT_ICONS = {
  "↑": { file: "pitch-up.png", rotation: 0 },
  "←": { file: "pitch-up.png", rotation: -90 },
  "→": { file: "pitch-up.png", rotation: 90 },
  "↓": { file: "pitch-down.png", rotation: 0 },
};
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
  if (action.k === "cmd") {
    const art = COMMAND_ART[action.binding];
    if (art) return `assets/wow/panels/${art}.png`;
  }
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
  const shipped = await shippedProfile();
  if (stored?.characters?.length && placedCount(stored) > 0) {
    // New shipped characters (a class added since this profile was saved) join the saved list
    // without touching the characters already there. Same for their macros.
    if (shipped) {
      let changed = false;
      const ids = new Set(stored.characters.map((character) => character.id));
      for (const character of shipped.characters) {
        if (ids.has(character.id)) continue;
        stored.characters.push(character);
        changed = true;
      }
      const macroIds = new Set((stored.macros ?? []).map((macro) => macro.id));
      for (const macro of shipped.macros ?? []) {
        if (macroIds.has(macro.id)) continue;
        (stored.macros ??= []).push(macro);
        changed = true;
      }
      if (changed) localStorage.setItem(STORE, JSON.stringify(stored));
    }
    return stored;
  }
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
    renderTray();
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

function renderLayers() {
  const box = el("layers");
  box.innerHTML = "";
  const character = active();
  for (const mod of MODS) {
    const count = Object.values(character.slots).filter((slots) => slots[mod.id]).length;
    const button = document.createElement("button");
    button.dataset.layer = mod.id;
    button.className = mod.id === state.layer ? "on" : "";
    button.append(LAYER_LABEL[mod.id]);
    const badge = document.createElement("span");
    badge.className = "count";
    badge.textContent = String(count);
    button.append(badge);
    button.title = LAYER_HINT[mod.id];
    button.onclick = () => {
      state.layer = mod.id;
      renderBoard();
    };
    box.append(button);
  }
}

function renderBoard() {
  renderLayers();
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
    const slots =
      character.slots[key.legend] ?? { bare: null, shift: null, ctrl: null, alt: null, ctrlshift: null };
    const action = slots[state.layer];
    const cap = document.createElement("button");
    cap.type = "button";
    cap.className =
      "key" + (MODS.some((m) => slots[m.id]) ? " assigned" : "") + (key.rot ? " tilted" : "");
    cap.style.left = `${key.x * UNIT}px`;
    cap.style.top = `${key.y * UNIT}px`;
    cap.style.width = `${key.w * UNIT - GAP}px`;
    cap.style.height = `${UNIT - GAP}px`;
    cap.tabIndex = 0;
    cap.style.setProperty("--rot", `${key.rot ?? 0}deg`);
    if (key.rot) {
      cap.style.transform = `rotate(${key.rot}deg)`;
      if (key.ox !== undefined) cap.style.transformOrigin = `${key.ox * UNIT}px ${key.oy * UNIT}px`;
    }
    const body = document.createElement("div");
    body.className = "body";

    const legend = document.createElement("div");
    legend.className = "legend";
    legend.textContent = key.legend;

    const primary = document.createElement("div");
    const base = state.layer === "bare" ? BASE_LABELS[key.legend] : null;
    const icon = actionIcon(action);
    primary.className =
      "primary" + (action ? (icon ? (action.k === "cmd" ? " art" : "") : " no-icon") : base ? " base" : " empty");
    if (action) {
      if (icon) {
        const img = document.createElement("img");
        img.src = icon;
        img.alt = "";
        img.width = 64;
        img.height = 64;
        img.onerror = () => img.remove();
        primary.append(img);
      }
      const name = document.createElement("span");
      name.textContent = actionLabel(action, state.profile.macros);
      primary.append(name);
    } else if (base) {
      // Movement keys have no spell icon: draw their arrow big and name them underneath.
      const glyph = document.createElement("div");
      glyph.className = "glyph";
      const movementIcon = MOVEMENT_ICONS[base.glyph];
      if (movementIcon) {
        const image = document.createElement("img");
        image.className = "movement-icon";
        image.src = `assets/wow/vehicle/${movementIcon.file}`;
        image.alt = base.label;
        image.width = 64;
        image.height = 64;
        image.style.transform = movementIcon.rotation ? `rotate(${movementIcon.rotation}deg)` : "none";
        glyph.append(image);
      } else {
        glyph.textContent = base.glyph;
      }
      primary.append(glyph);
      const name = document.createElement("span");
      name.textContent = base.label;
      primary.append(name);
    } else if (key.legend.length > 3) {
      // Named keys (LGui, MO(1), Space, Tab) read better in the middle than as an "empty" key with
      // their name in the corner, and a turned key clips that corner anyway.
      primary.textContent = key.legend;
      cap.classList.add("named");
    } else {
      primary.textContent = "empty";
    }
    primary.title = `${key.legend} · ${LAYER_LABEL[state.layer]}: ${
      action ? actionLabel(action, state.profile.macros) : base?.label ?? "empty"
    }`;
    primary.setAttribute("aria-label", primary.title);

    // Drag and drop: a tile from the tray lands on the key under the pointer, filling the slot the
    // layer on screen would, so a drop and a click do the same thing.
    const plan = SLOT_PLAN[`${state.layer}:${key.legend}`];
    cap.dataset.legend = key.legend;
    cap.dataset.layer = state.layer;
    if (plan) cap.classList.add("droppable");
    cap.ondragover = (event) => {
      if (!plan) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      cap.classList.add("over");
    };
    cap.ondragleave = () => cap.classList.remove("over");
    cap.ondrop = (event) => {
      if (!plan) return;
      event.preventDefault();
      cap.classList.remove("over");
      const dropped = (state.classes[character.class]?.abilities ?? [])
        .find((entry) => entry.name === event.dataTransfer.getData("text/plain"));
      if (!dropped || !placeAbility(character, key.legend, state.layer, dropped)) return;
      save();
      renderBoard();
      renderPlan();
      renderTray();
    };
    cap.onclick = (event) => openPalette(event, key.legend, state.layer);
    body.append(primary);

    // One dot per layer, filled where that layer has something. The board shows the selected layer;
    // the dots are how you see at a glance what is hiding underneath it.
    const dots = document.createElement("div");
    dots.className = "dots";
    for (const mod of MODS) {
      const dot = document.createElement("span");
      dot.className =
        "dot" + (slots[mod.id] ? " on" : "") + (mod.id === state.layer ? " current" : "");
      dot.title = `${LAYER_LABEL[mod.id]}: ${
        slots[mod.id] ? actionLabel(slots[mod.id], state.profile.macros) : "empty"
      }`;
      dots.append(dot);
    }
    body.append(dots);
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
  // Read the inline box, not offsetWidth: the first fit can run before the browser has flushed the
  // width set in renderBoard, which would scale the board from its 1120px CSS fallback and clip it.
  const width = parseFloat(board.style.width) || board.offsetWidth || 1;
  const height = parseFloat(board.style.height) || board.offsetHeight || 1;
  // Keep the keyboard readable on narrow screens. The stage scrolls horizontally
  // instead of shrinking every key below a usable size.
  const minimumScale = window.matchMedia("(max-width: 900px)").matches ? 0.65 : 0;
  const scale = Math.min(1, Math.max(minimumScale, available / width));
  board.style.transform = `scale(${scale})`;
  fit.style.width = `${width * scale}px`;
  fit.style.height = `${height * scale}px`;
}

// ---------- tray ----------

// Every ability the class teaches sits under the board as an icon, available ones first and used ones
// after, marked with the key that holds them. Dragging one onto a key moves the spell there: it stops
// being available and the key shows it. Nothing is ever on two keys, so a drag also swaps a spell.
function renderTray() {
  const tray = el("tray");
  const grid = el("tray-grid");
  if (!tray || !grid) return;
  const character = active();
  const abilities = state.classes[character.class]?.abilities ?? [];
  tray.hidden = abilities.length === 0;
  if (!abilities.length) return;

  const rows = abilities
    .map((ability) => ({ ability, where: findPlacement(character, ability.name) }))
    .sort((a, b) => Number(Boolean(a.where)) - Number(Boolean(b.where)) || a.ability.level - b.ability.level);
  const used = rows.filter((row) => row.where).length;
  el("tray-count").textContent =
    `${used} of ${rows.length} on the board · ${rows.length - used} available · drag an icon onto a key`;

  grid.innerHTML = "";
  for (const { ability, where } of rows) {
    const trainable = ability.level <= character.level;
    const tile = document.createElement("button");
    tile.type = "button";
    tile.className = "tray-tile" + (where ? " used" : "") + (trainable ? "" : " later");
    tile.dataset.ability = ability.name;
    tile.draggable = trainable;
    tile.title = where
      ? `${ability.name} · on ${where} · drag to move it`
      : trainable
        ? `${ability.name} · drag onto a key`
        : `${ability.name} · trains at ${ability.level}`;
    if (ability.icon) {
      const img = document.createElement("img");
      img.src = `assets/icons/${ability.icon}.jpg`;
      img.alt = "";
      img.onerror = () => img.remove();
      tile.append(img);
    }
    const name = document.createElement("span");
    name.className = "name";
    name.textContent = ability.name;
    tile.append(name);
    const badge = document.createElement("span");
    badge.className = "badge";
    badge.textContent = where ?? (trainable ? "" : String(ability.level));
    if (badge.textContent) tile.append(badge);
    tile.ondragstart = (event) => {
      if (!trainable) {
        event.preventDefault();
        return;
      }
      event.dataTransfer.setData("text/plain", ability.name);
      event.dataTransfer.effectAllowed = "move";
      tile.classList.add("dragging");
      el("board").classList.add("dropping");
    };
    tile.ondragend = () => {
      tile.classList.remove("dragging");
      el("board").classList.remove("dropping");
      for (const key of document.querySelectorAll(".key.over")) key.classList.remove("over");
    };
    grid.append(tile);
  }
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
  heading(`${legend} · ${modId === "bare" ? "no modifier" : LAYER_LABEL[modId]}`);

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
        placeAbility(character, legend, modId, ability);
        save();
        palette.hidden = true;
        renderBoard();
        renderPlan();
        renderTray();
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
    renderTray();
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
  const levelInput = el("plan-level");
  levelInput.value = character.level;
  levelInput.onchange = () => {
    character.level = Number(levelInput.value) || 1;
    save();
    renderChars();
    renderBoard();
    renderPlan();
    renderTray();
    renderExport();
  };
  select.onchange = () => {
    if (select.value === character.class) return;
    if (!confirm(`Change ${character.name} to ${select.value}? The spells on their keys are cleared.`)) {
      renderPlan();
      return;
    }
    // A character's spells belong to its class; the commands and the key layout stay.
    character.class = select.value;
    for (const slots of Object.values(character.slots)) {
      for (const mod of MODS) if (slots[mod.id]?.k === "bar") slots[mod.id] = null;
    }
    save();
    renderBoard();
    renderPlan();
    renderTray();
    renderExport();
  };

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
  renderTray();
}

function clearPlaces() {
  const character = active();
  for (const slots of Object.values(character.slots)) {
    for (const mod of MODS) if (slots[mod.id]?.ability) slots[mod.id] = null;
  }
  save();
  renderBoard();
  renderPlan();
  renderTray();
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
  const [index, board, classIndex] = await Promise.all([
    fetch("assets/boards/index.json", { cache: "no-store" }).then((r) => r.json()),
    fetch("assets/board.json", { cache: "no-store" }).then((r) => r.json()),
    fetch("assets/classes/index.json")
      .then((r) => r.json())
      .catch(() => ({ classes: ["hunter"] })),
  ]);
  const classFiles = await Promise.all(
    (classIndex.classes ?? ["hunter"]).map((name) =>
      fetch(`assets/classes/${name}.json`)
        .then((r) => r.json())
        .catch(() => null),
    ),
  );
  state.boards = index.boards;
  state.board = board;
  state.classes = Object.fromEntries(classFiles.filter(Boolean).map((klass) => [klass.class, klass]));
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
  el("io-bindings").onchange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const result = applyBindings(active(), state.board, await file.text());
    save();
    renderBoard();
    renderPlan();
    renderTray();
    renderExport();
    const skipped = result.unknownKeys.length
      ? `, ${result.unknownKeys.length} key(s) not on this board`
      : "";
    el("io-status").textContent = `${result.applied} bind(s) read onto ${active().name}${skipped}.`;
    event.target.value = "";
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
  renderTray();
  renderMacros();
  renderExport();
}

boot();
