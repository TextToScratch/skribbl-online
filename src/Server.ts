// Networking and game rules.
//
// Cloud layout: 8 variables, one per player slot. Each player only ever writes its own slot, so rooms
// never collide and no update can overwrite someone else's. Every value is digits only (<= 256):
//
//   header (22 digits): 1 | room(4) | seq(2) | type(1) | face mouth color (3) | guessTurn(2) | guessLeft(2)
//                       | chosenWord(3) | chooseTurn(2) | chatSeq(1) | chatId(1)
//   type 1 presence:    nameLength(2) + 2 digits per letter (index into the font)
//   type 2 strokes:     turn(2) drawSeq(2) len(3) newTokens len(3) previousTokens   (5-digit tokens, see Pen.ts;
//                       the previous chunk is resent so one lost update doesn't lose strokes)
//   type 3 game state:  phase(1) round(1) rounds(1) turn(2) drawer(1) timeLeft(2) word(3) scores 8 x 4
//
// Only the host (lowest active slot in the room) runs the rules; everyone else copies its state.
// Nothing typed is ever sent: guesses are checked locally and only "guessed at time t" goes out.
import { g, pActive, pName, pFace, pMouth, pColor, pScore, pGuessed, pGuessLeft, rowSlot, podium, feed, feedInk, drawQueue, outQueue, PlayerData, Words, WordCat, CATEGORIES, QUICK_CHAT } from "./Stage";
import { flags } from "./Stage";
import { now, pad, slice } from "./lib/util";
import { FONT } from "./lib/font";
import { REC_WORDS, REC_DATA } from "./lib/recordings";

/** @cloud */
export const cloud = { S1: 0, S2: 0, S3: 0, S4: 0, S5: 0, S6: 0, S7: 0, S8: 0 };

const SLOTS = 8;
const BOT = 9;
const SEND_EVERY = 0.15; // <= ~7 cloud updates per second per player
const DRAW_TIME = 80;
const CHOOSE_TIME = 15;

const lastVal: string[] = ["", "", "", "", "", "", "", ""];
const lastChange: number[] = [0, 0, 0, 0, 0, 0, 0, 0];
const pRoom: number[] = [-1, -1, -1, -1, -1, -1, -1, -1];
const pChosen: number[] = [0, 0, 0, 0, 0, 0, 0, 0, 0];
const pChooseTurn: number[] = [0, 0, 0, 0, 0, 0, 0, 0, 0];
const pChatSeq: number[] = [0, 0, 0, 0, 0, 0, 0, 0, 0];
const pDrawSeq: number[] = [0, 0, 0, 0, 0, 0, 0, 0, 0];
const pAwarded: number[] = [0, 0, 0, 0, 0, 0, 0, 0, 0];

let mySeq = 10;
let myDrawSeq = 10;
let lastSend = 0;
let lastState = 0;
let lastPresence = 0;
let lastHeader = "";
let myValue = "";
let prevChunk = "";
let stateDirty = false;
let joinedAt = 0;
let secondAt = 0;
let prevPhase = -1;
let prevTurn = -1;
let prevLeft = 0;
let botRec = 0;
let botPos = 0;
let botGuessAt = 0;
let header = "";
let players = 0;
let realPlayers = 0;

/** @warp */
function slotValue(slot: number): string {
  if (slot === 1) return String(cloud.S1);
  if (slot === 2) return String(cloud.S2);
  if (slot === 3) return String(cloud.S3);
  if (slot === 4) return String(cloud.S4);
  if (slot === 5) return String(cloud.S5);
  if (slot === 6) return String(cloud.S6);
  if (slot === 7) return String(cloud.S7);
  return String(cloud.S8);
}

// Values are kept as text so no digit is lost to number rounding.
/** @warp */
function setSlot(slot: number, value: string) {
  const v = value as unknown as number;
  if (slot === 1) cloud.S1 = v;
  if (slot === 2) cloud.S2 = v;
  if (slot === 3) cloud.S3 = v;
  if (slot === 4) cloud.S4 = v;
  if (slot === 5) cloud.S5 = v;
  if (slot === 6) cloud.S6 = v;
  if (slot === 7) cloud.S7 = v;
  if (slot === 8) cloud.S8 = v;
}

