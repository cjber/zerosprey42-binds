# About the app

A static bind planner for a 42-key board: `index.html`, `style.css`, `app.js` and `lib/planner.js`, with
a Bun CLI (`tools/cli.ts`) over the same module and a browser e2e run (`tools/e2e.ts`).

## How to run it

    bun tools/dev.ts 8792        # then http://127.0.0.1:8792/
    bun run check                # validate, unit tests, then the e2e run

The e2e run boots headless Chrome, drives the page over CDP and asserts the board, the profile, the
palette, the export, level re-planning, the fit and the macros. Treat a failing e2e check as the report.

## Important flows

- Assigning a spell to a key, and the export line it produces.
- Auto-place at a low level versus level 60.
- The board fitting a narrow window instead of scrolling.

## Never

- Never edit `assets/board.json`, `assets/profiles/**` or `assets/icons/**` by hand: they are generated.
- Never use the network.
