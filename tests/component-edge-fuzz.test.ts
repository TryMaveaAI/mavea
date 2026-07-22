import { RAW_CATALOG } from '../src/canvas/blocks/catalog/catalog.data';
import { render } from '@testing-library/react';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { TopicCanvas } from '../src/canvas/TopicCanvas';
import { EXTENDED_REGISTRY } from '../src/canvas/blocks';
import { primeExtendedRegistry } from '../src/canvas/blocks/loader';
import type { ComponentMeta, ItemSpec } from '../src/canvas/blocks/catalog';
import type { Block, ConversationSpec } from '../src/data/conversation';
import { validateLiveResponse } from '../src/engine/liveSchema';
// TopicCanvas resolves extended blocks through the per-family loader (async chunks in the
// app). The fuzz mounts assert on the same tick, so prime the merged registry — every lookup
// is then synchronous, exactly like the gallery.
primeExtendedRegistry(EXTENDED_REGISTRY);
// Plain .ts, not .tsx — mounted via React.createElement (the same pattern slides-fit.test.ts
// uses) instead of JSX, so no JSX transform is required for this file.
// component-edge-fuzz.test.ts — does every generic-coerced block survive input it was never
// hand-tuned against?
//
// canvas-render.test.tsx proves every block renders the ONE authored fixture per topic; that
// fixture is a single well-formed sample, not a spec, and a component whose sizing/formatting
// math only works for that exact shape is a live bug (see CLAUDE.md's "handle dynamic data, not
// just the demo numbers"). live-itemshape.test.ts separately proves the item-array COERCER
// repairs a model's synonym field names. This file combines the two: it reuses itemshape's
// type-guessing stub-prop generator to synthesize hostile model props, sends those through the
// production validator, then mounts any accepted block through TopicCanvas at three scales:
//   (a) minimum   — every required prop present, item arrays holding exactly one item, nothing
//                    optional filled at all.
//   (b) large-N   — every itemShapes-described array (required OR optional) holding ~60 items,
//                    the shape a long real answer can produce.
//   (c) numeric-extreme — every prop that reads as a NUMBER by name (score/count/pct/…) and is
//                    OPTIONAL set to 0, then 1e9, then a large negative — three separate mounts.
// Scoped to coercer:'generic' components only (RAW_CATALOG's long tail, driven purely by
// requires/optional/itemShapes) — the 19 coercer:'custom' ones have a hand-written builder in
// liveSchema with its own type-specific validation and are a smaller, separate follow-up.
//
// A BLOCK THAT THROWS DOES NOT THROW HERE. TopicCanvas wraps every accepted block in `BlockBoundary`, an
// error boundary that swallows a render crash and hides the cell — exactly so one malformed
// block never blanks Live's whole canvas. That means `render()` itself never rejects; the crash
// signal is BlockBoundary's own `console.error('[BlockBoundary] block render failed …')`. This
// file spies on console.error for that tag instead of wrapping render in try/catch, which is the
// accurate way to detect "this component crashed on this input" given how the app is built.
//
// A required prop with no ItemSpec is guessed by NAME, the same way live-itemshape.test.ts's
// stubRequired already does for its own leftover category: numeric-sounding → a number,
// plural-sounding → a short array of plain strings, anything else → a string (see `stubScalar`'s
// own comment for why a string, not an object). A wrong guess there can be a real finding:
// The reference-shape gate now either repairs that data to the renderer's demonstrated nested
// contract or drops the one malformed block. Both are safe; reaching React malformed is not.
const GENERIC = RAW_CATALOG.filter((m) => m.coercer === 'generic');
/** Prop names that read as a NUMBER by the same convention live-itemshape.test.ts's
 *  stubRequired uses, broadened to a substring test — optional names skew compound
 *  (maxScore, itemCount, startValue) rather than the bare score/min/max/value/count/total/pct
 *  the original exact-match regex covers. Heuristic and imperfect by nature (see file header). */
const NUMERIC_NAME =
  /score|count|total|pct|percent|progress|value|amount|price|cost|rate|ratio|width|height|weight|age|duration|distance|speed|volume|level|index|rank|position|delta|target|goal|limit|capacity|quantity|number|degrees|angle|temp|delay|step|length|loss|min|max/i;