/** @warp */
function addFeed(text: string, ink: number) {
  feed.push(text);
  feedInk.push(ink);
  while (feed.length > 9) {
    feed.remove(0);
    feedInk.remove(0);
  }
  g.dirtyFeed = true;
}

/** @warp */
function nameOf(slot: number): string {
  if (slot === g.slot) return "You";
  if (pName[slot - 1] === "") return `Player ${slot}`;
  return pName[slot - 1];
}

// ---------------- joining ----------------

whenFlag(() => {
  me.visible = false;
  g.slot = 0;
  g.room = 0;
  g.inGame = false;
  g.practice = false;
  g.offline = false;
  g.phase = 0;
  g.host = 0;
  g.overlay = "";
  g.myGuessTurn = 0;
  g.chatSeq = 0;
  g.chatId = 0;
  feed.length = 0;
  feedInk.length = 0;
  drawQueue.length = 0;
  outQueue.length = 0;
  for (let i = 1; i <= BOT; i++) {
    pActive[i - 1] = 0;
    pScore[i - 1] = 0;
    pGuessed[i - 1] = 0;
    if (i <= SLOTS) pName[i - 1] = "";
    if (i <= SLOTS) pRoom[i - 1] = -1;
  }
  for (let i = 1; i <= SLOTS; i++) lastVal[i - 1] = slotValue(i);
});

// The lobby's Play button: public room.
onMessage("Play", () => {
  if (g.inGame) return;
  if (g.room === 0) g.room = 0;
  join();
});

// "Create Private Room": ask for a code (digits only), or make a new one.
onMessage("PrivateRoom", () => {
  askAndWait("Type a 4-digit room code to join a friend, or leave it empty to create a new private room");
  const a = answer();
  g.room = random(1000, 9999);
  if (a.length === 4 && Number(a) >= 1000 && Number(a) <= 9999 && Math.floor(Number(a)) === Number(a)) g.room = Number(a);
  broadcast("Play");
});

function join() {
  g.inGame = true;
  g.overlay = "join";
  g.dirtyTop = true;
  // watch the slots for 2.5 s: a slot nobody updates is free
  for (let i = 1; i <= SLOTS; i++) {
    lastVal[i - 1] = slotValue(i);
    lastChange[i - 1] = 0;
  }
  wait(2.5);
  let free = 0;
  for (let i = SLOTS; i >= 1; i--) {
    const v = slotValue(i);
    if (v === lastVal[i - 1]) free = i;
  }
  joinedAt = now();
  secondAt = now();
  if (free === 0) {
    // everyone's slots are busy: play offline against the Bot
    g.offline = true;
    free = SLOTS;
    addFeed("The game is full! Practice mode", 3);
  }
  g.slot = free;
  g.host = free;
  pActive[free - 1] = 1;
  pRoom[free - 1] = g.room;
  g.phase = 0;
  g.overlay = "wait";
  if (g.room > 0) addFeed(`Private room ${g.room}`, 4);
  addFeed("You joined!", 2);
  sendPacket(1);
  forever(() => tick());
}

// ---------------- main loop ----------------

/** @warp */
function tick() {
  readAll();
  // who's here, and who hosts
  players = 0;
  realPlayers = 0;
  let host = 0;
  for (let s = SLOTS; s >= 1; s--) {
    const t = lastChange[s - 1];
    const was = pActive[s - 1];
    let on = 0;
    if (s === g.slot) on = 1;
    else if (!g.offline && pRoom[s - 1] === g.room && now() - t < 4) on = 1;
    pActive[s - 1] = on;
    if (on === 1) {
      players++;
      realPlayers++;
      host = s;
    }
    if (was === 1 && on === 0) {
      addFeed(`${nameOf(s)} left`, 3);
      g.dirtyPlayers = true;
    }
    if (was === 0 && on === 1 && s !== g.slot) {
      addFeed(`${nameOf(s)} joined!`, 2);
      g.dirtyPlayers = true;
    }
  }
  if (g.practice) players++;
  g.host = host;
  if (g.host === g.slot) hostStep();
  onChanges();
  botStep();
  updateRows();
  if (!g.offline) send();
}

