// Lobby avatar body (ported from the original blocks) + one clone per player-list row and podium place.
import { g, PlayerData, PlayerPosX, PlayerPosY, PlayerSize, rowSlot, podium, pColor } from "./Stage";
import { avatarSlot, avatarPlace } from "./lib/avatar";

let PlayerColor = 0;
let row = 0;
let slot = 0;

whenFlag(() => {
  row = 0;
  me.visible = true;
  forever(() => {
    nextCostume();
    wait(0.1);
  });
});

whenFlag(() => {
  forever(() => {
    PlayerColor = Number(PlayerData[PlayerData.indexOf("Color") + 1]) * 10;
    if (row === 0) setEffect("color", PlayerColor * 2);
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
      setEffect("color", pColor[slot - 1] * 20);
    }
  });
});
