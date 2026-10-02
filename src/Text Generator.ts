// All the game's text, stamped with this sprite's letter costumes (the original "Word Stamp" idea):
// top bar (round, word hint, clock), player list, chat feed, and the canvas overlays.
import { g, flags, pName, pScore, pGuessed, rowSlot, podium, feed, feedInk, Words } from "./Stage";
import { FONT_L, FONT_R, LETTER_GAP, SPACE_W } from "./lib/font";
import { paintRect, CX, CY, CW, CH } from "./lib/util";

const MID = 62.5; // canvas center x
let lastOverlay = "-";
let wasDown = false;
let tx = 0;
let hint = "";
let name = "";

whenFlag(() => {
  me.visible = false;
  encodeName();
});

/** My Scratch username as 2-digit costume numbers (costume names are case-sensitive, unlike = in Scratch). */
/** @warp */
function encodeName() {
  name = username();
  if (name === "") name = "Guest" + String(random(100, 999));
  g.nameCode = "";
  for (let i = 0; i < name.length && i < 20; i++) {
    switchCostume(name[i] as CostumeName);
    if (me.costumeNumber < 10) g.nameCode = g.nameCode + "0";
    g.nameCode = g.nameCode + String(me.costumeNumber);
  }
}

// ---------------- text ----------------

/** 0 black, 1 white, 2 green, 3 red, 4 blue, 5 orange, 6 gray */
/** @warp */
function ink(c: number) {
  clearEffects();
  if (c === 0) setEffect("brightness", -100);
  if (c === 1) setEffect("brightness", 100);
  if (c === 2) {
    setEffect("color", 62);
    setEffect("brightness", -35);
  }
  if (c === 3) setEffect("brightness", -15);
  if (c === 4) {
    setEffect("color", 128);
    setEffect("brightness", -20);
  }
  if (c === 5) {
    setEffect("color", 14);
    setEffect("brightness", -15);
  }
  if (c === 6) {
    setEffect("brightness", -100);
    setEffect("ghost", 50);
  }
}

/** Width of a text at a size (100 = 20 px font): glyph ink widths + letter gaps + spaces (no trailing gap). */
/** @warp */
function measure(text: string, size: number): number {
  let w = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === " ") w += SPACE_W;
    else {
      switchCostume(text[i] as CostumeName);
      w += FONT_R[me.costumeNumber - 1] - FONT_L[me.costumeNumber - 1];
      if (i < text.length - 1 && text[i + 1] !== " ") w += LETTER_GAP;
    }
  }
  return (w * size) / 100;
}

/** Stamp text with its left edge at x; y is the middle of the letters.
 *  Each glyph's ink starts where the previous one ended, plus a fixed gap (all scaled by size). */
/** @warp */
function write(text: string, x: number, y: number, size: number, c: number) {
  switchCostume("W"); // Scratch limits how small a sprite can get by its current costume: set the size on a wide one
  me.size = size;
  ink(c);
  me.visible = true;
  tx = x;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === " ") tx += (SPACE_W * size) / 100;
    else {
      switchCostume(text[i] as CostumeName);
      goTo(tx - (FONT_L[me.costumeNumber - 1] * size) / 100, y);
      stamp();
      tx += ((FONT_R[me.costumeNumber - 1] - FONT_L[me.costumeNumber - 1]) * size) / 100;
      if (i < text.length - 1 && text[i + 1] !== " ") tx += (LETTER_GAP * size) / 100;
    }
  }
  me.visible = false;
}

/** @warp */
function writeCentered(text: string, x: number, y: number, size: number, c: number) {
  const w = measure(text, size);
  write(text, x - w / 2, y, size, c);
}

/** @warp */
function writeRight(text: string, x: number, y: number, size: number, c: number) {
  const w = measure(text, size);
  write(text, x - w, y, size, c);
}