/** Read every slot that changed since last frame. */
/** @warp */
function readAll() {
  for (let s = 1; s <= SLOTS; s++) {
    const v = slotValue(s);
    if (v !== lastVal[s - 1]) {
      lastVal[s - 1] = v;
      lastChange[s - 1] = now();
      if (s !== g.slot) parse(s, v);
      // ponytail: two players grabbing the same slot at the same moment isn't resolved; the later join wins the slot
    }
  }
}

/** @warp */
function parse(s: number, v: string) {
  if (v.length < 22) return;
  const room = Number(slice(v, 1, 4));
  pRoom[s - 1] = room;
  if (room !== g.room) return;
  const kind = Number(v[7]);
  const face = Number(v[8]);
  const mouth = Number(v[9]);
  const color = Number(v[10]);
  if (face !== pFace[s - 1] || mouth !== pMouth[s - 1] || color !== pColor[s - 1]) g.dirtyPlayers = true;
  pFace[s - 1] = face;
  pMouth[s - 1] = mouth;
  pColor[s - 1] = color;
  const guessTurn = Number(slice(v, 11, 2));
  if (guessTurn === g.turn && g.phase === 2 && pGuessed[s - 1] === 0 && s !== g.drawer) {
    pGuessed[s - 1] = 1;
    pGuessLeft[s - 1] = Number(slice(v, 13, 2));
    addFeed(`${nameOf(s)} guessed the word!`, 2);
    playSound("correct");
    g.dirtyPlayers = true;
  }
  pChosen[s - 1] = Number(slice(v, 15, 3));
  pChooseTurn[s - 1] = Number(slice(v, 18, 2));
  const chatSeq = Number(v[20]);
  const chatId = Number(v[21]);
  if (chatSeq !== pChatSeq[s - 1]) {
    pChatSeq[s - 1] = chatSeq;
    if (chatId >= 1 && chatId <= QUICK_CHAT.length) {
      addFeed(`${nameOf(s)}: ${QUICK_CHAT[chatId - 1]}`, 4);
      playSound("pop");
    }
  }
  if (kind === 1) readName(s, v);
  if (kind === 2) readStrokes(s, v);
  if (kind === 3 && s === g.host && s !== g.slot) readState(v);
}

/** @warp */
function readName(s: number, v: string) {
  const n = Number(slice(v, 22, 2));
  let name = "";
  for (let i = 0; i < n; i++) {
    const code = Number(slice(v, 24 + i * 2, 2));
    if (code >= 1 && code <= FONT.length) name = name + FONT[code - 1];
  }
  if (name !== pName[s - 1]) {
    pName[s - 1] = name;
    g.dirtyPlayers = true;
    if (g.overlay === "choose" && s === g.drawer && g.drawer !== g.slot) g.dirtyOverlay = true;
  }
}

/** @warp */
function readStrokes(s: number, v: string) {
  if (s !== g.drawer || g.phase !== 2) return;
  if (Number(slice(v, 22, 2)) !== g.turn) return;
  const seq = Number(slice(v, 24, 2));
  const lenA = Number(slice(v, 26, 3));
  const lenB = Number(slice(v, 29 + lenA, 3));
  const last = pDrawSeq[s - 1];
  let gap = (seq - last + 90) % 90;
  if (last === 0) gap = 1;
  if (gap === 0) return;
  // missed exactly one update: its tokens are repeated as the "previous" chunk
  if (gap === 2) queueTokens(slice(v, 32 + lenA, lenB));
  queueTokens(slice(v, 29, lenA));
  pDrawSeq[s - 1] = seq;
}

/** @warp */
function queueTokens(chunk: string) {
  for (let i = 0; i + 5 <= chunk.length; i += 5) drawQueue.push(slice(chunk, i, 5));
}