/** A "type:prop" pair where the bare name reads as NUMBER by `NUMERIC_NAME` but this ONE
 *  component's renderer treats it as a plain STRING (a date, a hex color, a text body) — the
 *  neighbors that make `value` genuinely ambiguous (counter, sliderinput, toolscale, …) DO want
 *  the number, so this can't be a name-wide exception. Confirmed by reading each renderer.
 *  Precisely scoped (not a name-wide override) so it carries zero regression risk for every
 *  other component that shares the same prop name. */
const SCALAR_STRING_OVERRIDE = new Set([
  'datepicker:value', // an ISO date string ("value.slice(...)").
  'calendarpick:value', // same — an ISO date string.
  'colorpicker:value', // a hex color string ("value.toUpperCase()").
  'textarea:value', // the free-text body ("value.slice(...)").
]);
/** The mirror image of SCALAR_STRING_OVERRIDE: a "type:prop" pair whose ARRAY ITEMS are genuinely
 *  numbers but the bare name doesn't match NUMERIC_NAME — a string stub here would pass `.map()`
 *  fine but leak NaN the moment the renderer does arithmetic on it (a y-scale, a min/max). */
const NUMERIC_ARRAY_OVERRIDE = new Set([
  'timeseriesdecomposition:observed',
  'timeseriesdecomposition:trend',
  'timeseriesdecomposition:seasonal',
  'timeseriesdecomposition:residual',
]);
function looksNumericProp(type: string, prop: string): boolean {
  if (NUMERIC_ARRAY_OVERRIDE.has(`${type}:${prop}`)) return true;
  return !SCALAR_STRING_OVERRIDE.has(`${type}:${prop}`) && NUMERIC_NAME.test(prop);
}
/** A handful of props that read as plural (and so would trip `looksArrayName` below) but are
 *  genuinely scalar in the one component that declares them — found by checking the actual
 *  renderer once the naive plural guess produced a false-crash. Keep this list to CONFIRMED
 *  exceptions only (see the comment at each entry), not a defensive blanket. */
const LIKELY_SCALAR_PLURAL = new Set([
  'protons', // bohrmodel: an atom's proton COUNT, not a list of protons.
  'shells', // bohrmodel: electron-per-shell COUNTS, read as numbers via shells[i], not objects.
  'periodDays', // contractiontimer: a cycle-length NUMBER, not a list of days.
]);
/** The mirror-image gap: a required array prop whose name genuinely IS a flat array (parallel
 *  same-length series, one number/string per sample) but doesn't end in "s" so `looksArrayName`'s
 *  suffix check misses it — found via timeseriesdecomposition, whose four data series read as a
 *  past-tense verb/noun rather than an English plural. Keep tight, confirmed exceptions only. */
const LIKELY_ARRAY_SINGULAR = new Set([
  'observed', // timeseriesdecomposition: the raw series, one number per sample.
  'trend', // timeseriesdecomposition: the long-run trend component, same length as dates.
  'seasonal', // timeseriesdecomposition: the repeating seasonal component, same length as dates.
  'residual', // timeseriesdecomposition: observed minus trend minus seasonal, same length as dates.
]);
/** A prop name that reads as a plural noun and isn't a known scalar exception. Checked BEFORE
 *  `looksNumericProp` (see `stubScalar`): plenty of legitimate array props — steps, levels, ranks,
 *  positions, targets, limits — contain one of `NUMERIC_NAME`'s substrings (step/level/rank/…)
 *  purely by coincidence of English, and a plural name is the stronger signal of the two. This
 *  is the same "no shape info" gap live-itemshape.test.ts's stubRequired accepts for its own
 *  leftover category, just widened so a required prop whose ITEMS have more than one field (so
 *  it never qualified for an ItemSpec — see meta.ts's `ItemSpec` doc) doesn't get treated as a
 *  scalar and crash `.map()` on a stub string. */
