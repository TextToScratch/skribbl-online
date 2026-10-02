// The drawing canvas. The drawer's strokes become 5-digit tokens that are drawn here and sent to everyone
// (Server.ts); other players replay the tokens they receive a few per frame, so drawings appear smoothly.
//
//   00000-82959  point: x * 244 + y on the 340 x 244 canvas
//   91CCS        set color (palette index CC) and brush size S (0-9)
//   92000        pen up (end of stroke)
//   93000        clear canvas
//   94000        fill the canvas with the current color
//   95000        undo the last stroke
import { g, drawQueue, outQueue } from "./Stage";
import { paintRect, slice, pad, CX, CY, CW, CH } from "./lib/util";

/** The Colors sprite's palette, column by column (top, bottom). */
const PALETTE: string[] = ["#ffffff", "#000000", "#d4d4d4", "#5a5a5a", "#ff0000", "#b20000", "#ff7c00", "#b35700", "#fbff00", "#b0b300",
  "#04ff00", "#03b300", "#00ff9c", "#00b36d", "#00c2ff", "#0088b3", "#0015ff", "#000eb3", "#bd00ff", "#8400b3", "#ff88df", "#b35f9d",
  "#ffc29c", "#b3856d", "#ad5a00", "#662200"];
/** Every token drawn this turn, for undo. */
const hist: string[] = [];

let PenSize = 1; // 1..10, as in the original project (B cycles it)
let color = 1; // black
let sentStyle = "";
let stroking = false;
let down = false;
let wasDown = false;
let lastX = 0;
let lastY = 0;
let curColor = 1;
let curSize = 1;
let tool = 0; // 0 brush, 1 eraser

whenFlag(() => {
  me.visible = false;
  penClear();
});

// ---- canvas ----

/** @warp */
function fillCanvas(c: string) {
  paintRect(CX - 2, CY - 2, CX + CW + 2, CY + CH + 2, c);
}

onMessage("clearCanvas", () => {
  hist.length = 0;
  stroking = false;
  down = false;
  sentStyle = "";
  fillCanvas("#ffffff");
});

/** @warp */
function drawToken(t: string) {
  const code = Number(t);
  if (code >= 90000) {
    const kind = Number(t[1]);
    if (kind === 1) {
      curColor = Number(slice(t, 2, 2));
      curSize = Number(t[4]) + 1;
      penUp();
      stroking = false;
    }
    if (kind === 2) {
      penUp();
      stroking = false;
    }
    if (kind === 3) {
      hist.length = 0;
      penUp();
      stroking = false;
      fillCanvas("#ffffff");
      return;
    }
    if (kind === 4) {
      penUp();
      stroking = false;
      fillCanvas(PALETTE[curColor]);
    }
    if (kind === 5) {
      undo();
      return;
    }
    hist.push(t);
    return;
  }
  hist.push(t);
  // keep the brush inside the canvas
  const r = curSize * 1.25;
  const x = Math.max(r, Math.min(CW - r, Math.floor(code / 244)));
  const y = Math.max(r, Math.min(CH - r, code % 244));
  setPenColor(PALETTE[curColor]);
  setPenSize(curSize * 2.5);
  goTo(CX + x, CY + y);
  if (!stroking) penDown();
  stroking = true;
}

/** Remove the last stroke and redraw everything else. */
/** @warp */
function undo() {
  // drop trailing pen-ups, then points back to the previous pen-up
  while (hist.length > 0 && hist[hist.length - 1] === "92000") hist.remove(hist.length - 1);
  while (hist.length > 0 && hist[hist.length - 1] !== "92000") hist.remove(hist.length - 1);
  penUp();
  stroking = false;
  fillCanvas("#ffffff");
  const n = hist.length;
  for (let i = 0; i < n; i++) {
    drawToken(hist[0]);
    hist.remove(0); // drawToken pushed it again at the end
  }
}

// ---- drawing (my turn) or replay (someone else's) ----

whenBackdrop("Gameplay", () => {
  forever(() => {
    const myTurn = g.phase === 2 && g.drawer === g.slot && g.slot > 0;
    if (myTurn) {
      // the cursor shows the brush, like the original Pen sprite
      me.visible = mouseX() > CX && mouseX() < CX + CW && mouseY() > CY && mouseY() < CY + CH;
      me.size = PenSize * 20;
      drawStep();
      keys();
    } else {
      me.visible = false;
      down = false;
      wasDown = mouseDown(); // a click that was still held when my turn began is not a stroke
      replayStep();
    }
  });
});

/** @warp */
function emit(t: string) {
  outQueue.push(t);
  drawToken(t);
}

