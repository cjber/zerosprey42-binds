// Zerosprey42 bind planner. No build step, no dependencies: open index.html or serve the folder.

const MODS = [
  { id: "bare", prefix: "", label: "" },
  { id: "shift", prefix: "SHIFT-", label: "S+" },
  { id: "ctrl", prefix: "CTRL-", label: "C+" },
  { id: "alt", prefix: "ALT-", label: "A+" },
];

// Keys that belong to the utilities and are never auto-filled.
const RESERVED = new Set(["F", "G", "T", "S", "B", "Space"]);

// Order the auto-placer consumes: the two physical rows of the main block, then the layers.
const AUTO_ORDER = [
  "Q", "W", "E", "R", "Z", "X", "C", "V",
];

// Which bar and slot each (layer, key) drives. This is the grid the fixed binds use, so a spell
// placed here exports as the same ACTIONBUTTON/MULTIACTIONBAR binding the key already has.
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

const PET_COUNT = 5;

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

const state = {
  board: null,
  classes: {},
  profile: null,
};

const el = (id) => document.getElementById(id);

function newId() {
  return Math.random().toString(36).slice(2, 9);
}

function blankSlots() {
  const slots = {};
  for (const key of state.board.keys) {
    slots[key.legend] = { bare: null, shift: null, ctrl: null, alt: null };
  }
  return slots;
}

function newCharacter(name, klass, level) {
  return {
    id: newId(),
    name,
    class: klass,
    level,
    slots: blankSlots(),
    placed: {},
  };
}

function active() {
  return state.profile.characters.find((c) => c.id === state.profile.active);
}

// ---------- storage ----------

const STORE = "zerosprey-binds-v2";

function save() {
  localStorage.setItem(STORE, JSON.stringify(state.profile));
}

function load() {
  const raw = localStorage.getItem(STORE);
  if (raw) {
    try {
      state.profile = JSON.parse(raw);
      if (!state.profile.characters.length) state.profile = null;
      if (state.profile) return;
    } catch {
      state.profile = null;
    }
  }
  state.profile = {
    characters: [newCharacter("Barry Buckfast", "hunter", 60)],
    macros: [],
    active: null,
  };
  state.profile.active = state.profile.characters[0].id;
  save();
}

// ---------- action helpers ----------

function actionLabel(action) {
  if (!action) return "";
  if (action.k === "bar") {
    return action.ability ? action.ability : `${BARS[action.bar].label} ${action.slot}`;
  }
  if (action.k === "pet") return `pet ${action.slot}`;
  if (action.k === "cmd") return action.label;
  if (action.k === "macro") {
    const macro = state.profile.macros.find((m) => m.id === action.id);
    return macro ? macro.name : "macro";
  }
  return "";
}

function actionChipClass(action) {
  if (!action) return "empty";
  if (action.k === "bar") return action.bar === 1 ? "bar1" : action.bar === 2 ? "bar2" : "bar3";
  if (action.k === "pet") return "bar3";
  if (action.k === "cmd") return "util";
  if (action.k === "macro") return "macro";
  return "neutral";
}

function bindingFor(action) {
  if (!action) return null;
  if (action.k === "bar") return `${BARS[action.bar].prefix}${action.slot}`;
  if (action.k === "pet") return `BONUSACTIONBUTTON${action.slot}`;
  if (action.k === "cmd") return action.binding;
  return null;
}

function wowKey(legend) {
  return WOW_KEY[legend] ?? legend.toUpperCase();
}

// ---------- rendering ----------

