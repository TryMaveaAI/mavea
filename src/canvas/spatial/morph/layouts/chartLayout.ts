// chartLayout.ts — the how-much representation. Every node with a measured series becomes a line in
// a plot band it shares ONLY with series in its own unit — one time scale on x for the whole chart,
// one nice value domain per unit on y — and the node itself shrinks to a mark on its series' last
// point, so the morph from card to mark lands exactly where the line ends. Two marks that would
// land on the same pixel are fanned apart inside their band, each keeping a leader back to its
// datum. Series lines, gridlines and axis labels are chrome; a node with no measured series is
// shelved, never dropped and never given an invented line.
import type { Bbox } from '../../camera';
import { niceDomain, niceStep, scaleLinear, ticks as tickValues } from '../../../lib/scale';
import { spreadLabels } from '../../../lib/spreadLabels';
import type {
  ChromeSpec,
  LayoutFn,
  MorphLayout,
  MorphNodeDatum,
  PlacedNode,
  WorldData,
} from '../types';
import {
  COUNTER_MAX,
  DEFAULT_VIEWPORT,
  MARK,
  PAD,
  px,
  timeAxis,
  yearOf,
  type TimeTick,
} from './lanes';
import { placeShelf } from './shelf';

const PLOT_W = 880;
/** The height every unit band SHARES. A chart of four incommensurable series is the same size on
 *  the stage as a chart of one, so being honest about units never costs the reader a zoom level;
 *  the bands only push past it when there are more units than this height can seat. */
const PLOT_H = 340;
const MAX_PLOT_H = 468;
const MIN_BAND_H = 56;
const BAND_GAP = 26;
const LABEL_GAP = 16;
/** Rough glyph width for reserving bbox room around text chrome. */
const GLYPH_W = 7;
/** Minimum distance between two mark CENTRES. A mark is the node's hit target, so this is an
 *  INTERACTION floor, not a visual one — two marks closer together than a mark is WIDE ON SCREEN
 *  share a hit box, and whichever is on top answers for both. The counter-scale is in it because
 *  that is what decides how wide a mark really is: the dot is drawn in the node's own space, which
 *  the camera's counter-scale stretches by up to COUNTER_MAX against the world these distances are
 *  measured in. */
const MARK_GAP = MARK * COUNTER_MAX;

interface SeriesNode {
  node: MorphNodeDatum;
  /** Finite points only, sorted by t (in fractional years). */
  points: Array<{ t: number; v: number }>;
}

function seriesOf(node: MorphNodeDatum): SeriesNode | null {
  const points = (node.series ?? [])
    .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.v))
    .map((p) => ({ t: yearOf(p.t), v: p.v }))
    .sort((a, b) => a.t - b.t);
  return points.length > 0 ? { node, points } : null;
}

/** Can this representation draw the node a line, rather than shelve it? Exported so a surface
 *  deciding whether to OFFER the chart asks the same question the lane below asks before shelving —
 *  a second copy of the test is a copy that drifts. */
export const placeableOnChart = (node: MorphNodeDatum): boolean => seriesOf(node) !== null;

/** One unit's own plot: its value domain, its gridlines, and where it sits in the stack. */
interface UnitBand {
  /** '' when the series in it carry no unit at all. */
  unit: string;
  domain: [number, number];
  ticks: number[];
  /** Offset of the band's top from the plot's top, and the band's height. */
  top: number;
  h: number;
}

interface PlotSpec {
  x: [number, number];
  xTicks: TimeTick[];
  bands: UnitBand[];
  /** Unit → its band. */
  bandOf: ReadonlyMap<string, number>;
  /** Total height of the stacked bands. */
  height: number;
}

/** How tall each of `n` unit bands is, and the gap between them. The gap never falls under a mark's
 *  clear space, so a mark at the bottom of one band cannot collide with one at the top of the next
 *  however many units a world brings — and a band is tall enough to SEAT the marks that land in it
 *  (`crowd` is the fullest band's count). Without that second floor `fanMarks` runs out of band,
 *  spreadLabels shares the space out evenly instead, and the marks compress straight back into each
 *  other's hit boxes — the collision the reservation exists to prevent. MAX_PLOT_H still caps it:
 *  past that the chart is buying room with the whole composition's fit scale. */