function looksArrayName(prop: string): boolean {
  if (LIKELY_ARRAY_SINGULAR.has(prop)) return true;
  return !LIKELY_SCALAR_PLURAL.has(prop) && /s$/i.test(prop) && prop.length > 3;
}
/** Small, FIXED count for a guessed (not itemShapes-described) array — large-N scale (b) only
 *  stresses arrays we have real structural knowledge of; this just clears `.map()` on more than
 *  a single element for the rest. */
const GUESSED_ARRAY_SIZE = 2;
/** A prop with no declared item shape gets a plain non-empty stub: a plural-ish name (checked
 *  first — see `looksArrayName`) gets a short array, a numeric-ish singular name gets a number,
 *  anything else gets a string — the fallback live-itemshape.test.ts's stubRequired already uses
 *  for this identical leftover category, widened by the plural case. A guessed array holds
 *  PLAIN STRINGS (numbers when the name is ALSO numeric-ish, e.g. "scores"/"amounts"): a string
 *  is safe whether the real prop turns out to be an array of primitives (rendered directly) or
 *  an array of objects (`.title`/`.label` on a string returns `undefined` harmlessly, same as a
 *  genuinely missing field) — an object item would be the one choice that breaks the primitive
 *  case (React refuses to render a plain object as a child). An itemShape-less array whose items
 *  need a NUMERIC field this generator was never taught (a waterfall step's `value`, a matrix
 *  row's cells) is represented in the historical regression corpus below, not a reason
 *  to make every guessed item a kitchen-sink object (tried; it traded one failure class for
 *  another of about the same size, since plenty of OTHER guessed arrays really are flat lists of
 *  primitives that a rendered object would break instead). */
function stubScalar(type: string, prop: string): unknown {
  if (looksArrayName(prop)) {
    const numericItems = looksNumericProp(type, prop);
    return Array.from({ length: GUESSED_ARRAY_SIZE }, (_, i) =>
      numericItems ? 50 + i : `fuzz-${prop}-${i}`,
    );
  }
  if (looksNumericProp(type, prop)) return 50;
  return `fuzz-${prop}`;
}
/** One item object built straight onto the CANONICAL field (no synonym) — this file stresses
 *  the renderer, not the alias-repair coercer.test.ts already covers. Nested child arrays stay
 *  fixed at 2 regardless of the outer scale: real answers don't nest hundreds deep, and letting
 *  N compound at every level would blow up render time for no extra signal. */
function makeItem(spec: ItemSpec, tag: string): Record<string, unknown> {
  const item: Record<string, unknown> = {};
  if (spec.text) item[spec.text] = `FUZZTEXT_${tag}`;
  if (spec.children) {
    item[spec.children.prop] = [0, 1].map((i) => makeItem(spec.children!, `${tag}_c${i}`));
  }
  return item;
}
function itemArray(spec: ItemSpec, tag: string, n: number): Record<string, unknown>[] {
  return Array.from({ length: n }, (_, i) => makeItem(spec, `${tag}${i}`));
}
function shapeByProp(meta: ComponentMeta): Map<string, ItemSpec> {
  return new Map((meta.itemShapes ?? []).map((s) => [s.prop, s]));
}
/** Every required prop filled: an itemShapes-described array gets `itemCount` items on the
 *  canonical field, everything else gets the numeric-or-string scalar guess. */
function requiredProps(meta: ComponentMeta, itemCount: number): Record<string, unknown> {
  const shapes = shapeByProp(meta);
  const props: Record<string, unknown> = {};
  for (const req of meta.requires) {
    const spec = shapes.get(req);
    props[req] = spec
      ? itemArray(spec, `${meta.type}_${req}_`, itemCount)
      : stubScalar(meta.type, req);
  }
  return props;
}
/** Scale (a): the readable floor — one item per array, nothing optional. */
function minimumProps(meta: ComponentMeta): Record<string, unknown> {
  return requiredProps(meta, 1);
}
/** Scale (b): every itemShapes-described array (required or optional) blown out to ~60 items —
 *  the shape a long, real, list-heavy answer produces. Only generated for a meta that actually
 *  has an itemShape somewhere; without one this would be byte-identical to (a). */
