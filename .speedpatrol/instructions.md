# About the app

A static planner: `index.html`, `style.css` and ES modules, with no build step and a Bun CLI over the
same pure module. `bun tools/dev.ts` serves it; `bun run check` is the gate.

- Keep a change only when it speeds the app up or shortens the gate. The e2e run boots Chrome, so it
  dominates: improving it means fewer sleeps and a faster readiness check, not fewer assertions.
- Every change must keep `bun run check` green, which includes the twelve e2e checks.
- Never weaken an assertion to make a benchmark faster.
