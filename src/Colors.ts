// The palette (art from the original project): only shown to the player who is drawing.
import { g } from "./Stage";

whenBackdrop("Lobby", () => {
  me.visible = false;
});

whenBackdrop("Gameplay", () => {
  forever(() => {
    me.visible = g.phase === 2 && g.drawer === g.slot && g.slot > 0;
  });
});
