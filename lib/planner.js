// Pure planner logic: no DOM, no fetch. Shared by the browser app, the CLI and the tests.

export const MODS = [
  { id: "bare", label: "", prefix: "" },
  { id: "shift", label: "S", prefix: "SHIFT-" },
  { id: "ctrl", label: "C", prefix: "CTRL-" },
  { id: "alt", label: "A", prefix: "ALT-" },
  { id: "ctrlshift", label: "CS", prefix: "CTRL-SHIFT-" },
];

export const RESERVED = ["G", "T", "S", "B", "Space"];
// The grid is the eight keys the owner has always used: bar 1 slots 1 to 8 were Q W E R and Z X C F.
export const AUTO_ORDER = ["Q", "W", "E", "R", "Z", "X", "C", "F"];

// Which bar and slot each (layer, key) drives. Five layers on the eight grid keys is 40 slots, and the
// utility keys lend four unused layers, so every ability a character can learn has a key.
export const SLOT_PLAN = (() => {
  const plan = {};
  const put = (mod, keys, bar, first) => {
    keys.forEach((key, index) => {
      plan[`${mod}:${key}`] = { bar, slot: first + index };
    });
  };
  const left = ["Q", "W", "E", "R"];
  const right = ["Z", "X", "C", "F"];
  put("bare", AUTO_ORDER, 1, 1);
  put("shift", left, 1, 9);
  put("shift", right, 2, 1);
  put("ctrl", left, 2, 5);
  put("ctrl", right, 2, 9);
  put("ctrlshift", left, 3, 9);
  put("ctrlshift", right, 4, 1);
  // Alt is deliberately left out: it is the layer for mounts, food, potions and other items, and no
  // spell is auto-placed on it. The last few situational spells use the unused modifiers on keys
  // whose bare press is a command.
  plan["shift:T"] = { bar: 4, slot: 5 };
  plan["ctrl:T"] = { bar: 4, slot: 6 };
  plan["ctrlshift:T"] = { bar: 3, slot: 5 };
  plan["ctrlshift:G"] = { bar: 3, slot: 6 };
  plan["shift:B"] = { bar: 3, slot: 1 };
  plan["ctrl:B"] = { bar: 3, slot: 2 };
  plan["ctrlshift:B"] = { bar: 3, slot: 3 };
  plan["shift:S"] = { bar: 3, slot: 4 };
  plan["ctrl:S"] = { bar: 3, slot: 7 };
  plan["ctrlshift:S"] = { bar: 3, slot: 8 };
  return plan;
})();

export const SLOT_ORDER = (() => {
  const order = [];
  for (const mod of MODS.map((m) => m.id)) {
    for (const key of AUTO_ORDER) {
      if (SLOT_PLAN[`${mod}:${key}`]) order.push(`${mod}:${key}`);
    }
  }
  for (const entry of [
    "shift:T", "ctrl:T", "ctrlshift:T", "ctrlshift:G",
    "shift:B", "ctrl:B", "ctrlshift:B", "shift:S", "ctrl:S", "ctrlshift:S",
  ]) order.push(entry);
  return order;
})();

export const WOW_KEY = {
  Tab: "TAB", Space: "SPACE", Enter: "ENTER", Bksp: "BACKSPACE",
  ";": "SEMICOLON", "'": "APOSTROPHE", ",": "COMMA", ".": "PERIOD", "/": "SLASH",
};

export const BARS = {
  1: { prefix: "ACTIONBUTTON", label: "bar 1" },
  2: { prefix: "MULTIACTIONBAR1BUTTON", label: "bar 2" },
  3: { prefix: "MULTIACTIONBAR2BUTTON", label: "bar 3" },
  4: { prefix: "MULTIACTIONBAR3BUTTON", label: "bar 4" },
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

// Keys whose bare press is movement or a command rather than a spell, so the board can name them
// even before anything is assigned. These match the account's own bindings.
export const BASE_LABELS = {
  S: { label: "forward", glyph: "↑" },
  A: { label: "strafe left", glyph: "←" },
  D: { label: "strafe right", glyph: "→" },
};

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
  for (const [slot, action] of Object.entries(character.extra ?? {})) {
    const [mod, legend] = slot.split(":");
    const prefix = MODS.find((entry) => entry.id === mod)?.prefix ?? "";
    const binding = bindingFor(action);
    if (binding) lines.push(`bind ${prefix}${wowKey(legend)} ${binding}`);
  }
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

export function validateBoard(board) {
  const problems = [];
  const variants = new Set(board.keys.map((key) => `${key.legend}:${key.x}:${key.y}`));
  if (variants.size !== board.keys.length) problems.push("two keys share a legend and position");
  const missing = AUTO_ORDER.filter((legend) => !board.keys.some((key) => key.legend === legend));
  if (missing.length) problems.push(`board is missing the grid keys ${missing.join(", ")}`);
  for (const key of board.keys) {
    if (!Number.isFinite(key.x) || !Number.isFinite(key.y) || !(key.w > 0)) {
      problems.push(`key ${key.legend} has no usable position`);
    }
  }
  return problems;
}

export function validate(board, classes, profile, universe = null) {
  const known = universe ? new Set(universe) : new Set(board.keys.map((key) => key.legend));
  const problems = validateBoard(board);

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
    if (!Number.isInteger(character.level) || character.level < 1 || character.level > 60) {
      problems.push(`${character.name}: level ${character.level} is outside 1 to 60`);
    }
    const seen = new Map();
    for (const [legend, slots] of Object.entries(character.slots ?? {})) {
      if (!known.has(legend)) problems.push(`${character.name}: unknown key ${legend}`);
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
