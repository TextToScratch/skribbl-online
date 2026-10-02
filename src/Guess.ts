// The answer box. Guesses are checked right here and never sent anywhere: only "I guessed it" goes out.
// Typing 1-6 sends a fixed quick-chat phrase instead (Scratch doesn't allow free-text chat).
import { g, feed, feedInk, pGuessed, pGuessLeft, Words, QUICK_CHAT } from "./Stage";

let a = "";
let word = "";

whenFlag(() => {
  me.visible = false;
});

onMessage("stopGuess", () => {
  stopOthers(); // also closes the answer box
});

onMessage("startGuess", () => {
  forever(() => {
    askAndWait("Type your guess! (1-6 = quick chat: Hi / Nice drawing / So close / Hmm / Haha / Good game)");
    a = answer();
    check();
  });
});

/** @warp */
function say2(text: string, ink: number) {
  feed.push(text);
  feedInk.push(ink);
  while (feed.length > 9) {
    feed.remove(0);
    feedInk.remove(0);
  }
  g.dirtyFeed = true;
}

/** @warp */
function check() {
  if (a === "") return;
  const n = Number(a);
  if (a.length === 1 && n >= 1 && n <= QUICK_CHAT.length) {
    g.chatSeq = (g.chatSeq % 9) + 1;
    g.chatId = n;
    say2(`You: ${QUICK_CHAT[n - 1]}`, 4);
    return;
  }
  if (g.phase !== 2 || g.word === 0 || g.iGuessed || g.drawer === g.slot) return;
  word = Words[g.word - 1];
  if (a === word) {
    // Scratch's = ignores upper/lower case
    g.iGuessed = true;
    g.myGuessTurn = g.turn;
    g.myGuessLeft = Math.max(0, g.timeLeft);
    pGuessed[g.slot - 1] = 1;
    pGuessLeft[g.slot - 1] = g.myGuessLeft;
    g.dirtyPlayers = true;
    g.dirtyTop = true;
    say2("You guessed the word!", 2);
    playSound("correct");
    return;
  }
  if (isClose()) {
    say2(`${a} is close!`, 5);
    playSound("close");
  } else say2(a, 0); // wrong guesses stay on your screen only
}

/** One letter off (changed, missing or extra)? */
/** @warp */
function isClose(): boolean {
  const la = a.length;
  const lb = word.length;
  if (Math.abs(la - lb) > 1) return false;
  let i = 0;
  let j = 0;
  let diff = 0;
  while (i < la && j < lb && diff < 2) {
    if (a[i] === word[j]) {
      i++;
      j++;
    } else {
      diff++;
      if (la > lb) i++;
      else if (lb > la) j++;
      else {
        i++;
        j++;
      }
    }
  }
  diff = diff + (la - i) + (lb - j);
  return diff === 1;
}
