// Drawing toolbar (only for the drawer) and the selection rings over it and the palette.
import { g } from "./Stage";
import { penUi } from "./Pen";

let kind = 0; // 0 toolbar, 1 tool ring, 2 color ring

whenFlag(() => {
  me.visible = false;
  kind = 1;
  createClone();
  kind = 2;
  createClone();
  kind = 0;
  switchCostume("toolbar");
  goTo(166, -152);
  show();
});

onClone(() => {
  if (kind === 1) switchCostume("sel");
  else switchCostume("cell");
  show();
});

function show() {
  forever(() => {
    me.visible = g.phase === 2 && g.drawer === g.slot && g.slot > 0;
    if (kind === 1) {
      let b = 0;
      if (penUi.size >= 3) b = 1;
      if (penUi.size >= 7) b = 2;
      if (penUi.eraser === 1) b = 3;
      goTo(116.5 + b * 33, -139);
    }
    if (kind === 2) goTo(-101.3 + Math.floor(penUi.color / 2) * 15.9, -137.3 - (penUi.color % 2) * 16);
    goToFront();
  });
}
