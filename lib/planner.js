// Pure planner logic: no DOM, no fetch. Shared by the browser app, the CLI and the tests.

export const MODS = [
  { id: "bare", label: "", prefix: "" },
  { id: "shift", label: "S", prefix: "SHIFT-" },
  { id: "ctrl", label: "C", prefix: "CTRL-" },
  { id: "alt", label: "A", prefix: "ALT-" },
];

export const RESERVED = ["F", "G", "T", "S", "B", "Space"];
export const AUTO_ORDER = ["Q", "W", "E", "R", "Z", "X", "C", "V"];

// Which bar and slot each (layer, key) drives, matching the fixed bind grid.
export const SLOT_PLAN = (() => {
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

export const SLOT_ORDER = [
  "bare:Q", "bare:W", "bare:E", "bare:R", "bare:Z", "bare:X", "bare:C", "bare:V",
  "shift:Q", "shift:W", "shift:E", "shift:R", "shift:Z", "shift:X", "shift:C", "shift:V",
  "ctrl:Q", "ctrl:W", "ctrl:E", "ctrl:R", "ctrl:Z", "ctrl:X", "ctrl:C", "ctrl:V",
  "alt:Q", "alt:W", "alt:E", "alt:R", "alt:Z", "alt:X", "alt:C", "alt:V",
];

export const WOW_KEY = {
  Tab: "TAB", Space: "SPACE", Enter: "ENTER", Bksp: "BACKSPACE",
  ";": "SEMICOLON", "'": "APOSTROPHE", ",": "COMMA", ".": "PERIOD", "/": "SLASH",
};

export const BARS = {
  1: { prefix: "ACTIONBUTTON", label: "bar 1" },
  2: { prefix: "MULTIACTIONBAR1BUTTON", label: "bar 2" },
  3: { prefix: "MULTIACTIONBAR2BUTTON", label: "bar 3" },
};

export const COMMANDS = [
  ["INTERACTTARGET", "Interact"],
  ["TARGETNEARESTENEMY", "Target nearest"],
  ["TARGETFOCUS", "Target focus"],
  ["STOPCASTING", "Stop cast"],
  ["JUMP", "Jump"],
  ["TOGGLEBACKPACK", "Bags"],
  ["TOGGLEAUTORUN", "Autorun"],
];

// The fixed non-bar binds every character gets.
export const BASE_BINDINGS = [
  ["S", "MOVEFORWARD"],
  ["BUTTON3", "STARTAUTORUN"],
  ["UP", "NONE"],
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map((digit) => [`${digit}`, "NONE"]),
  ["-", "NONE"],
  ["=", "NONE"],
];

export function blankSlots(board) {
  const slots = {};
  for (const key of board.keys) slots[key.legend] = { bare: null, shift: null, ctrl: null, alt: null };
  return slots;
}

export function newCharacter(board, name, klass, level) {
  return {
    id: `${klass}-${name}`.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    name,
    class: klass,
    level,
    slots: blankSlots(board),
  };
}

export function actionLabel(action, macros = []) {
  if (!action) return "";
  if (action.k === "bar") return action.ability ?? `${BARS[action.bar].label} ${action.slot}`;
  if (action.k === "pet") return `pet ${action.slot}`;
  if (action.k === "cmd") return action.label;
  if (action.k === "macro") return macros.find((macro) => macro.id === action.id)?.name ?? "macro";
  return "";
}

export function bindingFor(action) {
  if (!action) return null;
  if (action.k === "bar") return `${BARS[action.bar].prefix}${action.slot}`;
  if (action.k === "pet") return `BONUSACTIONBUTTON${action.slot}`;
  if (action.k === "cmd") return action.binding;
  return null;
}

export const wowKey = (legend) => WOW_KEY[legend] ?? legend.toUpperCase();

export function nextFreeSlot(character) {
  for (const entry of SLOT_ORDER) {
    const [mod, legend] = entry.split(":");
    if (!character.slots[legend]) continue;
    if (!character.slots[legend][mod]) return { legend, mod };
  }
  return null;
}

export function findPlacement(character, name) {
  for (const [legend, slots] of Object.entries(character.slots)) {
    for (const mod of MODS) {
      if (slots[mod.id]?.ability === name) {
        return `${mod.label ? `${mod.label}+` : ""}${legend}`;
      }
    }
  }
  return null;
}

// Which abilities earn the limited grid slots first: the rotation, then the pet, then buffs, then
// the situational utility. Within a kind, the earliest level wins.
export const KIND_PRIORITY = { attack: 0, pet: 1, buff: 2, utility: 3, passive: 9 };

// Place every ability the character has learned, in priority then level order, into the next free slot.
export function autoPlace(character, abilities) {
  const learned = abilities
    .filter((ability) => ability.level <= character.level && ability.kind !== "passive")
    .sort(
      (a, b) =>
        (KIND_PRIORITY[a.kind] ?? 4) - (KIND_PRIORITY[b.kind] ?? 4) ||
        a.level - b.level ||
        a.name.localeCompare(b.name),
    );

  const placed = new Set();
  for (const slots of Object.values(character.slots)) {
    for (const action of Object.values(slots)) {
      if (action?.ability) placed.add(action.ability);
    }
  }

  const unplaced = [];
  for (const ability of learned) {
    if (placed.has(ability.name)) continue;
    const free = nextFreeSlot(character);
    if (!free) {
      unplaced.push(ability.name);
      continue;
    }
    const plan = SLOT_PLAN[`${free.mod}:${free.legend}`];
    character.slots[free.legend][free.mod] = {
      k: "bar",
      bar: plan.bar,
      slot: plan.slot,
      ability: ability.name,
      icon: ability.icon,
    };
  }
  return unplaced;
}

export function toBindings(character, board) {
  const lines = BASE_BINDINGS.map(([key, binding]) => `bind ${key} ${binding}`);
  for (const key of board.keys) {
    const slots = character.slots[key.legend];
    if (!slots) continue;
    for (const mod of MODS) {
      const binding = bindingFor(slots[mod.id]);
      if (!binding) continue;
      lines.push(`bind ${mod.prefix}${wowKey(key.legend)} ${binding}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

export function toMacroText(profile) {
  const text = (profile.macros ?? [])
    .map((macro) => `# ${macro.name}\n# icon: ${macro.icon}\n${macro.body.trim()}\n`)
    .join("\n");
  return text || "No macros yet.\n";
}

export function validate(board, classes, profile) {
  const problems = [];
  const variants = new Set(board.keys.map((key) => `${key.legend}:${key.x}:${key.y}`));
  if (board.keys.length !== 42) problems.push(`board has ${board.keys.length} keys, expected 42`);
  if (variants.size !== board.keys.length) problems.push("two keys share a legend and position");

  for (const [name, klass] of Object.entries(classes)) {
    for (const ability of klass.abilities ?? []) {
      if (typeof ability.level !== "number") problems.push(`${name}: ${ability.name} has no level`);
      if (!["attack", "buff", "utility", "pet", "passive"].includes(ability.kind)) {
        problems.push(`${name}: ${ability.name} has kind ${ability.kind}`);
      }
      if (!ability.icon) problems.push(`${name}: ${ability.name} has no icon`);
    }
  }

  for (const character of profile.characters ?? []) {
    const seen = new Map();
    for (const [legend, slots] of Object.entries(character.slots ?? {})) {
      if (!board.keys.some((key) => key.legend === legend)) problems.push(`${character.name}: unknown key ${legend}`);
      for (const mod of MODS) {
        const action = slots[mod.id];
        if (!action) continue;
        if (action.k === "bar") {
          const id = `${action.bar}:${action.slot}`;
          if (seen.has(id)) problems.push(`${character.name}: ${BARS[action.bar].label} ${action.slot} bound twice`);
          seen.set(id, `${mod.id}:${legend}`);
        }
      }
    }
  }
  return problems;
}