function largeNProps(meta: ComponentMeta): Record<string, unknown> {
  const props = requiredProps(meta, 60);
  const shapes = shapeByProp(meta);
  for (const opt of meta.optional) {
    const spec = shapes.get(opt);
    if (spec) props[opt] = itemArray(spec, `${meta.type}_${opt}_`, 60);
  }
  return props;
}
/** Scale (c): the readable floor plus every numeric-looking OPTIONAL prop pinned to one
 *  extreme value. Returns null when the meta has no such prop — that mount would be identical
 *  to (a) and add nothing. */
function numericExtremeProps(meta: ComponentMeta, extreme: number): Record<string, unknown> | null {
  const numericOptional = meta.optional.filter((opt) => looksNumericProp(meta.type, opt));
  if (numericOptional.length === 0) return null;
  const props = minimumProps(meta);
  for (const opt of numericOptional) props[opt] = extreme;
  return props;
}
function specForBlock(block: Block): ConversationSpec {
  return {
    id: 'money', // any valid TopicId; the canvas never reads it
    workspace: 'Test',
    title: 'Title',
    sub: 'Sub',
    opener: '',
    context: [],
    blocks: [block],
    proof: null,
    extras: {},
    group: 'home',
    suggests: [],
    keywords: [],
  };
}
const FORBIDDEN_SUBSTRINGS = ['NaN', 'Infinity', 'undefined'];
interface MountResult {
  /** BlockBoundary caught a render throw — see the file header for why this, not try/catch. */
  crashed: boolean;
  /** The first forbidden substring found in the rendered text, or null when clean. */
  leaked: string | null;
}
/** Mount one (component, scale) pair through the real TopicCanvas path and report whether it
 *  crashed (per the BlockBoundary console signal) or leaked a raw JS-artifact string into the
 *  visible card — the two failure modes `expectSafe` turns into assertions. */
function mount(meta: ComponentMeta, props: Record<string, unknown>): MountResult {
  const validated = validateLiveResponse(
    { title: 'Fuzz', blocks: [{ type: meta.type, props }] },
    new Set([meta.type]),
    1,
  );
  const block = validated?.blocks.find((candidate) => candidate.type === meta.type);
  // Rejection is deliberate, clean degradation: no malformed renderer input reaches React.
  if (!block) return { crashed: false, leaked: null };
  const caughtByBoundary: unknown[] = [];
  const errorSpy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    if (typeof args[0] === 'string' && args[0].includes('[BlockBoundary]')) {
      caughtByBoundary.push(args);
    }
  });
  let container: HTMLElement;
  let unmount: () => void;
  try {
    ({ container, unmount } = render(
      createElement(TopicCanvas, {
        data: specForBlock(block),
        spot: null,
        built: {},
        onProve: () => {},
      }),
    ));
  } finally {
    errorSpy.mockRestore();
  }
  const text = container.textContent ?? '';
  unmount();
  return {
    crashed: caughtByBoundary.length > 0,
    leaked: FORBIDDEN_SUBSTRINGS.find((bad) => text.includes(bad)) ?? null,
  };
}
/**
 * The exact historical corpus that used to crash or leak NaN before the nested structural gate.
 * These are regression inputs now, not accepted failures: every one must be repaired or rejected
 * before React. Keeping the keys makes the old 215-case gap auditable instead of erasing history.
 * Original root-cause tags:
 *   [ITEM-FIELD] a required array prop has no ItemSpec, and this generator's per-item guess (a
 *     string/number, or a single text field) is missing ANOTHER field the renderer reads — the
 *     same gap would bite a real model reply that omits an optional per-item field, since
 *     coerceGeneric performs no shape validation beyond "not empty" (see the file header).
 *   [NOT-ARRAY] the renderer expects a real (possibly nested) array/matrix shape this
 *     generator's flat per-item guess doesn't provide (`.flat()`, spread, a nested sub-array).
 *   [NAN-LEAK] a numeric computation (often a percentage or a ratio) resolves to NaN instead of
 *     a guarded fallback.
 *   [STR-AS-NUM] an OPTIONAL `value`-ish prop this generator's blanket numeric-name heuristic
 *     still mis-reads on one specific component even after the `SCALAR_STRING_OVERRIDE` above
 *     (a sibling optional prop on the SAME component reads as numeric correctly).
 *   [OBJ-CHILD] an item object reaches JSX as a direct child instead of a named field.
 */