/** @warp */
function readState(v: string) {
  const p = 22;
  g.phase = Number(v[p]);
  g.round = Number(v[p + 1]);
  g.rounds = Number(v[p + 2]);
  g.turn = Number(slice(v, p + 3, 2));
  g.drawer = Number(v[p + 5]);
  g.timeLeft = Number(slice(v, p + 6, 2));
  g.word = Number(slice(v, p + 8, 3));
  for (let s = 1; s <= SLOTS; s++) {
    const sc = Number(slice(v, p + 11 + (s - 1) * 4, 4));
    if (sc !== pScore[s - 1]) g.dirtyPlayers = true;
    pScore[s - 1] = sc;
  }
}

// ---------------- sending ----------------

/** @warp */
function makeHeader(kind: number): string {
  mySeq = mySeq + 1;
  if (mySeq > 99) mySeq = 10;
  let h = "1";
  h = h + pad(g.room, 4);
  h = h + pad(mySeq, 2);
  h = h + String(kind) + PlayerData[1] + PlayerData[3] + PlayerData[5];
  h = h + pad(g.myGuessTurn, 2);
  h = h + pad(g.myGuessLeft, 2);
  h = h + pad(g.chosen, 3);
  h = h + pad(g.turn, 2);
  return h + String(g.chatSeq) + String(g.chatId);
}

/** @warp */
function sendPacket(kind: number) {
  let v = makeHeader(kind);
  if (kind === 1) {
    v = v + pad(g.nameCode.length / 2, 2) + g.nameCode;
    lastPresence = now();
  }
  if (kind === 3) {
    v = v + String(g.phase) + String(g.round) + String(g.rounds);
    v = v + pad(g.turn, 2);
    v = v + String(g.drawer);
    v = v + pad(Math.max(0, g.timeLeft), 2);
    v = v + pad(g.word, 3);
    for (let s = 1; s <= SLOTS; s++) v = v + pad(Math.min(9999, pScore[s - 1]), 4);
    lastState = now();
    stateDirty = false;
  }
  if (kind === 2) {
    let chunk = "";
    while (outQueue.length > 0 && chunk.length < 105) {
      chunk = chunk + outQueue[0];
      outQueue.remove(0);
    }
    myDrawSeq = myDrawSeq + 1;
    if (myDrawSeq > 99) myDrawSeq = 10;
    v = v + pad(g.turn, 2);
    v = v + pad(myDrawSeq, 2);
    v = v + pad(chunk.length, 3);
    v = v + chunk;
    v = v + pad(prevChunk.length, 3);
    v = v + prevChunk;
    prevChunk = chunk;
  }
  lastHeader = slice(v, 8, 14);
  lastSend = now();
  myValue = v;
  setSlot(g.slot, v);
  lastVal[g.slot - 1] = v;
}

/** @warp */
function send() {
  if (now() - lastSend < SEND_EVERY) return;
  const iDraw = g.phase === 2 && g.drawer === g.slot;
  if (g.host === g.slot && (stateDirty || now() - lastState > 0.6)) sendPacket(3);
  else if (iDraw && (outQueue.length > 0 || prevChunk !== "")) sendPacket(2);
  else {
    header = makeHeader(1);
    mySeq = mySeq - 1;
    header = slice(header, 8, 14);
    if (header !== lastHeader || now() - lastPresence > 1.2) sendPacket(1);
  }
}

// ---------------- host: the rules ----------------

/** @warp */
function setPhase(p: number, time: number) {
  g.phase = p;
  g.timeLeft = time;
  secondAt = now();
  stateDirty = true;
}

/** @warp */
function firstActive(after: number): number {
  let found = 0;
  for (let s = BOT; s > after; s--) if (pActive[s - 1] === 1) found = s;
  return found;
}

/** @warp */
function startGame() {
  for (let s = 1; s <= BOT; s++) pScore[s - 1] = 0;
  g.round = 1;
  g.drawer = firstActive(0);
  newTurn();
  addFeed("New game!", 4);
}

