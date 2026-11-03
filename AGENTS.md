# Zerosprey42 binds

Plan WoW: Forever keybinds, level order and macros for a 42-key board, then export a
`bindings-cache.wtf`. Static site, no build step, no runtime dependencies.

This file is for agents. A human wanting the app can read `README.md`.

## Commands

```sh
bun tools/dev.ts                  # dev server on http://127.0.0.1:8770/, live reload
bun run check                     # the gate: validate, unit tests, then the browser e2e run
bun test                          # unit tests only
bun tools/e2e.ts                  # headless Chrome drives the page and asserts twelve behaviours
bun tools/cli.ts validate --json   # board, class and profile consistency
bun tools/cli.ts plan --class hunter --level 60 --json
bun tools/cli.ts export --format wtf --out /tmp/binds.wtf
bun tools/cli.ts profile --name "Barry Buckfast" --class hunter --level 60 --out assets/profiles/barry.json
python3 tools/build-board.py      # rebuild assets/board.json from the Vial definition
python3 tools/import-qmk.py       # regenerate the selectable QMK boards in assets/boards/
python3 tools/fetch-icons.py      # cache spell icons into assets/icons/
```

Every command exits non-zero on failure and `--json` prints machine-readable output. There is no
browser requirement for anything except the UI itself.

## Layout

- `lib/planner.js` is the whole of the logic: slot plan, auto-place, export, validation. No DOM, no
  fetch. Everything here is unit tested.
- `app.js` is the browser shell only: it renders the board and calls `lib/planner.js`.
- `tools/cli.ts` is the agent-facing entry point, importing the same module.
- `assets/board.json` is the Zerosprey42 board: 42 keys with `legend`, `x`, `y`, `w` and `rot` in key
  units, plus the box, built from `assets/vial-definition.json`. `assets/boards/index.json` lists the
  selectable boards and `assets/boards/<id>.json` holds them.
- `assets/classes/<class>.json` is the ability list: `name`, `level`, `kind`
  (`attack`/`buff`/`utility`/`pet`/`passive`), `icon`, plus an optional `macros` array.
  `assets/classes/index.json` lists the classes the page loads.
- `assets/profiles/<name>.json` is a saved profile: characters (with their slots), macros, active id.
- `assets/icons/<icon>.jpg` are the client's own spell icons, cached.

## Rules

- A key drives a fixed bar slot. `SLOT_PLAN` is the single source of truth: bare and Shift fill bar 1,
  Ctrl fills bar 2, Ctrl+Shift reaches bars 3 and 4. Alt is reserved for mounts, food and items, so no
  spell goes there. Do not invent slots per character.
- F, G, T, S, B and Space keep their bare press as a utility key; only their unused modifiers may carry
  the last few spells.
- The right-hand keys carry the client's UI panels, not spells. `UI_BINDS` in `lib/planner.js` is the one
  table: H Honor, K Professions, P Spellbook, L Quest log, and the rest of the standard binds.
- Keep `lib/planner.js` free of DOM and network access so the CLI and the tests keep working.
- No build step and no runtime dependencies. Ship plain HTML, CSS and modules.
- A change to data files must keep `bun run check` green; a change to logic must add or update a test.
- Never write a browser-only path for something the CLI should do.

## Adding a class

1. Write `assets/classes/<class>.json` with the abilities and their levels, kinds and icons, and add it
   to `assets/classes/index.json`.
2. `python3 tools/fetch-icons.py` to cache the icons.
3. `bun tools/cli.ts profile --class <class> --level 60 --out assets/profiles/<name>.json`.
4. `bun run check`.

## Patrols

All four agent-labs-dev products are configured here, and their checks are the gate above.

- Mergepatrol: `.mergepatrol/mergepatrol.yml` plus the skill, and the App is installed here. Label a PR
  `mergepatrol` and the queue takes it; PR #1 went in that way.
- Speedpatrol: `.speedpatrol/` times `gate.unit` and `gate.e2e`. Run `npx -y speedpatrol@latest run`.
- Sloppatrol: `.sloppatrol/` uses the gate as its oracle. Run `npx -y sloppatrol@latest check`; it works
  from a clean checkout of `origin/main`, so commit before expecting it to pass.
- Bugpatrol: `.bugpatrol/` describes the app and the e2e harness.

Patrol run data lands under each product's `runs/` folder and is gitignored.

## Where the data comes from

Levels for this client belong in `cjber/tweaks-forever` `Data/ClassSpells.lua` (spell IDs, level, fee,
from the client and CMaNGOS), and both class files here are generated from it. Their `source` field names
the wago.tools build the SpellName and icon exports came from, which is the folder name they sit in:

```sh
C=~/.cache/wowmock/1.60.1.69913
python3 tools/build-class.py ~/drive/proj/wow/tweaks-forever/Data/ClassSpells.lua $C/SpellName.csv hunter assets/classes/hunter.json
python3 tools/build-icons.py $C/SpellMisc.csv $C/ManifestInterfaceData.csv assets/classes/hunter.json
```

Regenerate in place: `build-class.py` keeps the `macros` array from the file it writes over. Board
geometry: see the note in `tools/build-board.py`.
