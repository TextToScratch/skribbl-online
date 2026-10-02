// One client VM inside an iframe. The parent page (multiplayer.js) relays cloud updates between iframes.
const Storage = window.ScratchStorage.ScratchStorage ?? window.ScratchStorage;
const params = new URLSearchParams(location.search);
const canvas = document.querySelector("canvas"), input = document.querySelector("input"), q = document.querySelector(".q");
const name = params.get("name") ?? "Player";
document.getElementById("name").textContent = name;
const vm = (window.vm = new VirtualMachine());
vm.attachRenderer(new ScratchRender(canvas));
vm.attachStorage(new Storage());
vm.attachV2BitmapAdapter(new ScratchSVGRenderer.BitmapAdapter());
vm.runtime.ioDevices.userData._username = name;
vm.runtime.on("QUESTION", (text) => { q.textContent = text === null ? "" : "asks: " + text; });
input.onkeydown = (e) => { e.stopPropagation(); if (e.key === "Enter") { vm.runtime.emit("ANSWER", input.value); input.value = ""; q.textContent = ""; } };
window.answer = (t) => vm.runtime.emit("ANSWER", t);
window.provider = {
  updateVariable(name, value) { window.parent.cloudSend?.(window, name, value); },
  createVariable() {}, renameVariable() {}, deleteVariable() {}, requestCloseConnection() {},
};
window.cloudReceive = (name, value) => vm.postIOData("cloud", { varUpdate: { name, value } });
const mouse = (e, isDown) => {
  const r = canvas.getBoundingClientRect();
  vm.postIOData("mouse", { x: e.clientX - r.left, y: e.clientY - r.top, canvasWidth: r.width, canvasHeight: r.height, isDown });
};
canvas.addEventListener("mousemove", (e) => mouse(e));
canvas.addEventListener("mousedown", (e) => mouse(e, true));
window.addEventListener("mouseup", (e) => mouse(e, false));
window.addEventListener("keydown", (e) => vm.postIOData("keyboard", { key: e.key, isDown: true }));
window.addEventListener("keyup", (e) => vm.postIOData("keyboard", { key: e.key, isDown: false }));
// test helpers: stage coordinates (-240..240, -180..180)
window.move = (x, y, isDown) => vm.postIOData("mouse", { x: x + 240, y: 180 - y, canvasWidth: 480, canvasHeight: 360, isDown });
window.shot = () => new Promise((res) => { vm.renderer.requestSnapshot(res); vm.renderer.draw(); });
window.load = async (project, cloud) => {
  const data = await (await fetch(project + "?v=" + Date.now())).arrayBuffer();
  await vm.loadProject(data);
  vm.setCloudProvider(window.provider);
  for (const [n, v] of Object.entries(cloud)) window.cloudReceive(n, v);
  vm.start();
};
