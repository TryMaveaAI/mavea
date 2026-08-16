// world-gauntlet.test.tsx — the adversarial sweep over the living answer.
//
// A canvas fixture is one sample, not a spec. The world surface ships with exactly one input
// (WORLD_SEED: 2008, twelve nodes, illustrative), and every layout constant, every shelf band and
// every honesty gate on it was tuned while looking at that one world. This file runs the whole
// scenario corpus — deep chains, flat webs, diamonds, a single node, a 61-node cascade, T0-only,
// fully-grounded, contested, unicode, nine orders of magnitude — through all three representations
// and asserts the properties that must hold for ANY of them.
//
// Everything here is an INVARIANT, never a geometry number: the layout constants are being tuned
// as this is written, and a suite that pins 300px column gutters would be re-written every time
// they move. What it pins instead is what a reader can check: nothing is lost, nothing collides,
// nothing lands outside the box, nothing renders as NaN, the composition can actually be SHOWN at
// a readable size, and an ungrounded world can never answer a what-if with an exact number.
//
// Each `it` sweeps the whole corpus and fails ONCE with the complete list of violations, rather
// than fanning out into a hundred cases. A failure here is meant to be read as a defect report.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { fitScale } from '../src/canvas/spatial/camera';
import { worldToMorph } from '../src/canvas/spatial/morph/adapters';
import { layoutChart } from '../src/canvas/spatial/morph/layouts/chartLayout';
import { layoutGraph } from '../src/canvas/spatial/morph/layouts/graphLayout';
import { ENTRY_W } from '../src/canvas/spatial/morph/layouts/lanes';
import { layoutTimeline } from '../src/canvas/spatial/morph/layouts/timelineLayout';
import type {
  LayoutFn,
  MorphLayout,
  PlacedNode,
  Representation,
  WorldData,
} from '../src/canvas/spatial/morph/types';
import { asWhyDag } from '../src/live/world/asWhyDag';
import { WORLD_SCENARIOS, worldCorpus, type WorldScenario } from '../src/live/world/scenarios';
import type { WorldNode, WorldSpec } from '../src/live/world/types';
import { coerceWorldSpec } from '../src/live/world/validate';
import { WorldOverlay } from '../src/live/world/WorldOverlay';
import { cascade, isFullyGrounded } from '../src/live/why/engine';

/* ── the frame the surface actually renders into ─────────────────────────── */

/** A laptop stage — the surface's own default (graphLayout's DEFAULT_VIEWPORT). */
const VIEWPORT = { w: 1200, h: 760 };
/** Breathing room the camera keeps on every fit (useMorphStage's MARGIN). */
const FIT_MARGIN = 56;
/** What useMorphStage hands a layout as its `viewport` hint: the box the bbox is fitted into. */
const LAYOUT_HINT = { w: VIEWPORT.w - FIT_MARGIN * 2, h: VIEWPORT.h - FIT_MARGIN * 2 };
/** The camera's zoom floor (useMorphStage's CLAMP.min). A composition needing less than this to
 *  fit CANNOT be shown whole — the camera stops zooming out and the rest is off-screen. */
const CAMERA_FLOOR = 0.25;
/** Below this camera scale the counter-scale — `clamp(1, 1/scale, 1.4)` in morph.css — can no
 *  longer hold a node at its authored size, so text starts shrinking with the world. graphLayout
 *  calls it LEGIBLE_SCALE and wraps its columns rather than cross it; it is the codebase's own
 *  declared floor, which is why this file uses it rather than inventing an aspect-ratio bound.
 *  (An aspect bound alone is the wrong metric: a six-entry shelf strip is 4.9:1 and perfectly
 *  readable, while a 1.3:1 sixty-node web is not.) */
const LEGIBLE_SCALE = 1 / 1.4;

/** A layout re-runs synchronously on every lever drag and every representation swap, so the
 *  largest world the corpus contains has to stay inside a couple of animation frames. Measured at
 *  1–7ms per representation on the machine this was written on; 120ms is ~7 frames and ~20×
 *  headroom for a loaded CI runner. This is a responsiveness floor, not a complexity check —
 *  morph-perf.test.ts is what catches a reintroduced quadratic, at a size where one shows. */
