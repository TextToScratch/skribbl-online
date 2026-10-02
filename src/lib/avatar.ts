// Where the avatar clones of Body / Eyes / Mouth go: rows 1-9 = player list, 10-12 = podium places.
import { g, rowSlot, podium } from "../Stage";

/** Slot shown by this clone (0 = hide). */
/** @warp */
export function avatarSlot(row: number): number {
  if (!g.inGame || g.slot === 0) return 0;
  if (row <= 9) return rowSlot[row - 1];
  if (g.overlay !== "podium") return 0;
  return podium[row - 10];
}

/** @warp */
export function avatarPlace(row: number) {
  if (row <= 9) {
    me.size = 40;
    goTo(-227, 110 - (row - 1) * 16);
    return;
  }
  me.size = 110;
  if (row === 10) goTo(62.5, -8);
  if (row === 11) goTo(-32.5, -28);
  if (row === 12) goTo(157.5, -43);
}
