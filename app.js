// Zerosprey42 bind planner. No build step, no dependencies: open index.html or serve the folder.

const UNIT = 88;
const GAP = 6;

const MODS = [
  { id: "bare", label: "", prefix: "" },
  { id: "shift", label: "S", prefix: "SHIFT-" },
  { id: "ctrl", label: "C", prefix: "CTRL-" },
  { id: "alt", label: "A", prefix: "ALT-" },
];

// Keys that belong to the utilities and are never auto-filled.
const RESERVED = new Set(["F", "G", "T", "S", "B", "Space"]);

const AUTO_ORDER = ["Q", "W", "E", "R", "Z", "X", "C", "V"];

// Which bar and slot each (layer, key) drives, matching the fixed bind grid.
const SLOT_PLAN = (() => {
  const plan = {};
  const put = (mod, keys, bar, first) => {
    keys.forEach((key, index) => {
      plan[`${mod}:${key}`] = { bar, slot: first + index };
    });
  };
  put("bare", AUTO_ORDER, 1, 1);
  put("shift", ["Q", "W", "E", "R"], 1, 9);
  put("shift", ["Z", "X", "C", "V"], 2, 1);
  put("ctrl", ["Q", "W", "E", "R"], 2, 5);
  put("ctrl", ["Z", "X", "C", "V"], 2, 9);
  put("alt", ["Q", "W", "E", "R"], 3, 1);
  put("alt", ["Z", "X", "C", "V"], 3, 5);
  return plan;
})();

const SLOT_ORDER = [
  "bare:Q", "bare:W", "bare:E", "bare:R", "bare:Z", "bare:X", "bare:C", "bare:V",
  "shift:Q", "shift:W", "shift:E", "shift:R", "shift:Z", "shift:X", "shift:C", "shift:V",
  "ctrl:Q", "ctrl:W", "ctrl:E", "ctrl:R", "ctrl:Z", "ctrl:X", "ctrl:C", "ctrl:V",
  "alt:Q", "alt:W", "alt:E", "alt:R", "alt:Z", "alt:X", "alt:C", "alt:V",
];

const WOW_KEY = {
  Tab: "TAB", Space: "SPACE", Enter: "ENTER", Bksp: "BACKSPACE",
  ";": "SEMICOLON", "'": "APOSTROPHE", ",": "COMMA", ".": "PERIOD", "/": "SLASH",
};

const BARS = {
  1: { prefix: "ACTIONBUTTON", label: "bar 1" },
  2: { prefix: "MULTIACTIONBAR1BUTTON", label: "bar 2" },
  3: { prefix: "MULTIACTIONBAR2BUTTON", label: "bar 3" },
};

const COMMANDS = [
  ["INTERACTTARGET", "Interact"],
  ["TARGETNEARESTENEMY", "Target nearest"],
  ["TARGETFOCUS", "Target focus"],
  ["STOPCASTING", "Stop cast"],
  ["JUMP", "Jump"],
  ["TOGGLEBACKPACK", "Bags"],
  ["TOGGLEAUTORUN", "Autorun"],
];

const state = { board: null, classes: {}, profile: null };
const el = (id) => document.getElementById(id);
const newId = () => Math.random().toString(36).slice(2, 9);

function blankSlots() {
  const slots = {};
  for (const key of state.board.keys) slots[key.legend] = { bare: null, shift: null, ctrl: null, alt: null };
  return slots;
}

function newCharacter(name, klass, level) {
  return { id: newId(), name, class: klass, level, slots: blankSlots() };
}

function active() {
  return state.profile.characters.find((c) => c.id === state.profile.active);
}

const STORE = "zerosprey-binds-v3";
const save = () => localStorage.setItem(STORE, JSON.stringify(state.profile));

function load() {
  const raw = localStorage.getItem(STORE);
  if (raw) {
    try {
      state.profile = JSON.parse(raw);
      if (state.profile?.characters?.length) return;
    } catch {
      /* fall through to a fresh profile */
    }
  }
  state.profile = { characters: [newCharacter("Barry Buckfast", "hunter", 60)], macros: [], active: null };
  state.profile.active = state.profile.characters[0].id;
  save();
}

// ---------- labels ----------

function actionLabel(action) {
  if (!action) return "";
  if (action.k === "bar") return action.ability ?? `${BARS[action.bar].label} ${action.slot}`;
  if (action.k === "pet") return `pet ${action.slot}`;
  if (action.k === "cmd") return action.label;
  if (action.k === "macro") return state.profile.macros.find((m) => m.id === action.id)?.name ?? "macro";
  return "";
}

