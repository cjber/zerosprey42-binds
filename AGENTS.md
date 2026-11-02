# Zerosprey42 binds

Plan WoW: Forever keybinds, level order and macros for a 42-key board, then export a
`bindings-cache.wtf`. Static site, no build step, no runtime dependencies.

This file is for agents. A human wanting the app can read `README.md`.

## Commands

```sh
bun tools/dev.ts                  # dev server on http://127.0.0.1:8770/, live reload
bun run check                     # the gate: data validation plus unit tests
bun test                          # unit tests only
bun tools/cli.ts validate --json   # board, class and profile consistency
bun tools/cli.ts plan --class hunter --level 60 --json
bun tools/cli.ts export --format wtf --out /tmp/binds.wtf
bun tools/cli.ts profile --name "Barry Buckfast" --class hunter --level 60 --out assets/profiles/barry.json
python3 tools/build-board.py      # rebuild assets/board.json
python3 tools/fetch-icons.py      # cache spell icons into assets/icons/
```

Every command exits non-zero on failure and `--json` prints machine-readable output. There is no
browser requirement for anything except the UI itself.

## Layout

- `lib/planner.js` is the whole of the logic: slot plan, auto-place, export, validation. No DOM, no
  fetch. Everything here is unit tested.
- `app.js` is the browser shell only: it renders the board and calls `lib/planner.js`.
- `tools/cli.ts` is the agent-facing entry point, importing the same module.
- `assets/board.json` is the board: 42 keys with `legend`, `x`, `y`, `w` and `rot` in key units.
- `assets/classes/<class>.json` is the ability list: `name`, `level`, `kind`
  (`attack`/`buff`/`utility`/`pet`/`passive`), `icon`, plus an optional `macros` array.
- `assets/profiles/<name>.json` is a saved profile: characters (with their slots), macros, active id.
- `assets/icons/<icon>.jpg` are the client's own spell icons, cached.

## Rules

- A key drives a fixed bar slot. `SLOT_PLAN` is the single source of truth: bare and Shift fill bar 1,
  Ctrl fills bar 2, Alt fills bar 3. Do not invent slots per character.
- F, G, T, S, B and Space are utility keys and are never auto-filled.
- Keep `lib/planner.js` free of DOM and network access so the CLI and the tests keep working.
- No build step and no runtime dependencies. Ship plain HTML, CSS and modules.
- A change to data files must keep `bun run check` green; a change to logic must add or update a test.
- Never write a browser-only path for something the CLI should do.

## Adding a class

1. Write `assets/classes/<class>.json` with the abilities and their levels, kinds and icons.
2. `python3 tools/fetch-icons.py` to cache the icons.
3. `bun tools/cli.ts profile --class <class> --level 60 --out assets/profiles/<name>.json`.
4. `bun run check`.

## Where the data comes from

Levels for this client belong in `cjber/tweaks-forever` `Data/ClassSpells.lua` (spell IDs, level, fee,
from the client and CMaNGOS); the Hunter list here is a seed and needs that source plumbed in, with
names attached. Board geometry: see the note in `tools/build-board.py`.
