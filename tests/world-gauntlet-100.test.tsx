// world-gauntlet-100.test.tsx — the same adversarial sweep as world-gauntlet.test.tsx, run over the
// WHOLE corpus (the sixteen shipped worlds plus the four authored batches: natural science, society
// and economy, technology and history, and the structural edge cases) rather than the shipped
// sixteen alone.
//
// It is a separate file on purpose. world-gauntlet.test.tsx is the SHIPPED contract — it must stay
// green, and scoping it to the worlds the product actually ships keeps a failure there meaningful.
// This file is the DEFECT INSTRUMENT: it sweeps a hundred worlds looking for the places the layouts,
// the axes and the honesty spine stop holding, and a failure here is a defect report, not a
// regression. Every assertion is an invariant — never a geometry number — and every sweep fails
// ONCE with the complete list of violating (scenario, representation) pairs.
//
// Three invariants here are new, and they exist because a wider corpus made them reachable:
//   • axis sanity — a tick may not sit outside the data's own domain (a single-date world currently
//     draws a five-century axis), and an axis over data that spans months may not collapse to one
//     label.
//   • chart sanity — two series in incommensurable units may not share one linear y such that the
//     smaller flattens onto the axis, and two marks may not co-locate inside the legibility floor.
//   • the honesty invariant, restated at BOTH levels — engine and DOM — over every node, not only
//     the roots, because an illustrative world reads as fully grounded to the engine.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { fitScale } from '../src/canvas/spatial/camera';
import { worldToMorph } from '../src/canvas/spatial/morph/adapters';
import { layoutChart } from '../src/canvas/spatial/morph/layouts/chartLayout';
import { layoutGraph } from '../src/canvas/spatial/morph/layouts/graphLayout';
import { ENTRY_W, yearOf } from '../src/canvas/spatial/morph/layouts/lanes';
import { layoutTimeline } from '../src/canvas/spatial/morph/layouts/timelineLayout';
import type {
  LayoutFn,
  MorphLayout,
  PlacedNode,
  Representation,
  WorldData,
} from '../src/canvas/spatial/morph/types';
import { asWhyDag } from '../src/live/world/asWhyDag';
import {
  ALL_WORLD_SCENARIOS,
  duplicateScenarioIds,
  worldCorpus,
  type WorldScenario,
} from '../src/live/world/scenarios/index';
import type { WorldNode, WorldSpec } from '../src/live/world/types';
import { coerceWorldSpec } from '../src/live/world/validate';
import { WorldOverlay } from '../src/live/world/WorldOverlay';
import { cascade, isFullyGrounded } from '../src/live/why/engine';

/* ── the frame the surface actually renders into (world-gauntlet's own constants) ─────────── */

const VIEWPORT = { w: 1200, h: 760 };
const FIT_MARGIN = 56;
const LAYOUT_HINT = { w: VIEWPORT.w - FIT_MARGIN * 2, h: VIEWPORT.h - FIT_MARGIN * 2 };
const CAMERA_FLOOR = 0.25;
const LEGIBLE_SCALE = 1 / 1.4;

/** The codebase's own rendered-text legibility floor (CLAUDE.md, scripts/ui-audit.mts): nothing a
 *  reader must hit or read may be smaller — or closer to its neighbour — than this. */
const LEGIBILITY_PX = 9;

/* ── the coercer's documented caps (world/validate.ts) ───────────────────── */

const NODE_CAP = 16;
const CHILD_CAP = 4;
const EDGE_CAP = 48;
const SERIES_POINT_CAP = 40;
const ID_MAX = 40;
const LABEL_MAX = 120;

/** The chart carries one scale per unit, so what a series has to make itself visible inside is its
 *  own unit's BAND, not the whole plot — the band stack is read back off the emitted gridlines
 *  (`plotBands`) rather than assumed here. */

const LAYOUTS: ReadonlyArray<readonly [Representation, LayoutFn]> = [
  ['graph', layoutGraph],
  ['timeline', layoutTimeline],
  ['chart', layoutChart],
];

/* ── sweep helpers ───────────────────────────────────────────────────────── */

interface Pass {
  scenario: WorldScenario;
  rep: Representation;
  mode: 'folded' | 'expanded';
  world: WorldData;
  layout: MorphLayout;
}

const parentsOf = (world: WorldData): Set<string> =>
  new Set(world.nodes.map((n) => n.parentId).filter((id): id is string => id !== undefined));

/** Every (scenario × representation × fold state) layout the corpus produces, computed once. */
function sweep(
  scenarios: readonly WorldScenario[],
  specOf: (s: WorldScenario) => WorldSpec | null,
) {
  const passes: Pass[] = [];
  for (const scenario of scenarios) {
    const spec = specOf(scenario);
    if (!spec) continue;
    const world = worldToMorph(spec);
    const parents = parentsOf(world);
    const modes: Array<Pass['mode']> = parents.size > 0 ? ['folded', 'expanded'] : ['folded'];
    for (const mode of modes) {
      for (const [rep, fn] of LAYOUTS) {
        passes.push({
          scenario,
          rep,
          mode,
          world,
          layout: fn(world, {
            viewport: LAYOUT_HINT,
            ...(mode === 'expanded' ? { expandedIds: parents } : {}),
          }),
        });
      }
    }
  }
  return passes;
}

/** A scenario as the model would have proposed it: plain JSON, no shared references. */
const asRaw = (spec: WorldSpec): unknown => JSON.parse(JSON.stringify(spec)) as unknown;

const PASSES: readonly Pass[] = sweep(ALL_WORLD_SCENARIOS, (s) => s.spec);

/** The world the PRODUCT would actually lay out: the spec after it has been through the same gate a
 *  live turn goes through. A 28-node fixture is a 16-node world by the time it reaches a screen, so
 *  this is the only sweep whose fit numbers describe something a reader could ever see. */
const COERCED: ReadonlyArray<{ scenario: WorldScenario; spec: WorldSpec }> =
  ALL_WORLD_SCENARIOS.map((scenario) => ({
    scenario,
    spec: coerceWorldSpec(asRaw(scenario.spec), worldCorpus(scenario.spec)),
  })).filter((x): x is { scenario: WorldScenario; spec: WorldSpec } => x.spec !== null);

const COERCED_PASSES: readonly Pass[] = sweep(
  COERCED.map((c) => c.scenario),
  (s) => COERCED.find((c) => c.scenario.id === s.id)?.spec ?? null,
);

