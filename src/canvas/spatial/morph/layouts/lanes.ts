// lanes.ts — the frame every representation draws in: the shared footprint metrics (and the
// counter-scale arithmetic that turns them into the room a layout must actually reserve), plus the
// timezone-free year scale the time-based layouts agree on.
import { niceStep } from '../../../lib/scale';

/** Margin kept around a lane's content inside its bbox. */
export const PAD = 56;
/** The fit box of a laptop stage — what a layout composes against until a caller measures its own
 *  (LayoutOpts.viewport). Shared, so the three representations agree on what "the space" means. */
export const DEFAULT_VIEWPORT = { w: 1090, h: 650 } as const;
/** Default footprints per face — a graph card, a timeline entry, a chart mark. */
export const CARD_W = 200;
/** The card's MINIMUM footprint — a one-line label with its foot row. What the composition budgets
 *  columns and rows against. */
export const CARD_H = 64;
/** What a card can actually GROW to, and therefore what anything keeping cards clear of each other
 *  has to reserve. A label is model-authored and wraps to three lines (morph.css clamps it there),
 *  and under it sits the foot row. Budgeting the minimum and then separating by it is why two open
 *  breakdowns drew their cards through each other: the geometry was correct for boxes nobody was
 *  rendering. The label clamps at TWO lines for the same reason the number is 88 — a third line
 *  costs every card in the web the height, and the composition stops fitting a laptop at a legible
 *  scale. Keep in step with morph.css's `.mv-face-card` (2-line clamp + foot + padding).
 *
 *  86, measured, not 80 as it was: 20 padding + 35 of two-line label + 4 gap + a foot row that is 24
 *  rather than its own 18px min-height, because the host puts 24px HIT-FLOOR boxes in it (world.css
 *  gives `.wo-num` and `.wo-expand` `min-height: 24px`), + 2 of border. The renderer was reserving a
 *  card seven pixels shorter than the one the host actually draws, so two cards in a column could
 *  touch however carefully the pitch was derived. */
export const CARD_H_MAX = 86;
export const ENTRY_W = 160;
export const ENTRY_H = 44;
/** A mark is the node's whole affordance on the chart — the only way into its provenance — so its
 *  footprint is the hit floor, not the dot. The dot morph.css paints inside it stays small; the box
 *  around it is what a finger has to land in, and what every distance in chartLayout is kept clear
 *  of. Keep the two in step: shrink this and the chart's marks stop being reachable.
 *
 *  30 world units, not 24, because this is a WORLD-space size and the hit floor is a SCREEN one. At
 *  the camera's floor a mark renders at `MARK × FIT_FLOOR × COUNTER_MAX`, which for 24 is 19.6px —
 *  under the floor on every window smaller than a large laptop, which is exactly where a finger is
 *  most likely to be the pointer. 30 lands it at 24.5px there and larger everywhere else. */
export const MARK = 30;
/** The ceiling morph.css puts on the world's counter-scale (`--mv-counter`). A face is drawn at its
 *  authored size in the NODE's own space, and the counter-scale blows that space up by as much as
 *  this as the camera pulls back — so a face's real world-space footprint is its size times this,
 *  and a layout that wants two faces to stay clear of each other has to reserve the product. The
 *  graph already obeys it by construction (COL_W 300 ≥ CARD_W 200 × 1.5); the chart, whose marks
 *  are placed by their data, has to do the arithmetic. Keep in step with morph.css. */
export const COUNTER_MAX = 1.4;

/**
 * How much room a face actually needs in WORLD space, which is not its authored size.
 *
 * The counter-scale blows a face up by as much as COUNTER_MAX as the camera pulls back, so two faces
 * stay clear of each other only if the layout reserved the PRODUCT. The graph obeyed this across
 * columns from the start (COL_W 300 ≥ CARD_W 200 × 1.5) and nothing obeyed it down them: a row pitch
 * of CARD_H_MAX + 32 reserves 112px for a card that stands 112px tall at full counter, which is a
 * gap of exactly zero — and the flow was several pixels NEGATIVE. It surfaced the moment the camera
 * stopped fitting below the legibility floor and worlds started sitting at full counter-scale: two
 * cards in one column, touching. Reserve these, not the authored numbers.
 */
export const CARD_SLOT_H = CARD_H_MAX * COUNTER_MAX;
export const ENTRY_SLOT_W = ENTRY_W * COUNTER_MAX;
/** A HELD-ASIDE chip is narrower than a placed entry: it carries a name and nothing else — no date,
 *  no figure — and it is the one thing on the surface competing for room with the view it was
 *  excluded from. At the placed width its full-counter footprint forced a second row onto the band
 *  and cost the composition its fit. Keep in step with morph.css's `[data-shelved] .mv-face-entry`. */
export const SHELF_ENTRY_W = 116;
export const SHELF_SLOT_W = SHELF_ENTRY_W * COUNTER_MAX;

