# Zerosprey42 binds

A planner for WoW: Forever keybinds on a 42-key board. Open `index.html`, or serve the folder, and it
draws your Zerosprey42 keys with four bind layers each, places your class abilities as you level, keeps a
list of macros, and exports a `bindings-cache.wtf` you can drop into the client.

No build step, no dependencies, no backend: plain HTML, CSS and JS, so any static host serves it.

## What it does

- **Binds**: every key on the board carries four slots, bare, Shift, Ctrl and Alt. Click a chip to assign
  a bar slot, a pet action, a command or a macro. F, G, T, S, B and Space are treated as utility keys and
  are never auto-filled.
- **Level plan**: pick a class and a level. Each ability lists its level and where it sits. Auto-place
  puts every ability you have learned into the next free slot in a fixed order (bare first, then Shift,
  Ctrl, Alt, Q W E R Z X C V), so a new spell never means deciding where it goes.
- **Macros**: name, icon and body, kept with the profile and listed on export.
- **Export**: the `bindings-cache.wtf` lines for the active character, and the macros as text.
- Profiles are per character and live in `localStorage`; download the JSON to move them between browsers.

## The board

`assets/board.json` is generated from the Vial firmware
(`beekeeb/vial-qmk-zerosprey42`, `keyboards/beekeeb/zerosprey42`): `info.json` for the key order and
matrix, `keymaps/vial/keymap.c` for the default legends. It is a 3x6 + 3 thumbs split, 42 keys.

The board is drawn as a grid for now. The physical shape (column stagger and the angled thumbs) is in
`pcb/zerosprey42.kicad_pcb` in the same repository: every switch has an `at x y rotation`, and the
footprint pads name the row and column nets, so a small parser can lay the keys out exactly. That is the
next change to the app, not a blocker.

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

## Run it

```sh
python3 -m http.server 8765 --bind 127.0.0.1   # then open http://127.0.0.1:8765/
```

## Deploy

It is a static folder, so Cloudflare Pages serves it directly:

1. Create a Pages project from this repository, output directory `/`, no build command.
2. Add `binds.cjber.dev` as a custom domain on that project, and the CNAME that Pages shows.
3. Every push to `main` redeploys.

## Layout

```
index.html            shell
style.css             dark theme
app.js                all of it: state, board, plan, macros, export
assets/board.json     the 42 keys and their matrix positions
assets/classes/*.json ability lists by class
```