const where = (p: Pass): string =>
  `${p.scenario.id}/${p.rep}${p.mode === 'expanded' ? '+open' : ''}`;

/** Assert a swept invariant: fail once, with every violation the sweep found. */
function expectNoViolations(violations: readonly string[]): void {
  expect(violations, `${violations.length} violation(s):\n  ${violations.join('\n  ')}`).toEqual(
    [],
  );
}

const overlap = (a: PlacedNode, b: PlacedNode): boolean =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

function foldedOntoParent(p: Pass): Set<string> {
  const folded = new Set<string>();
  for (const n of p.world.nodes) {
    if (n.parentId === undefined) continue;
    const self = p.layout.positions.get(n.id);
    const parent = p.layout.positions.get(n.parentId);
    if (self && parent && self.x === parent.x && self.y === parent.y) folded.add(n.id);
  }
  return folded;
}

const NON_FINITE = /NaN|Infinity/;
const BAD_TEXT = /NaN|undefined|\[object Object\]/;

function allNodes(spec: WorldSpec): WorldNode[] {
  const out: WorldNode[] = [];
  const visit = (n: WorldNode): void => {
    out.push(n);
    for (const c of n.children ?? []) visit(c);
  };
  for (const n of spec.nodes) visit(n);
  return out;
}

afterEach(cleanup);

/* ── the corpus itself ───────────────────────────────────────────────────── */

describe('The whole corpus — a hundred worlds, uniquely named', () => {
  it('aggregates every batch with no id collision', () => {
    expect(duplicateScenarioIds(), 'two batches claim the same scenario id').toEqual([]);
    expect(ALL_WORLD_SCENARIOS.length).toBeGreaterThanOrEqual(100);
    const ids = ALL_WORLD_SCENARIOS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    const bad: string[] = [];
    for (const s of ALL_WORLD_SCENARIOS) {
      if (!s.label.trim()) bad.push(`${s.id}: no label`);
      if (!s.note.trim()) bad.push(`${s.id}: no note`);
      if (!s.spec.title.trim()) bad.push(`${s.id}: no title`);
    }
    expectNoViolations(bad);
  });

  it('is structurally valid — every spec is a web the product could actually hold', () => {
    const bad: string[] = [];
    for (const { id, spec } of ALL_WORLD_SCENARIOS) {
      const topIds = new Set(spec.nodes.map((n) => n.id));
      if (topIds.size !== spec.nodes.length) bad.push(`${id}: duplicate top-level id`);
      if (!topIds.has(spec.outcomeId)) bad.push(`${id}: outcomeId ${spec.outcomeId} not a node`);
      if (!spec.title || spec.title.length > 140) bad.push(`${id}: title out of bounds`);
      for (const n of allNodes(spec)) {
        if (n.id.length > ID_MAX) bad.push(`${id}: id too long — ${n.id}`);
        if (n.label.length > LABEL_MAX) bad.push(`${id}: label over ${LABEL_MAX} — ${n.id}`);
        if (n.tier === 'T0' && n.value !== undefined)
          bad.push(`${id}: T0 node carries a value — ${n.id}`);
        for (const c of n.children ?? []) {
          if (!c.id.startsWith(`${n.id}.`)) bad.push(`${id}: child not namespaced — ${c.id}`);
          if ((c.children?.length ?? 0) > 0) bad.push(`${id}: grandchild under ${c.id}`);
        }
        if ((n.children?.length ?? 0) > CHILD_CAP)
          bad.push(`${id}: over ${CHILD_CAP} children — ${n.id}`);
      }
      for (const e of spec.edges) {
        if (e.from === e.to) bad.push(`${id}: self-loop on ${e.from}`);
        if (!topIds.has(e.from) || !topIds.has(e.to))
          bad.push(`${id}: edge off the top level ${e.from}→${e.to}`);
        if (e.receipts && e.receipts[0] !== e.receipt)
          bad.push(`${id}: receipts[0] is not receipt — ${e.from}→${e.to}`);
      }
      if (asWhyDag(spec).nodes.length > 0 && cascade(asWhyDag(spec)).byNode.size === 0) {
        bad.push(`${id}: cascade produced nothing`);
      }
    }
    expectNoViolations(bad);
  });
});

/* ── layout: nothing is lost ─────────────────────────────────────────────── */

describe('Gauntlet-100 — every layout places or shelves every node', () => {
  it('never loses or invents a node in any representation', () => {
    const bad: string[] = [];
    for (const p of PASSES) {
      for (const n of p.world.nodes) {
        if (!p.layout.positions.has(n.id)) bad.push(`${where(p)}: ${n.id} absent from the layout`);
      }
      for (const id of p.layout.positions.keys()) {
        if (!p.world.nodes.some((n) => n.id === id)) bad.push(`${where(p)}: ${id} invented`);
      }
    }
    expectNoViolations(bad);
  });

  it('gives every shelved node a labeled band that states how many were held aside', () => {
    const bad: string[] = [];
    for (const p of PASSES) {
      const shelved = [...p.layout.positions.values()].filter((n) => n.shelved);
      const band = p.layout.chrome.bands.find((b) => b.className.includes('shelf'));
      if (shelved.length === 0) {
        if (band) bad.push(`${where(p)}: shelf band with nothing on it`);
        continue;
      }
      if (!band) {
        bad.push(`${where(p)}: ${shelved.length} shelved with no band`);
        continue;
      }
      if (!band.label) {
        bad.push(`${where(p)}: shelf band carries no label`);
        continue;
      }
      const columns = new Set(
        [...p.layout.positions.values()].filter((n) => n.shelved).map((n) => Math.round(n.x)),
      ).size;
      if (shelved.length >= 2 && LAYOUT_HINT.w >= ENTRY_W * 2 && columns < 2) {
        bad.push(
          `${where(p)}: ${shelved.length} shelved entries in one column — band ${Math.round(band.w)}px wide inside a ${LAYOUT_HINT.w}px fit box`,
        );
      }
      if (!band.label.includes(String(shelved.length))) {
        bad.push(
          `${where(p)}: shelf label ${JSON.stringify(band.label)} does not state its count (${shelved.length})`,
        );
      }
    }
    expectNoViolations(bad);
  });
});

/* ── layout: nothing collides, nothing escapes, nothing is NaN ───────────── */