function actionIcon(action) {
  if (!action) return null;
  if (action.icon) return `assets/icons/${action.icon}.jpg`;
  if (action.k === "macro") {
    const macro = state.profile.macros.find((m) => m.id === action.id);
    return macro?.icon ? `assets/icons/${macro.icon}.jpg` : null;
  }
  return null;
}

function bindingFor(action) {
  if (!action) return null;
  if (action.k === "bar") return `${BARS[action.bar].prefix}${action.slot}`;
  if (action.k === "pet") return `BONUSACTIONBUTTON${action.slot}`;
  if (action.k === "cmd") return action.binding;
  return null;
}

const wowKey = (legend) => WOW_KEY[legend] ?? legend.toUpperCase();

// ---------- board ----------

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
  const add = document.createElement("button");
  add.className = "add";
  add.textContent = "+ character";
  add.onclick = () => {
    const name = prompt("Name");
    if (!name) return;
    const klass = (prompt("Class", "hunter") || "hunter").toLowerCase();
    const character = newCharacter(name, klass, 1);
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
}

function renderBoard() {
  const board = el("board");
  board.innerHTML = "";
  const character = active();
  const right = Math.max(...state.board.keys.map((k) => (k.x + (k.w ?? 1)) * UNIT));
  const bottom = Math.max(...state.board.keys.map((k) => k.y * UNIT + UNIT));
  board.style.width = `${right}px`;
  board.style.height = `${bottom}px`;

  for (const key of state.board.keys) {
    const slots = character.slots[key.legend] ?? { bare: null, shift: null, ctrl: null, alt: null };
    const cap = document.createElement("div");
    cap.className = "key" + (MODS.some((m) => slots[m.id]) ? " assigned" : "");
    cap.style.left = `${key.x * UNIT}px`;
    cap.style.top = `${key.y * UNIT}px`;
    cap.style.width = `${key.w * UNIT - GAP}px`;
    cap.style.height = `${UNIT - GAP}px`;
    if (key.rot) cap.style.transform = `rotate(${key.rot}deg)`;

    const legend = document.createElement("div");
    legend.className = "legend";
    legend.textContent = key.legend;
    cap.append(legend);

    const primary = document.createElement("div");
    primary.className = "primary" + (slots.bare ? "" : " empty");
    const icon = actionIcon(slots.bare);
    if (slots.bare) {
      if (icon) {
        const img = document.createElement("img");
        img.src = icon;
        img.alt = "";
        img.onerror = () => img.remove();
        primary.append(img);
      }
      const name = document.createElement("span");
      name.textContent = actionLabel(slots.bare);
      primary.append(name);
    } else {
      primary.textContent = "empty";
    }
    primary.title = slots.bare ? `${key.legend}: ${actionLabel(slots.bare)}` : `${key.legend}: empty`;
    primary.onclick = (event) => {
      event.stopPropagation();
      openPalette(event, key.legend, "bare");
    };
    cap.append(primary);

    const mods = document.createElement("div");
    mods.className = "mods";
    for (const mod of MODS.slice(1)) {
      const chip = document.createElement("div");
      const action = slots[mod.id];
      chip.className = "mod" + (action ? " has" : "");
      chip.textContent = action ? mod.label : "·";
      chip.title = action ? `${mod.id}: ${actionLabel(action)}` : `${mod.id}: empty`;
      chip.onclick = (event) => {
        event.stopPropagation();
        openPalette(event, key.legend, mod.id);
      };
      mods.append(chip);
    }
    cap.append(mods);
    board.append(cap);
  }
}

// ---------- palette ----------

