// Lobby avatar mouth (ported from the original blocks) + one clone per player-list row and podium place.
import { g, PlayerData, PlayerPosX, PlayerPosY, PlayerSize, pMouth } from "./Stage";
import { avatarSlot, avatarPlace } from "./lib/avatar";

let PlayerMouth = 0;
let row = 0;
let slot = 0;
let look = 0;

whenFlag(() => {
  row = 0;
  me.visible = true;
  forever(() => {
    switchCostume(PlayerMouth * 2 + 1);
    wait(0.1);
    switchCostume(PlayerMouth * 2 + 2);
    wait(0.1);
  });
});

whenFlag(() => {
  forever(() => {
    PlayerMouth = Number(PlayerData[PlayerData.indexOf("Mouth") + 1]);
  });
});

onMessage("UpdateCustomization", () => {
  updatePlacement();
});

function updatePlacement() {
  goTo(PlayerPosX, PlayerPosY);
  me.size = PlayerSize;
}

onMessage("Play", () => {
  me.visible = false;
  if (row > 0) return;
  stopOthers();
  for (let i = 1; i <= 12; i++) {
    row = i;
    createClone();
  }
  row = 0;
});

onClone(() => {
  forever(() => {
    slot = avatarSlot(row);
    me.visible = slot > 0;
    if (slot > 0) {
      avatarPlace(row);
      look = pMouth[slot - 1] * 2 + 1;
      if (Math.floor(daysSince2000() * 86400 * 5) % 2 === 1) look++;
      switchCostume(look);
    }
  });
});