describe('Gauntlet-100 — geometry', () => {
  it('never overlaps two node footprints in the same lane', () => {
    const bad: string[] = [];
    for (const p of PASSES) {
      const folded = foldedOntoParent(p);
      for (const id of folded) {
        const self = p.layout.positions.get(id)!;
        const parent = p.layout.positions.get(p.world.nodes.find((n) => n.id === id)!.parentId!)!;
        if (self.w !== parent.w || self.h !== parent.h) {
          bad.push(`${where(p)}: ${id} is folded onto its parent but a different size`);
        }
      }
      const placed = [...p.layout.positions.entries()].filter(
        ([id, n]) => n.face !== 'mark' && !folded.has(id),
      );
      for (let i = 0; i < placed.length; i++) {
        for (let j = i + 1; j < placed.length; j++) {
          const [aId, a] = placed[i];
          const [bId, b] = placed[j];
          if (overlap(a, b)) bad.push(`${where(p)}: ${aId} overlaps ${bId}`);
        }
      }
    }
    expectNoViolations(bad);
  });

  it('keeps every series label apart on the chart, however the lines converge', () => {
    const bad: string[] = [];
    for (const p of PASSES) {
      if (p.rep !== 'chart') continue;
      const labels = p.layout.chrome.labels
        .filter((l) => l.className.includes('series-label'))
        .map((l) => l.y)
        .sort((a, b) => a - b);
      for (let i = 1; i < labels.length; i++) {
        if (labels[i] - labels[i - 1] <= 0) {
          bad.push(`${where(p)}: two series labels share y=${labels[i]}`);
        }
      }
    }
    expectNoViolations(bad);
  });

  it('contains every footprint inside a finite, positive bbox', () => {
    const bad: string[] = [];
    for (const p of PASSES) {
      const { bbox } = p.layout;
      if (![bbox.x, bbox.y, bbox.w, bbox.h].every(Number.isFinite)) {
        bad.push(`${where(p)}: bbox is not finite`);
        continue;
      }
      if (bbox.w <= 0 || bbox.h <= 0) bad.push(`${where(p)}: bbox is ${bbox.w}×${bbox.h}`);
      for (const [id, n] of p.layout.positions) {
        const out =
          n.x < bbox.x - 0.5 ||
          n.y < bbox.y - 0.5 ||
          n.x + n.w > bbox.x + bbox.w + 0.5 ||
          n.y + n.h > bbox.y + bbox.h + 0.5;
        if (out) bad.push(`${where(p)}: ${id} at (${n.x},${n.y}) is outside the bbox`);
      }
    }
    expectNoViolations(bad);
  });

  it('emits no NaN or Infinity in any coordinate, path or chrome label', () => {
    const bad: string[] = [];
    for (const p of PASSES) {
      for (const [id, n] of p.layout.positions) {
        if (![n.x, n.y, n.w, n.h].every(Number.isFinite)) bad.push(`${where(p)}: ${id} position`);
      }
      for (const e of p.layout.edgePaths) {
        if (NON_FINITE.test(e.d)) bad.push(`${where(p)}: edge path ${e.id}`);
        if (e.width !== undefined && !Number.isFinite(e.width))
          bad.push(`${where(p)}: edge width ${e.id}`);
      }
      for (const path of p.layout.chrome.paths) {
        if (NON_FINITE.test(path.d)) bad.push(`${where(p)}: chrome path ${path.id}`);
      }
      for (const band of p.layout.chrome.bands) {
        if (![band.x, band.y, band.w, band.h].every(Number.isFinite))
          bad.push(`${where(p)}: band ${band.id}`);
        if (band.label !== undefined && BAD_TEXT.test(band.label)) {
          bad.push(`${where(p)}: band label ${band.id} = ${JSON.stringify(band.label)}`);
        }
      }
      for (const label of p.layout.chrome.labels) {
        if (!Number.isFinite(label.x) || !Number.isFinite(label.y))
          bad.push(`${where(p)}: label ${label.id} position`);
        if (BAD_TEXT.test(label.text)) {
          bad.push(`${where(p)}: label ${label.id} = ${JSON.stringify(label.text)}`);
        }
      }
    }
    expectNoViolations(bad);
  });
});

/* ── layout: the composition can actually be shown ───────────────────────── */

describe('Gauntlet-100 — the composition fits a landscape viewport', () => {
  it('never produces a composition the camera cannot show whole', () => {
    const bad: string[] = [];
    for (const p of PASSES) {
      const scale = fitScale(p.layout.bbox, VIEWPORT, FIT_MARGIN);
      if (scale < CAMERA_FLOOR) {
        bad.push(
          `${where(p)}: needs ${scale.toFixed(3)}× to fit (floor ${CAMERA_FLOOR}) — bbox ${Math.round(p.layout.bbox.w)}×${Math.round(p.layout.bbox.h)}`,
        );
      }
    }
    expectNoViolations(bad);
  });

  it('never produces a ribbon in a world the coercer would admit', () => {
    // Scoped exactly as the shipped suite scopes it: past NODE_CAP top-level cards no arrangement of
    // a 200×64 card clears the floor in a laptop box, and the honest answer there is pan-and-zoom.
    const bad: string[] = [];
    for (const p of PASSES.filter((pass) => pass.scenario.spec.nodes.length <= NODE_CAP)) {
      const scale = fitScale(p.layout.bbox, VIEWPORT, FIT_MARGIN);
      if (scale < LEGIBLE_SCALE) {
        const { bbox } = p.layout;
        bad.push(
          `${where(p)}: fits at ${scale.toFixed(3)}× (floor ${LEGIBLE_SCALE.toFixed(3)}) — bbox ${Math.round(bbox.w)}×${Math.round(bbox.h)}, aspect ${(bbox.w / bbox.h).toFixed(2)}`,
        );
      }
    }
    expectNoViolations(bad);
  });

  it('never produces a ribbon out of the world the COERCER actually hands the surface', () => {
    // The stronger reading of the same invariant, and the one a reader experiences: an over-cap
    // fixture is truncated to NODE_CAP before it is ever laid out, so its coerced form is inside the
    // scope above by construction — there is no "too big to judge" world left here.
    const bad: string[] = [];
    for (const p of COERCED_PASSES) {
      const scale = fitScale(p.layout.bbox, VIEWPORT, FIT_MARGIN);
      if (scale < LEGIBLE_SCALE) {
        const { bbox } = p.layout;
        bad.push(
          `${where(p)}: coerced world fits at ${scale.toFixed(3)}× (floor ${LEGIBLE_SCALE.toFixed(3)}) — ${p.world.nodes.length} nodes, bbox ${Math.round(bbox.w)}×${Math.round(bbox.h)}`,
        );
      }
    }
    expectNoViolations(bad);
  });
});

