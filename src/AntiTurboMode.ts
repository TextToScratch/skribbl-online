// Ported from the original: if 10 frames pass in no time, turbo mode is on, so show the warning and stop.
import { flags } from "./Stage";

let Running = "false";
let start = 0;

whenFlag(() => {
  flags.STOPPED = "false";
  forever(() => checkTurboMode());
});

function checkTurboMode() {
  // tiny and ghosted instead of hidden: moving a hidden sprite doesn't make Scratch wait for the next frame,
  // which made the original check fire without turbo mode
  me.visible = true;
  setEffect("ghost", 100);
  switchCostume("AntiTurboMode");
  me.size = 5; // tiny, in the corner: it must not cover any buttons
  goTo(230, 175);
  start = daysSince2000() * 86400;
  Running = "true";
  repeat(10, () => {
    me.x -= 10;
  });
  if (daysSince2000() * 86400 - start < 0.001) onTurboModeDetected();
  Running = "false";
}

function onTurboModeDetected() {
  setEffect("ghost", 0);
  switchCostume("TurboModeDetected");
  goToFront();
  me.size = 100;
  goTo(0, 0);
  stopGame();
}

function stopGame() {
  flags.STOPPED = "true";
  switchBackdrop("Lobby");
  broadcast("Stopped");
  stopAll();
}
