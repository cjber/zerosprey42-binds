# AGENTS.md

Zerosprey42 binds plans WoW: Forever keybinds, level order and macros for a 42-key board and exports a
`bindings-cache.wtf`. A static site with no build step and no runtime dependencies; humans start with `README.md`.

## Commands

```sh
bun run gate                       # the fast local gate: validate, then unit tests
bun run gate:changed               # validate, then only the tests the diff against origin/main reaches
bun run check                      # what CI runs: the gate plus the headless-Chrome e2e (twelve behaviours)
bun tools/dev.ts                   # dev server on http://127.0.0.1:8770/, live reload
bun tools/cli.ts <validate|plan|export|profile> --json   # the agent entry point; every command exits non-zero on failure
python3 tools/build-board.py       # rebuild assets/board.json from the Vial definition
python3 tools/import-qmk.py        # regenerate the selectable QMK boards in assets/boards/
python3 tools/fetch-icons.py       # cache spell icons into assets/icons/
```

## Layout

- `lib/planner.js` is the whole of the logic: slot plan, auto-place, export, validation. No DOM, no fetch, unit
  tested. `app.js` is the browser shell only; `tools/cli.ts` imports the same module. Never write a browser-only path
  for something the CLI should do.
- `assets/board.json` is the 42-key board (`legend`, `x`, `y`, `w`, `rot` in key units) built from
  `assets/vial-definition.json`; `assets/boards/index.json` lists the selectable boards.
- `assets/classes/<class>.json` is the ability list (`name`, `level`, `kind`, `icon`, optional `macros`) and
  `assets/classes/index.json` lists the classes the page loads. `assets/profiles/<name>.json` is a saved profile.
  `assets/icons/` holds the client's own spell icons, cached.

## Rules

- A key drives a fixed bar slot. `SLOT_PLAN` is the single source of truth: bare and Shift fill bar 1, Ctrl bar 2,
  Ctrl+Shift bars 3 and 4. Alt is reserved for mounts, food and items, so no spell goes there. Never invent slots
  per character.
- F, G, T, S, B and Space keep their bare press as a utility key; only their unused modifiers may carry spells.
- The right-hand keys carry the client's UI panels, not spells; `UI_BINDS` in `lib/planner.js` is the one table.
- A change to logic adds or updates a test; a change to data files keeps `bun run gate` green.

## Adding a class

Write `assets/classes/<class>.json` and list it in `assets/classes/index.json`; `python3 tools/fetch-icons.py`; then
`bun tools/cli.ts profile --class <class> --level 60 --out assets/profiles/<name>.json`; then `bun run check`.
Levels come from `cjber/tweaks-forever` `Data/ClassSpells.lua`: both class files here are generated from it
(`tools/build-class.py`, then `tools/build-icons.py`, with the wago.tools CSVs under `~/.cache/wowmock/<build>`, the
build named in each file's `source`). `build-class.py` keeps a file's `macros` array when it rewrites it.

## Patrols

`.mergepatrol/`, `.speedpatrol/`, `.sloppatrol/` and `.bugpatrol/` configure the agent-labs-dev patrols here; their
checks are the gate. Merging goes through MergeLoop (`.agents/skills/mergeloop/SKILL.md`).

## Standards

- `repo-standards`: the RS-* requirements every cjber and agent-labs-dev repo meets; its `audit.py` checks this repo.