/** Shorten a text to fit a width. */
/** @warp */
function fit(text: string, width: number, size: number): string {
  let out = text;
  while (out.length > 1 && measure(out, size) > width) {
    let s = "";
    for (let i = 0; i < out.length - 1; i++) s = s + out[i];
    out = s;
  }
  return out;
}

// ---------------- panels ----------------

whenBackdrop("Gameplay", () => {
  lastOverlay = "-";
  g.dirtyTop = true;
  g.dirtyPlayers = true;
  g.dirtyFeed = true;
  forever(() => {
    if (g.dirtyTop) drawTop();
    if (g.dirtyPlayers) drawPlayers();
    if (g.dirtyFeed) drawFeed();
    if (g.overlay !== lastOverlay || g.dirtyOverlay) drawOverlay();
    clickChoice();
  });
});

/** @warp */
function nameOf(slot: number): string {
  if (slot === g.slot) return "You";
  if (pName[slot - 1] === "") return `Player ${slot}`;
  return pName[slot - 1];
}

/** "_ _ a _ _" with letters revealed over time; the whole word for the drawer and once you've guessed. */
/** @warp */
function makeHint() {
  const word = Words[g.word - 1];
  const L = word.length;
  let k = 0;
  if (g.timeLeft <= 50 && L >= 3) k = 1;
  if (g.timeLeft <= 30 && L >= 5) k = 2;
  if (g.timeLeft <= 15 && L >= 8) k = 3;
  const p1 = (g.word + g.turn) % L;
  const p2 = (p1 + Math.floor(L / 2)) % L;
  const p3 = (p1 + Math.floor(L / 4) + 1) % L;
  const all = g.drawer === g.slot || g.iGuessed || g.phase >= 3;
  hint = "";
  for (let i = 0; i < L; i++) {
    let ch = "_";
    if (word[i] === " ") ch = " ";
    else if (all || (k >= 1 && i === p1) || (k >= 2 && i === p2) || (k >= 3 && i === p3)) ch = word[i];
    hint = hint + ch;
    if (i < L - 1) hint = hint + " ";
  }
}

/** @warp */
function drawTop() {
  g.dirtyTop = false;
  paintRect(-237, 129, 232, 158, "#ffffff");
  let left = `Round ${g.round} of ${g.rounds}`;
  if (g.phase === 0) left = "Waiting...";
  if (g.phase === 4) left = "Game over";
  if (g.practice) left = `Practice ${g.round}/${g.rounds}`;
  write(left, -230, 143, 60, 0);
  if (g.room > 0) write(`Room ${g.room}`, -230, 133, 45, 4);
  if (g.phase >= 2 && g.word > 0) {
    makeHint();
    let size = 80;
    if (hint.length > 26) size = 60;
    writeCentered(hint, 20, 146, size, 0);
    if (g.drawer !== g.slot && !g.iGuessed && g.phase === 2) writeCentered(`${flags.CATEGORY}, ${Words[g.word - 1].length} letters`, 20, 133, 40, 6);
  } else if (g.phase === 1) writeCentered("Choosing a word...", 20, 143, 70, 6);
  if (g.phase >= 1 && g.phase <= 3) {
    let c = 0;
    if (g.timeLeft <= 10 && g.phase === 2) c = 3;
    writeRight(String(Math.max(0, g.timeLeft)), 225, 143, 85, c);
  }
}

/** @warp */
function drawPlayers() {
  g.dirtyPlayers = false;
  paintRect(-238, -27, -110, 123, "#0b2a6b");
  paintRect(-236, -25, -112, 121, "#ffffff");
  for (let r = 0; r < 9; r++) {
    const s = rowSlot[r];
    if (s > 0) {
      const y = 112 - r * 16;
      if (pGuessed[s - 1] === 1) paintRect(-236, y - 8, -112, y + 8, "#b7f5a8");
      if (g.phase >= 1 && g.phase <= 3 && s === g.drawer) paintRect(-236, y - 8, -112, y + 8, "#ffe28a");
      let c = 0;
      if (s === g.slot) c = 4;
      name = nameOf(s);
      name = fit(name, 66, 50);
      write(name, -217, y, 50, c);
      writeRight(String(pScore[s - 1]), -115, y, 50, 0);
    }
  }
}