function renderChars() {
  const box = el("chars");
  box.innerHTML = "";
  for (const character of state.profile.characters) {
    const option = document.createElement("button");
    option.textContent = character.name;
    option.className = character.id === state.profile.active ? "on" : "";
    option.style.cssText =
      "background:none;border:1px solid var(--line);border-radius:6px;padding:4px 9px;color:" +
      (character.id === state.profile.active ? "var(--text)" : "var(--muted)");
    option.onclick = () => {
      state.profile.active = character.id;
      save();
      renderAll();
    };
    box.append(option);
  }
  const add = document.createElement("button");
  add.textContent = "+ character";
  add.style.cssText = "background:none;border:1px dashed var(--line);border-radius:6px;padding:4px 9px;color:var(--muted)";
  add.onclick = () => {
    const name = prompt("Name");
    if (!name) return;
    const klass = prompt("Class (letters, lower case)", "hunter");
    const character = newCharacter(name, (klass || "hunter").toLowerCase(), 1);
    state.profile.characters.push(character);
    state.profile.active = character.id;
    save();
    renderAll();
  };
  box.append(add);

  const level = active();
  const lvl = document.createElement("label");
  lvl.textContent = "level ";
  lvl.style.color = "var(--muted)";
  const input = document.createElement("input");
  input.type = "number";
  input.min = "1";
  input.max = "60";
  input.value = level?.level ?? 60;
  input.style.width = "64px";
  input.onchange = () => {
    level.level = Number(input.value) || 1;
    save();
    renderPlan();
  };
  lvl.append(input);
  box.append(lvl);
}

function renderBoard() {
  const board = el("board");
  board.innerHTML = "";
  const character = active();
  for (const key of state.board.keys) {
    const cell = document.createElement("div");
    const slots = character.slots[key.legend] ?? { bare: null, shift: null, ctrl: null, alt: null };
    const any = MODS.some((m) => slots[m.id]);
    cell.className = "key" + (any ? " bound" : "");
    cell.style.gridColumn = String(key.x + 1);
    cell.style.gridRow = String(key.y + 1);

    const legend = document.createElement("div");
    legend.className = "legend";
    legend.textContent = key.legend;
    cell.append(legend);

    for (const mod of MODS) {
      const chip = document.createElement("div");
      const action = slots[mod.id];
      chip.className = "chip " + actionChipClass(action);
      chip.textContent = action ? mod.label + actionLabel(action) : mod.label || "—";
      chip.title = `${key.legend} ${mod.id}: ${action ? actionLabel(action) : "empty"}`;
      chip.onclick = (event) => openPalette(event, key.legend, mod.id);
      cell.append(chip);
    }
    board.append(cell);
  }
}

function openPalette(event, legend, modId) {
  const palette = el("palette");
  const character = active();
  const current = character.slots[legend]?.[modId] ?? null;

  const sections = [];
  for (const bar of [1, 2, 3]) {
    const slots = [];
    for (let slot = 1; slot <= 12; slot += 1) {
      slots.push({ label: `${BARS[bar].label} ${slot}`, action: { k: "bar", bar, slot } });
    }
    sections.push([BARS[bar].label, slots]);
  }
  const pet = [];
  for (let slot = 1; slot <= PET_COUNT; slot += 1) pet.push({ label: `pet ${slot}`, action: { k: "pet", slot } });
  sections.push(["pet bar", pet]);

  sections.push([
    "commands",
    COMMANDS.map(([binding, label]) => ({ label, action: { k: "cmd", binding, label } })),
  ]);

  if (state.profile.macros.length) {
    sections.push([
      "macros",
      state.profile.macros.map((macro) => ({ label: macro.name, action: { k: "macro", id: macro.id } })),
    ]);
  }

  palette.innerHTML = `<h3>${legend} · ${modId === "bare" ? "no modifier" : modId}</h3>`;
  for (const [title, buttons] of sections) {
    const heading = document.createElement("h3");
    heading.textContent = title;
    palette.append(heading);
    const row = document.createElement("div");
    row.className = "row";
    for (const item of buttons) {
      const button = document.createElement("button");
      button.textContent = item.label;
      button.onclick = () => {
        character.slots[legend][modId] = item.action;
        save();
        palette.hidden = true;
        renderBoard();
      };
      row.append(button);
    }
    palette.append(row);
  }
  const row = document.createElement("div");
  row.className = "row";
  row.style.marginTop = "8px";
  const clear = document.createElement("button");
  clear.className = "clear";
  clear.textContent = "clear this key";
  clear.onclick = () => {
    character.slots[legend][modId] = null;
    save();
    palette.hidden = true;
    renderBoard();
  };
  row.append(clear);
  palette.append(row);

  palette.hidden = false;
  const rect = event.target.getBoundingClientRect();
  palette.style.left = `${Math.min(rect.left, window.innerWidth - 340)}px`;
  palette.style.top = `${rect.bottom + window.scrollY + 6}px`;
  palette.dataset.current = current ? "1" : "0";
}

// ---------- level plan ----------