const SCALE_BUDGET_MS = 120;

/* ── the coercer's documented caps (world/validate.ts) ───────────────────── */

const NODE_CAP = 16;
const CHILD_CAP = 4;
const EDGE_CAP = 48;
const SERIES_POINT_CAP = 40;
const ID_MAX = 40;
const LABEL_MAX = 120;

const LAYOUTS: ReadonlyArray<readonly [Representation, LayoutFn]> = [
  ['graph', layoutGraph],
  ['timeline', layoutTimeline],
  ['chart', layoutChart],
];

/* ── sweep helpers ───────────────────────────────────────────────────────── */

/** One layout pass to check: a scenario, a representation, and whether breakdowns are unfolded.
 *  The expanded pass matters — it is the only path that runs the separation relaxation. */
interface Pass {
  scenario: WorldScenario;
  rep: Representation;
  /** 'folded' = the default view; 'expanded' = every parent unfolded. */
  mode: 'folded' | 'expanded';
  world: WorldData;
  layout: MorphLayout;
}

const parentsOf = (world: WorldData): Set<string> =>
  new Set(world.nodes.map((n) => n.parentId).filter((id): id is string => id !== undefined));

/** Every (scenario × representation × fold state) layout the corpus produces, computed once and
 *  shared by every invariant below — laying the corpus out per test would triple the file's cost
 *  for no extra signal. */
const PASSES: readonly Pass[] = WORLD_SCENARIOS.flatMap((scenario) => {
  const world = worldToMorph(scenario.spec);
  const parents = parentsOf(world);
  const modes: Array<Pass['mode']> = parents.size > 0 ? ['folded', 'expanded'] : ['folded'];
  return modes.flatMap((mode) =>
    LAYOUTS.map(([rep, fn]) => ({
      scenario,
      rep,
      mode,
      world,
      layout: fn(world, {
        viewport: LAYOUT_HINT,
        ...(mode === 'expanded' ? { expandedIds: parents } : {}),
      }),
    })),
  );
});

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

/** Nodes folded ONTO their parent — semantic zoom keeps them in the layout (never dropped) and
 *  hides them under the parent's card, so they are coincident on purpose. Identified by exact
 *  coincidence rather than by having a parentId, so an unfolded child is still checked. */
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

/** Every node in a spec, breakdowns included. */
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

