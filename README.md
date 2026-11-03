# Zerosprey42 binds

A planner for WoW: Forever keybinds on a 42-key board. Open `index.html`, or serve the folder, and it
draws your Zerosprey42 keys with the real thumb cluster, places your class abilities as you level, keeps
a list of macros, and exports a `bindings-cache.wtf` you can drop into the client.

No build step, no dependencies, no backend: plain HTML, CSS and JS, so any static host serves it.

## What it does

- **Binds**: one layer at a time. Pick bare, Shift, Ctrl, Alt or Ctrl+Shift above the board and every
  key shows that layer's ability with a full name; five dots under each key show which other layers hold
  something, and the tab badges count each layer. Alt is kept for mounts, food, potions and other items,
  so auto-place never puts a spell there. G, T, S, B and Space keep their bare press as a utility key and
  lend their unused modifiers to the last few spells. The interface panels sit on the keys the client
  itself binds them to: P Spellbook, N Talents, L Quest log, O Social, M Map, H Honor, K Skills,
  U Reputation, Esc Game menu, plus Shift+I Pet book, Shift+P Pets, Shift+M Battle map and
  Shift+Space Score screen. A panel the client leaves unbound gets no key here either. Where the
  client ships button art for a panel, the key shows that art instead of its name (fetched into
  `assets/wow/panels/` by `python3 tools/fetch-panel-icons.py`); a command without art keeps its name.
- **Level plan**: pick a class and a level. Each ability lists its level and where it sits. Auto-place
  puts every ability you have learned into the next free slot in a fixed order: the left grid on bare,
  Shift, Ctrl and Ctrl+Shift, then the spare modifiers on T, G, S and B, so a new spell never means
  deciding where it goes.
- **Macros**: name, icon and body, kept with the profile and listed on export.
- **Export**: the `bindings-cache.wtf` lines for the active character, and the macros as text.
- Profiles are per character and live in `localStorage`; download the JSON to move them between browsers.

## The board

`assets/board.json` is built from the keyboard's own Vial layout, the same one Vial draws in its Keymap
tab. `tools/vial-read.py` reads it off the board over raw HID into `assets/vial-definition.json`, and
`tools/build-board.py` parses the KLE. Two rules make it come out right: `x` restarts on each row while
`y` accumulates, and setting `rx`/`ry` moves the cursor to that pivot, which is what puts the six thumbs
in a row under the inner columns. The layout keeps its 3.5 key gap between the halves because the wide
thumb keys reach into it.

The keyboard itself is selectable next to the level field. `assets/boards/index.json` lists the boards and
`tools/import-qmk.py` regenerates the QMK ones (Corne 3x6 and 3x5, Sofle, Lily58, Planck) from QMK's own
layout coordinates. The choice is stored in the profile, and the CLI takes `--board <id>`. Spells still
fill the same eight grid keys, so a board without them is rejected by `validate`.

## Class data

`assets/classes/<class>.json` is the ability list: `name`, `level`, and `kind` (`attack`, `buff`,
`utility`, `pet`, `passive`). Passives are skipped by auto-place. `assets/classes/index.json` lists the
classes the page loads, so adding a file there is enough to make it selectable.

Both files are generated from the client's own data. `Data/ClassSpells.lua` in `cjber/tweaks-forever`
(spell IDs, level and fee, from the client and CMaNGOS) is the authoritative list of what this client
teaches and at which level; `tools/build-class.py` attaches SpellName (one entry per ability, since ranks
share a name and only the first rank needs a slot) and `tools/build-icons.py` attaches the client's own
icon by spell ID.

The tools read wago.tools exports for one client build, kept together in a folder named for that build:
the class file's `source` records the folder name, so the provenance cannot drift from the data.

```sh
C=~/.cache/wowmock/1.60.1.69913
python3 tools/build-class.py ~/drive/proj/wow/tweaks-forever/Data/ClassSpells.lua \
  $C/SpellName.csv hunter assets/classes/hunter.json
python3 tools/build-icons.py $C/SpellMisc.csv $C/ManifestInterfaceData.csv \
  assets/classes/hunter.json
python3 tools/fetch-icons.py
```

The mage takes the same three steps with `mage` in place of `hunter`; its kind rules live in
`MAGE_KIND_OVERRIDES`.

## What it cannot do

A web page cannot write action bars or create macros. The export is for you or for a small companion
addon to apply: `PickupSpell` and `PlaceAction` can place a spell on a bar out of combat, and `CreateMacro`
can create a macro where the client allows it.

## The shipped profiles

`assets/profiles/barry.json` carries both characters: Barry Buckfast, a level 60 hunter with every ability
the client teaches on a key, and Alladys, a level 60 mage with the full trainer list. The hunter fills four
spell layers on the eight grid keys plus ten spare layers on T, G, S and B; the mage fills the same grid
and spare slots. Attacks fill the bare and Shift layers first, then pet actions, buffs and the situational
spells, so the rotation is on the keys the hand already knows. Alt stays empty for mounts, food and other
items. Both characters carry the client's interface panels on its own default keys. F9 interacts, S
walks forward, mouse 3 autoruns, as before.

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
bun run deploy                                   # builds dist/, deploys the Worker and its route
```

The Worker is named `zerosprey42-binds`, serves `dist/`, and lives in the Cloudflare account that
owns `cjber.dev`, so the `binds.cjber.dev/*` route in `wrangler.toml` goes up with every deploy.

The hostname also needs one proxied DNS record in that zone, which a deploy cannot create:

```sh
CLOUDFLARE_API_TOKEN=... python3 tools/attach-domain.py
```

The token needs `Zone:Read`, `DNS:Edit` and `Workers Scripts:Read`; the `wrangler login` OAuth token
does not have DNS rights. A Worker custom domain is deliberately not used: `custom_domain = true`
tries to create that same record during the deploy and fails it after the upload, and the Workers
custom-domain API rejects the OAuth login.

## Layout

```
index.html            shell
style.css             dark theme
app.js                all of it: state, board, plan, macros, export
assets/board.json     the 42 keys and their matrix positions
assets/classes/*.json ability lists by class
```
