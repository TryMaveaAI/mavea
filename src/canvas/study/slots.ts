// slots.ts — the Study's fixed composition, as data.
//
// The desk is authored ONCE at a fixed size and scaled to the stage, exactly like a piece of
// print: every slot below is a point in that 1440×740 space, so the composition can never come
// apart at an unanticipated stage size — it only gets bigger or smaller. The numbers are the
// design's own (measured off the approved mockup), not derived; change them only against it.
//
// Scale, not reflow, is the responsive story down to STUDY_FIT_FLOOR; below the floor the stage
// crops rather than shrinking type past legibility, and a genuinely small container drops the
// desk entirely for the flat column (study.css's compact block). The floor is DERIVED the way
// the world's camera floor is: the smallest persistent type on a reading surface here is authored
// at 11px (kickers, the note pager), and 9px is the app-wide rendered floor, so the desk may
// shrink to 9/11 of its authored size and no further.

/** The authored size of the desk composition, in design px. */
export const DESK_W = 1440;
export const DESK_H = 740;

/** The fitting box the scale is computed against — slightly larger than the desk so the
 *  composition keeps a breath of margin at scale 1 (the mockup's own ratio). */
export const FIT_W = 1470;
export const FIT_H = 765;

/** How far past its authored size the desk may grow on a large screen. */
export const SCALE_MAX = 1.12;

/** …and in full screen, where the reader has asked for the whole viewport and the HUD scales
 *  with the desk, so the surface grows as one piece rather than as a fixed frame around a
 *  slightly larger picture. */
export const SCALE_MAX_FULL = 1.6;

/** 9px app legibility floor ÷ 11px smallest persistent reading type on the desk. If either
 *  number changes, this moves — recompute it, never tune it. */
export const STUDY_FIT_FLOOR = 9 / 11;

/** The width at which the 3-D desk stands down for the flat reading column: below it the floored
 *  desk crops Mavéa's note card — real reading content — off the right edge. Shared with
 *  study.css's container query, which handles the descendants; the stage's own box is driven by
 *  the `data-compact` attribute the scale hook publishes (a container cannot query itself). */
export const COMPACT_W = 980;

/** Vertical crop (in design px) the stage will absorb before it declares itself shallow and
 *  study.css collapses the floor-grid band instead of cropping into the cards. */
export const SHALLOW_CROP = 90;

export interface DeskSlot {
  x: number;
  y: number;
  z: number;
  /** rotateY, degrees. */
  ry: number;
  /** scale of the card in this slot. */
  s: number;
}

/** The object being held up: dead ahead, full size, lifted toward the reader, and CENTRED on a
 *  point just above the desk's midline (370) — a card is the thing you are looking at, so it
 *  belongs where the eye already is, not floating at the top with a field of empty desk beneath
 *  it. Real blocks vary wildly in height; what keeps a tall one from walking off both edges is
 *  the measured height cap (useStudyScale's --study-front-max), not a top-pin. */
export const FRONT_SLOT: DeskSlot = { x: 590, y: 330, z: 70, ry: 0, s: 1 };

/** The arc behind the desk, left to right. Five, because a sixth either crowds the note card or
 *  falls off the stage — anything past the arc stays reachable through the beat bar. */
export const BACK_SLOTS: readonly DeskSlot[] = [
  { x: 150, y: 215, z: -420, ry: 16, s: 0.44 },
  { x: 405, y: 172, z: -420, ry: 8, s: 0.44 },
  { x: 720, y: 148, z: -420, ry: 0, s: 0.44 },
  { x: 1035, y: 172, z: -420, ry: -8, s: 0.44 },
  { x: 1290, y: 215, z: -420, ry: -16, s: 0.44 },
];

export const BACK_CAP = BACK_SLOTS.length;

/** Fill order for the arc. The front card is top-pinned and up to 560 design px wide, so the
 *  inner slots sit largely BEHIND it — the far ends are the genuinely visible ones. Filling
 *  ends-first keeps a two- or three-object answer balanced instead of huddled on the left,
 *  with the far-left slot first to counterweight the note card on the right. */
export const SLOT_ORDER = [0, 4, 3, 1, 2] as const;

/** Where a card waits before the answer assembles: the centre of the desk, tiny. */
export const GATHER_SLOT: DeskSlot = { x: 590, y: 420, z: 70, ry: 0, s: 0.22 };

/** Every card is authored at the front card's width and scaled per slot, so a card carries the
 *  same face everywhere and travel is pure transform. */
export const CARD_W = 560;

/** The wide desk, for blocks whose catalog span says they are built for 8+ grid columns — a
 *  twelve-column table at 560px truncates every cell ("Retail & E-co…"), which is the one thing
 *  the desk must never do to the object it is presenting. The numbers are the desk's own
 *  geometry: at 700 wide centred on 570 the card spans 220..920, the left scrawls (168px
 *  reach) still start at 52, and the right edge leaves the note card's flank (1014) a 94px
 *  gutter — enough for the connector's arrow, not enough for the right-gutter scrawls, which
 *  stand down on a wide card (the data beats a fourth remark). */
export const WIDE_CARD_W = 700;
export const WIDE_FRONT_SLOT: DeskSlot = { x: 570, y: 330, z: 70, ry: 0, s: 1 };
/** The connector's frame shifts with the wide card's edge so its curve still lands on the flank. */
export const WIDE_CONNECT_SLOT = { x: 922, y: 208, z: 72, w: 150, h: 220 } as const;

/** Mavéa's note, on the desk beside the front card. */
export const NOTE_SLOT = { x: 1165, y: 392, z: 75, w: 302 } as const;

/** The connector arrow's frame. Tall on purpose: its curve starts at the note's edge and lands
 *  HIGH on the front card's flank, so a short card is still genuinely pointed at. */
export const CONNECT_SLOT = { x: 872, y: 208, z: 72, w: 150, h: 220 } as const;

/** The handwritten takeaway under the front card. */
export const TAKEAWAY_SLOT = { x: 590, y: 648, w: 600 } as const;
