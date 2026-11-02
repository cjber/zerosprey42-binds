// Copy the static app into dist/ for deployment. Nothing is transformed; this exists so the
// deploy uploads the app and not the repository's tooling.
import { cp, mkdir, rm } from "node:fs/promises";

const root = new URL("..", import.meta.url).pathname;
const out = `${root}dist`;

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
for (const entry of ["index.html", "style.css", "app.js", "lib", "assets"]) {
  await cp(`${root}${entry}`, `${out}/${entry}`, { recursive: true });
}
console.log("built dist/");
