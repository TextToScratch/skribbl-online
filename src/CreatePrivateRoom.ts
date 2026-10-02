// Ported from the original blocks (hover sound + brightness); clicking now opens a private room.
let Hovering = "false";

whenFlag(() => {
  me.visible = true;
  forever(() => {
    if (touching("mouse")) {
      if (Hovering === "false") playSound("hover");
      Hovering = "true";
      setEffect("brightness", -10);
    } else {
      Hovering = "false";
      setEffect("brightness", 5);
    }
  });
});

whenClicked(() => {
  playSound("click");
  broadcast("PrivateRoom");
});

onMessage("Play", () => {
  me.visible = false;
  stopOthers();
});