const HISTORICAL_FUZZ_CASES = new Set<string>([
  // --- [ITEM-FIELD] / [NOT-ARRAY]: itemShape-less required array, item needs more than this
  // generator can synthesize, or the renderer wants a shape flatter/deeper than a plain array ---
  'agenttrace:minimum',
  'allocatepeople:minimum',
  'allocatepeople:large-N',
  'areamodel:minimum',
  'areaplot:minimum',
  'areaplot:large-N',
  'bohrmodel:minimum',
  'boxplot:minimum',
  'bulletkpi:minimum',
  'bulletkpi:large-N',
  'bump:minimum',
  'causationchain:minimum',
  'causationchain:large-N',
  'celldiagram:large-N',
  'chatthread:minimum',
  'chatthread:large-N',
  'claimgrid:minimum',
  'cohortgrid:minimum',
  'cohortgrid:large-N',
  'colorwheel:minimum',
  'colorwheel:large-N',
  'comparebars:minimum',
  'comparebars:large-N',
  'comparematrix:minimum',
  'comparematrix:large-N',
  'conjugation:minimum',
  'conjugation:numeric-extreme:0',
  'conjugation:numeric-extreme:1e9',
  'conjugation:numeric-extreme:negative',
  'craftchart:minimum',
  'craftchart:large-N',
  'datastructure:numeric-extreme:0',
  'datastructure:numeric-extreme:1e9',
  'datastructure:numeric-extreme:negative',
  'deltacascade:minimum',
  'deltacascade:large-N',
  'developmentmilestone:minimum',
  'devicemark:minimum',
  'diagram:minimum',
  'diagram:numeric-extreme:0',
  'diagram:numeric-extreme:1e9',
  'diagram:numeric-extreme:negative',
  'dimensiondrawing:minimum',
  'dimensiondrawing:large-N',
  'dualaxis:minimum',
  'energydiagram:large-N',
  'erdiagram:minimum',
  'erdiagram:large-N',
  'etymtree:minimum',
  'factcheck:minimum',
  'factcheck:large-N',
  'financialstatement:minimum',
  'financialstatement:large-N',
  'footnotetable:minimum',
  'funnel:minimum',
  // [NOT-ARRAY] contour is a genuine 2-D grid of {x,y,z} samples (row-major matrix of objects) —
  // this generator's per-item guess only synthesizes a flat 1-D array, never a nested grid, so
  // there's no shape it could stub here that would satisfy the renderer's contour[row][col].z
  // indexing. Not a defensive-coding gap on the component's part; a real model reply omitting
  // the whole grid is already caught by the required-prop empty-check in coerceGeneric.
  'gradientdescent:minimum',
  'gradientdescent:numeric-extreme:0',
  'gradientdescent:numeric-extreme:1e9',
  'gradientdescent:numeric-extreme:negative',
  'geometrycanvas:numeric-extreme:0',
  'geometrycanvas:numeric-extreme:1e9',
  'geometrycanvas:numeric-extreme:negative',
  'gloss:minimum',
  'gloss:large-N',
  'goaltree:minimum',
  'gridmatrix:minimum',
  'groupedbars:minimum',
  'growthcurve:minimum',
  'growthcurve:numeric-extreme:0',
  'growthcurve:numeric-extreme:1e9',
  'growthcurve:numeric-extreme:negative',
  'habittracker:minimum',
  'habittracker:large-N',
  'hashtable:minimum',
  'healthgrid:minimum',
  'healthgrid:large-N',
  'indifferencecurve:minimum',
  'indifferencecurve:large-N',
  'indifferencecurve:numeric-extreme:0',
  'indifferencecurve:numeric-extreme:1e9',
  'indifferencecurve:numeric-extreme:negative',
  'ipachart:large-N',
  'journeymap:minimum',
  'kanban:minimum',
  'kbd:minimum',
  'kbd:large-N',
  'leaderboard:minimum',
  'leaderboard:large-N',
  'logicgates:minimum',
  'logicgates:large-N',
  'marimekko:minimum',
  'matrix:minimum',
  'medicationschedule:minimum',
  'medicationschedule:large-N',
  'moonphase:numeric-extreme:1e9',
  'moonphase:numeric-extreme:negative',
  'paralleltext:minimum',
  'paralleltext:large-N',
  'parsetree:minimum',
  'phasediagram:minimum',
  'phasediagram:large-N',
  'phylotree:large-N',
  'pivot:minimum',
  'plot:minimum',
  'prayertimes:minimum',
  'prayertimes:large-N',
  'probabilitytree:minimum',
  'pyramidtiers:minimum',
  'quadrant:minimum',
  'quadrant:large-N',
  'radar:minimum',
  'radar:numeric-extreme:0',
  'radar:numeric-extreme:1e9',
  'radar:numeric-extreme:negative',
  'ratinginput:large-N',
  'retrieval:minimum',
  'retrieval:large-N',
  'roadmap:minimum',
  'roccurve:minimum',
  'roccurve:large-N',
  'scansionmark:minimum',
  'seasonband:minimum',
  'seasonband:large-N',
  'sequencediagram:minimum',
  'sequencediagram:large-N',
  'sizechart:minimum',
  'smallmultiples:minimum',
  'smallmultiples:large-N',
  'sourcelist:minimum',
  'sourcelist:large-N',
  'sparkstat:minimum',
  'sparkstat:numeric-extreme:0',
  'sparkstat:numeric-extreme:1e9',
  'sparkstat:numeric-extreme:negative',
  'sparktable:minimum',
  'sparktable:large-N',
  'sparktable:numeric-extreme:0',
  'sparktable:numeric-extreme:1e9',
  'sparktable:numeric-extreme:negative',
  'sportspitch:numeric-extreme:0',
  'sportspitch:numeric-extreme:1e9',
  'sportspitch:numeric-extreme:negative',
  'streamgraph:minimum',
  'surfaceplot:minimum',
  'surfaceplot:numeric-extreme:0',
  'surfaceplot:numeric-extreme:1e9',
  'surfaceplot:numeric-extreme:negative',
  'taylorseries:minimum',
  'taylorseries:numeric-extreme:0',
  'taylorseries:numeric-extreme:1e9',
  'taylorseries:numeric-extreme:negative',
  'teachdiagram:minimum',
  'teachdiagram:numeric-extreme:0',
  'teachdiagram:numeric-extreme:1e9',
  'teachdiagram:numeric-extreme:negative',
  'toolbar:minimum',
  'tooltip:numeric-extreme:0',
  'tooltip:numeric-extreme:1e9',
  'tooltip:numeric-extreme:negative',
  'trainingcurve:numeric-extreme:0',
  'trainingcurve:numeric-extreme:1e9',
  'trainingcurve:numeric-extreme:negative',
  'typespec:minimum',
  'typespec:large-N',
  'vectorfield:large-N',
  'verse:minimum',
  'vitalstrip:minimum',
  'vitalstrip:large-N',
  'waterfall:minimum',
  'whatchanged:minimum',
  // --- [NAN-LEAK]: a percentage/ratio computation reaches the card as literal "NaN" ---
  'burnrunway:minimum',
  'burnrunway:large-N',
  'confidencemeter:minimum',
  'confidencemeter:large-N',
  'controlchart:minimum',
  'cutlist:minimum',
  'cutlist:large-N',
  'cycletrack:minimum',
  'dumbbell:minimum',
  'ecgstrip:large-N',
  'eratimeline:minimum',
  'eratimeline:large-N',
  'eratimeline:numeric-extreme:0',
  'eratimeline:numeric-extreme:1e9',
  'eratimeline:numeric-extreme:negative',
  'fractionbar:minimum',
  'gridtransform:minimum',
  'histogram:minimum',
  'latencydist:minimum',
  'moneytray:minimum',
  'moneytray:large-N',
  'moneytray:numeric-extreme:0',
  'moneytray:numeric-extreme:1e9',
  'moneytray:numeric-extreme:negative',
  'patternpiece:minimum',
  'patternpiece:large-N',
  'payoffdiagram:minimum',
  'payoffdiagram:large-N',
  'payoffdiagram:numeric-extreme:0',
  'payoffdiagram:numeric-extreme:1e9',
  'payoffdiagram:numeric-extreme:negative',
  'pregnancyweek:minimum',
  'pregnancyweek:numeric-extreme:0',
  'pregnancyweek:numeric-extreme:1e9',
  'pregnancyweek:numeric-extreme:negative',
  'progressbar:minimum',
  'progressbar:large-N',
  'scatterregression:minimum',
  'statpair:minimum',
  'statpair:numeric-extreme:0',
  'statpair:numeric-extreme:1e9',
  'statpair:numeric-extreme:negative',
  'waffle:minimum',
  // --- [STR-AS-NUM]: a sibling optional prop on the SAME component still mis-reads as numeric
  // even after the exact-`value` override above ---
  'waveform:numeric-extreme:1e9',
  'waveform:numeric-extreme:negative',
]);
/** Assert a (component, scale) model input is repaired/rejected cleanly and never crashes React. */
function expectSafe(
  meta: ComponentMeta,
  props: Record<string, unknown>,
  key: string,
  label: string,
): void {
  void key; // retained in call sites so a failing regression still prints its stable corpus id
  const result = mount(meta, props);
  expect(result.crashed, `${label}: BlockBoundary caught a render crash on this input`).toBe(false);
  expect(result.leaked, `${label}: rendered the literal substring "${result.leaked}"`).toBeNull();
}
describe('component edge fuzz — generic-coerced blocks under adversarial props', () => {
  it('covers the bulk of the catalog (guards against a silently-empty corpus)', () => {
    expect(GENERIC.length).toBeGreaterThan(300);
  });
  describe.each(GENERIC.map((m) => [m.type, m] as const))('%s', (type, meta) => {
    it('minimum: one item per array, no optionals', () => {
      expectSafe(meta, minimumProps(meta), `${type}:minimum`, `${type} (minimum)`);
    });
    const hasItemShape = (meta.itemShapes?.length ?? 0) > 0;
    (hasItemShape ? it : it.skip)('large-N: ~60 items in every described array', () => {
      expectSafe(meta, largeNProps(meta), `${type}:large-N`, `${type} (large-N)`);
    });
    const numericOptional = meta.optional.filter((opt) => looksNumericProp(meta.type, opt));
    const hasNumericOptional = numericOptional.length > 0;
    (hasNumericOptional ? it : it.skip)('numeric-extreme: 0', () => {
      expectSafe(
        meta,
        numericExtremeProps(meta, 0)!,
        `${type}:numeric-extreme:0`,
        `${type} (numeric=0)`,
      );
    });
    (hasNumericOptional ? it : it.skip)('numeric-extreme: 1e9', () => {
      expectSafe(
        meta,
        numericExtremeProps(meta, 1e9)!,
        `${type}:numeric-extreme:1e9`,
        `${type} (numeric=1e9)`,
      );
    });
    (hasNumericOptional ? it : it.skip)('numeric-extreme: negative', () => {
      expectSafe(
        meta,
        numericExtremeProps(meta, -1e9)!,
        `${type}:numeric-extreme:negative`,
        `${type} (numeric=-1e9)`,
      );
    });
  });
});
describe('historical malformed-prop regression corpus', () => {
  it('every historical entry names a (type, scale) pair this file still exercises', () => {
    const validKeys = new Set<string>();
    for (const meta of GENERIC) {
      validKeys.add(`${meta.type}:minimum`);
      if ((meta.itemShapes?.length ?? 0) > 0) validKeys.add(`${meta.type}:large-N`);
      if (meta.optional.some((opt) => looksNumericProp(meta.type, opt))) {
        validKeys.add(`${meta.type}:numeric-extreme:0`);
        validKeys.add(`${meta.type}:numeric-extreme:1e9`);
        validKeys.add(`${meta.type}:numeric-extreme:negative`);
      }
    }
    const stale = [...HISTORICAL_FUZZ_CASES].filter((k) => !validKeys.has(k));
    expect(
      stale,
      `these historical fuzz entries no longer name a case this file runs (a typo, or the ` +
        `catalog changed under it) — remove them: ${stale.join(', ')}`,
    ).toEqual([]);
  });
});