/** @warp */
function style() {
  let c = color;
  if (tool === 1) c = 0;
  const s = "91" + pad(c, 2) + String(PenSize - 1);
  if (s !== sentStyle) {
    sentStyle = s;
    emit(s);
  }
}

/** @warp */
function drawStep() {
  const mx = mouseX();
  const my = mouseY();
  const inCanvas = mx > CX && mx < CX + CW && my > CY && my < CY + CH;
  const press = mouseDown() && !wasDown;
  wasDown = mouseDown();
  if (mouseDown() && inCanvas && (down || press)) {
    const x = Math.round(mx - CX);
    const y = Math.round(my - CY);
    if (!down) {
      style();
      down = true;
      lastX = x;
      lastY = y;
      emit(pad(x * 244 + y, 5));
    } else if (Math.abs(x - lastX) + Math.abs(y - lastY) >= 3) {
      lastX = x;
      lastY = y;
      emit(pad(x * 244 + y, 5));
    }
    return;
  }
  if (down) {
    down = false;
    emit("92000");
  }
  goTo(mx, my);
  if (!press) return;
  // palette (the Colors sprite: 13 columns x 2 rows of 16 px cells)
  if (my < -129 && my > -161 && mx > -109.3 && mx < 97) {
    color = Math.floor((mx + 109.3) / 15.9) * 2;
    if (my < -145.3) color++;
    tool = 0;
    g.dirtyTop = true;
    broadcast("toolChanged");
  }
  // toolbar (the Tools sprite), 2 rows of 4 buttons: small, medium, large, eraser / fill, clear, undo
  if (my < -127 && my > -177 && mx > 100 && mx < 232) {
    let b = Math.floor((mx - 100) / 33);
    if (my < -152) b += 4;
    if (b === 0) PenSize = 1;
    if (b === 1) PenSize = 3;
    if (b === 2) PenSize = 7;
    if (b <= 2) tool = 0;
    if (b === 3) tool = 1;
    if (b === 4) fill();
    if (b === 5) emit("93000");
    if (b === 6) emit("95000");
    broadcast("toolChanged");
  }
}

/** @warp */
function fill() {
  tool = 0;
  style();
  emit("94000");
}

/** The original project's keys: B = bigger brush (wraps), F = fill, C = clear. Plus E = eraser, Z = undo. */
function keys() {
  if (keyPressed("b")) {
    if (PenSize < 9.9) PenSize++;
    else PenSize = 1;
    broadcast("toolChanged");
    waitUntil(() => !keyPressed("b"));
  }
  if (keyPressed("c")) {
    emit("93000");
    waitUntil(() => !keyPressed("c"));
  }
  if (keyPressed("f")) {
    fill();
    waitUntil(() => !keyPressed("f"));
  }
  if (keyPressed("e")) {
    tool = 1 - tool;
    broadcast("toolChanged");
    waitUntil(() => !keyPressed("e"));
  }
  if (keyPressed("z")) {
    emit("95000");
    waitUntil(() => !keyPressed("z"));
  }
}

/** @warp */
function replayStep() {
  // draw a few tokens per frame: smooth, and it catches up when packets bunch up
  let n = Math.max(2, Math.ceil(drawQueue.length / 4));
  while (n > 0 && drawQueue.length > 0) {
    drawToken(drawQueue[0]);
    drawQueue.remove(0);
    n--;
  }
}

/** Global so the Tools sprite can show the selection. */
export const penUi = { size: 1, eraser: 0, color: 1 };
onMessage("toolChanged", () => {
  penUi.size = PenSize;
  penUi.eraser = tool;
  penUi.color = color;
  playSound("Quick");
});

// The original scribble sounds: the longer the stroke, the longer the sound; it fades out when you let go.
let sx = 0;
let sy = 0;
whenBackdrop("Gameplay", () => {
  forever(() => {
    if (g.phase === 2 && g.drawer === g.slot && mouseDown() && down) {
      clearSoundEffects();
      me.volume = 100;
      sx = mouseX();
      sy = mouseY();
      wait(0.2);
      const d = Math.round(Math.sqrt((mouseX() - sx) * (mouseX() - sx) + (mouseY() - sy) * (mouseY() - sy)));
      if (d > 200) {
        playSound(random(1, 3));
        playSound("Medium");
      } else if (d > 150) playSound("Fast");
      else if (d > 80) playSound("Medium");
      else if (d < 50) playSound("Long");
      waitUntil(() => !mouseDown());
      repeat(10, () => {
        me.volume -= 10;
      });
      stopAllSounds();
    }
  });
});

