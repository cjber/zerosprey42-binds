import { describe, expect, test } from "bun:test";
import {
  autoPlace, blankSlots, findPlacement, newCharacter, toBindings, toMacroText, validate,
  SLOT_PLAN, SLOT_ORDER, bindingFor,
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
    expect(seen.size).toBe(32);
  });

  test("bare slots are bar 1, Shift finishes bar 1 and starts bar 2", () => {
    expect(SLOT_PLAN["bare:Q"]).toEqual({ bar: 1, slot: 1 });
    expect(SLOT_PLAN["bare:V"]).toEqual({ bar: 1, slot: 8 });
    expect(SLOT_PLAN["shift:Q"]).toEqual({ bar: 1, slot: 9 });
    expect(SLOT_PLAN["shift:V"]).toEqual({ bar: 2, slot: 4 });
    expect(SLOT_PLAN["ctrl:V"]).toEqual({ bar: 2, slot: 12 });
    expect(SLOT_PLAN["alt:V"]).toEqual({ bar: 3, slot: 8 });
  });
});

describe("autoPlace", () => {
  test("places learned abilities in level order, and stops at the level", () => {
    const character = newCharacter(board, "Barry Test", "hunter", 6);
    autoPlace(character, hunter.abilities);
    expect(findPlacement(character, "Serpent Sting")).toBe("Q");
    expect(findPlacement(character, "Arcane Shot")).toBe("W");
    expect(findPlacement(character, "Mend Pet")).toBe(null);
  });

  test("never takes a utility key", () => {
    const character = newCharacter(board, "Barry Test", "hunter", 60);
    autoPlace(character, hunter.abilities);
    for (const key of ["F", "G", "T", "S", "B", "Space"]) {
      for (const mod of ["bare", "shift", "ctrl", "alt"]) {
        expect(character.slots[key][mod]).toBe(null);
      }
    }
  });

  test("is idempotent", () => {
    const character = newCharacter(board, "Barry Test", "hunter", 60);
    autoPlace(character, hunter.abilities);
    const first = JSON.stringify(character.slots);
    autoPlace(character, hunter.abilities);
    expect(JSON.stringify(character.slots)).toBe(first);
  });

  test("reports abilities it could not fit", () => {
    const many = Array.from({ length: 40 }, (_, index) => ({
      name: `Spell ${index}`, level: 1, kind: "attack", icon: "x",
    }));
    const character = newCharacter(board, "Barry Test", "hunter", 60);
    const unplaced = autoPlace(character, many);
    expect(unplaced.length).toBe(8);
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

  test("catches a bar slot bound twice", () => {
    const character = newCharacter(board, "Barry Test", "hunter", 1);
    character.slots.Q.bare = { k: "bar", bar: 1, slot: 1 };
    character.slots.W.bare = { k: "bar", bar: 1, slot: 1 };
    const problems = validate(board, { hunter }, { characters: [character], macros: [] });
    expect(problems.some((problem) => problem.includes("bound twice"))).toBe(true);
  });
});