/* ── axis sanity ─────────────────────────────────────────────────────────── */

/** Every dated node's position on the year scale, exactly as timelineLayout reads it. */
function datedYears(world: WorldData): number[] {
  const years: number[] = [];
  for (const n of world.nodes) {
    if (!n.date || !Number.isFinite(n.date.start)) continue;
    years.push(yearOf(n.date.start));
    if (n.date.end !== undefined && Number.isFinite(n.date.end)) years.push(yearOf(n.date.end));
  }
  return years;
}

/** Every point on every parsed series, in fractional years — the chart's own x data. */
function seriesYears(world: WorldData): number[] {
  const years: number[] = [];
  for (const n of world.nodes) for (const p of n.series ?? []) years.push(yearOf(p.t));
  return years;
}

/** The time ticks a pass actually emitted, and the data they claim to describe. `graph` has no time
 *  axis at all, so it is out of scope here rather than a world with "no labels". */
function timeAxis(p: Pass): { data: number[]; ticks: Array<{ x: number; text: string }> } | null {
  if (p.rep === 'graph') return null;
  const data = p.rep === 'timeline' ? datedYears(p.world) : seriesYears(p.world);
  if (data.length === 0) return null;
  const prefix = p.rep === 'timeline' ? 'tick-label:' : 'xtick:';
  return { data, ticks: p.layout.chrome.labels.filter((l) => l.id.startsWith(prefix)) };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_MS = 86_400_000;

/** Date.UTC folds years 0–99 into the 1900s, and this corpus reaches back to year 120. */
function utcAt(year: number, month: number, day: number): number {
  const d = new Date(0);
  d.setUTCFullYear(year, month, day);
  d.setUTCHours(0, 0, 0, 0);
  return d.getTime();
}

/** Each tick label back to the instant it names, or null where it names none.
 *
 *  An axis is labelled at whatever grain its span has — "2024", "Mar 2024", "8 Mar 2024", or a bare
 *  "12:00" clock reading — so reading one back means reading it the way a reader does: a clock tick
 *  takes its day from the last tick that named one, which is unambiguous precisely because every
 *  midnight re-dates the axis. Parsing matters more than it looks: `Number(label)` is NaN for every
 *  grain below a year, so a numeric sweep over these ticks does not measure a calendar axis — it
 *  skips it, and passes by not looking. */
function tickInstants(ticks: ReadonlyArray<{ text: string }>): Array<number | null> {
  const at: Array<number | null> = ticks.map(() => null);
  const clocks: Array<{ i: number; ms: number }> = [];
  ticks.forEach((t, i) => {
    const s = t.text.trim();
    if (/^-?\d+$/.test(s)) {
      at[i] = utcAt(Number(s), 0, 1);
      return;
    }
    const cal = /^(?:(\d{1,2}) )?([A-Z][a-z]{2}) (-?\d+)$/.exec(s);
    if (cal) {
      const month = MONTHS.indexOf(cal[2]);
      if (month >= 0) at[i] = utcAt(Number(cal[3]), month, cal[1] ? Number(cal[1]) : 1);
      return;
    }
    const clock = /^(\d{2}):(\d{2})$/.exec(s);
    if (clock) clocks.push({ i, ms: Number(clock[1]) * 3_600_000 + Number(clock[2]) * 60_000 });
  });
  for (const c of clocks) {
    let midnight: number | null = null;
    for (let j = c.i - 1; j >= 0 && midnight === null; j--) {
      const v = at[j];
      if (v !== null) midnight = Math.floor(v / DAY_MS) * DAY_MS;
    }
    // An axis that opens mid-day has no dated tick to its left; the day it belongs to is the one
    // before the first tick that does name a date.
    for (let j = c.i + 1; j < at.length && midnight === null; j++) {
      const v = at[j];
      if (v !== null) midnight = Math.floor(v / DAY_MS) * DAY_MS - DAY_MS;
    }
    if (midnight !== null) at[c.i] = midnight + c.ms;
  }
  return at;
}

/** The ticks that name an instant, on the same fractional-year scale as the data. */
const tickYears = (ticks: ReadonlyArray<{ text: string }>): number[] =>
  tickInstants(ticks)
    .filter((v): v is number => v !== null)
    .map(yearOf);

describe('Gauntlet-100 — axis sanity', () => {
  it('never labels a time axis outside the data it describes', () => {
    // A nice axis rounds OUTWARD, so the honest tolerance is the data's own span again on each side
    // (plus a year, so a single-year world is not judged against a zero-width window). Anything past
    // that is not rounding — it is an axis describing a period nothing was measured in.
    const bad: string[] = [];
    let read = 0;
    let seen = 0;
    for (const p of PASSES) {
      const axis = timeAxis(p);
      if (!axis) continue;
      const { data, ticks } = axis;
      seen += ticks.length;
      read += tickInstants(ticks).filter((v) => v !== null).length;
      const lo = Math.min(...data);
      const hi = Math.max(...data);
      const slack = hi - lo + 1;
      const strays = tickYears(ticks).filter((v) => v < lo - slack || v > hi + slack);
      if (strays.length > 0) {
        bad.push(
          `${where(p)}: ${strays.length}/${ticks.length} ticks outside the data — data spans ${lo.toFixed(2)}–${hi.toFixed(2)}, ticks ${ticks.map((t) => t.text).join(',')}`,
        );
      }
    }
    expectNoViolations(bad);
    // This sweep and the last-tick one below can only judge a tick they can read, so an unreadable
    // label is a hole in BOTH, not a skipped case: add a grain the parser does not know and the
    // sweeps go quiet rather than red. Fail here instead, where the reason is legible.
    expect(seen, 'the corpus emits time axes for this sweep to measure').toBeGreaterThan(0);
    expect(read, `${seen - read} of ${seen} tick labels did not parse`).toBe(seen);
  });

  it('never collapses an axis to a single label when the data has more than one date', () => {
    const bad: string[] = [];
    for (const p of PASSES) {
      const axis = timeAxis(p);
      if (!axis) continue;
      const { data, ticks } = axis;
      const distinct = new Set(data.map((v) => v.toFixed(6))).size;
      if (distinct < 2) continue;
      const distinctLabels = new Set(ticks.map((t) => t.text)).size;
      if (distinctLabels < 2) {
        const lo = Math.min(...data);
        const hi = Math.max(...data);
        bad.push(
          `${where(p)}: ${distinct} distinct dates spanning ${((hi - lo) * 12).toFixed(1)} months collapsed to ${distinctLabels} axis label(s) — ${ticks.map((t) => JSON.stringify(t.text)).join(',') || 'none'}`,
        );
      }
    }
    expectNoViolations(bad);
  });

  it('gives the last observation in a series a tick to sit under', () => {
    // A reader reads the right-hand end of a line off the axis; if the last tick is a full step
    // short of it, the most recent figure is the one they cannot date.
    //
    // The slack is ONE DAY, not the whole year the labels used to be rounded to. The scale is a mean
    // Gregorian year (lanes.ts's `yearOf`) while the ticks are calendar instants, so the two
    // disagree by up to a day — "2000" lands 0.2 days before an observation timestamped in 2000 —
    // and that is representation, not a missing tick. Anything past a day is the axis genuinely
    // stopping short, which on an intraday axis a whole year of tolerance could never see.
    const DAY_IN_YEARS = 1 / 365.2425;
    const bad: string[] = [];
    for (const p of PASSES) {
      const axis = timeAxis(p);
      if (!axis) continue;
      const hi = Math.max(...axis.data);
      const ticks = tickYears(axis.ticks);
      if (ticks.length === 0) continue;
      const last = Math.max(...ticks);
      if (last < hi - DAY_IN_YEARS) {
        bad.push(
          `${where(p)}: last observation ${hi.toFixed(4)} sits ${((hi - last) * 365.2425).toFixed(1)} days past the last tick ${last.toFixed(4)} — ticks ${axis.ticks.map((t) => t.text).join(',')}`,
        );
      }
    }
    expectNoViolations(bad);
  });

  it('never shelves a whole world it had something to place', () => {
    // A node reaches the time axis by its own `date` or by a dated series. Two worlds in the corpus
    // are honestly atemporal — a catalytic cycle in steady state, and a span `parseWorldTime` has no
    // BC vocabulary for — and dating them would be inventing, so they shelve entirely BY DESIGN and
    // the surface withholds the "Over time" chip (pinned at the DOM in world-dates.test.tsx).
    // What must never happen is the surprise: a world that HAD placeable nodes shelving the lot.
    const bad: string[] = [];
    for (const p of PASSES) {
      if (p.rep !== 'timeline' || p.mode !== 'folded') continue;
      if (p.world.nodes.length < 2) continue;
      const shelved = [...p.layout.positions.values()].filter((n) => n.shelved).length;
      const placeable = p.world.nodes.filter((n) => n.date !== undefined).length;
      if (shelved === p.world.nodes.length && placeable > 0) {
        bad.push(`${where(p)}: all ${shelved} nodes shelved despite ${placeable} carrying a date`);
      }
    }
    expectNoViolations(bad);
  });
});

/* ── chart sanity ────────────────────────────────────────────────────────── */

/** The plot bands the layout actually emitted, each as the pixel range its own gridlines span.
 *
 *  There is deliberately no chart-wide value→pixel map here any more. A chart carries one scale PER
 *  UNIT, so a single map does not exist — two bands can put the same number at different heights —
 *  and the gridline ids say so (`grid:<band>:<value>`). Reconstructing one map anyway is how this
 *  sweep went blind: `Number('0:50')` is NaN, every row was dropped, and the flatness check below
 *  returned early for all 100 worlds. */
function plotBands(p: Pass): Array<{ band: number; top: number; bottom: number }> {
  const rows = new Map<number, number[]>();
  for (const path of p.layout.chrome.paths) {
    if (!path.className.includes('gridline')) continue;
    const id = /grid:(\d+):(-?[\d.eE+]+)$/.exec(path.id);
    const at = /^M \S+ (\S+) /.exec(path.d);
    if (!id || !at) continue;
    const y = Number(at[1]);
    if (!Number.isFinite(y)) continue;
    const band = Number(id[1]);
    rows.set(band, [...(rows.get(band) ?? []), y]);
  }
  return [...rows.entries()]
    .map(([band, ys]) => ({ band, top: Math.min(...ys), bottom: Math.max(...ys) }))
    .filter((b) => b.bottom > b.top);
}

/** The pixel extent a series actually draws, straight off its own emitted path — the drawn line
 *  rather than a second copy of chartLayout's arithmetic, and agnostic to which scale drew it. */
function drawnExtent(p: Pass, nodeId: string): { lo: number; hi: number } | null {
  const path = p.layout.chrome.paths.find((x) => x.id === `series:${nodeId}`);
  if (!path) return null;
  const ys = [...path.d.matchAll(/[ML] \S+ (-?[\d.]+)/g)].map((m) => Number(m[1]));
  if (ys.length === 0 || ys.some((y) => !Number.isFinite(y))) return null;
  return { lo: Math.min(...ys), hi: Math.max(...ys) };
}

describe('Gauntlet-100 — chart sanity', () => {
  it('never flattens a series onto the axis by sharing one linear scale across units', () => {
    // Stated against the per-unit plot stack, which is what forecloses the defect. The original
    // failure was two incommensurable series on ONE linear y, so the smaller flattened onto the
    // axis; the guarantee that ends it is a scale per unit, so that is what is measured — a band
    // may never hold two units, and a series must draw inside the band that scales it.
    //
    // A series that is small beside a sibling in its OWN unit stays a violation-free case on
    // purpose: 88–96 ML/d really is a flat line next to 340–620 ML/d, and that comparison is the
    // whole reason a unit shares a scale. What is checked instead is that the band is not mostly
    // empty air — its series must together fill a third of it — which is the honest form of "the
    // scale this series is drawn on describes this series".
    const MIN_BAND_FILL = 1 / 3;
    const bad: string[] = [];
    let measured = 0;
    for (const p of PASSES) {
      if (p.rep !== 'chart') continue;
      const bands = plotBands(p);
      if (bands.length === 0) continue;
      measured += bands.length;
      const held = new Map<number, { lo: number; hi: number; units: Set<string>; ids: string[] }>();
      for (const n of p.world.nodes) {
        const vs = (n.series ?? []).map((s) => s.v);
        if (vs.length === 0) continue;
        const drawn = drawnExtent(p, n.id);
        if (!drawn) continue;
        const mid = (drawn.lo + drawn.hi) / 2;
        const band = bands.reduce((best, b) =>
          Math.abs((b.top + b.bottom) / 2 - mid) < Math.abs((best.top + best.bottom) / 2 - mid)
            ? b
            : best,
        );
        if (drawn.lo < band.top - 1 || drawn.hi > band.bottom + 1) {
          bad.push(
            `${where(p)}: ${n.id} (${n.unit ?? 'no unit'}) draws ${drawn.lo.toFixed(1)}–${drawn.hi.toFixed(1)}px, outside the ${band.top.toFixed(1)}–${band.bottom.toFixed(1)}px band scaling it`,
          );
        }
        const cur = held.get(band.band) ?? {
          lo: Infinity,
          hi: -Infinity,
          units: new Set<string>(),
          ids: [],
        };
        // A genuinely constant series is honestly flat and cannot speak to how full its band is.
        if (Math.min(...vs) !== Math.max(...vs)) {
          cur.lo = Math.min(cur.lo, drawn.lo);
          cur.hi = Math.max(cur.hi, drawn.hi);
        }
        cur.units.add(n.unit ?? '');
        cur.ids.push(n.id);
        held.set(band.band, cur);
      }
      for (const band of bands) {
        const on = held.get(band.band);
        if (!on) continue;
        if (on.units.size > 1) {
          bad.push(
            `${where(p)}: band ${band.band} scales ${on.units.size} units at once (${[...on.units].map((u) => u || 'no unit').join(' / ')}) — ${on.ids.join(', ')}`,
          );
        }
        if (on.hi < on.lo) continue; // every series in the band is constant
        const fill = (on.hi - on.lo) / (band.bottom - band.top);
        if (fill < MIN_BAND_FILL) {
          bad.push(
            `${where(p)}: band ${band.band} (${[...on.units].map((u) => u || 'no unit').join('/')}) is ${(fill * 100).toFixed(0)}% filled by ${on.ids.join(', ')} — ${(on.hi - on.lo).toFixed(1)}px of ${(band.bottom - band.top).toFixed(1)}px, so its own data reads as a rule near the axis`,
          );
        }
      }
    }
    expectNoViolations(bad);
    // Same reason as the axis sweep: this one measures the gridlines the layout emitted, so a change
    // to how a gridline is identified can leave it reading zero bands and passing on every world.
    expect(measured, 'the corpus emits plot bands for this sweep to measure').toBeGreaterThan(0);
  });

  it('never co-locates two chart marks inside the legibility floor', () => {
    const bad: string[] = [];
    for (const p of PASSES) {
      if (p.rep !== 'chart') continue;
      // Painted marks only. A part the reader has not opened folds onto its cause — coincident by
      // design, because that is what it animates out of — and it paints nothing and takes no hit
      // target, so it cannot crowd anything.
      const marks = [...p.layout.positions.entries()].filter(
        ([, n]) => n.face === 'mark' && n.folded !== true,
      );
      for (let i = 0; i < marks.length; i++) {
        for (let j = i + 1; j < marks.length; j++) {
          const [aId, a] = marks[i];
          const [bId, b] = marks[j];
          const dx = a.x + a.w / 2 - (b.x + b.w / 2);
          const dy = a.y + a.h / 2 - (b.y + b.h / 2);
          const d = Math.hypot(dx, dy);
          if (d < LEGIBILITY_PX) {
            bad.push(
              `${where(p)}: marks ${aId} and ${bId} are ${d.toFixed(2)}px apart (floor ${LEGIBILITY_PX}) — the lower one has no reachable hit target`,
            );
          }
        }
      }
    }
    expectNoViolations(bad);
  });
});

/* ── the surface renders ─────────────────────────────────────────────────── */

describe('Gauntlet-100 — the surface renders every scenario', () => {
  function debrisIn(container: HTMLElement): string[] {
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    const found: string[] = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = (node.textContent ?? '').trim();
      if (text === 'undefined' || text === 'NaN' || text.includes('[object Object]')) {
        found.push(text);
      }
    }
    return found;
  }

  it('mounts every scenario in every view, and under a lever, without throwing or leaving debris', () => {
    const bad: string[] = [];
    for (const scenario of ALL_WORLD_SCENARIOS) {
      const { id, spec } = scenario;
      try {
        const { container, unmount } = render(<WorldOverlay spec={spec} />);
        // Sweep the chips this world actually renders. A hard-coded list named three views and so
        // never pressed Contribution once across a hundred worlds — and every view added later
        // would have inherited that hole. Reading the row keeps the sweep honest by construction.
        const chips = () =>
          Array.from(container.querySelectorAll<HTMLButtonElement>('.wo-views .wo-chip'));
        const offered = chips().map((c) => c.textContent ?? '');
        const sole = container.querySelector('.wo-chip-sole')?.textContent ?? null;
        // Every world has causal structure, so the causal web is always among the readings — a chip
        // where there is a choice, a plain label where it is the only one.
        if (offered.length === 0 && sole === null) bad.push(`${id}: no reading offered at all`);
        else if (offered.length > 0 && !offered.includes('Graph')) {
          bad.push(`${id}: Graph missing from [${offered.join(', ')}]`);
        } else if (offered.length === 0 && sole !== 'Graph') {
          bad.push(`${id}: sole reading is ${sole}, not Graph`);
        }
        for (let i = 0; i < offered.length; i += 1) {
          act(() => chips()[i].click());
          bad.push(...debrisIn(container).map((t) => `${id}/${offered[i]}: ${t}`));
        }
        if (offered.length > 1) act(() => chips()[0].click());
        const nodeCount = allNodes(spec).length;
        const painted = container.querySelectorAll('.mv-node').length;
        if (painted !== nodeCount) {
          bad.push(`${id}: ${painted} .mv-node in the DOM for ${nodeCount} spec nodes`);
        }
        const slider = screen.queryAllByRole('slider')[0];
        if (slider) {
          fireEvent.change(slider, { target: { value: '30' } });
          bad.push(...debrisIn(container).map((t) => `${id}/lever: ${t}`));
          // A what-if re-weights the world in place, so the DOM must not grow by a single node. It
          // used to fork a second lane and double; that lane is gone precisely because it was a
          // copy of this one.
          const levered = container.querySelectorAll('.mv-node').length;
          if (levered !== nodeCount) {
            bad.push(
              `${id}/lever: ${levered} .mv-node for a world of ${nodeCount} (expected same)`,
            );
          }
        }
        unmount();
      } catch (err) {
        bad.push(`${id}: threw — ${err instanceof Error ? err.message : String(err)}`);
        cleanup();
      }
    }
    expectNoViolations(bad);
  });
});