/** @warp */
function drawFeed() {
  g.dirtyFeed = false;
  paintRect(-238, -178, -110, -25, "#0b2a6b");
  paintRect(-236, -176, -112, -27, "#ffffff");
  for (let i = 0; i < feed.length; i++) {
    name = fit(feed[i], 120, 45);
    write(name, -233, -35 - i * 15.5, 45, feedInk[i]);
  }
}

// ---------------- canvas overlays ----------------

/** @warp */
function drawOverlay() {
  lastOverlay = g.overlay;
  g.dirtyOverlay = false;
  if (g.overlay === "") return;
  paintRect(CX - 2, CY - 2, CX + CW + 2, CY + CH + 2, "#ffffff");
  if (g.overlay === "join") writeCentered("Joining...", MID, 0, 120, 4);
  if (g.overlay === "wait") {
    writeCentered("Waiting for players...", MID, 30, 100, 4);
    if (g.room > 0) {
      writeCentered("Private room code:", MID, -10, 70, 0);
      writeCentered(String(g.room), MID, -45, 160, 3);
      writeCentered("Friends join with Create Private Room", MID, -80, 50, 6);
    }
  }
  if (g.overlay === "choose") {
    if (g.drawer === g.slot) {
      writeCentered("Your turn! Choose a word", MID, 75, 90, 0);
      choiceBox(g.choice1, 30);
      choiceBox(g.choice2, -10);
      choiceBox(g.choice3, -50);
    } else writeCentered(`${nameOf(g.drawer)} is choosing a word...`, MID, 0, 80, 0);
  }
  if (g.overlay === "reveal") {
    writeCentered("The word was", MID, 40, 80, 0);
    writeCentered(Words[g.word - 1], MID, 0, 150, 2);
    writeCentered("Next turn soon...", MID, -50, 60, 6);
  }
  if (g.overlay === "podium") {
    writeCentered("Game over!", MID, 95, 120, 3);
    podiumBlock(0, MID, 50, "#ffd23f");
    podiumBlock(1, MID - 95, 30, "#d4d4d4");
    podiumBlock(2, MID + 95, 15, "#e0a060");
  }
}

/** @warp */
function choiceBox(word: number, y: number) {
  paintRect(MID - 90, y - 16, MID + 90, y + 16, "#2c7be5");
  writeCentered(Words[word - 1], MID, y, 90, 1);
}

/** @warp */
function podiumBlock(place: number, x: number, h: number, color: string) {
  const s = podium[place];
  if (s === 0) return;
  paintRect(x - 40, CY + 2, x + 40, CY + 40 + h, color);
  writeCentered(String(place + 1), x, CY + 25 + h / 2, 120, 1);
  name = nameOf(s);
  name = fit(name, 90, 60);
  writeCentered(name, x, CY + 115 + h, 60, 0);
  writeCentered(`${pScore[s - 1]} pts`, x, CY + 102 + h, 50, 4);
}

/** The drawer clicks one of the three words. */
function clickChoice() {
  const press = mouseDown() && !wasDown;
  wasDown = mouseDown();
  if (!press || g.overlay !== "choose" || g.drawer !== g.slot || g.chosen > 0) return;
  if (Math.abs(mouseX() - MID) > 90) return;
  const y = mouseY();
  if (Math.abs(y - 30) < 16) g.chosen = g.choice1;
  if (Math.abs(y + 10) < 16) g.chosen = g.choice2;
  if (Math.abs(y + 50) < 16) g.chosen = g.choice3;
  if (g.chosen > 0) {
    playSound("pop");
    paintRect(CX - 2, CY - 2, CX + CW + 2, CY + CH + 2, "#ffffff");
    writeCentered(`You chose: ${Words[g.chosen - 1]}`, MID, 0, 90, 4);
  }
}

