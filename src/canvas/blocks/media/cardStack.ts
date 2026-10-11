// Each card under the top one is offset by this share of a card's own width and height.
export const STACK_STEP_X = 0.04;
export const STACK_STEP_Y = 0.03;

/**
 * The box a cascaded pile of `shown` cards occupies, so the pile fills it exactly. The box is
 * as wide as one card plus its cascade, and each card takes the share of it that leaves room
 * for the offsets — nothing escapes the box, and nothing after the pile (its ×N count) is
 * pushed off by empty space the cascade never reaches.
 */
export function stackBox(
  shown: number,
  cardAspect: number,
): { widthScale: number; cardPct: number; aspect: number } {
  const depth = Math.max(0, shown - 1);
  const widthScale = 1 + depth * STACK_STEP_X;
  const heightScale = 1 + depth * STACK_STEP_Y;
  return {
    widthScale,
    cardPct: 100 / widthScale,
    aspect: (widthScale * cardAspect) / heightScale,
  };
}