/* ── the honesty invariant ───────────────────────────────────────────────── */

describe('Gauntlet-100 — an ungrounded world can never answer exactly', () => {
  it('returns a well-formed cascade for every scenario', () => {
    const bad: string[] = [];
    for (const { id, spec } of ALL_WORLD_SCENARIOS) {
      const dag = asWhyDag(spec);
      const result = cascade(dag, []);
      if (result.byNode.size !== dag.nodes.length)
        bad.push(`${id}: byNode has ${result.byNode.size} of ${dag.nodes.length}`);
      if (result.relativeByNode.size !== dag.nodes.length)
        bad.push(`${id}: relativeByNode is short`);
      for (const [nodeId, v] of result.relativeByNode) {
        if (!Number.isFinite(v) || v < 0 || v > 1) bad.push(`${id}: relative ${nodeId} = ${v}`);
      }
      for (const [nodeId, v] of result.byNode) {
        if (v !== null && !Number.isFinite(v)) bad.push(`${id}: byNode ${nodeId} = ${v}`);
      }
      if (result.relativeOutcome !== null && !Number.isFinite(result.relativeOutcome)) {
        bad.push(`${id}: relativeOutcome = ${result.relativeOutcome}`);
      }
      if (result.fullyGrounded !== isFullyGrounded(dag))
        bad.push(`${id}: fullyGrounded disagrees with the gate`);
    }
    expectNoViolations(bad);
  });

  it('yields an exact outcome delta under intervention only where the whole path is grounded', () => {
    const bad: string[] = [];
    let groundedSeen = 0;
    for (const { id, spec } of ALL_WORLD_SCENARIOS) {
      const dag = asWhyDag(spec);
      const grounded = isFullyGrounded(dag);
      if (grounded) groundedSeen += 1;
      for (const root of spec.nodes.filter((n) => n.role === 'root')) {
        const { outcomeDelta, explainedPct } = cascade(dag, [{ nodeId: root.id, pct: 0 }]);
        if (!grounded && outcomeDelta !== null)
          bad.push(
            `${id}: ungrounded world produced an exact delta ${outcomeDelta} for ${root.id}`,
          );
        if (!grounded && explainedPct !== null)
          bad.push(`${id}: ungrounded world produced "% explained" for ${root.id}`);
        if (grounded && (outcomeDelta === null || !Number.isFinite(outcomeDelta)))
          bad.push(`${id}: grounded world refused an exact delta for ${root.id}`);
      }
    }
    expect(groundedSeen, 'no fully grounded scenario left in the corpus').toBeGreaterThan(0);
    expectNoViolations(bad);
  });

  it('THE HONESTY INVARIANT, engine-level: an illustrative world never yields an exact delta', () => {
    // The engine grounds on TIERS alone. A textbook world whose author wrote T2 receipts therefore
    // reads as fully grounded to `cascade`, and will hand back a number nothing measured — under any
    // intervention on any node, not only a root. `provenance.illustrative` is the world saying it
    // measured nothing, and it has to outrank the tiers. Today only the view honours it.
    const bad: string[] = [];
    for (const { id, spec } of ALL_WORLD_SCENARIOS) {
      if (spec.provenance.illustrative !== true) continue;
      const dag = asWhyDag(spec);
      for (const node of spec.nodes) {
        for (const pct of [0, 50, 200]) {
          const { outcomeDelta, explainedPct } = cascade(dag, [{ nodeId: node.id, pct }]);
          if (outcomeDelta !== null) {
            bad.push(
              `${id}: illustrative world answered "${node.id} at ${pct}%" with an exact delta of ${outcomeDelta}`,
            );
          }
          if (explainedPct !== null) {
            bad.push(`${id}: illustrative world produced "% explained" for ${node.id} at ${pct}%`);
          }
        }
      }
    }
    expectNoViolations(bad);
  });

  it('THE HONESTY INVARIANT, DOM-level: no ungrounded world ever renders an exact delta', () => {
    // The same rule where the reader meets it. Every world that is not fully grounded — and every
    // illustrative world, whatever its tiers claim — must refuse the exact ladder on screen, under
    // the strongest lever the rail offers.
    const bad: string[] = [];
    for (const { id, spec } of ALL_WORLD_SCENARIOS) {
      const illustrative = spec.provenance.illustrative === true;
      const grounded = isFullyGrounded(asWhyDag(spec));
      if (grounded && !illustrative) continue;
      const { container, unmount } = render(<WorldOverlay spec={spec} />);
      for (const slider of screen.queryAllByRole('slider')) {
        fireEvent.change(slider, { target: { value: '0' } });
        fireEvent.change(slider, { target: { value: '200' } });
      }
      if (container.querySelector('.tr-wi-delta')) {
        bad.push(
          `${id}: ${illustrative ? 'illustrative' : 'ungrounded'} world rendered an exact delta`,
        );
      }
      if (illustrative && !container.querySelector('.wo-banner-illustrative')) {
        bad.push(`${id}: illustrative world carries no banner`);
      }
      unmount();
    }
    expectNoViolations(bad);
  });
});

