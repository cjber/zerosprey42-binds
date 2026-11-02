// Agent-facing CLI. Every action has a --json mode; nothing here needs a browser.
//   bun tools/cli.ts plan --class hunter --level 60 --json
//   bun tools/cli.ts export --character barry-buckfast --format wtf
//   bun tools/cli.ts validate --json
//   bun tools/cli.ts profile --name "Barry Buckfast" --class hunter --level 60 --out assets/profiles/barry.json

import {
  autoPlace, blankSlots, findPlacement, newCharacter, toBindings, toMacroText, validate,
  validateBoard, MODS,
} from "../lib/planner.js";

const root = new URL("..", import.meta.url).pathname;
const read = async (path) => JSON.parse(await Bun.file(`${root}${path}`).text());
const boardsIndex = await read("assets/boards/index.json");

async function loadBoard(id) {
  const entry = boardsIndex.boards.find((candidate) => candidate.id === id);
  if (!entry) {
    console.error(`no board ${id}; choose one of ${boardsIndex.boards.map((b) => b.id).join(", ")}`);
    process.exit(2);
  }
  return read(entry.file);
}

async function loadClasses() {
  const dir = `${root}assets/classes`;
  const classes = {};
  for (const entry of new Bun.Glob("*.json").scanSync(dir)) {
    const data = JSON.parse(await Bun.file(`${dir}/${entry}`).text());
    classes[data.class] = data;
  }
  return classes;
}

async function loadProfile(path = "assets/profiles/barry.json") {
  try {
    return await read(path);
  } catch {
    return { characters: [], macros: [], active: null };
  }
}

const args = process.argv.slice(2);
const command = args[0];
const flag = (name, fallback = null) => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? fallback : (args[index + 1] ?? true);
};
const json = args.includes("--json");

const classes = await loadClasses();
const profile = await loadProfile();
const selected = String(flag("board", profile.board ?? "zerosprey42"));
const board = await loadBoard(selected);
const universe = (await Promise.all(boardsIndex.boards.map((entry) => loadBoard(entry.id))))
  .flatMap((candidate) => candidate.keys.map((key) => key.legend));

if (command === "validate") {
  const problems = [];
  for (const entry of boardsIndex.boards) {
    if (entry.id !== selected) problems.push(...validateBoard(await loadBoard(entry.id)));
  }
  problems.push(...validate(board, classes, profile, universe));
  if (json) {
    console.log(JSON.stringify({ ok: problems.length === 0, problems }, null, 2));
  } else {
    console.log(problems.length ? problems.join("\n") : "board, classes and profile are consistent");
  }
  process.exit(problems.length ? 1 : 0);
}

const levelIsValid = (level: number) => Number.isInteger(level) && level >= 1 && level <= 60;

if (command === "plan") {
  const klass = flag("class", "hunter");
  const level = Number(flag("level", 60));
  if (!levelIsValid(level)) {
    console.error(`level must be a whole number from 1 to 60, got ${flag("level")}`);
    process.exit(2);
  }
  const name = flag("name", `Barry ${klass}`);
  const data = classes[klass];
  if (!data) {
    console.error(`no class data for ${klass}`);
    process.exit(2);
  }
  const character = newCharacter(board, name, klass, level);
  const unplaced = autoPlace(character, data.abilities);
  const rows = data.abilities
    .slice()
    .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name))
    .map((ability) => ({
      name: ability.name,
      level: ability.level,
      kind: ability.kind,
      icon: ability.icon,
      key: findPlacement(character, ability.name),
      known: ability.level <= level,
    }));
  if (json) {
    console.log(JSON.stringify({ class: klass, level, keys: character.slots, abilities: rows, unplaced }, null, 2));
  } else {
    for (const row of rows) {
      console.log(`${String(row.level).padStart(2)}  ${row.name.padEnd(22)} ${row.key ?? (row.known ? "not placed" : "")}`);
    }
    if (unplaced.length) console.log(`\nno room for: ${unplaced.join(", ")}`);
  }
}

if (command === "export") {
  const id = flag("character", profile.active ?? profile.characters[0]?.id);
  const character = profile.characters.find((c) => c.id === id || c.name.toLowerCase().includes(String(id)));
  if (!character) {
    console.error(`no character ${id}`);
    process.exit(2);
  }
  const format = flag("format", "wtf");
  const text = format === "macros" ? toMacroText(profile) : toBindings(character, board);
  const out = flag("out");
  if (out) {
    const target = String(out).startsWith("/") ? String(out) : `${root}${out}`;
    await Bun.write(target, text);
    console.log(`wrote ${out}`);
  } else {
    console.log(text);
  }
}

if (command === "profile") {
  const name = String(flag("name", "Barry Buckfast"));
  const klass = String(flag("class", "hunter"));
  const level = Number(flag("level", 60));
  if (!levelIsValid(level)) {
    console.error(`level must be a whole number from 1 to 60, got ${flag("level")}`);
    process.exit(2);
  }
  const target = String(flag("out", `assets/profiles/${klass}.json`));
  const character = newCharacter(board, name, klass, level);
  autoPlace(character, classes[klass]?.abilities ?? []);
  // The utility keys every character gets, outside the auto-filled grid.
  // The owner's own binds: F9 interacts, S walks forward, mouse 3 autoruns. The rest are additions on
  // keys those binds never used.
  const utility: Array<[string, string, unknown]> = [
    ["F9", "bare", { k: "cmd", binding: "INTERACTTARGET", label: "Interact" }],
    ["T", "bare", { k: "cmd", binding: "TARGETNEARESTENEMY", label: "Target nearest" }],
    ["G", "bare", { k: "cmd", binding: "BONUSACTIONBUTTON1", label: "Pet attack" }],
    ["G", "shift", { k: "cmd", binding: "BONUSACTIONBUTTON2", label: "Pet follow" }],
    ["G", "ctrl", { k: "cmd", binding: "STOPCASTING", label: "Stop cast" }],
    ["B", "bare", { k: "cmd", binding: "TOGGLEBACKPACK", label: "Bags" }],
    ["Space", "bare", { k: "cmd", binding: "JUMP", label: "Jump" }],
  ];
  for (const [legend, mod, action] of utility) {
    // F9 is not a board key, so it lives in the character's extra binds rather than a slot.
    if (character.slots[legend]) character.slots[legend][mod] = action;
    else (character.extra ??= {})[`${mod}:${legend}`] = action;
  }
  const macros = (classes[klass]?.macros ?? []).map((macro) => ({ ...macro }));
  const next = {
    board: selected,
    characters: [character],
    macros,
    active: character.id,
  };
  await Bun.write(`${root}${target}`, `${JSON.stringify(next, null, 2)}\n`);
  const placed = Object.values(character.slots)
    .flatMap((slots) => MODS.map((mod) => slots[mod.id]))
    .filter((action) => action?.ability).length;
  console.log(`wrote ${target}: ${placed} abilities placed for ${name} (${klass}, level ${level})`);
}

if (!command) {
  console.error("commands: validate, plan, export, profile");
  process.exit(2);
}

// Anything else is a typo, and a typo must not look like success.
if (!["validate", "plan", "export", "profile"].includes(command)) {
  console.error(`unknown command: ${command}`);
  console.error("commands: validate, plan, export, profile");
  process.exit(2);
}
