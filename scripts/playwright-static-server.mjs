#!/usr/bin/env node

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";

const port = Number(process.env.PLAYWRIGHT_PORT ?? 4173);
const host = "127.0.0.1";
const root = path.resolve("dist");

if (!existsSync(path.join(root, "index.html"))) {
  console.error("dist/index.html was not found. Run `npm run build` before browser smoke tests.");
  process.exit(1);
}

function contentTypeFor(filePath) {
  if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".json")) return "application/json; charset=utf-8";
  if (filePath.endsWith(".svg")) return "image/svg+xml";
  if (filePath.endsWith(".png")) return "image/png";
  if (filePath.endsWith(".jpg") || filePath.endsWith(".jpeg")) return "image/jpeg";
  if (filePath.endsWith(".ico")) return "image/x-icon";
  return "application/octet-stream";
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? `${host}:${port}`}`);
    const requestedPath = decodeURIComponent(url.pathname);
    const relativePath = requestedPath.replace(/^\/+/, "");
    const requestedFilePath = path.resolve(root, relativePath);
    const hasExtension = path.extname(requestedPath).length > 0;
    const safeFilePath =
      hasExtension && requestedFilePath.startsWith(root) && existsSync(requestedFilePath)
        ? requestedFilePath
        : path.join(root, "index.html");
    const body = await readFile(safeFilePath);
    response.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Type": contentTypeFor(safeFilePath)
    });
    response.end(body);
  } catch (error) {
    response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    response.end(`Playwright static server error: ${error instanceof Error ? error.message : String(error)}`);
  }
});

server.listen(port, host, () => {
  console.log(`Playwright static server listening at http://${host}:${port}`);
});

const shutdown = () => {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1000).unref();
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
process.on("SIGHUP", shutdown);