/* ── the coercer ─────────────────────────────────────────────────────────── */

describe('Gauntlet-100 — every scenario survives its own coercion', () => {
  it('keeps the nodes, children and edges the caps allow', () => {
    const bad: string[] = [];
    for (const { id, spec } of ALL_WORLD_SCENARIOS) {
      const coerced = coerceWorldSpec(asRaw(spec), worldCorpus(spec));
      if (spec.nodes.length < 2) {
        if (coerced !== null) bad.push(`${id}: a sub-two-node world was accepted`);
        continue;
      }
      if (!coerced) {
        bad.push(`${id}: refused outright`);
        continue;
      }
      const kept = spec.nodes.slice(0, NODE_CAP);
      if (coerced.nodes.length !== kept.length)
        bad.push(`${id}: ${coerced.nodes.length} nodes kept of ${kept.length} inside the cap`);
      for (const n of kept) {
        const out = coerced.nodes.find((c) => c.id === n.id);
        if (!out) {
          bad.push(`${id}: lost node ${n.id}`);
          continue;
        }
        if (out.tier !== n.tier) bad.push(`${id}: ${n.id} tier ${n.tier} → ${out.tier}`);
        if (n.value !== undefined && out.value === undefined)
          bad.push(`${id}: ${n.id} lost its value`);
        for (const c of n.children ?? []) {
          if (!out.children?.some((x) => x.id === c.id)) bad.push(`${id}: lost breakdown ${c.id}`);
        }
      }
      const keptIds = new Set(kept.map((n) => n.id));
      const survivable = spec.edges.filter((e) => keptIds.has(e.from) && keptIds.has(e.to));
      const expected = Math.min(survivable.length, EDGE_CAP);
      if (coerced.edges.length !== expected)
        bad.push(`${id}: ${coerced.edges.length} edges kept, ${expected} were survivable`);
      if (!coerced.outcomeId) bad.push(`${id}: coerced world lost its outcome`);
      if (coerced.title !== spec.title) bad.push(`${id}: title rewritten`);
    }
    expectNoViolations(bad);
  });

  it('keeps a series exactly when the gate says it may — and drops the points it cannot verify', () => {
    const bad: string[] = [];
    for (const { id, spec } of ALL_WORLD_SCENARIOS) {
      const coerced = coerceWorldSpec(asRaw(spec), worldCorpus(spec));
      if (!coerced) continue;
      for (const n of spec.nodes.slice(0, NODE_CAP)) {
        const series = n.series;
        if (!series) continue;
        const out = coerced.nodes.find((c) => c.id === n.id)?.series;
        const receiptedThroughout = series.points.every((p) => p.receipt !== undefined);
        const mayLive =
          series.tier === 'T3'
            ? spec.provenance.illustrative === true
            : series.tier !== 'T0' && receiptedThroughout;
        if (mayLive && !out) bad.push(`${id}: ${n.id} lost a series the gate allows`);
        if (!mayLive && out) bad.push(`${id}: ${n.id} kept a series the gate forbids`);
        if (mayLive && out) {
          const expected = Math.min(series.points.length, SERIES_POINT_CAP);
          if (out.points.length !== expected)
            bad.push(`${id}: ${n.id} kept ${out.points.length} of ${expected} points`);
        }
      }
    }
    expectNoViolations(bad);
  });

  it('carries every authored history through the gate that a live turn would carry it through', () => {
    // The gate's RULE is asserted above; this asserts the OUTCOME a reader experiences. A node that
    // was written with a history and comes out of the coercer without one has had its chart line
    // deleted on the way to the screen — which is a defect in the fixture or in the gate, never a
    // neutral fact, and the shipped seed is exactly where that has to be visible.
    const bad: string[] = [];
    for (const { id, spec } of ALL_WORLD_SCENARIOS) {
      const coerced = coerceWorldSpec(asRaw(spec), worldCorpus(spec));
      if (!coerced) continue;
      for (const n of spec.nodes.slice(0, NODE_CAP)) {
        if (!n.series || n.series.points.length === 0) continue;
        const out = coerced.nodes.find((c) => c.id === n.id);
        if (out && !out.series) {
          const receipted = n.series.points.filter((p) => p.receipt !== undefined).length;
          bad.push(
            `${id}: ${n.id} lost its ${n.series.points.length}-point ${n.series.tier} history (${receipted} points carried a receipt)`,
          );
        }
      }
    }
    expectNoViolations(bad);
  });

  it('demotes or drops a corrupted variant of every grounded world instead of trusting it', () => {
    // The shipped suite runs these mutations against one fixture. Run them against EVERY fully
    // grounded world in the corpus: a demotion path that only holds for `grounded-retention` is a
    // path tuned to one shape.
    const bad: string[] = [];
    const grounded = ALL_WORLD_SCENARIOS.filter((s) => isFullyGrounded(asWhyDag(s.spec)));
    expect(grounded.length, 'no fully grounded world to corrupt').toBeGreaterThan(0);
    for (const { id, spec } of grounded) {
      const corpus = worldCorpus(spec);
      const clone = (): WorldSpec => JSON.parse(JSON.stringify(spec)) as WorldSpec;
      const coerce = (s: WorldSpec): WorldSpec | null => coerceWorldSpec(s as unknown, corpus);

      const invented = clone();
      invented.nodes[0].receipt = { quote: 'A sentence that appears in no source anywhere.' };
      const afterInvented = coerce(invented);
      if (!afterInvented) bad.push(`${id}: refused the invented-quote variant outright`);
      else if (afterInvented.nodes[0].tier !== 'T0' || afterInvented.nodes[0].value !== undefined) {
        bad.push(
          `${id}: an invented quote left ${afterInvented.nodes[0].id} at ${afterInvented.nodes[0].tier} with value ${String(afterInvented.nodes[0].value)}`,
        );
      }

      const dangling = clone();
      if (dangling.edges.length > 0) {
        dangling.edges[0] = { ...dangling.edges[0], to: 'a-node-that-does-not-exist' };
        const after = coerce(dangling);
        if (after && after.edges.length !== spec.edges.length - 1) {
          bad.push(`${id}: a dangling edge left ${after.edges.length} edges, expected one fewer`);
        }
      }

      const weightless = clone();
      if (weightless.edges.length > 0) {
        delete weightless.edges[0].weight;
        const after = coerce(weightless);
        if (!after) bad.push(`${id}: refused the weightless-edge variant outright`);
        else if (isFullyGrounded(asWhyDag(after))) {
          bad.push(`${id}: a weightless link left the world claiming to be fully grounded`);
        }
      }

      const textbook = clone();
      textbook.nodes[0] = { ...textbook.nodes[0], tier: 'T3', value: 99 };
      const after = coerce(textbook);
      if (after && spec.provenance.illustrative !== true) {
        if (after.nodes[0].tier !== 'T0' || after.nodes[0].value !== undefined) {
          bad.push(
            `${id}: a T3 figure outside an illustrative world survived as ${after.nodes[0].tier} = ${String(after.nodes[0].value)}`,
          );
        }
      }
    }
    expectNoViolations(bad);
  });
});
