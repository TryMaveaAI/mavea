// The mascot's shared geometry — one source of truth for every place the jelly is drawn:
// the living face (Presence.tsx) and the static brand marks (flagship Orb). All paths live
// in the same 200×220 user space (bell up top, curtains trailing), so a mark built from
// these constants is literally the same creature at rest, not a lookalike.

/** The bell silhouette. */
export const BELL =
  'M38 96 C38 52 62 26 100 26 C138 26 162 52 162 96 C162 110 146 116 100 116 C54 116 38 110 38 96 Z';

/** The four hanging curtains — the resting/working set. */
export const TENTS = [
  'M62 118 C56 142 66 158 56 186',
  'M84 121 C84 146 74 162 84 194',
  'M108 121 C110 144 100 162 110 192',
  'M130 118 C138 140 128 156 138 184',
];

/** The curled-up set (glyph moments + the docked chibi). */
export const SHORTS = [
  'M62 118 C56 128 62 138 56 148',
  'M84 121 C81 130 85 138 81 146',
  'M116 121 C119 130 115 138 119 146',
  'M138 118 C144 128 138 138 144 148',
];

/** The "found it" sweep — one tentacle points at the thing she did. */
export const POINT = 'M84 121 C96 140 120 148 152 144';

/** The bell's inner highlight arc. */
export const BELL_SHEEN = 'M48 88 C48 58 66 38 92 36';

/* ---- the face ---- */
export const EYE_Y = 72;
export const EYE_R = 9;
/** One eye per side: ball center + the swap-in crescent and closed-lid shapes. */
export const EYES = [
  { side: 'l', x: 80, crescent: 'M71 74 Q80 64 89 74', closed: 'M71 74 Q80 79 89 74' },
  { side: 'r', x: 120, crescent: 'M111 74 Q120 64 129 74', closed: 'M111 74 Q120 79 129 74' },
] as const;
export const SMILE = 'M92 91 Q100 97 108 91';
export const CHEEKS = [
  { side: 'l', cx: 66, cy: 86 },
  { side: 'r', cx: 134, cy: 86 },
] as const;

/* ---- strand glyphs — drawn beneath her, then dissolved ---- */
export const GLYPH_QUESTION = 'M88 152 C88 139 112 139 112 153 C112 163 100 162 100 172';
export const GLYPH_HEART =
  'M100 184 C90 174 80 170 80 160 C80 151 92 149 100 158 C108 149 120 151 120 160 C120 170 110 174 100 184';
export const GLYPH_IDEA = [
  'M100 146 C88 146 81 155 84 165 C86 172 91 176 94 179 L106 179 C109 176 114 172 116 165 C119 155 112 146 100 146',
  'M95 187 L105 187',
  'M96 172 L100 165 L104 172',
];
export const GLYPH_CHECK = 'M82 164 L96 178 L120 146';
