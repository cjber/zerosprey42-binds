---
name: zerosprey42-binds
description: Plan WoW: Forever keybinds, level order and macros for the Zerosprey42, and export a bindings-cache.wtf. Use when changing the board layout, class data, the slot plan, auto-place behaviour, the export format, or a saved profile in this repo.
---

# Zerosprey42 binds

A static app plus an agent-first CLI over one pure module. `AGENTS.md` has the commands and the rules;
this skill is the short version an agent needs before touching it.

## Before you change anything

```sh
bun run check     # data validation and unit tests; must be green before and after
```

## The one rule that matters

A physical key plus a layer maps to exactly one bar slot, defined once in `SLOT_PLAN` in
`lib/planner.js`. If a task seems to need a different slot per character, the task is wrong: change the
plan for everyone or do not change it.

## Common jobs

- **Add or fix a class**: `assets/classes/<class>.json`, then `python3 tools/fetch-icons.py`, then
  `bun tools/cli.ts profile --class <class> --level 60 --out assets/profiles/<name>.json`, then
  `bun run check`.
- **Regenerate someone's profile**: `bun tools/cli.ts profile --name "<name>" --class <class> --level <n>
  --out assets/profiles/<file>.json`. This is deterministic: the same inputs give the same file.
- **Export what a profile binds**: `bun tools/cli.ts export --format wtf`, `--out <path>` to write a file.
- **Change the arrangement**: `tools/build-board.py` writes `assets/board.json`; the app and the CLI both
  read it. Keep 42 keys.
- **Add a macro kind**: macros live in a class file's `macros` array and in profiles; they are text, and
  nothing here creates them in game.

## What this cannot do

It cannot write action bars or create macros in the client. The export is applied by the player or by a
companion addon using `PickupSpell`/`PlaceAction` and `CreateMacro`.
