# Zerosprey42 binds

A planner for WoW: Forever keybinds on a 42-key board. Open `index.html`, or serve the folder, and it
draws your Zerosprey42 keys with the real thumb cluster, places your class abilities as you level, keeps
a list of macros, and exports a `bindings-cache.wtf` you can drop into the client.

No build step, no dependencies, no backend: plain HTML, CSS and JS, so any static host serves it.

## What it does

- **Binds**: every key on the board carries five slots, bare, Shift, Ctrl, Ctrl+Shift and Alt. Click a
  chip to assign a bar slot, a pet action, a command or a macro. Alt is kept for mounts, food, potions
  and other items, so auto-place never puts a spell there. G, T, S, B and Space keep their bare press as
  a utility key and lend their unused modifiers to the last few spells.
- **Level plan**: pick a class and a level. Each ability lists its level and where it sits. Auto-place
  puts every ability you have learned into the next free slot in a fixed order (bare first, then Shift,
  Ctrl, Alt, Q W E R Z X C V), so a new spell never means deciding where it goes.
- **Macros**: name, icon and body, kept with the profile and listed on export.
- **Export**: the `bindings-cache.wtf` lines for the active character, and the macros as text.
- Profiles are per character and live in `localStorage`; download the JSON to move them between browsers.

## The board

`assets/board.json` comes from the keyboard itself. `tools/read-pcb.py` reads the 42 switch footprints in
`pcb/zerosprey42.kicad_pcb` (`beekeeb/zerosprey42`): centre, width and the 1.5u thumbs, which gives the
V-shaped halves, the two inner columns that step down towards the thumbs, and the thumb fan with the
wide key inboard. `tools/build-board.py` converts those millimetres into key units and the box the page
draws. The firmware's Vial layout is not used for geometry: its thumb entries cascade a row each and its
outer columns sit a key low, so it draws a board that does not exist.

The keyboard itself is selectable next to the level field. `assets/boards/index.json` lists the boards and
`tools/import-qmk.py` regenerates the QMK ones (Corne 3x6 and 3x5, Sofle, Lily58, Planck) from QMK's own
layout coordinates. The choice is stored in the profile, and the CLI takes `--board <id>`. Spells still
fill the same eight grid keys, so a board without them is rejected by `validate`.

## Class data

`assets/classes/<class>.json` is the ability list: `name`, `level`, and `kind` (`attack`, `buff`,
`utility`, `pet`, `passive`). Passives are skipped by auto-place.

The Hunter file is a seed. The authoritative list of what this client teaches, and at which level, is
`Data/ClassSpells.lua` in `cjber/tweaks-forever` (spell IDs, level and fee, from the client and
CMaNGOS); it needs names attached before it can be imported here.

## What it cannot do

A web page cannot write action bars or create macros. The export is for you or for a small companion
addon to apply: `PickupSpell` and `PlaceAction` can place a spell on a bar out of combat, and `CreateMacro`
can create a macro where the client allows it.

## The hunter profile

`assets/profiles/barry.json` is a level 60 hunter with every ability the client teaches on a key: 42 of
them, across four spell layers on the eight grid keys plus ten spare layers on T, G, S and B. Attacks fill
the bare and Shift layers first, then pet actions, buffs and the situational spells, so the rotation is on
the keys the hand already knows. Alt stays empty for mounts, food and other items. F9 interacts, S walks
forward, mouse 3 autoruns, as before.

## Tested

`bun run check` is the gate: it validates the board, the class data and the profile, runs the unit tests,
then boots headless Chrome and drives the page end to end. The e2e run asserts the 42 keys, the shipped
profile, icons on every placed ability, the palette, assignment, the exported binding, level re-planning,
the fit at 1100px and the macro list.

## Run it

```sh
bun tools/dev.ts          # http://127.0.0.1:8770/, reloads the page when a file changes
python3 -m http.server 8765 --bind 127.0.0.1   # or any static server, no reload
```

Spell icons are the client's own art names, fetched once into `assets/icons/` by
`python3 tools/fetch-icons.py`, so the app works offline afterwards.

## Deploy

```sh
bun run deploy                                   # builds dist/ and deploys the Worker
python3 tools/attach-domain.py                   # binds.cjber.dev, in the zone's own account
```

The Worker is named `zerosprey42-binds` and serves `dist/` as static assets. Cloudflare only attaches
a custom domain when the hostname's zone is in the same account as the Worker, so `attach-domain.py`
reads the zone's account from the API rather than assuming one: the live staging copy is under the
Nebula account while `cjber.dev` is elsewhere, and the domain step has to run in whichever account
holds the zone.

## Layout

```
index.html            shell
style.css             dark theme
app.js                all of it: state, board, plan, macros, export
assets/board.json     the 42 keys and their matrix positions
assets/classes/*.json ability lists by class
```