/** Below this many RENDERED px, type is being squinted at rather than read. The repo's own floor,
 *  and what `scripts/world-audit.mts` fails on. */
const LEGIBLE_FLOOR_PX = 9;
/** The smallest type the surface paints that level-of-detail does NOT hide as the camera pulls
 *  back. Values, tier badges and the what-if chip all disappear at far LOD; a node's LABEL, a chart
 *  axis's tick and the held-aside band's heading cannot, because they are the content. The axis
 *  tick, at 11px, is the smallest of those — keep in step with `.mv-chrome-label`. */
const SMALLEST_PERSISTENT_PX = 11;

/**
 * The scale the camera stops shrinking at.
 *
 * Not a taste call — it is the point where the counter-scale runs out of room. Above 1/COUNTER_MAX
 * a face renders at its authored size however far the camera has pulled back; below it, type
 * shrinks linearly, and this is the scale at which the smallest type the reader still needs reaches
 * the legibility floor. Fitting past it does not show more of the world, it shows an unreadable
 * picture of it — so the camera stops here and the world becomes pannable instead, which is what
 * `isAtFitFloor` and the audit's "offstage is reported, not failed" rule already assume.
 *
 * It used to be 0.25, which let a sixteen-cause world fit a short laptop window at 0.26× and paint
 * its labels at 4.1px. Every size below a 1440×900 laptop was doing some version of that.
 */
export const FIT_FLOOR = LEGIBLE_FLOOR_PX / (SMALLEST_PERSISTENT_PX * COUNTER_MAX);

/** Path-data number: relaxation and scales produce long floats; 0.01px is below anything the eye
 *  (or a test) can see, and keeps emitted `d` strings readable. */
export const px = (v: number): string => String(Math.round(v * 100) / 100);

/** The relation modifier for an edge's class list. The kind reaches the layouts as a free string
 *  (the geometry layer has no view of the live allowlist), so it is checked before it is pasted
 *  into a selector — a class is a contract with the sheet, not a place to echo model text. */
export const relClass = (kind: string | undefined): string => modClass('morph-edge--rel', kind);

/** A model-authored token as a CSS modifier, or nothing. The guard is the point: a class is a
 *  contract with the stylesheet, not a place to echo whatever the model wrote — an unrecognised
 *  token yields no class at all rather than one nothing styles. */
export const modClass = (base: string, token: string | undefined): string =>
  token && /^[a-z-]{1,24}$/.test(token) ? ` ${base}-${token}` : '';

/** ms epoch → fractional Gregorian year, timezone-free so layout is identical everywhere. It is a
 *  plain linear map over a mean Gregorian year, which is what lets one scale carry both time reps —
 *  and `msOf` inverts it exactly, so a tick chosen on the calendar lands on the instant it names. */
const MS_PER_YEAR = 365.2425 * 24 * 60 * 60 * 1000;
export const yearOf = (ms: number): number => 1970 + ms / MS_PER_YEAR;
const msOf = (year: number): number => (year - 1970) * MS_PER_YEAR;

const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const MS_PER_DAY = 24 * MS_PER_HOUR;

type Grain = 'minute' | 'hour' | 'day' | 'month';
const GRAIN_MS: Record<Grain, number> = {
  minute: MS_PER_MINUTE,
  hour: MS_PER_HOUR,
  day: MS_PER_DAY,
  month: MS_PER_YEAR / 12,
};
interface Step {
  grain: Grain;
  n: number;
}

/** The sub-year steps an axis may take. A span under a few years takes whichever of these lands
 *  CLOSEST to the tick target — the finest granularity the span can carry, and the smallest rounding
 *  it has to suffer at each end. Rounding every tick to a year instead is what once drew an
 *  hour-by-hour bank run as the single label "2019". */
const SUB_YEAR_STEPS: readonly Step[] = [
  { grain: 'minute', n: 1 },
  { grain: 'minute', n: 5 },
  { grain: 'minute', n: 10 },
  { grain: 'minute', n: 15 },
  { grain: 'minute', n: 30 },
  { grain: 'hour', n: 1 },
  { grain: 'hour', n: 2 },
  { grain: 'hour', n: 3 },
  { grain: 'hour', n: 6 },
  { grain: 'hour', n: 12 },
  { grain: 'day', n: 1 },
  { grain: 'day', n: 2 },
  { grain: 'day', n: 5 },
  { grain: 'day', n: 10 },
  { grain: 'month', n: 1 },
  { grain: 'month', n: 2 },
  { grain: 'month', n: 3 },
  { grain: 'month', n: 6 },
];
/** Under this many years an axis stops counting in years: three whole-year ticks over a two-year
 *  span say far less than eight monthly ones. */
const YEAR_MIN_SPAN = 3;
const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;
/** A step is chosen to land near the target, so this only ever catches float pathology. */
const TICK_CAP = 64;