describe('World scenarios — the corpus covers what it claims', () => {
  it('is a diverse, uniquely-identified set', () => {
    expect(WORLD_SCENARIOS.length).toBeGreaterThanOrEqual(12);
    const ids = WORLD_SCENARIOS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of WORLD_SCENARIOS) {
      expect(s.label.length, s.id).toBeGreaterThan(0);
      expect(s.note.length, s.id).toBeGreaterThan(0);
    }
  });

  // Guards the corpus against quietly rotting into fifteen variations on one shape. Each clause is
  // a regime a component has been seen to break on; deleting the scenario that satisfies it should
  // fail here rather than silently reduce coverage.
  it('covers every shape, data regime and content stress it exists to cover', () => {
    const specs = WORLD_SCENARIOS.map((s) => s.spec);
    const depthSpan = (spec: WorldSpec): number => new Set(spec.nodes.map((n) => n.depth)).size;
    const rootsOf = (spec: WorldSpec): number => spec.nodes.filter((n) => n.role === 'root').length;
    const hasDiamond = (spec: WorldSpec): boolean =>
      spec.nodes.some((n) => spec.edges.filter((e) => e.to === n.id).length >= 2) &&
      spec.nodes.some((n) => spec.edges.filter((e) => e.from === n.id).length >= 2);
    const touched = (spec: WorldSpec): Set<string> =>
      new Set(spec.edges.flatMap((e) => [e.from, e.to]));
    const seriesPoints = (spec: WorldSpec): number[] =>
      allNodes(spec)
        .map((n) => n.series?.points.length ?? 0)
        .filter((n) => n > 0);
    const values = (spec: WorldSpec): number[] =>
      allNodes(spec)
        .map((n) => n.value)
        .filter((v): v is number => v !== undefined);

    // shapes
    expect(
      specs.some((s) => depthSpan(s) >= 8),
      'deep narrow chain',
    ).toBe(true);
    expect(
      specs.some((s) => rootsOf(s) >= 10),
      'shallow and wide',
    ).toBe(true);
    expect(specs.some(hasDiamond), 'a cause reaching the outcome two ways').toBe(true);
    expect(
      specs.some((s) => s.nodes.length === 1),
      'single-node world',
    ).toBe(true);
    expect(
      specs.some((s) => s.nodes.length === 2),
      'two-node world',
    ).toBe(true);
    expect(
      specs.some((s) => s.nodes.length >= 60 && s.edges.length >= 90),
      'a world at scale',
    ).toBe(true);
    expect(
      specs.some((s) => s.nodes.length > 1 && s.nodes.some((n) => !touched(s).has(n.id))),
      'a node no edge reaches',
    ).toBe(true);

    // data regimes
    expect(
      specs.some((s) => isFullyGrounded(asWhyDag(s))),
      'a fully grounded world',
    ).toBe(true);
    expect(
      specs.some(
        (s) => allNodes(s).every((n) => n.tier === 'T0') && s.edges.every((e) => e.tier === 'T0'),
      ),
      'structure only — no number anywhere',
    ).toBe(true);
    expect(
      specs.some(
        (s) => s.provenance.illustrative === true && allNodes(s).some((n) => n.tier === 'T3'),
      ),
      'a wholly illustrative world',
    ).toBe(true);
    expect(
      specs.some((s) => new Set(allNodes(s).map((n) => n.tier)).size >= 3),
      'mixed tiers on one web',
    ).toBe(true);
    expect(
      specs.some((s) => s.nodes.every((n) => n.series)),
      'a series on every node',
    ).toBe(true);
    expect(
      specs.some((s) => s.nodes.length > 1 && allNodes(s).every((n) => !n.series)),
      'no series and nothing dated',
    ).toBe(true);
    expect(
      specs.some((s) => s.edges.some((e) => e.counter && (e.receipts?.length ?? 0) > 0)),
      'a contested link',
    ).toBe(true);

    // content stress
    const labels = specs.flatMap((s) => allNodes(s).map((n) => n.label));
    expect(
      labels.some((l) => l.length >= 100),
      '100+ character label',
    ).toBe(true);
    expect(
      labels.some((l) => !l.includes(' ')),
      'single-word label',
    ).toBe(true);
    expect(
      labels.some((l) => /[À-ɏ]/.test(l)),
      'accented Latin label',
    ).toBe(true);
    expect(
      labels.some((l) => /[֐-ࣿ]/.test(l)),
      'right-to-left label',
    ).toBe(true);
    const allValues = specs.flatMap(values);
    expect(
      allValues.some((v) => Math.abs(v) <= 1e-3),
      'a tiny figure',
    ).toBe(true);
    expect(
      allValues.some((v) => Math.abs(v) >= 1e11),
      'a huge figure',
    ).toBe(true);
    expect(
      specs.some((s) =>
        s.nodes.some((n) => n.value === undefined && (n.children?.length ?? 0) > 0),
      ),
      'a container whose magnitude lives in its children',
    ).toBe(true);
    expect(
      specs.some((s) => s.nodes.filter((n) => (n.children?.length ?? 0) > 0).length >= 2),
      'breakdowns on several nodes',
    ).toBe(true);
    const points = specs.flatMap(seriesPoints);
    expect(
      points.some((n) => n === 1),
      'a single-point series',
    ).toBe(true);
    expect(
      points.some((n) => n >= SERIES_POINT_CAP),
      'a series at the point cap',
    ).toBe(true);
    expect(
      specs.some((s) =>
        allNodes(s).some((n) => {
          const ts = n.series?.points.map((p) => p.t) ?? [];
          return ts.some((t, i) => i > 0 && t < ts[i - 1]);
        }),
      ),
      'a series authored out of order',
    ).toBe(true);
  });

  it('is structurally valid — every spec is a web the product could actually hold', () => {
    const bad: string[] = [];
    for (const { id, spec } of WORLD_SCENARIOS) {
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
      // A causal web must be acyclic; the cascade refuses a cycle rather than resolving it, so a
      // cyclic fixture would silently test the refusal path instead of the layout.
      if (asWhyDag(spec).nodes.length > 0 && cascade(asWhyDag(spec)).byNode.size === 0) {
        bad.push(`${id}: cascade produced nothing`);
      }
    }
    expectNoViolations(bad);
  });
});

