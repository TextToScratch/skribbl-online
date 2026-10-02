// Small helpers shared by several sprites.

/** Seconds on a wall clock (the AntiTurboMode sprite keeps resetting Scratch's timer, so don't use timer()). */
/** @warp */
export function now(): number {
  return daysSince2000() * 86400;
}

/** Left-pad a number with zeros. */
/** @warp */
export function pad(n: number, width: number): string {
  let s = String(Math.round(n));
  while (s.length < width) s = "0" + s;
  return s;
}

/** Characters [start, start + length) of a string. */
/** @warp */
export function slice(text: string, start: number, length: number): string {
  let out = "";
  for (let i = start; i < start + length && i < text.length; i++) out = out + text[i];
  return out;
}

/** Fill a rectangle on the pen layer (stage coordinates). Leaves the pen up. */
/** @warp */
export function paintRect(x1: number, y1: number, x2: number, y2: number, color: string) {
  penUp();
  setPenColor(color);
  setPenSize(4);
  let y = y1 + 2;
  while (y <= y2 - 2) {
    goTo(x1 + 2, y);
    penDown();
    goTo(x2 - 2, y);
    penUp();
    y += 3;
  }
  goTo(x1 + 2, y2 - 2);
  penDown();
  goTo(x2 - 2, y2 - 2);
  penUp();
}

/** Canvas area on the stage (the white box of the Gameplay backdrop). */
export const CX = -106;
export const CY = -123;
export const CW = 339;
export const CH = 243;
