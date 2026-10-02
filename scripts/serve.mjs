// Dev server for the test pages: http://localhost:5181/test/player.html and /test/multiplayer.html
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(".");
const types = { ".html": "text/html", ".js": "text/javascript", ".svg": "image/svg+xml", ".png": "image/png" };
const port = Number(process.env.PORT ?? 5181);
// scratch-vm & co. come from the TextToScratch checkout
const vmRoot = path.resolve("node_modules/texttoscratch/node_modules");

http.createServer((req, res) => {
  const url = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (req.method === "PUT" && url === "/__shot") {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => { fs.writeFileSync(path.join(root, "screenshot.png"), Buffer.concat(chunks)); res.writeHead(204).end(); });
    return;
  }
  const file = url.startsWith("/vm/") ? path.join(vmRoot, url.slice(4)) : path.join(root, url);
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) return res.writeHead(404).end();
  res.writeHead(200, { "Content-Type": types[path.extname(file)] ?? "application/octet-stream", "Cache-Control": "no-store" });
  fs.createReadStream(file).pipe(res);
}).listen(port, () => console.log(`http://localhost:${port}/test/multiplayer.html`));
