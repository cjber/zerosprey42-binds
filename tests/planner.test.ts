import { describe, expect, test } from "bun:test";
import boardsIndex from "../assets/boards/index.json";
import {
  autoPlace, blankSlots, findPlacement, newCharacter, toBindings, toMacroText, validate,
  validateBoard, SLOT_PLAN, SLOT_ORDER, bindingFor, availableAbilities, placedAbilityNames,
  placeAbility, applyBindings, parseWtfKey, actionFromBinding,
} from "../lib/planner.js";

const board = {
  keys: [
    ...["Tab", "Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P", "Bksp",
      "Ctrl", "A", "S", "D", "F", "G", "H", "J", "K", "L", ";", "'",
      "Shift", "Z", "X", "C", "V", "B", "N", "M", ",", ".", "/", "Shift",
      "Super", "Lower", "Space", "Enter", "Raise", "AltGr"].map((legend, index) => ({
      legend, x: index % 12, y: Math.floor(index / 12), w: 1, rot: 0,
    })),
  ],
};

const hunter = {
  class: "hunter",
  abilities: [
    { name: "Serpent Sting", level: 4, kind: "attack", icon: "a" },
    { name: "Arcane Shot", level: 6, kind: "attack", icon: "b" },
    { name: "Mend Pet", level: 10, kind: "pet", icon: "c" },
    { name: "Tame Beast", level: 10, kind: "pet", icon: "d" },
  ],
  macros: [{ id: "pet-attack", name: "Pet Attack", icon: "e", body: "/petattack" }],
};

describe("slot plan", () => {
  test("every layer key maps to a unique bar slot", () => {
    const seen = new Set();
    for (const entry of SLOT_ORDER) {
      const { bar, slot } = SLOT_PLAN[entry];
      const id = `${bar}:${slot}`;
      expect(seen.has(id)).toBe(false);
      seen.add(id);
    }
    expect(seen.size).toBe(42);
  });

  test("each layer fills the next stretch of bars, Ctrl+Shift reaching bar 4", () => {
    expect(SLOT_PLAN["bare:Q"]).toEqual({ bar: 1, slot: 1 });
    expect(SLOT_PLAN["bare:F"]).toEqual({ bar: 1, slot: 8 });
    expect(SLOT_PLAN["shift:Q"]).toEqual({ bar: 1, slot: 9 });
    expect(SLOT_PLAN["shift:F"]).toEqual({ bar: 2, slot: 4 });
    expect(SLOT_PLAN["ctrl:F"]).toEqual({ bar: 2, slot: 12 });
    expect(SLOT_PLAN["ctrlshift:Q"]).toEqual({ bar: 3, slot: 9 });
    expect(SLOT_PLAN["ctrlshift:F"]).toEqual({ bar: 4, slot: 4 });
    expect(SLOT_PLAN["shift:T"]).toEqual({ bar: 4, slot: 5 });
  });

  test("keeps spells off Alt, which is for mounts and items", () => {
    for (const entry of SLOT_ORDER) expect(entry.startsWith("alt:")).toBe(false);
  });
});

