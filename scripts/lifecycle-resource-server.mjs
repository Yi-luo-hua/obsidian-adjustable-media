import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delayResponse } from "node:timers";

const vault = process.argv[2];
if (!vault) throw new Error("Pass the dedicated test vault directory");
const resources = {
  "/image.png": await readFile(path.join(vault, "attachments/square-1x1.png")),
  "/video.mp4": await readFile(path.join(vault, "attachments/LoopVid_00001_p84_pccpp_1771066925.mp4")),
  "/font.ttf": await readFile("C:/Windows/Fonts/consola.ttf"),
};
const readyAt = new Map();
const server = createServer((request, response) => {
  const url = new URL(request.url, "http://127.0.0.1:18708");
  const bytes = resources[url.pathname];
  if (!bytes) { response.writeHead(404); response.end(); return; }
  const range = /^bytes=(\d+)-(\d*)$/.exec(request.headers.range ?? "");
  const start = range ? Number(range[1]) : 0;
  const end = range && range[2] ? Math.min(Number(range[2]), bytes.length - 1) : bytes.length - 1;
  if (!readyAt.has(url.href)) readyAt.set(url.href, Date.now() + Math.min(3000, Number(url.searchParams.get("delay")) || 0));
  delayResponse(() => {
    response.writeHead(range ? 206 : 200, {
      "Content-Type": url.pathname.endsWith("mp4") ? "video/mp4" : url.pathname.endsWith("ttf") ? "font/ttf" : "image/png",
      "Content-Length": end - start + 1, "Access-Control-Allow-Origin": "*", "Accept-Ranges": "bytes",
      "Cache-Control": "max-age=3600", ...(range ? { "Content-Range": `bytes ${start}-${end}/${bytes.length}` } : {}),
    });
    response.end(bytes.subarray(start, end + 1));
  }, Math.max(0, readyAt.get(url.href) - Date.now()));
});
server.listen(18708, "127.0.0.1", () => process.stdout.write("W01 resources on 127.0.0.1:18708\n"));
