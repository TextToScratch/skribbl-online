// Skribbl Online: shared state. Every top-level variable here is global.
// The lobby sprites that still run their original blocks (Customize, Username, PlayButton, Logo, Icons, Info,
// MenuBackground) find PlayerData / PlayerPosX / PlayerPosY / PlayerSize by name, so keep these names.

/** Lobby avatar: "Face", face, "Mouth", mouth, "Color", color (the Customize arrows edit it). */
export const PlayerData: string[] = ["Face", "0", "Mouth", "0", "Color", "0"];
export let PlayerPosX = 0;
export let PlayerPosY = -25;
export let PlayerSize = 200;
/** STOPPED: set by AntiTurboMode. CATEGORY: category of the current word ("Animals", "Food", ...). */
export const flags = { STOPPED: "true", CATEGORY: "" };

/** Game state as seen by this client (the host writes it; everyone else copies it from the host's cloud slot). */
export const g = {
  inGame: false, // left the lobby
  room: 0, // 0 = public, 1000..9999 = private room code
  slot: 0, // my cloud slot 1..8 (0 = not joined)
  host: 0, // slot of the host (lowest active slot in the room)
  practice: false, // alone: playing against the Bot (slot 9)
  phase: 0, // 0 waiting, 1 choosing, 2 drawing, 3 turn over, 4 game over
  round: 1,
  rounds: 3,
  turn: 10, // turn id 10..99
  drawer: 0, // slot of the drawer
  timeLeft: 0,
  word: 0, // index into Words (1-based), 0 = none
  iGuessed: false,
  // hud redraw requests
  dirtyTop: true,
  dirtyPlayers: true,
  dirtyFeed: true,
  dirtyOverlay: false,
  overlay: "", // what's on the canvas: "", "choose", "reveal", "podium", "join"
  choice1: 0,
  choice2: 0,
  choice3: 0,
  chosen: 0, // word I picked (drawer)
  myGuessTurn: 0,
  myGuessLeft: 0,
  chatSeq: 0,
  chatId: 0,
  nameCode: "", // my Scratch username as 2-digit font codes (set by Text Generator)
  offline: false, // no free cloud slot: practice only, nothing sent
  asking: false, // the Guess sprite is showing the answer box
};

// Per slot 1..9 (9 = practice Bot). Index i-1.
export const pActive: number[] = [0, 0, 0, 0, 0, 0, 0, 0, 0];
export const pName: string[] = ["", "", "", "", "", "", "", "", "Bot"];
export const pFace: number[] = [0, 0, 0, 0, 0, 0, 0, 0, 1];
export const pMouth: number[] = [0, 0, 0, 0, 0, 0, 0, 0, 2];
export const pColor: number[] = [0, 0, 0, 0, 0, 0, 0, 0, 5];
export const pScore: number[] = [0, 0, 0, 0, 0, 0, 0, 0, 0];
export const pGuessed: number[] = [0, 0, 0, 0, 0, 0, 0, 0, 0];
/** Seconds left on the clock when that player guessed. */
export const pGuessLeft: number[] = [0, 0, 0, 0, 0, 0, 0, 0, 0];
/** Player list rows (top to bottom): slot numbers, 0 = empty row. */
export const rowSlot: number[] = [0, 0, 0, 0, 0, 0, 0, 0, 0];
/** Podium: 1st, 2nd, 3rd slot. */
export const podium: number[] = [0, 0, 0];

/** Chat/feed lines on the left panel (newest last) and their colors (0 black, 2 green, 3 red, 4 blue, 5 orange). */
export const feed: string[] = [];
export const feedInk: number[] = [];
/** Stroke tokens for the canvas (5 digits each, see Pen.ts) waiting to be drawn, and ones I drew to send. */
export const drawQueue: string[] = [];
export const outQueue: string[] = [];

/** Fixed quick-chat phrases (Scratch doesn't allow free-text chat). Type 1-6 as a guess, or press 1-6 while drawing. */
export const QUICK_CHAT: string[] = ["Hi!", "Nice drawing!", "So close!", "Hmm...", "Haha!", "Good game!"];

whenFlag(() => {
  switchBackdrop("Lobby");
  g.inGame = false;
  flags.STOPPED = "false";
  stopAllSounds();
  setVolume(35);
  forever(() => {
    if (!g.inGame) playSoundUntilDone("WIP2sea");
  });
});

function setVolume(v: number) {
  me.volume = v;
}

onMessage("Play", () => {
  switchBackdrop("Gameplay");
  stopOthers();
  stopAllSounds();
  me.volume = 100;
});

onMessage("GameOverMusic", () => {
  playSound("Classical Piano");
});

/** Word list (index = 1-based position). The drawer shares only this index; guesses are checked locally. */
export const Words: string[] = ["grocery store","plant","magic","rainy day","sidewalk","banana","blue jeans","notebook","echo","candlelight","driftwood","picture frame","jellybean","moss","coffee mug","pocket watch","riverbed","snowflake","treasure map","thunderstorm","gravel road","mirror","sunglasses","pinecone","laundry basket","marble floor","notebook paper","wind chime","popcorn","paperclip","cotton ball","teacup","shoelace","birdhouse","light bulb","backpack","honey jar","puddle","chocolate chip","doormat","fence post","sweater","jellyfish","sandcastle","clock tower","wagon wheel","paper boat","pencil case","rubber band","mailbox","penguin","cat","dog","fish","elephant","giraffe","snake","rabbit","turtle","lion","monkey","owl","frog","shark","butterfly","horse","pig","cow","duck","spider","bee","octopus","bear","mouse","snail","whale","zebra","crab","pizza","apple","burger","ice cream","cake","cookie","carrot","cheese","donut","egg","hot dog","pancake","sandwich","watermelon","grapes","cupcake","lemon","strawberry","taco","cherry","house","tree","sun","moon","rainbow","mountain","beach","volcano","castle","island","cloud","flower","river","cave","desert","lighthouse","bridge","igloo","tent","star","rocket","guitar","umbrella","bicycle","car","train","airplane","robot","crown","kite","balloon","camera","ladder","key","glasses","boat","hat","clock","book","drum","snowman","ghost","heart","smile"];
/** Category of each word: index into CATEGORIES. */
export const WordCat: number[] = [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4];
export const CATEGORIES: string[] = ["Things","Animals","Food","Nature","Stuff"];
