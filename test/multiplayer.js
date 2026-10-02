// Fake cloud server (after TextToScratch/test/multiplayer.js): every cloud update from one client reaches
// the others after LATENCY ms. Clients live in iframes (see client.html).
const LATENCY = 60;
const params = new URLSearchParams(location.search);
const project = params.get("project") ?? "/dist/skribbl-online.sb3";
const N = Number(params.get("n") ?? 3);
window.cloudLog = [];
window.cloud = {}; // server copy, so late joiners get current values

const frames = Array.from({ length: N }, (_, i) => {
  const f = document.createElement("iframe");
  f.src = `/test/client.html?name=Player${"ABCDEF"[i]}`;
  document.body.appendChild(f);
  return f;
});
window.clients = () => frames.map((f) => f.contentWindow);
window.cloudSend = (from, name, value) => {
  const i = clients().indexOf(from);
  window.cloudLog.push([i, name, String(value), performance.now() | 0]);
  window.cloud[name] = value;
  for (const c of clients()) if (c !== from) setTimeout(() => c.cloudReceive(name, value), LATENCY);
};
window.saveShot = async () => {
  // all clients side by side into screenshot.png
  const urls = await Promise.all(clients().map((c) => c.shot()));
  const c = document.createElement("canvas"); c.width = 480 * urls.length + 10 * (urls.length - 1); c.height = 360;
  const g = c.getContext("2d"); g.fillStyle = "#e5f0ff"; g.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i < urls.length; i++) { const img = new Image(); img.src = urls[i]; await img.decode(); g.drawImage(img, i * 490, 0, 480, 360); }
  const blob = await new Promise((r) => c.toBlob(r));
  await fetch("/__shot", { method: "PUT", body: blob });
};
window.ready = (async () => {
  await Promise.all(frames.map((f) => new Promise((r) => (f.contentWindow.load ? r() : f.addEventListener("load", r)))));
  for (const c of clients()) await c.load(project, window.cloud);
  if (!params.has("noflag")) for (const c of clients()) { c.vm.greenFlag(); await new Promise((r) => setTimeout(r, 700)); }
})();
