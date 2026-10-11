/** An insight's stat is the one figure the card sets in its display size, cut for numerals. A
 *  phrase written there ("Equal split") reads as a heading in the wrong face while the title
 *  already carries the words, so only text with a digit qualifies. When the stat is a phrase but
 *  the delta is a figure, the delta takes the stat's place: the card draws a delta only beside a
 *  stat, so dropping the stat alone would silently drop a real number with it.
 *
 *  Shared by the validator and the card, because a restored or baked frame never re-validates. */
export function insightFigure(
  stat: string | undefined,
  delta: string | undefined,
): { stat?: string; delta?: string } {
  const isFigure = (s: string | undefined): s is string => !!s && /\d/.test(s);
  if (isFigure(stat)) return delta ? { stat, delta } : { stat };
  return isFigure(delta) ? { stat: delta } : {};
}
