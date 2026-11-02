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
  // Every call times out, so a wedged page fails the gate instead of hanging it.
  const call = (method: string, params: Record<string, unknown> = {}, sessionId?: string) =>
    new Promise<any>((resolve) => {
      id += 1;
      const callId = id;
      const timer = setTimeout(() => {
        pending.delete(callId);
        resolve({ __timeout: true, method });
      }, 15000);
      pending.set(callId, (value) => {
        clearTimeout(timer);
        resolve(value);
      });
      ws.send(JSON.stringify({ id: callId, method, params, ...(sessionId ? { sessionId } : {}) }));
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
    if (result.__timeout) throw new Error(`page did not answer ${result.method} within 15s`);
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

  // Each layer is shown on its own now, so count the icons by walking the tabs.
  const layerIcons = await evaluate(
    `(() => {
      const counts = {};
      for (const button of document.querySelectorAll('.layers button')) {
        button.click();
        counts[button.dataset.layer] = document.querySelectorAll('.key img').length;
      }
      document.querySelector('.layers button[data-layer=bare]').click();
      return JSON.stringify(counts);
    })()`,
  );
  const counts = JSON.parse(layerIcons);
  const totalIcons = Object.values(counts).reduce((total: number, count: number) => total + count, 0);
  check("every layer shows the icons placed on it", totalIcons >= 32, layerIcons);
  check("Alt starts with no spells on it", counts.alt === 0, layerIcons);
  const ctrlSeesQ = await evaluate(
    `(() => {
      document.querySelector('.layers button[data-layer=ctrl]').click();
      const key = [...document.querySelectorAll('.key')].find((k) => k.querySelector('.legend')?.textContent === 'Q');
      const text = key.querySelector('.primary span')?.textContent;
      document.querySelector('.layers button[data-layer=bare]').click();
      return text;
    })()`,
  );
  check("switching layer changes what a key shows", ctrlSeesQ && ctrlSeesQ !== "Serpent Sting", String(ctrlSeesQ));
  const noBroken = await evaluate("[...document.images].filter((i) => !i.complete || i.naturalWidth === 0).length");
  check("no icon fails to load", noBroken === 0, `broken: ${noBroken}`);

  const labels = await evaluate(
    "JSON.stringify([...document.querySelectorAll('.key .primary span')].map((s) => s.textContent))",
  );
  const names = JSON.parse(labels);
  check("placed keys are named", names.includes("Serpent Sting") || names.includes("Arcane Shot"), labels);

  // The movement arrows are Blizzard vehicle art: forward is the pitch-up tile, and the strafe tiles
  // are quarter turns of it. The mapping is easy to rotate one step out, so pin the direction.
  const movement = await evaluate(
    `JSON.stringify(Object.fromEntries(['S', 'A', 'D'].map((legend) => {
      const key = [...document.querySelectorAll('.key')].find((k) => k.querySelector('.legend')?.textContent === legend);
      const icon = key?.querySelector('.movement-icon');
      if (!icon) return [legend, null];
      const box = icon.getBoundingClientRect();
      const primary = key.querySelector('.primary').getBoundingClientRect();
      const fill = Math.abs(box.width - primary.width) <= 1 && Math.abs(box.height - primary.height) <= 1;
      return [legend, { src: icon.getAttribute('src'), transform: icon.style.transform, fill }];
    })))`,
  );
  const arrows = JSON.parse(movement);
  check(
    "movement keys point the right way and fill the cap",
    arrows.S?.src === "assets/wow/vehicle/pitch-up.png" && arrows.S?.transform === "none" &&
      arrows.A?.src === "assets/wow/vehicle/pitch-up.png" && arrows.A?.transform === "rotate(-90deg)" &&
      arrows.D?.src === "assets/wow/vehicle/pitch-up.png" && arrows.D?.transform === "rotate(90deg)" &&
      arrows.S?.fill && arrows.A?.fill && arrows.D?.fill,
    movement,
  );

  const utilityDisplay = await evaluate(
    `(() => {
      const key = [...document.querySelectorAll('.key')].find((candidate) => candidate.querySelector('.primary span')?.textContent === 'Bags');
      const spell = [...document.querySelectorAll('.key')].find((candidate) => candidate.querySelector('.primary span')?.textContent === 'Serpent Sting');
      return JSON.stringify({ utility: key ? getComputedStyle(key.querySelector('.primary span')).display : null, spell: spell ? getComputedStyle(spell.querySelector('.primary span')).display : null });
    })()`
  );
  const utilityState = JSON.parse(utilityDisplay);
  check("utility binds keep a readable label", utilityState.utility === "flex", utilityDisplay);
  check("spell names stay hidden until interaction", utilityState.spell === "none", utilityDisplay);

  // Assigning a spell through the palette updates the key and the export.
  // Pick the Q key by its legend, not by position: the board order comes from the keyboard itself.
  await evaluate(
    `(() => { const key = [...document.querySelectorAll('.key')].find((k) => k.querySelector('.legend')?.textContent === 'Q'); key.querySelector('.primary').click(); return true; })()`,
  );
  await sleep(300);
  const paletteOpen = await evaluate("!document.getElementById('palette').hidden");
  check("clicking a key opens the palette", paletteOpen === true);

  await evaluate(
    "(() => { const b = [...document.querySelectorAll('#palette button')].find((x) => x.textContent.includes('Aimed Shot')); b.click(); return true; })()",
  );
  await sleep(400);
  const assigned = await evaluate(
    `(() => { const key = [...document.querySelectorAll('.key')].find((k) => k.querySelector('.legend')?.textContent === 'Q'); return key.querySelector('.primary span')?.textContent; })()`,
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
  check("macros are listed", macroCount >= 3, `got ${macroCount}`);

  // The keyboard picker swaps the board and remembers the choice.
  const boards = await evaluate("document.querySelectorAll('.board-pick option').length");
  check("the keyboard picker lists every board", boards >= 2, `got ${boards}`);
  await evaluate(
    "(() => { const s = document.querySelector('.board-pick'); s.value = 'corne-3x5'; s.dispatchEvent(new Event('change')); return true; })()",
  );
  await sleep(700);
  const picked = await evaluate(
    "JSON.stringify({ keys: document.querySelectorAll('.key').length, board: JSON.parse(localStorage.getItem('zerosprey-binds-v4')).board })",
  );
  const chosen = JSON.parse(picked);
  check("picking a 36-key board draws 36 keys", chosen.keys === 36 && chosen.board === "corne-3x5", picked);
  await evaluate(
    "(() => { const s = document.querySelector('.board-pick'); s.value = 'zerosprey42'; s.dispatchEvent(new Event('change')); return true; })()",
  );
  await sleep(700);
  const back = await evaluate("document.querySelectorAll('.key').length");
  check("switching back restores the 42-key board", back === 42, `got ${back}`);

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
