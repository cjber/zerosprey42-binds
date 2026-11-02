// Local dev server with live reload. Run: bun tools/dev.ts [port]
// Serves the repo root and reloads the page whenever a file the app reads changes.

import { watch } from "node:fs";

const port = Number(process.argv[2] ?? 8770);
const root = new URL("..", import.meta.url).pathname;
const clients = new Set<ReadableStreamDefaultController<Uint8Array>>();

const encoder = new TextEncoder();

function broadcast() {
  for (const client of clients) {
    try {
      client.enqueue(encoder.encode("data: reload\n\n"));
    } catch {
      clients.delete(client);
    }
  }
}

for (const target of ["index.html", "style.css", "app.js", "assets", "assets/classes"]) {
  watch(`${root}${target}`, { recursive: target.startsWith("assets") }, () => broadcast());
}

const types: Record<string, string> = {
  html: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  json: "application/json; charset=utf-8",
  jpg: "image/jpeg",
  png: "image/png",
  svg: "image/svg+xml",
};

Bun.serve({
  port,
  hostname: "127.0.0.1",
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/__live") {
      let controller: ReadableStreamDefaultController<Uint8Array>;
      const stream = new ReadableStream<Uint8Array>({
        start(c) {
          controller = c;
          clients.add(c);
          c.enqueue(encoder.encode(": connected\n\n"));
        },
        cancel() {
          clients.delete(controller);
        },
      });
      return new Response(stream, {
        headers: { "content-type": "text/event-stream", "cache-control": "no-store" },
      });
    }
    const path = url.pathname === "/" ? "/index.html" : url.pathname;
    const file = Bun.file(`${root}${path.slice(1)}`);
    if (!(await file.exists())) return new Response("not found", { status: 404 });
    const extension = path.split(".").pop() ?? "";
    return new Response(file, {
      headers: { "content-type": types[extension] ?? "application/octet-stream", "cache-control": "no-store" },
    });
  },
});

console.log(`zerosprey binds on http://127.0.0.1:${port}/ (live reload on)`);