function renderPlan() {
  const character = active();
  const select = el("plan-class");
  const classes = Object.keys(state.classes);
  if (!classes.includes(character.class)) state.classes[character.class] = { abilities: [] };
  select.innerHTML = "";
  for (const name of classes) {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    option.selected = name === character.class;
    select.append(option);
  }
  el("plan-level").value = character.level;

  const abilities = (state.classes[character.class]?.abilities ?? []).slice();
  abilities.sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
  const list = el("plan-list");
  list.innerHTML = "";
  if (!abilities.length) {
    list.innerHTML =
      '<p class="hint">No abilities known for this class yet. Add them in <code>assets/classes/&lt;class&gt;.json</code>.</p>';
    return;
  }
  for (const ability of abilities) {
    const row = document.createElement("div");
    row.className = "plan-row" + (ability.level <= character.level ? " known" : "");
    const where = findPlacement(character, ability.name);
    if (ability.level <= character.level && !where) row.classList.add("unplaced");
    row.innerHTML =
      `<span class="lvl">${ability.level}</span>` +
      `<span class="name">${ability.name}</span>` +
      `<span class="where">${where ?? (ability.level <= character.level ? "not placed" : "not yet")}</span>`;
    list.append(row);
  }
}

function findPlacement(character, name) {
  for (const key of state.board.keys) {
    const slots = character.slots[key.legend];
    if (!slots) continue;
    for (const mod of MODS) {
      const action = slots[mod.id];
      if (action && action.ability === name) {
        return `${mod.label}${key.legend}`.replace(/^\+/, "");
      }
    }
  }
  return null;
}

function autoPlace() {
  const character = active();
  const abilities = (state.classes[character.class]?.abilities ?? [])
    .filter((a) => a.level <= character.level && a.kind !== "passive");
  abilities.sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));

  const alreadyThere = new Set();
  for (const key of state.board.keys) {
    for (const action of Object.values(character.slots[key.legend] ?? {})) {
      if (action?.ability) alreadyThere.add(action.ability);
    }
  }

  for (const ability of abilities) {
    if (alreadyThere.has(ability.name)) continue;
    const free = nextFreeSlot(character);
    if (!free) break;
    const { legend, mod } = free;
    const { bar, slot } = SLOT_PLAN[`${mod}:${legend}`];
    character.slots[legend][mod] = { k: "bar", bar, slot, ability: ability.name };
  }
  save();
  renderBoard();
  renderPlan();
}

function nextFreeSlot(character) {
  for (const entry of SLOT_ORDER) {
    const [mod, legend] = entry.split(":");
    const slots = character.slots[legend];
    if (!slots) continue;
    if (!slots[mod]) return { legend, mod };
  }
  return null;
}

function clearPlaces() {
  const character = active();
  for (const key of state.board.keys) {
    const slots = character.slots[key.legend];
    if (!slots) continue;
    for (const mod of MODS) {
      if (slots[mod.id]?.ability) slots[mod.id] = null;
    }
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
  const lines = [
    "bind S MOVEFORWARD",
    "bind BUTTON3 STARTAUTORUN",
    "bind UP NONE",
  ];
  for (let digit = 1; digit <= 9; digit += 1) lines.push(`bind ${digit} NONE`);
  lines.push("bind 0 NONE", "bind - NONE", "bind = NONE");

  const reservedKeys = [];
  for (const key of state.board.keys) {
    const slots = character.slots[key.legend];
    if (!slots) continue;
    for (const mod of MODS) {
      const action = slots[mod.id];
      const binding = bindingFor(action);
      if (!binding) continue;
      const keyName = MODS.find((m) => m.id === mod.id).prefix + wowKey(key.legend);
      lines.push(`bind ${keyName} ${binding}`);
      if (mod.id === "bare") reservedKeys.push(key.legend);
    }
  }
  el("out-bindings").textContent = lines.join("\n") + "\n";

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
  state.classes = {};
  if (hunter) state.classes.hunter = hunter;
  load();
  renderAll();

  for (const button of document.querySelectorAll("nav button")) {
    button.onclick = () => {
      for (const other of document.querySelectorAll("nav button")) other.classList.remove("on");
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
    if (palette.contains(event.target) || event.target.classList.contains("chip")) return;
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