describe("autoPlace", () => {
  test("places the rotation before pet actions, and stops at the level", () => {
    const character = newCharacter(board, "Barry Test", "hunter", 6);
    autoPlace(character, hunter.abilities);
    expect(findPlacement(character, "Serpent Sting")).toBe("Q");
    expect(findPlacement(character, "Arcane Shot")).toBe("W");
    expect(findPlacement(character, "Mend Pet")).toBe(null);
  });

  test("gives the grid to attacks before utility, whatever the level", () => {
    const abilities = [
      { name: "Track Undead", level: 1, kind: "utility", icon: "u" },
      { name: "Aimed Shot", level: 40, kind: "attack", icon: "a" },
    ];
    const character = newCharacter(board, "Barry Test", "hunter", 60);
    autoPlace(character, abilities);
    expect(findPlacement(character, "Aimed Shot")).toBe("Q");
    expect(findPlacement(character, "Track Undead")).toBe("W");
  });

  test("never takes a utility key's bare press", () => {
    const character = newCharacter(board, "Barry Test", "hunter", 60);
    autoPlace(character, hunter.abilities);
    for (const key of ["F", "G", "T", "S", "B", "Space"]) {
      expect(character.slots[key].bare).toBe(null);
    }
  });

  test("is idempotent", () => {
    const character = newCharacter(board, "Barry Test", "hunter", 60);
    autoPlace(character, hunter.abilities);
    const first = JSON.stringify(character.slots);
    autoPlace(character, hunter.abilities);
    expect(JSON.stringify(character.slots)).toBe(first);
  });

  test("fits 42 abilities, and reports the ones past the last slot", () => {
    const fits = Array.from({ length: 42 }, (_, index) => ({
      name: `Spell ${index}`, level: 1, kind: "attack", icon: "x",
    }));
    const character = newCharacter(board, "Barry Test", "hunter", 60);
    expect(autoPlace(character, fits)).toEqual([]);

    const tooMany = [...fits, ...Array.from({ length: 6 }, (_, index) => ({
      name: `Extra ${index}`, level: 1, kind: "utility", icon: "x",
    }))];
    const second = newCharacter(board, "Barry Test", "hunter", 60);
    expect(autoPlace(second, tooMany).length).toBe(6);
  });
});

describe("export", () => {
  test("writes the fixed base binds and one line per bound key", () => {
    const character = newCharacter(board, "Barry Test", "hunter", 60);
    autoPlace(character, hunter.abilities);
    character.slots.F.bare = { k: "cmd", binding: "INTERACTTARGET", label: "Interact" };
    character.slots.W.shift = { k: "bar", bar: 2, slot: 1 };
    const text = toBindings(character, board);
    expect(text).toContain("bind S MOVEFORWARD");
    expect(text).toContain("bind Q ACTIONBUTTON1");
    expect(text).toContain("bind SHIFT-W MULTIACTIONBAR1BUTTON1");
    expect(text).toContain("bind F INTERACTTARGET");
    const bound = Object.values(character.slots)
      .flatMap((slots) => Object.values(slots))
      .filter(Boolean).length;
    expect(text.split("\n").filter(Boolean).length).toBe(15 + bound);
  });

  test("macro text lists each macro with its icon", () => {
    expect(toMacroText({ macros: hunter.macros })).toContain("# Pet Attack");
    expect(toMacroText({ macros: [] })).toBe("No macros yet.\n");
  });

  test("a command binding is exported as its own binding, not a bar slot", () => {
    expect(bindingFor({ k: "cmd", binding: "STOPCASTING", label: "Stop" })).toBe("STOPCASTING");
    expect(bindingFor({ k: "bar", bar: 3, slot: 7 })).toBe("MULTIACTIONBAR2BUTTON7");
    expect(bindingFor(null)).toBe(null);
  });
});

describe("validate", () => {
  test("passes a clean profile", () => {
    const character = newCharacter(board, "Barry Test", "hunter", 60);
    autoPlace(character, hunter.abilities);
    const profile = { characters: [character], macros: hunter.macros, active: character.id };
    expect(validate(board, { hunter }, profile)).toEqual([]);
  });

  test("catches a level outside 1 to 60", () => {
    const character = newCharacter(board, "Barry Test", "hunter", 99);
    const problems = validate(board, { hunter }, { characters: [character], macros: [] });
    expect(problems.some((problem) => problem.includes("outside 1 to 60"))).toBe(true);
  });

  test("catches a bar slot bound twice", () => {
    const character = newCharacter(board, "Barry Test", "hunter", 1);
    character.slots.Q.bare = { k: "bar", bar: 1, slot: 1 };
    character.slots.W.bare = { k: "bar", bar: 1, slot: 1 };
    const problems = validate(board, { hunter }, { characters: [character], macros: [] });
    expect(problems.some((problem) => problem.includes("bound twice"))).toBe(true);
  });
});