/** @warp */
function newTurn() {
  g.turn = g.turn + 1;
  if (g.turn > 99) g.turn = 10;
  g.word = 0;
  setPhase(1, CHOOSE_TIME);
}

/** @warp */
function nextTurn() {
  let next = firstActive(g.drawer);
  if (next === 0) {
    g.round = g.round + 1;
    next = firstActive(0);
  }
  if (g.round > g.rounds) {
    setPhase(4, 10);
    return;
  }
  g.drawer = next;
  newTurn();
}

/** @warp */
function startDrawing(word: number) {
  g.word = word;
  for (let s = 1; s <= BOT; s++) pAwarded[s - 1] = 0;
  setPhase(2, DRAW_TIME);
  botGuessAt = random(20, 55);
}

/** @warp */
function hostStep() {
  // practice against the Bot while alone; real players take over at once
  if (realPlayers === 1 && !g.practice && g.phase === 0 && now() - joinedAt > 3) {
    g.practice = true;
    pActive[BOT - 1] = 1;
    addFeed("Nobody here yet: practice with Bot!", 5);
    players = 2;
  }
  if (realPlayers >= 2 && g.practice) {
    g.practice = false;
    pActive[BOT - 1] = 0;
    setPhase(0, 0);
    drawQueue.length = 0;
  }
  if (g.practice) pActive[BOT - 1] = 1;
  if (g.phase === 0) {
    if (players >= 2) startGame();
    return;
  }
  if (players < 2) {
    setPhase(0, 0);
    return;
  }
  if (now() - secondAt >= 1) {
    secondAt = secondAt + 1;
    g.timeLeft = g.timeLeft - 1;
    stateDirty = true;
  }
  if (g.phase === 1) {
    let pick = 0;
    if (pActive[g.drawer - 1] === 0) {
      nextTurn();
      return;
    }
    if (g.drawer === g.slot) pick = g.chosen;
    else if (g.drawer === BOT) {
      if (g.timeLeft <= CHOOSE_TIME - 2) {
        botRec = random(1, REC_WORDS.length);
        botPos = 0;
        pick = Words.indexOf(REC_WORDS[botRec - 1]) + 1;
      }
    } else if (pChooseTurn[g.drawer - 1] === g.turn) pick = pChosen[g.drawer - 1];
    if (pick === 0 && g.timeLeft <= -3) pick = random(1, Words.length); // drawer never picked
    if (pick > 0) startDrawing(pick);
    return;
  }
  if (g.phase === 2) {
    let waiting = 0;
    for (let s = 1; s <= BOT; s++) {
      if (pActive[s - 1] === 1 && s !== g.drawer) {
        if (pGuessed[s - 1] === 1 && pAwarded[s - 1] === 0) {
          pAwarded[s - 1] = 1;
          pScore[s - 1] = pScore[s - 1] + 100 + Math.round(pGuessLeft[s - 1] * 3);
          pScore[g.drawer - 1] = pScore[g.drawer - 1] + 50;
          stateDirty = true;
          g.dirtyPlayers = true;
        }
        if (pGuessed[s - 1] === 0) waiting++;
      }
    }
    if (g.timeLeft <= 0 || waiting === 0 || pActive[g.drawer - 1] === 0) setPhase(3, 5);
    return;
  }
  if (g.phase === 3) {
    if (g.timeLeft <= 0) nextTurn();
    return;
  }
  if (g.timeLeft <= 0) startGame(); // phase 4: podium shown for 10 s
}

/** Practice Bot: draws pre-recorded pictures, and guesses your drawings after a while. */
/** @warp */
function botStep() {
  if (!g.practice || g.phase !== 2) return;
  if (g.drawer === BOT) {
    const data = REC_DATA[botRec - 1];
    // ~20 points per second, through the normal replay queue
    if (botPos < data.length && drawQueue.length < 2) {
      drawQueue.push(slice(data, botPos, 5));
      botPos += 5;
    }
    return;
  }
  if (pGuessed[BOT - 1] === 0 && DRAW_TIME - g.timeLeft >= botGuessAt) {
    pGuessed[BOT - 1] = 1;
    pGuessLeft[BOT - 1] = g.timeLeft;
    addFeed("Bot guessed the word!", 2);
    playSound("correct");
    g.dirtyPlayers = true;
  }
}