function bandMetrics(n: number, crowd: number): { h: number; gap: number } {
  const seats = Math.max(MIN_BAND_H, (crowd - 1) * MARK_GAP + MARK);
  const wanted = n * seats + (n - 1) * BAND_GAP;
  const total = Math.min(MAX_PLOT_H, Math.max(PLOT_H, wanted));
  const gap = Math.max(MARK_GAP, Math.min(BAND_GAP, total / (4 * n)));
  return { h: (total - (n - 1) * gap) / n, gap };
}

/** A nice value domain and the gridlines that go with it, both off ONE step. `niceDomain` and
 *  `LinearScale.ticks` each pick their own, which is how a domain bound ends up between two ticks
 *  and the top of a series' range loses its gridline. */
function valueAxis(
  lo: number,
  hi: number,
  target: number,
): { domain: [number, number]; ticks: number[] } {
  // A flat series has no range to round out — open a window around it instead of dividing by zero.
  const [lo0, hi0] = lo === hi ? niceDomain(lo, hi, target) : [lo, hi];
  const step = niceStep(hi0 - lo0, target);
  const domain: [number, number] = [Math.floor(lo0 / step) * step, Math.ceil(hi0 / step) * step];
  // Nudge the floor: `ticks` rounds its first tick UP, and a bound one ulp above its own multiple
  // would drop the very gridline the domain was rounded out to produce.
  return { domain, ticks: tickValues(domain[0] - step * 1e-9, domain[1], step) };
}

/** One x domain and one band stack over every series in the given worlds — takes a list so a
 *  worlds, so actual and hypothetical plot on identical scales. */
function plotSpec(worlds: readonly WorldData[]): PlotSpec | null {
  let tLo = Infinity;
  let tHi = -Infinity;
  // Insertion-ordered: the bands stack in the order the world introduces its units.
  // `marks` is the most a SINGLE lane puts in the band, not the total: the fork's two lanes hold
  // the same nodes and are laid out one after the other, so summing them would reserve twice the
  // room either of them can use.
  const byUnit = new Map<string, { lo: number; hi: number; marks: number }>();
  for (const world of worlds) {
    const here = new Map<string, number>();
    for (const node of world.nodes) {
      const s = seriesOf(node);
      if (!s) continue;
      const unit = node.unit ?? '';
      let range = byUnit.get(unit);
      if (!range) byUnit.set(unit, (range = { lo: Infinity, hi: -Infinity, marks: 0 }));
      here.set(unit, (here.get(unit) ?? 0) + 1);
      for (const p of s.points) {
        tLo = Math.min(tLo, p.t);
        tHi = Math.max(tHi, p.t);
        range.lo = Math.min(range.lo, p.v);
        range.hi = Math.max(range.hi, p.v);
      }
    }
    for (const [unit, count] of here) {
      const range = byUnit.get(unit)!;
      range.marks = Math.max(range.marks, count);
    }
  }
  if (tLo === Infinity) return null;
  let crowd = 1;
  for (const range of byUnit.values()) crowd = Math.max(crowd, range.marks);
  const { h, gap } = bandMetrics(byUnit.size, crowd);
  // Fewer gridlines in a short band: five rules crammed into 70px read as hatching, not an axis.
  const target = Math.max(2, Math.min(5, Math.round(h / 60)));
  const bands: UnitBand[] = [];
  const bandOf = new Map<string, number>();
  for (const [unit, range] of byUnit) {
    const { domain, ticks } = valueAxis(range.lo, range.hi, target);
    bandOf.set(unit, bands.length);
    bands.push({ unit, domain, ticks, top: bands.length * (h + gap), h });
  }
  const x = timeAxis(tLo, tHi);
  return {
    x: x.domain,
    xTicks: x.ticks,
    bands,
    bandOf,
    height: bands.length * h + (bands.length - 1) * gap,
  };
}

/** Where each mark actually sits. A mark IS the node's hit target — the only way into its
 *  provenance — so two marks on one pixel leave the lower node unreachable however honestly the
 *  pair is drawn. Marks that already clear each other stay exactly on their datum; the rest are
 *  fanned apart inside their own band (never across it: y is a value here, and a mark in the wrong
 *  band would be read off the wrong scale) and each moved mark keeps a leader back to its point.
 *
 *  Marks are grouped by x proximity first. Sorting by x and breaking wherever the gap reaches
 *  MARK_GAP is exactly the transitive closure of "close in x", so two marks in different groups are
 *  already a clear space apart horizontally and cannot collide whatever the spread does to their y. */