/* ── layout: nothing is lost ─────────────────────────────────────────────── */

describe('World gauntlet — every layout places or shelves every node', () => {
  it('never loses a node in any representation', () => {
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
      // The shelf wraps, so it must wrap against the space the composition will be FITTED into,
      // not against a lane whose emptiness is itself caused by the shelving. Two entries side by
      // side is the weakest form of that: whenever the fit box could hold a second column, the
      // shelf must use one, or an all-shelved world becomes a single 160px-wide stack in a
      // 1088px-wide viewport. Stated as "more than one column", so it survives any pitch the
      // layout picks.
      const columns = new Set(
        [...p.layout.positions.values()].filter((n) => n.shelved).map((n) => Math.round(n.x)),
      ).size;
      if (shelved.length >= 2 && LAYOUT_HINT.w >= ENTRY_W * 2 && columns < 2) {
        bad.push(
          `${where(p)}: ${shelved.length} shelved entries in one column — band ${Math.round(band.w)}px wide inside a ${LAYOUT_HINT.w}px fit box`,
        );
      }
      // The count is the whole point of the band: "held aside" without a number leaves the reader
      // unable to tell whether one node or forty-nine were withheld from the representation.
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

describe('World gauntlet — geometry', () => {
  it('never overlaps two node footprints in the same lane', () => {
    const bad: string[] = [];
    for (const p of PASSES) {
      const folded = foldedOntoParent(p);
      // A folded breakdown is coincident with its parent BY DESIGN — semantic zoom keeps it in the
      // layout and hides it under the parent's card. Assert that intent exactly (it is coincident,
      // not merely overlapping) and leave it out of the collision sweep.
      for (const id of folded) {
        const self = p.layout.positions.get(id)!;
        const parent = p.layout.positions.get(p.world.nodes.find((n) => n.id === id)!.parentId!)!;
        if (self.w !== parent.w || self.h !== parent.h) {
          bad.push(`${where(p)}: ${id} is folded onto its parent but a different size`);
        }
      }
      // A chart mark is anchored ON its series' last point, so two marks coincide exactly when
      // their data does; moving one apart would put it at a time and value nothing measured. The
      // marks are therefore excluded here and their labels are de-collided instead (below).
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
      // spreadLabels' contract: `gap` between neighbours, or — when the band cannot hold them all —
      // an even share of the band. Either way NO two labels may land on the same line.
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
        // Sub-pixel tolerance: the layouts round path data to 0.01px, and a footprint sitting
        // exactly on the edge is contained, not escaped.
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
        // A label's TEXT may legitimately contain a node's own words; what it may never contain is
        // the debris of a missing value.
        if (BAD_TEXT.test(label.text)) {
          bad.push(`${where(p)}: label ${label.id} = ${JSON.stringify(label.text)}`);
        }
      }
    }
    expectNoViolations(bad);
  });
});

/* ── layout: the composition can actually be shown ───────────────────────── */

describe('World gauntlet — the composition fits a landscape viewport', () => {
  it('never produces a composition the camera cannot show whole', () => {
    const bad: string[] = [];
    for (const p of PASSES) {
      const scale = fitScale(p.layout.bbox, VIEWPORT, FIT_MARGIN);
      // Below the camera's own zoom floor the fit stops zooming out, so part of the world is
      // simply off-screen — nodes the layout swore it had placed cannot be reached.
      if (scale < CAMERA_FLOOR) {
        bad.push(
          `${where(p)}: needs ${scale.toFixed(3)}× to fit (floor ${CAMERA_FLOOR}) — bbox ${Math.round(p.layout.bbox.w)}×${Math.round(p.layout.bbox.h)}`,
        );
      }
    }
    expectNoViolations(bad);
  });

  it('never produces a ribbon — a composition that only fits by shrinking past legibility', () => {
    const bad: string[] = [];
    // Scoped to worlds the surface can actually be handed: past NODE_CAP top-level cards there is
    // no arrangement of a 200×64 card that clears the floor in a laptop box (sixty-one of them
    // need more area than the box has at that scale), and the honest answer for an over-cap
    // stress fixture is pan and zoom, which the camera-floor sweep above is what guards. Every
    // world the coercer admits is checked here, folded and unfolded.
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

  it('lays the largest world out in all three representations inside the frame budget', () => {
    const biggest = WORLD_SCENARIOS.reduce((a, b) =>
      b.spec.nodes.length > a.spec.nodes.length ? b : a,
    );
    expect(biggest.spec.nodes.length).toBeGreaterThanOrEqual(60);
    const world = worldToMorph(biggest.spec);
    for (const [rep, fn] of LAYOUTS) {
      const started = performance.now();
      const layout = fn(world, { viewport: LAYOUT_HINT });
      const elapsed = performance.now() - started;
      expect(layout.positions.size).toBe(world.nodes.length);
      expect(elapsed, `${biggest.id}/${rep} took ${Math.round(elapsed)}ms`).toBeLessThan(
        SCALE_BUDGET_MS,
      );
    }
  });
});

/* ── the surface renders ─────────────────────────────────────────────────── */

describe('World gauntlet — the surface renders every scenario', () => {
  /** Text nodes only: an attribute may legitimately hold the word "undefined" in a label. */
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

  it.each(WORLD_SCENARIOS.map((s) => [s.id, s] as const))(
    'renders %s through all three views, and under a lever, without debris',
    (id, scenario) => {
      const { container, unmount } = render(<WorldOverlay spec={scenario.spec} />);
      const seen: string[] = [];
      // A view a world cannot fill is not offered at all, so sweep the chips this world actually
      // has. Graph is unconditional — every world has causal structure — which keeps this a real
      // sweep rather than one that could silently degrade to visiting nothing.
      for (const view of ['Graph', 'As a chart', 'Over time', 'Graph']) {
        const chip = screen.queryByRole('button', { name: view }) as HTMLButtonElement | null;
        if (!chip) {
          expect(view).not.toBe('Graph');
          continue;
        }
        act(() => chip.click());
        seen.push(...debrisIn(container).map((t) => `${id}/${view}: ${t}`));
      }
      // Every node of the world reaches the DOM in every view — the morph moves elements, it never
      // swaps them out.
      const nodeCount = allNodes(scenario.spec).length;
      expect(container.querySelectorAll('.mv-node')).toHaveLength(nodeCount);
      // A lever re-weights the world IN PLACE, so the node count must not budge. It used to fork a
      // second lane and double the DOM; that lane is where a projected figure could reach the screen
      // wearing the measured world's receipts, and the debris sweep below still watches for one.
      const slider = screen.queryAllByRole('slider')[0];
      if (slider) {
        fireEvent.change(slider, { target: { value: '30' } });
        seen.push(...debrisIn(container).map((t) => `${id}/lever: ${t}`));
        expect(container.querySelectorAll('.mv-node')).toHaveLength(nodeCount);
      }
      unmount();
      expectNoViolations(seen);
    },
  );
});

/* ── the honesty invariant ───────────────────────────────────────────────── */

describe('World gauntlet — an ungrounded world can never answer exactly', () => {
  it('returns a well-formed cascade for every scenario', () => {
    const bad: string[] = [];
    for (const { id, spec } of WORLD_SCENARIOS) {
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
    for (const { id, spec } of WORLD_SCENARIOS) {
      const dag = asWhyDag(spec);
      const grounded = isFullyGrounded(dag);
      if (grounded) groundedSeen += 1;
      for (const root of spec.nodes.filter((n) => n.role === 'root')) {
        // Prune the root entirely — the strongest intervention there is.
        const { outcomeDelta, explainedPct } = cascade(dag, [{ nodeId: root.id, pct: 0 }]);
        if (!grounded && outcomeDelta !== null) {
          bad.push(
            `${id}: ungrounded world produced an exact delta ${outcomeDelta} for ${root.id}`,
          );
        }
        if (!grounded && explainedPct !== null) {
          bad.push(`${id}: ungrounded world produced "% explained" for ${root.id}`);
        }
        if (grounded && (outcomeDelta === null || !Number.isFinite(outcomeDelta))) {
          bad.push(`${id}: grounded world refused an exact delta for ${root.id}`);
        }
      }
    }
    // Without this the invariant above passes vacuously the day the corpus loses its grounded world.
    expect(groundedSeen, 'no fully grounded scenario left in the corpus').toBeGreaterThan(0);
    expectNoViolations(bad);
  });

  it('never shows an exact delta for an illustrative world, whatever its tiers say', () => {
    // The engine grounds on tiers alone, so a textbook world written in T2 reads as fully grounded
    // to `cascade`. The surface is what closes the ladder — this pins that it really does, for
    // every illustrative scenario, because the engine will not.
    const bad: string[] = [];
    for (const { id, spec } of WORLD_SCENARIOS) {
      if (spec.provenance.illustrative !== true) continue;
      const { container, unmount } = render(<WorldOverlay spec={spec} />);
      const slider = screen.queryAllByRole('slider')[0];
      if (slider) fireEvent.change(slider, { target: { value: '20' } });
      if (container.querySelector('.tr-wi-delta'))
        bad.push(`${id}: illustrative world showed an exact delta`);
      if (!container.querySelector('.wo-banner-illustrative'))
        bad.push(`${id}: no illustrative banner`);
      unmount();
    }
    expectNoViolations(bad);
  });
});

/* ── the coercer ─────────────────────────────────────────────────────────── */

/** A scenario as the model would have proposed it: plain JSON, no shared references. */
const asRaw = (spec: WorldSpec): unknown => JSON.parse(JSON.stringify(spec)) as unknown;

describe('World gauntlet — every scenario survives its own coercion', () => {
  it('keeps the nodes, children and edges the caps allow', () => {
    const bad: string[] = [];
    for (const { id, spec } of WORLD_SCENARIOS) {
      const coerced = coerceWorldSpec(asRaw(spec), worldCorpus(spec));
      if (spec.nodes.length < 2) {
        // Documented gate: fewer than two nodes is not a causal web, and the coercer refuses it
        // rather than emitting a one-node "explanation".
        if (coerced !== null) bad.push(`${id}: a one-node world was accepted`);
        continue;
      }
      if (!coerced) {
        bad.push(`${id}: refused outright`);
        continue;
      }
      const kept = spec.nodes.slice(0, NODE_CAP);
      expect(coerced.nodes.length, id).toBe(kept.length);
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
      expect(coerced.edges.length, id).toBe(Math.min(survivable.length, EDGE_CAP));
      expect(coerced.outcomeId, id).toBeTruthy();
      expect(coerced.title, id).toBe(spec.title);
    }
    expectNoViolations(bad);
  });

  it('keeps a series exactly when the gate says it may — and drops the points it cannot verify', () => {
    // The rule, stated once: a real (T1/T2) series survives only if EVERY point carries its own
    // verifiable receipt; a T3 series survives only inside an illustrative world. Anything else is
    // dropped whole. Asserting the rule (rather than a count) is what makes this readable when a
    // fixture that looks grounded silently loses its history.
    const bad: string[] = [];
    for (const { id, spec } of WORLD_SCENARIOS) {
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
          expect(out.points.length, `${id}/${n.id}`).toBe(
            Math.min(series.points.length, SERIES_POINT_CAP),
          );
        }
      }
    }
    expectNoViolations(bad);
  });

  it('demotes or drops a corrupted world instead of trusting it', () => {
    const base = WORLD_SCENARIOS.find((s) => s.id === 'grounded-retention')!.spec;
    const corpus = worldCorpus(base);
    const clone = (): WorldSpec => JSON.parse(JSON.stringify(base)) as WorldSpec;
    const coerce = (spec: WorldSpec): WorldSpec => {
      const out = coerceWorldSpec(spec as unknown, corpus);
      expect(out).not.toBeNull();
      return out!;
    };

    // A fabricated figure: the receipt is real, the number is not. The quote survives (it grounds
    // the claim it does make); the invented number is stripped rather than shown.
    const fabricated = clone();
    fabricated.nodes[0].value = 1234;
    const afterFabricated = coerce(fabricated);
    expect(afterFabricated.nodes[0].value).toBeUndefined();
    expect(afterFabricated.nodes[0].tier).toBe('T2');

    // A quote that is not in the source at all: the whole claim demotes to the no-number tier.
    const invented = clone();
    invented.nodes[0].receipt = { quote: 'A sentence that appears in no source anywhere.' };
    const afterInvented = coerce(invented);
    expect(afterInvented.nodes[0].tier).toBe('T0');
    expect(afterInvented.nodes[0].value).toBeUndefined();
    expect(afterInvented.nodes[0].receipt).toBeUndefined();

    // An edge into an id that does not resolve is DROPPED, never rewired to a plausible neighbour.
    const dangling = clone();
    dangling.edges[0] = { ...dangling.edges[0], to: 'a-node-that-does-not-exist' };
    expect(coerce(dangling).edges).toHaveLength(base.edges.length - 1);

    // A weightless link cannot carry a measured share, receipt or not — it degrades to a faint,
    // provisional, T0 assertion, which is exactly what closes the exact ladder for the world.
    const weightless = clone();
    delete weightless.edges[0].weight;
    const afterWeightless = coerce(weightless);
    expect(afterWeightless.edges[0].tier).toBe('T0');
    expect(afterWeightless.edges[0].weight).toBeUndefined();
    expect(afterWeightless.edges[0].provisional).toBe(true);
    expect(afterWeightless.edges[0].status).toBe('provisional');
    expect(isFullyGrounded(asWhyDag(afterWeightless))).toBe(false);

    // A breakdown is one level deep. A grandchild is dropped at the gate, not flattened up into a
    // sibling of its parent, where it would read as a peer cause.
    const nested = clone();
    nested.nodes[0].children = [
      {
        id: `${nested.nodes[0].id}.part`,
        label: 'A part',
        role: 'root',
        depth: 0,
        tier: 'T0',
        children: [
          {
            id: `${nested.nodes[0].id}.part.bit`,
            label: 'A bit',
            role: 'root',
            depth: 0,
            tier: 'T0',
          },
        ],
      },
    ];
    const afterNested = coerce(nested);
    expect(afterNested.nodes[0].children).toHaveLength(1);
    expect(afterNested.nodes[0].children![0].children).toBeUndefined();

    // A T3 figure outside an illustrative world has nothing to license it and loses its number.
    const textbook = clone();
    textbook.nodes[0] = { ...textbook.nodes[0], tier: 'T3', value: 99 };
    const afterTextbook = coerce(textbook);
    expect(afterTextbook.nodes[0].tier).toBe('T0');
    expect(afterTextbook.nodes[0].value).toBeUndefined();

    // A counter-receipt is verified exactly like a supporting one; an ungrounded objection vanishes
    // rather than downgrading a link on the strength of an invented quote.
    const objection = clone();
    objection.edges[0] = {
      ...objection.edges[0],
      counter: { quote: 'Nobody wrote this sentence.' },
    };
    expect(coerce(objection).edges[0].counter).toBeUndefined();
    expect(coerce(objection).edges[0].status).toBe('supported');
  });
});