export interface TimeTick {
  /** Fractional year — where the tick sits on the shared scale. */
  year: number;
  text: string;
}

export interface TimeAxis {
  /** The data's span rounded OUT to whole steps, so both ends of the data carry a tick. Nicing here
   *  rather than in each layout is what keeps a domain and its ticks on ONE step: computing them
   *  separately let a niced bound land between two ticks, stranding the last observation past the
   *  last label. */
  domain: [number, number];
  ticks: TimeTick[];
}

/** Date.UTC folds years 0–99 into the 1900s, so an ancient world has to build its instants the long
 *  way round. */
function utcMonthStart(months: number): number {
  const d = new Date(0);
  d.setUTCFullYear(Math.floor(months / 12), ((months % 12) + 12) % 12, 1);
  d.setUTCHours(0, 0, 0, 0);
  return d.getTime();
}

/** The step boundary at or before `ms` — or, with `up`, at or after it. */
function snap(ms: number, step: Step, up: boolean): number {
  if (step.grain === 'month') {
    const d = new Date(ms);
    const months = Math.floor((d.getUTCFullYear() * 12 + d.getUTCMonth()) / step.n) * step.n;
    const at = utcMonthStart(months);
    return up && at < ms ? utcMonthStart(months + step.n) : at;
  }
  const unit = GRAIN_MS[step.grain] * step.n;
  const at = Math.floor(ms / unit) * unit;
  return up && at < ms ? at + unit : at;
}

function calendarLabel(ms: number, grain: Grain): string {
  const d = new Date(ms);
  // Past the range a Date can hold there is no calendar to read, and every field comes back NaN —
  // the year scale still has a number, and a number beats "undefined NaN" on an axis.
  if (!Number.isFinite(d.getTime())) return String(Math.round(yearOf(ms)));
  const month = `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  if (grain === 'month') return month;
  const day = `${d.getUTCDate()} ${month}`;
  if (grain === 'day') return day;
  // An intraday axis reads as a clock; every midnight tick re-dates it, so no reader has to guess
  // which day a time belongs to.
  if (d.getUTCHours() === 0 && d.getUTCMinutes() === 0) return day;
  const two = (v: number): string => String(v).padStart(2, '0');
  return `${two(d.getUTCHours())}:${two(d.getUTCMinutes())}`;
}

/** The next boundary after `ms`. Months are real calendar months (28–31 days), so they are walked
 *  on the calendar rather than added as a mean length — an axis that drifts off the first of the
 *  month is an axis whose labels stop meaning what they say. */
function advance(ms: number, step: Step): number {
  if (step.grain !== 'month') return ms + GRAIN_MS[step.grain] * step.n;
  const d = new Date(ms);
  return utcMonthStart(d.getUTCFullYear() * 12 + d.getUTCMonth() + step.n);
}

function calendarAxis(lo: number, hi: number, step: Step): TimeAxis {
  const start = snap(msOf(lo), step, false);
  const end = snap(msOf(hi), step, true);
  const ticks: TimeTick[] = [];
  for (let at = start; at <= end && ticks.length < TICK_CAP; at = advance(at, step)) {
    ticks.push({ year: yearOf(at), text: calendarLabel(at, step.grain) });
  }
  return { domain: [yearOf(start), yearOf(end)], ticks };
}

/** Whole-year ticks on a nice integer step, with the domain rounded out to the same step. */
function yearAxis(lo: number, hi: number, target: number): TimeAxis {
  const step = Math.max(1, Math.round(niceStep(hi - lo, target)));
  const d0 = Math.floor(lo / step) * step;
  const d1 = Math.ceil(hi / step) * step;
  const ticks: TimeTick[] = [];
  for (let t = d0; t <= d1 && ticks.length < TICK_CAP; t += step) {
    ticks.push({ year: t, text: String(t) });
  }
  return { domain: [d0, d1], ticks };
}

/** The one time axis both time representations draw: a domain rounded out to whole steps and the
 *  ticks that step produces, labelled at the granularity the span actually has. */
export function timeAxis(min: number, max: number, target = 6): TimeAxis {
  // A single instant still needs a width to plot in.
  const [lo, hi] = min < max ? [min, max] : [min - 0.5, max + 0.5];
  if (hi - lo >= YEAR_MIN_SPAN) return yearAxis(lo, hi, target);
  // Closest in ratio, not the first that fits: a step half again wider than the span needs rounds
  // the domain out past the data, which on a dense timeline is width every entry pays for.
  const ideal = ((hi - lo) * MS_PER_YEAR) / target;
  let step = SUB_YEAR_STEPS[SUB_YEAR_STEPS.length - 1];
  let closest = Infinity;
  for (const s of SUB_YEAR_STEPS) {
    const off = Math.abs(Math.log((GRAIN_MS[s.grain] * s.n) / ideal));
    if (off < closest) {
      closest = off;
      step = s;
    }
  }
  return calendarAxis(lo, hi, step);
}