function openPalette(event, legend, modId) {
  const palette = el("palette");
  const character = active();
  const plan = SLOT_PLAN[`${modId}:${legend}`];
  palette.innerHTML = "";

  const title = document.createElement("h3");
  title.textContent = `${legend} · ${modId === "bare" ? "no modifier" : modId}`;
  palette.append(title);

  const abilities = state.classes[character.class]?.abilities ?? [];
  if (abilities.length) {
    const heading = document.createElement("h3");
    heading.textContent = plan ? `spells (this key drives ${BARS[plan.bar].label} ${plan.slot})` : "spells";
    palette.append(heading);
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
      button.onclick = () => {
        if (!plan) {
          alert("That key is a utility key: pick a command or a macro for it instead.");
          return;
        }
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

  const slotSection = (bar) => {
    const heading = document.createElement("h3");
    heading.textContent = `${BARS[bar].label}`;
    palette.append(heading);
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
  };
  for (const bar of [1, 2, 3]) slotSection(bar);

  const commands = document.createElement("h3");
  commands.textContent = "commands";
  palette.append(commands);
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
    const heading = document.createElement("h3");
    heading.textContent = "macros";
    palette.append(heading);
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

  const clearSection = document.createElement("h3");
  clearSection.textContent = " ";
  palette.append(clearSection);
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
  const width = 430;
  const left = Math.min(rect.left + window.scrollX, window.innerWidth - width - 20);
  const below = rect.bottom + window.scrollY + 8;
  const tooLow = below + 460 > window.scrollY + window.innerHeight;
  palette.style.left = `${Math.max(12, left)}px`;
  palette.style.top = tooLow ? `${Math.max(12, rect.top + window.scrollY - 470)}px` : `${below}px`;
}

// ---------- level plan ----------

function renderPlan() {
  const character = active();
  const select = el("plan-class");
  const names = Object.keys(state.classes);
  select.innerHTML = "";
  for (const name of names) {
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

function findPlacement(character, name) {
  for (const key of state.board.keys) {
    const slots = character.slots[key.legend];
    if (!slots) continue;
    for (const mod of MODS) {
      if (slots[mod.id]?.ability === name) {
        return `${mod.label ? `${mod.label}+` : ""}${key.legend}`;
      }
    }
  }
  return null;
}

function autoPlace() {
  const character = active();
  const abilities = (state.classes[character.class]?.abilities ?? [])
    .filter((a) => a.level <= character.level && a.kind !== "passive")
    .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));

  const placed = new Set();
  for (const key of state.board.keys) {
    for (const action of Object.values(character.slots[key.legend] ?? {})) {
      if (action?.ability) placed.add(action.ability);
    }
  }

  for (const ability of abilities) {
    if (placed.has(ability.name)) continue;
    const free = nextFreeSlot(character);
    if (!free) break;
    const { legend, mod } = free;
    const plan = SLOT_PLAN[`${mod}:${legend}`];
    character.slots[legend][mod] = {
      k: "bar", bar: plan.bar, slot: plan.slot, ability: ability.name, icon: ability.icon,
    };
  }
  save();
  renderBoard();
  renderPlan();
}

function nextFreeSlot(character) {
  for (const entry of SLOT_ORDER) {
    const [mod, legend] = entry.split(":");
    if (!character.slots[legend]) continue;
    if (!character.slots[legend][mod]) return { legend, mod };
  }
  return null;
}

function clearPlaces() {
  const character = active();
  for (const key of state.board.keys) {
    const slots = character.slots[key.legend];
    if (!slots) continue;
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
  const character = active();
  const lines = ["bind S MOVEFORWARD", "bind BUTTON3 STARTAUTORUN", "bind UP NONE"];
  for (let digit = 1; digit <= 9; digit += 1) lines.push(`bind ${digit} NONE`);
  lines.push("bind 0 NONE", "bind - NONE", "bind = NONE");

  for (const key of state.board.keys) {
    const slots = character.slots[key.legend];
    if (!slots) continue;
    for (const mod of MODS) {
      const binding = bindingFor(slots[mod.id]);
      if (!binding) continue;
      lines.push(`bind ${mod.prefix}${wowKey(key.legend)} ${binding}`);
    }
  }
  el("out-bindings").textContent = `${lines.join("\n")}\n`;

  const macroText = state.profile.macros
    .map((macro) => `# ${macro.name}\n# icon: ${macro.icon}\n${macro.body.trim()}\n`)
    .join("\n");
  el("out-macros").textContent = macroText || "No macros yet.\n";
}

// ---------- wiring ----------

async function boot() {
  const [board, hunter] = await Promise.all([
    fetch("assets/board.json").then((r) => r.json()),
    fetch("assets/classes/hunter.json").then((r) => r.json()).catch(() => null),
  ]);
  state.board = board;
  state.classes = hunter ? { hunter } : {};
  load();
  renderAll();

  for (const button of document.querySelectorAll(".tabs button")) {
    button.onclick = () => {
      for (const other of document.querySelectorAll(".tabs button")) other.classList.remove("on");
      button.classList.add("on");
      for (const id of ["binds", "plan", "macros", "export"]) {
        el(`tab-${id}`).hidden = id !== button.dataset.tab;
      }
      if (button.dataset.tab === "export") renderExport();
      if (button.dataset.tab === "plan") renderPlan();
      if (button.dataset.tab === "macros") renderMacros();
    };
  }

  el("plan-auto").onclick = autoPlace;
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
    save();
    renderAll();
  };

  document.addEventListener("click", (event) => {
    const palette = el("palette");
    if (palette.hidden) return;
    if (palette.contains(event.target) || event.target.closest(".key")) return;
    palette.hidden = true;
  });
}

function renderAll() {
  renderChars();
  renderBoard();
  renderPlan();
  renderMacros();
  renderExport();
}

boot();