describe("placing a spell from the tray", () => {
  test("a spell sits on one key, so a second drop moves it", () => {
    const character = newCharacter(board, "Barry Test", "hunter", 60);
    expect(placeAbility(character, "Q", "bare", hunter.abilities[0])).toBe(true);
    expect(findPlacement(character, "Serpent Sting")).toBe("Q");
    expect(placeAbility(character, "W", "bare", hunter.abilities[0])).toBe(true);
    expect(findPlacement(character, "Serpent Sting")).toBe("W");
    expect(character.slots.Q.bare).toBe(null);
  });

  test("a key with no bar slot refuses the drop", () => {
    const character = newCharacter(board, "Barry Test", "hunter", 60);
    expect(placeAbility(character, "H", "bare", hunter.abilities[0])).toBe(false);
    expect(character.slots.H.bare.binding).toBe("TOGGLECHARACTER4");
  });

  test("the board holds what the tray does not", () => {
    const character = newCharacter(board, "Barry Test", "hunter", 60);
    placeAbility(character, "Q", "bare", hunter.abilities[0]);
    expect([...placedAbilityNames(character)]).toEqual(["Serpent Sting"]);
    expect(availableAbilities(character, hunter.abilities).map((ability) => ability.name)).toEqual([
      "Arcane Shot", "Mend Pet", "Tame Beast",
    ]);
  });
});

describe("reading a bindings-cache.wtf", () => {
  const grid = {
    keys: ["Q", "W", "B", "Z", "Bksp", "Esc"].map((legend) => ({ legend, x: 0, y: 0, w: 1, rot: 0 })),
  };
  const fresh = () => newCharacter(grid, "Barry Test", "hunter", 60);

  test("a modifier and a bar prefix turn into the key the plan drives", () => {
    expect(parseWtfKey("CTRL-SHIFT-Q")).toEqual({ mod: "ctrlshift", legend: "Q" });
    expect(parseWtfKey("BACKSPACE")).toEqual({ mod: "bare", legend: "Bksp" });
    expect(actionFromBinding("MULTIACTIONBAR1BUTTON3")).toEqual({ k: "bar", bar: 2, slot: 3 });
    expect(actionFromBinding("BONUSACTIONBUTTON2")).toEqual({ k: "pet", slot: 2 });
    expect(actionFromBinding("TOGGLEBACKPACK")).toEqual({ k: "cmd", binding: "TOGGLEBACKPACK", label: "Bags" });
    expect(actionFromBinding("NONE")).toBe(null);
  });

  test("binds land on the key they name, and an unknown key is reported", () => {
    const character = fresh();
    const text = "bind SHIFT-B MULTIACTIONBAR1BUTTON3\nbind BACKSPACE INTERACTTARGET\nbind J UNKNOWNKEY";
    const result = applyBindings(character, grid, text);
    expect(result.applied).toBe(2);
    expect(result.unknownKeys).toEqual(["J"]);
    expect(character.slots.B.shift).toEqual({ k: "bar", bar: 2, slot: 3 });
    expect(character.slots.Bksp.bare).toEqual({ k: "cmd", binding: "INTERACTTARGET", label: "Interact" });
  });

  test("the spell already on a bar slot follows the key that drives it", () => {
    const character = fresh();
    character.slots.Q.bare = { k: "bar", bar: 1, slot: 5, ability: "Serpent Sting", icon: "a" };
    applyBindings(character, grid, "bind W ACTIONBUTTON5");
    expect(character.slots.W.bare.ability).toBe("Serpent Sting");
    expect(character.slots.Q.bare).toBe(null);
  });

  test("a bind takes its slot off whichever key had it", () => {
    const character = fresh();
    character.slots.Q.bare = { k: "bar", bar: 1, slot: 2 };
    applyBindings(character, grid, "bind W ACTIONBUTTON2");
    expect(character.slots.W.bare).toEqual({ k: "bar", bar: 1, slot: 2 });
    expect(character.slots.Q.bare).toBe(null);
  });
});

describe("boards", () => {
  for (const entry of boardsIndex.boards) {
    test(`${entry.id} is a usable board`, async () => {
      const data = await Bun.file(entry.file).json();
      expect(validateBoard(data)).toEqual([]);
      expect(data.keys.length).toBe(entry.keys);
    });
  }

  test("a board without the grid keys is rejected", () => {
    const problems = validateBoard({ keys: [{ legend: "Q", x: 0, y: 0, w: 1 }] });
    expect(problems.some((problem) => problem.includes("grid keys"))).toBe(true);
  });
});
