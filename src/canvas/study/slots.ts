// slots.ts — the Study's fixed composition, as data.
//
// The desk is authored ONCE at a fixed size and scaled to the stage, exactly like a piece of
// print: every slot below is a point in that 1440×740 space, so the composition can never come
// apart at an unanticipated stage size — it only gets bigger or smaller. The numbers are the
// design's own (measured off the approved mockup), not derived; change them only against it.
//
// Scale, not reflow, is the responsive story down to STUDY_FIT_FLOOR; a short stage crops only its
// decorative floor rather than silently changing the whole experience, and a genuinely NARROW
// container drops the desk for the flat column (study.css's compact block). The floor is DERIVED the way
// the world's camera floor is: the smallest persistent type on a reading surface here is authored
// at 11px (kickers, the note pager), and 9px is the app-wide rendered floor, so the desk may
// shrink to 9/11 of its authored size and no further.

/** The authored height of the desk composition, in design px. */
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
 *  desk crops Mavéa's note card — real reading content — off the right edge. Held clear of the
 *  980px stage a 1280px window produces (1280 − 236 rail − 52 − 12), which otherwise decided the
 *  layout on a sub-pixel. Shared with study.css's container query, which handles the descendants;
 *  the stage's own box is driven by the `data-compact` attribute the scale hook publishes (a
 *  container cannot query itself). */
export const COMPACT_W = 940;

/** The tallest stage the desk is fitted into, mirroring study.css's own clamp — past it the
 *  composition is swimming in parchment rather than reading larger. */
export const STAGE_H_MAX = 820;

/** How far the handwritten takeaway sits above the stage's lower edge, in design px. Mirrors
 *  study.css's `.study-takeaway { bottom }`; the scale hook adds the line's measured height to
 *  it to reserve the whole band under the front card. */
export const TAKEAWAY_BOTTOM = 74;

/** Vertical crop (in design px) the stage will absorb before it declares itself shallow and
 *  study.css collapses the floor-grid band instead of cropping into the cards. */
export const SHALLOW_CROP = 90;

/** Short windows scroll the authored desk instead of crushing it below the point where the card
 * arc survives. Derived from the same legibility floor and decorative crop allowance as the fit:
 * (DESK_H - SHALLOW_CROP) * STUDY_FIT_FLOOR + the 2px frame. */
export const STAGE_H_MIN = Math.ceil((DESK_H - SHALLOW_CROP) * STUDY_FIT_FLOOR) + 2;

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

/** The connector arrow's frame. Tall on purpose: its curve starts at the note's edge and lands
 *  HIGH on the front card's flank, so a short card is still genuinely pointed at. */
export const CONNECT_SLOT = { x: 872, y: 208, z: 72, w: 150, h: 220 } as const;