// ---------------- everyone: react to the state ----------------

/** @warp */
function onChanges() {
  if (g.turn !== prevTurn) {
    prevTurn = g.turn;
    for (let s = 1; s <= BOT; s++) {
      pGuessed[s - 1] = 0;
      pDrawSeq[s - 1] = 0;
    }
    g.iGuessed = false;
    g.chosen = 0;
    prevChunk = "";
    outQueue.length = 0;
  }
  if (g.phase !== prevPhase) {
    prevPhase = g.phase;
    g.dirtyTop = true;
    g.dirtyPlayers = true;
    if (g.phase === 0) g.overlay = "wait";
    if (g.phase === 1) {
      if (g.drawer === g.slot) {
        g.choice1 = random(1, Words.length);
        g.choice2 = random(1, Words.length);
        while (g.choice2 === g.choice1) g.choice2 = random(1, Words.length);
        g.choice3 = random(1, Words.length);
        while (g.choice3 === g.choice1 || g.choice3 === g.choice2) g.choice3 = random(1, Words.length);
      }
      g.overlay = "choose";
      playSound("turnstart");
    }
    if (g.phase === 2) {
      drawQueue.length = 0;
      flags.CATEGORY = CATEGORIES[WordCat[g.word - 1]];
      g.overlay = "";
      broadcast("clearCanvas");
      if (g.drawer === g.slot) addFeed(`Draw: ${Words[g.word - 1]}`, 4);
      else addFeed(`${nameOf(g.drawer)} is drawing now!`, 4);
    }
    if (g.phase === 3) {
      g.overlay = "reveal";
      addFeed(`The word was ${Words[g.word - 1]}`, 5);
      playSound("roundend");
    }
    if (g.phase === 4) {
      g.overlay = "podium";
      makePodium();
      broadcast("GameOverMusic");
    }
  }
  if (g.timeLeft !== prevLeft) {
    prevLeft = g.timeLeft;
    g.dirtyTop = true;
    if (g.phase === 2 && g.timeLeft <= 10 && g.timeLeft > 0) playSound("tick");
  }
  // the answer box is up whenever I'm not the one drawing
  const wantAsk = g.inGame && !(g.phase === 2 && g.drawer === g.slot) && !(g.phase === 1 && g.drawer === g.slot);
  if (wantAsk && !g.asking) broadcast("startGuess");
  if (!wantAsk && g.asking) broadcast("stopGuess");
  g.asking = wantAsk;
}

/** @warp */
function makePodium() {
  for (let k = 0; k < 3; k++) podium[k] = 0;
  for (let s = 1; s <= BOT; s++) {
    if (pActive[s - 1] === 1) {
      if (podium[0] === 0 || pScore[s - 1] > pScore[podium[0] - 1]) {
        podium[2] = podium[1];
        podium[1] = podium[0];
        podium[0] = s;
      } else if (podium[1] === 0 || pScore[s - 1] > pScore[podium[1] - 1]) {
        podium[2] = podium[1];
        podium[1] = s;
      } else if (podium[2] === 0 || pScore[s - 1] > pScore[podium[2] - 1]) podium[2] = s;
    }
  }
}

/** Player list rows: active players in slot order. */
/** @warp */
function updateRows() {
  let r = 0;
  for (let s = 1; s <= BOT; s++) {
    if (pActive[s - 1] === 1) {
      if (rowSlot[r] !== s) g.dirtyPlayers = true;
      rowSlot[r] = s;
      r++;
    }
  }
  while (r < 9) {
    if (rowSlot[r] !== 0) g.dirtyPlayers = true;
    rowSlot[r] = 0;
    r++;
  }
  if (g.slot > 0) {
    pFace[g.slot - 1] = Number(PlayerData[1]);
    pMouth[g.slot - 1] = Number(PlayerData[3]);
    pColor[g.slot - 1] = Number(PlayerData[5]);
  }
}
