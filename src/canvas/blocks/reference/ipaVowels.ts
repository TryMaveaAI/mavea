// The IPA vowel quadrilateral's fixed geometry: where each vowel and each cardinal dot sits in
// IpaChart's 0..104 × 0..100 viewBox. Static linguistic data — the model only picks highlights.

/** One vowel: its symbol and its position on the quadrilateral (0 = front/close, 1 = back/open). */
interface VowelPos {
  s: string; // IPA symbol
  back: number; // 0 front … 1 back
  high: number; // 0 close … 1 open
  rounded?: boolean; // rounded vowels sit to the right of their point, unrounded to the left
  free?: boolean; // the lax/central vowels float between the points, centred, with no dot
}

// The cardinal points the IPA chart marks with a dot, each flanked by its unrounded (left) and
// rounded (right) vowel, plus the four lax/central vowels that float free. Coordinates follow
// the official chart: two interior rules (close-mid, open-mid) and a central spine.
const VOWELS: VowelPos[] = [
  // close
  { s: 'i', back: 0, high: 0 },
  { s: 'y', back: 0, high: 0, rounded: true },
  { s: 'ɨ', back: 0.5, high: 0 },
  { s: 'u', back: 1, high: 0, rounded: true },
  { s: 'ɪ', back: 0.2, high: 0.17, free: true },
  { s: 'ʊ', back: 0.8, high: 0.17, rounded: true, free: true },
  // close-mid
  { s: 'e', back: 0, high: 1 / 3 },
  { s: 'ø', back: 0, high: 1 / 3, rounded: true },
  { s: 'o', back: 1, high: 1 / 3, rounded: true },
  // mid
  { s: 'ə', back: 0.5, high: 0.5, free: true },
  // open-mid
  { s: 'ɛ', back: 0, high: 2 / 3 },
  { s: 'ɜ', back: 0.5, high: 2 / 3 },
  { s: 'ʌ', back: 1, high: 2 / 3 },
  { s: 'ɔ', back: 1, high: 2 / 3, rounded: true },
  // open
  { s: 'æ', back: 0.12, high: 0.84, free: true },
  { s: 'a', back: 0, high: 1 },
  { s: 'ɑ', back: 1, high: 1 },
  { s: 'ɒ', back: 1, high: 1, rounded: true },
];

/** How far a flanking vowel's centre sits from its point. A 6-unit mono glyph is ~3.6 wide, so
 *  this leaves a clear gap either side of the dot, and the halo (VOWEL_HALO_R) stops short of it. */
const VOWEL_SIDE = 4.6;
export const VOWEL_HALO_R = 3.8;

/** Where each vowel's symbol is drawn, and the points that carry a dot. */
export function vowelLayout(): {
  glyphs: { s: string; x: number; y: number }[];
  dots: { x: number; y: number }[];
} {
  const glyphs: { s: string; x: number; y: number }[] = [];
  const dots = new Map<string, { x: number; y: number }>();
  for (const v of VOWELS) {
    const p = projectVowel(v.back, v.high);
    if (v.free) {
      glyphs.push({ s: v.s, x: p.x, y: p.y });
      continue;
    }
    dots.set(`${p.x.toFixed(2)},${p.y.toFixed(2)}`, p);
    glyphs.push({ s: v.s, x: p.x + (v.rounded ? VOWEL_SIDE : -VOWEL_SIDE), y: p.y });
  }
  return { glyphs, dots: [...dots.values()] };
}

// Trapezoid corners (viewBox units). Top is wide, bottom is narrower & shifted right.
export const TL = { x: 12, y: 14 };
export const TR = { x: 92, y: 14 };
export const BL = { x: 34, y: 86 };
export const BR = { x: 80, y: 86 };

// For a given height t (0 top … 1 bottom) the left/right x are linear interpolations of the
// corners — that is what makes a vowel's horizontal slot narrow as it descends.
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export function projectVowel(back: number, high: number): { x: number; y: number } {
  const left = lerp(TL.x, BL.x, high);
  const right = lerp(TR.x, BR.x, high);
  return { x: lerp(left, right, back), y: lerp(TL.y, BL.y, high) };
}
