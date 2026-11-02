// End-to-end check: serves the app, drives a real headless Chrome over CDP, asserts behaviour.
// Run: bun tools/e2e.ts   (exit 0 only when every assertion passes)

import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PORT = 8791;
const chromePath = ["/usr/bin/google-chrome-stable", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(existsSync);
if (!chromePath) {
  console.error("no chrome found");
  process.exit(2);
}

const failures: string[] = [];
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) failures.push(name);
};

const profile = mkdtempSync(join(tmpdir(), "zerosprey-e2e-"));
const server = spawn("bun", ["tools/dev.ts", String(PORT)], { stdio: "ignore" });
const chrome = spawn(
  chromePath,
  [
    "--headless=new",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-gpu",
    "--remote-debugging-port=0",
    `--user-data-dir=${profile}`,
    "--window-size=1400,1000",
    "about:blank",
  ],
  { stdio: "ignore" },
);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitPort(path: string) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (existsSync(path)) {
      const [port, browser] = readFileSync(path, "utf8").split("\n");
      if (port && browser) return { port, browser };
    }
    await sleep(100);
  }
  throw new Error(`devtools port file never appeared: ${path}`);
}

async function main() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${PORT}/`);
      if (response.ok) break;
    } catch {
      /* keep waiting */
    }
    await sleep(150);
  }

  const { port, browser } = await waitPort(join(profile, "DevToolsActivePort"));
  const ws = new WebSocket(`ws://127.0.0.1:${port}${browser}`);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });

  let id = 0;
  const pending = new Map<number, (value: any) => void>();
  ws.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data));
    const resolve = pending.get(message.id);
    if (resolve) {
      pending.delete(message.id);
      resolve(message.result ?? {});
    }
  });
  const call = (method: string, params: Record<string, unknown> = {}, sessionId?: string) =>
    new Promise<any>((resolve) => {
      id += 1;
      pending.set(id, resolve);
      ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });

  const { targetId } = await call("Target.createTarget", { url: `http://127.0.0.1:${PORT}/` });
  const { sessionId } = await call("Target.attachToTarget", { targetId, flatten: true });
  await sleep(2500);

  const evaluate = async (expression: string) => {
    const result = await call(
      "Runtime.evaluate",
      { expression, returnByValue: true, awaitPromise: true },
      sessionId,
    );
    if (result.exceptionDetails) throw new Error(`page threw: ${result.exceptionDetails.text}`);
    return result.result?.value;
  };

  await evaluate("localStorage.clear(); location.reload(); true");
  await sleep(2500);

  // A stored profile that binds nothing is the mark of a failed load: the shipped one must win, and
  // the empty one must not be saved back.
  await evaluate(
    `localStorage.setItem('zerosprey-binds-v4', JSON.stringify({characters:[{id:'x',name:'Barry Buckfast',class:'hunter',level:60,slots:{}}],macros:[],active:'x'})); location.reload(); true`,
  );
  await sleep(2500);
  const recovered = await evaluate(
    "JSON.stringify({placed: document.querySelectorAll('.key.assigned').length, stored: (JSON.parse(localStorage.getItem('zerosprey-binds-v4')||'{}').characters?.[0]?.slots && Object.values(JSON.parse(localStorage.getItem('zerosprey-binds-v4')).characters[0].slots).reduce((n,s)=>n+Object.values(s).filter(Boolean).length,0)) })",
  );
  const recovery = JSON.parse(recovered);
  check("an empty stored profile is replaced by the shipped one", recovery.placed > 0, recovered);
  check("the shipped profile is written back", recovery.stored > 0, `stored ${recovery.stored}`);

  const keys = await evaluate("document.querySelectorAll('.key').length");
  check("the board renders 42 keys", keys === 42, `got ${keys}`);

  const profileName = await evaluate("document.querySelector('.chars button.on')?.textContent");
  check("the shipped hunter profile loads", profileName === "Barry Buckfast", `got ${profileName}`);

  const abilityIcons = await evaluate("document.querySelectorAll('.key img').length");
  check("every placed ability shows its icon, on the bare layer and the mod chips", abilityIcons >= 32, `got ${abilityIcons}`);
  const noBroken = await evaluate("[...document.images].filter((i) => !i.complete || i.naturalWidth === 0).length");
  check("no icon fails to load", noBroken === 0, `broken: ${noBroken}`);

  const labels = await evaluate(
    "JSON.stringify([...document.querySelectorAll('.key .primary span')].map((s) => s.textContent).slice(0, 4))",
  );
  check("placed keys are named", labels.includes("Serpent") || labels.includes("Arcane"), labels);

  // Assigning a spell through the palette updates the key and the export.
  await evaluate(
    "document.querySelectorAll('.key')[1].querySelector('.primary').click(); true",
  );
  await sleep(300);
  const paletteOpen = await evaluate("!document.getElementById('palette').hidden");
  check("clicking a key opens the palette", paletteOpen === true);

  await evaluate(
    "(() => { const b = [...document.querySelectorAll('#palette button')].find((x) => x.textContent.includes('Aimed Shot')); b.click(); return true; })()",
  );
  await sleep(400);
  const assigned = await evaluate(
    "document.querySelectorAll('.key')[1].querySelector('.primary span')?.textContent",
  );
  check("picking a spell assigns it to the key", assigned === "Aimed Shot", `got ${assigned}`);

  const bindLine = await evaluate(
    `document.getElementById('out-bindings').textContent.split('\\n').find((l) => l.startsWith('bind Q '))`,
  );
  check("the export carries the key's bar slot", bindLine === "bind Q ACTIONBUTTON1", String(bindLine));

  // Dropping to level 1 and re-planning keeps only what a level 1 hunter knows.
  await evaluate(
    "(() => { const i = document.querySelector('.chars input'); i.value = '1'; i.dispatchEvent(new Event('change')); return true; })()",
  );
  await sleep(300);
  await evaluate("document.querySelector('.tabs button[data-tab=plan]').click(); true");
  await sleep(200);
  await evaluate("document.getElementById('plan-clear').click(); true");
  await sleep(200);
  await evaluate("document.getElementById('plan-auto').click(); true");
  await sleep(400);
  const levelOne = await evaluate(
    "JSON.stringify([...document.querySelectorAll('.key .primary span')].map((s) => s.textContent))",
  );
  const named = JSON.parse(levelOne);
  const storedLevel = await evaluate(
    "JSON.parse(localStorage.getItem('zerosprey-binds-v4')).characters[0].level",
  );
  check("the level field is saved to the profile", storedLevel === 1, `got ${storedLevel}`);
  check(
    "a level 1 hunter carries Track Beasts and no trained attack",
    named.includes("Track Beasts") && !named.includes("Serpent Sting") && !named.includes("Aimed Shot"),
    levelOne,
  );
  await evaluate("document.querySelector('.tabs button[data-tab=binds]').click(); true");
  await sleep(400);

  // The board fits its container instead of scrolling.
  await call("Emulation.setDeviceMetricsOverride", { width: 1100, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await sleep(600);
  const fit = await evaluate(
    "JSON.stringify({ scroll: document.querySelector('.stage').scrollWidth, client: document.querySelector('.stage').clientWidth, scale: document.getElementById('board').style.transform })",
  );
  const { scroll, client, scale } = JSON.parse(fit);
  check("the board fits at 1100px with no horizontal scroll", scroll === client, fit);
  check("the board is scaled to fit", /scale\(0\.\d+\)/.test(scale), scale);

  // Macros tab lists the shipped macros.
  await evaluate("document.querySelector('.tabs button[data-tab=macros]').click(); true");
  await sleep(300);
  const macroCount = await evaluate("document.querySelectorAll('#macro-list li').length");
  check("macros are listed", macroCount === 3, `got ${macroCount}`);

  ws.close();
}

main()
  .catch((error) => {
    console.error("e2e crashed:", error.message);
    failures.push("crash");
  })
  .finally(() => {
    chrome.kill();
    server.kill();
    console.log(failures.length ? `\n${failures.length} failed` : "\nall e2e checks passed");
    process.exit(failures.length ? 1 : 0);
  });
