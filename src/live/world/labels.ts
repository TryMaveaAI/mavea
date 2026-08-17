// world/labels.ts — a label a reader can actually see.
//
// A node label is model-authored and only has to be non-empty to survive the gate. U+200B is not
// whitespace, so a zero-width label passes every trim and then paints nothing: a card with no name, a
// lever with no name, and — where a label is spliced into a sentence — a bare arrow with no subject,
// which reads as a broken sentence rather than as a missing name. Format and control characters are
// stripped and what is left has to contain something.
//
// Stated at the WORLD's edge rather than in the spatial renderer: "an unnamed cause" is this
// surface's wording for its own subject matter, and canvas/spatial knows nothing about causes.

/** `label` when it paints something, else `fallback`. */
export function readableLabel(label: string | undefined, fallback = 'an unnamed cause'): string {
  const raw = label ?? '';
  const visible = raw.replace(/[\p{Cf}\p{Cc}]/gu, '').trim();
  return visible.length > 0 ? raw.trim() : fallback;
}
