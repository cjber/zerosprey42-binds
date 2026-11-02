# About the code

One pure module, `lib/planner.js`, holds the planner: slot plan, auto-place, export and validation, with
no DOM and no network. `app.js` is the browser shell, `tools/cli.ts` the agent-facing CLI and
`tests/planner.test.ts` the unit tests; all three import that module.

- Keep the pure module free of DOM and fetch so the CLI and the tests keep working.
- A refactor must keep `bun run check` green, e2e included, and must not change the export format.
- `assets/board.json` and `assets/icons/` are generated; never hand-edit them.