function fanMarks(
  marks: ReadonlyArray<{ id: string; band: number; x: number; y: number }>,
  bandRange: (band: number) => { top: number; bottom: number },
): Map<string, number> {
  const settled = new Map<string, number>();
  const byBand = new Map<number, Array<{ id: string; x: number; y: number }>>();
  for (const m of marks) {
    const list = byBand.get(m.band);
    if (list) list.push(m);
    else byBand.set(m.band, [m]);
  }
  for (const [band, list] of byBand) {
    const { top, bottom } = bandRange(band);
    list.sort((a, b) => a.x - b.x || a.y - b.y || a.id.localeCompare(b.id));
    let group: typeof list = [];
    const settle = (): void => {
      if (group.length === 0) return;
      for (const [id, y] of spreadLabels(group, { gap: MARK_GAP, top, bottom })) settled.set(id, y);
      group = [];
    };
    for (const m of list) {
      if (group.length > 0 && m.x - group[group.length - 1].x >= MARK_GAP) settle();
      group.push(m);
    }
    settle();
  }
  return settled;
}

function place(
  world: WorldData,
  plot: PlotSpec | null,
  viewport: { w: number; h: number },
): Omit<MorphLayout, 'rep'> {
  const series: SeriesNode[] = [];
  const shelved: MorphNodeDatum[] = [];
  for (const node of world.nodes) {
    const s = seriesOf(node);
    if (s && plot) series.push(s);
    else shelved.push(node);
  }

  const positions = new Map<string, PlacedNode>();
  const chrome: ChromeSpec = { bands: [], paths: [], labels: [] };
  const topY = PAD;
  let minX = Infinity;
  let maxX = -Infinity;
  let maxY = topY;

  if (series.length > 0 && plot) {
    const x = scaleLinear(plot.x, [PAD, PAD + PLOT_W]);
    const bandY = plot.bands.map((b) => scaleLinear(b.domain, [topY + b.top + b.h, topY + b.top]));
    // plotSpec saw every world this lane can hold, so the lookup is total; the fallback keeps the
    // type honest without a cast.
    const bandOf = (node: MorphNodeDatum): number => plot.bandOf.get(node.unit ?? '') ?? 0;

    plot.bands.forEach((band, bi) => {
      const y = bandY[bi];
      for (const gv of band.ticks) {
        // The gridline id names its BAND as well as its value: with a scale per unit there is no
        // single value→pixel map for the chart, and an id that implied one would be a lie (two
        // bands can carry the same number at different heights).
        chrome.paths.push({
          id: `grid:${bi}:${gv}`,
          d: `M ${px(PAD)} ${px(y(gv))} L ${px(PAD + PLOT_W)} ${px(y(gv))}`,
          className: 'morph-gridline',
        });
        chrome.labels.push({
          id: `ytick:${bi}:${gv}`,
          x: PAD - 10,
          y: y(gv) + 4,
          text: String(gv),
          className: 'morph-axis-label',
          anchor: 'end',
        });
        minX = Math.min(minX, PAD - 10 - String(gv).length * GLYPH_W);
      }
      // With one unit the y labels ARE the unit; with several, each band has to say which scale it
      // is drawn on or the stack reads as one plot chopped into strips.
      if (plot.bands.length > 1) {
        chrome.labels.push({
          id: `unit:${bi}`,
          x: PAD,
          y: topY + band.top - 11,
          text: band.unit === '' ? 'no unit' : band.unit,
          className: 'morph-axis-label',
          anchor: 'start',
        });
      }
    });

    plot.xTicks.forEach((tick, i) => {
      const tx = x(tick.year);
      chrome.labels.push({
        id: `xtick:${i}`,
        x: tx,
        y: topY + plot.height + 22,
        text: tick.text,
        className: 'morph-axis-label',
        anchor: 'middle',
      });
      const half = (tick.text.length * GLYPH_W) / 2;
      minX = Math.min(minX, tx - half);
      maxX = Math.max(maxX, tx + half);
    });
    minX = Math.min(minX, PAD);
    maxX = Math.max(maxX, PAD + PLOT_W);
    maxY = Math.max(maxY, topY + plot.height + 28);

    const ordered = [...series].sort((a, b) => a.node.id.localeCompare(b.node.id));
    const anchors = ordered.map((s) => {
      const band = bandOf(s.node);
      const last = s.points[s.points.length - 1];
      return { id: s.node.id, band, x: x(last.t), y: bandY[band](last.v) };
    });
    const markY = fanMarks(anchors, (band) => ({
      top: topY + plot.bands[band].top,
      bottom: topY + plot.bands[band].top + plot.bands[band].h,
    }));
    // End labels sit at each mark, spread apart inside the band when the lines converge there.
    const labelY = new Map<string, number>();
    // Bucket once, in anchor order, instead of re-scanning every anchor per band: the sweep is
    // bands × series otherwise, and `spreadLabels` depends on the order it is handed, so building
    // the buckets in one forward pass preserves the result exactly.
    const byBand = new Map<number, typeof anchors>();
    for (const a of anchors) {
      const bucket = byBand.get(a.band);
      if (bucket) bucket.push(a);
      else byBand.set(a.band, [a]);
    }
    plot.bands.forEach((band, bi) => {
      const inBand = byBand.get(bi);
      if (inBand === undefined || inBand.length === 0) return;
      const spread = spreadLabels(
        inBand.map((a) => ({ id: a.id, y: markY.get(a.id) ?? a.y })),
        { gap: LABEL_GAP, top: topY + band.top + 6, bottom: topY + band.top + band.h - 6 },
      );
      for (const [id, y] of spread) labelY.set(id, y);
    });

    ordered.forEach((s, i) => {
      const { x: lx, y: ly } = anchors[i];
      const y = bandY[anchors[i].band];
      const d = s.points
        .map((p, at) => `${at === 0 ? 'M' : 'L'} ${px(x(p.t))} ${px(y(p.v))}`)
        .join(' ');
      const id = s.node.id;
      chrome.paths.push({
        id: `series:${id}`,
        d,
        className: 'morph-series',
        draw: true,
      });
      const my = markY.get(s.node.id) ?? ly;
      // A fanned mark is off its datum by design, so it carries a leader back to the point it
      // belongs to — the reader can still see exactly where the line ends.
      if (Math.abs(my - ly) > 0.01) {
        chrome.paths.push({
          id: `leader:${s.node.id}`,
          d: `M ${px(lx)} ${px(ly)} L ${px(lx)} ${px(my)}`,
          className: 'morph-tick',
        });
      }
      positions.set(id, {
        x: lx - MARK / 2,
        y: my - MARK / 2,
        w: MARK,
        h: MARK,
        face: 'mark',
      });
      const textX = lx + MARK / 2 + 8;
      chrome.labels.push({
        id: `label:${s.node.id}`,
        x: textX,
        y: (labelY.get(s.node.id) ?? my) + 4,
        text: s.node.label,
        className: 'morph-series-label',
        anchor: 'start',
      });
      maxX = Math.max(maxX, textX + s.node.label.length * GLYPH_W);
    });
  }

  const plotBbox: Bbox =
    minX === Infinity
      ? { x: 0, y: 0, w: PAD * 2, h: PAD * 2 }
      : { x: minX - PAD, y: 0, w: maxX - minX + PAD * 2, h: maxY + PAD };
  // The count carries the honesty: "held aside" alone leaves the reader unable to tell whether one
  // node was withheld from the chart or forty (the timeline band says the same thing its way).
  const shelf = placeShelf(
    shelved,
    plotBbox,
    `${shelved.length} with nothing measured over time — the chart cannot plot these`,
    viewport,
  );
  if (shelf.band) chrome.bands.push(shelf.band);
  for (const [id, placed] of shelf.positions) positions.set(id, placed);
  return { positions, edgePaths: [], chrome, bbox: shelf.bbox };
}

export const layoutChart: LayoutFn = (world, opts) => ({
  rep: 'chart',
  ...place(world, plotSpec([world]), opts?.viewport ?? DEFAULT_VIEWPORT),
});
