// Write the hunter's level plan as markdown: what arrives at each level and where it lands.
// usage: bun tools/level-plan.ts > docs/level-plan.md

import { autoPlace, findPlacement, newCharacter } from "../lib/planner.js";

const root = new URL("..", import.meta.url).pathname;
const board = JSON.parse(await Bun.file(`${root}assets/board.json`).text());
const hunter = JSON.parse(await Bun.file(`${root}assets/classes/hunter.json`).text());

const character = newCharacter(board, "Barry Buckfast", "hunter", 60);
autoPlace(character, hunter.abilities);

const byLevel = new Map<number, { name: string; kind: string; key: string | null }[]>();
for (const ability of hunter.abilities.slice().sort((a, b) => a.level - b.level || a.name.localeCompare(b.name))) {
  const key = findPlacement(character, ability.name);
  if (!byLevel.has(ability.level)) byLevel.set(ability.level, []);
  byLevel.get(ability.level)!.push({ name: ability.name, kind: ability.kind, key });
}

const lines: string[] = [];
lines.push("# Hunter level plan");
lines.push("");
lines.push("Every ability this client teaches a hunter, the level it first arrives, the kind it is, and the key");
lines.push("it lands on. Late ranks replace the same key, so each ability has one line here, not one per rank.");
lines.push("");
lines.push("| Level | Ability | Kind | Key |");
lines.push("| --- | --- | --- | --- |");
for (const [level, entries] of [...byLevel.entries()].sort((a, b) => a[0] - b[0])) {
  for (const entry of entries) {
    lines.push(`| ${level} | ${entry.name} | ${entry.kind} | ${entry.key ?? "no key"} |`);
  }
}

const unplaced = hunter.abilities.filter((ability) => !findPlacement(character, ability.name));
lines.push("");
lines.push(`Abilities: ${hunter.abilities.length}. Placed: ${hunter.abilities.length - unplaced.length}. Unplaced: ${unplaced.length}.`);
lines.push("");
lines.push("## Layers");
lines.push("");
lines.push("| Layer | Bar | Keys |");
lines.push("| --- | --- | --- |");
lines.push("| bare | bar 1, slots 1-8 | Q W E R Z X C F |");
lines.push("| Shift | bar 1 slots 9-12, bar 2 slots 1-4 | Q W E R Z X C F |");
lines.push("| Ctrl | bar 2, slots 5-12 | Q W E R Z X C F |");
lines.push("| Ctrl+Shift | bar 3 slots 9-12, bar 4 slots 1-4 | Q W E R Z X C F |");
lines.push("| spare | bar 3 slots 1-8, bar 4 slots 5-6 | Shift/Ctrl/Ctrl+Shift on T, G, S and B |");
lines.push("| Alt | bar 3, slots 1-8 | reserved for mounts, food and items, never a spell |");
lines.push("");

console.log(lines.join("\n"));
