// meta.ts — the machine-readable description of one renderable block, and the
// vocabulary the Live "component brain" reasons over.
//
// The canvas can already render ~600 (heading toward 1000+) block types, but Live
// has no way to know which one fits a given answer or to keep them all out of the
// prompt at once. A ComponentMeta is the small, declarative fact sheet that closes
// that gap: what DATA a component is for, what props it needs, how impressive it is,
// and how reliably a model can fill it. The selector (src/live/select) scores these
// to pick a handful per turn; the validator coerces props from `requires`/`optional`;
// the prompt shows only the chosen few. Metadata is the join between a growing
// library and a fixed-size prompt.
//
// Authoring is meant to be cheap — `createMeta('sparkstat', { dataShapes:['series'],
// requires:['points','value'], wowWeight:0.85 })` is a complete entry; everything
// else falls back to sensible defaults. Pure data, no imports, no I/O.

/**
 * The shape of the DATA a block visualizes — the join key between a user's ask
 * (classified into shapes) and the components that suit it. Deliberately a small,
 * closed set: a component tags the shapes it serves, the classifier emits a weighted
 * vector over the same set, and their overlap is the fit score.
 */
export type DataShape =
  | 'scalar' //        a single headline number / metric
  | 'series' //        values changing over time (a trend)
  | 'composition' //   parts of a whole (a split, a budget, a mix)
  | 'comparison' //    options weighed against criteria (a decision)
  | 'ranking' //       ordered magnitudes (a leaderboard, top-N)
  | 'distribution' //  spread / frequency / outliers
  | 'relationship' //  one variable against another (correlation)
  | 'structure' //     a molecular / chemical structure (atoms + bonds)
  | 'hierarchy' //     nested / tree-structured data
  | 'flow' //          a process, funnel, or directed movement
  | 'sequence' //      ordered events or steps (a timeline, a plan)
  | 'keyvalue' //      a set of labeled stats side by side
  | 'list' //          short text items (tips, a checklist)
  | 'geo' //           places / a map
  | 'text' //          prose, a quote, a callout
  | 'code' //          source code, a snippet, an algorithm, a data structure
  | 'media' //         an image, gallery, video, or audio
  | 'tabular' //       rows × columns of data
  | 'status' //        progress, health, or state toward a goal
  | 'selection' //     a control the user fills or chooses (forms, pickers)
  | 'navigation' //    moving between views (tabs, steps, a menu)
  | 'overlay' //       a focused surface over the canvas (a sheet, a dialog)
  | 'action'; //       a thing to do (a CTA, a confirmation)

/** Every DataShape, for build/runtime validation of authored metadata. */
export const DATA_SHAPES: readonly DataShape[] = [
  'scalar',
  'series',
  'composition',
  'comparison',
  'ranking',
  'distribution',
  'relationship',
  'structure',
  'hierarchy',
  'flow',
  'sequence',
  'keyvalue',
  'list',
  'geo',
  'text',
  'code',
  'media',
  'tabular',
  'status',
  'selection',
  'navigation',
  'overlay',
  'action',
] as const;

const DATA_SHAPE_SET: ReadonlySet<string> = new Set(DATA_SHAPES);

export function isDataShape(v: string): v is DataShape {
  return DATA_SHAPE_SET.has(v);
}

/**
 * The visual BASE a component is a preset of — the "IS" facet of the tagging model. A closed,
 * deliberately small set (~22): the research is clear that a couple dozen base forms + composition
 * cover essentially the whole useful design space (Tableau ships 24 view types; nvBench covers 105
 * domains with 7 chart types). This is what lets the selector CLUSTER 580 → 10k components by the
 * base they share and offer the model a handful of genuinely-different forms instead of five
 * near-identical tables — and it's the machine-readable statement that a `receipt` IS a `table`
 * (+ currency/total annotations), so a receipt-shaped ask with no `receipt` component still lands
 * on `table` and gets annotated. Adding a value here is a deliberate review event.
 */
export type Archetype =
  | 'stat' //         one headline number against context (kpi, ring, gauge, scoreboard)
  | 'trend' //        values over time (line/area charts, candlestick)
  | 'bar' //          discrete magnitudes side by side (bars, lollipop, standings)
  | 'composition' //  parts of a whole (breakdown, donut, stack, waterfall, treemap)
  | 'distribution' // spread / frequency (histogram, boxplot, violin)
  | 'scatter' //      one variable against another (scatter, bubble, quadrant)
  | 'matrix' //       a grid keyed on two axes (heatmap, confusion matrix, Punnett)
  | 'table' //        rows × columns (datatable, receipt, pricing, gradebook, ledger)
  | 'compare' //      options weighed across criteria (compare, pros/cons, comparematrix)
  | 'list' //         short text items (list, checklist, tips)
  | 'steps' //        an ordered how-to (howtosteps, recipe, workout plan)
  | 'timeline' //     time-ordered events (timeline, agenda, chronology)
  | 'graph' //        a node/edge diagram (flow diagram, state machine, ER, network)
  | 'tree' //         a hierarchy (org chart, decision tree, treetable, taxonomy)
  | 'flow' //         a directed pipeline/funnel (funnel, sankey, kanban, journey)
  | 'map' //          real geography (geomap)
  | 'prose' //        narrative text (insight, callout, quote, dictionary, FAQ)
  | 'code' //         source / diff / trace
  | 'media' //        image, gallery, photo, video
  | 'document' //     a real document surface (pdf reader, doc view)
  | 'control' //      an interactive control (form, picker, nav, overlay — chrome)
  | 'canvas'; //      a bespoke spatial render no base subsumes (pitch, floorplan, chord, molecule)

export const ARCHETYPES: readonly Archetype[] = [
  'stat',
  'trend',
  'bar',
  'composition',
  'distribution',
  'scatter',
  'matrix',
  'table',
  'compare',
  'list',
  'steps',
  'timeline',
  'graph',
  'tree',
  'flow',
  'map',
  'prose',
  'code',
  'media',
  'document',
  'control',
  'canvas',
] as const;

const ARCHETYPE_SET: ReadonlySet<string> = new Set(ARCHETYPES);
export function isArchetype(v: string): v is Archetype {
  return ARCHETYPE_SET.has(v);
}

/**
 * The closed CAPABILITY vocabulary — the "ADAPTS" facet: which annotations/adaptations a component
 * embodies natively. Shared with the annotation-grammar ops (canvas/lib/annotations) so `receipt`
 * carrying `caps:['currency','total-row']` is exactly the statement "receipt = a table with those
 * annotations baked in". Used to teach the model which base+annotation combos are available and to
 * cluster/rank. Kept small and closed on purpose (annotation-vocab creep would re-create the
 * infinite-library problem in tag space).
 */
export type Cap =
  | 'currency' //     money-formatted values
  | 'percent' //      percentage-formatted values
  | 'unit' //         unit-suffixed values (kg, ms, °)
  | 'total-row' //    a computed summary/total row
  | 'delta' //        change vs a baseline (▲/▼)
  | 'target-line' //  a reference/threshold line or band
  | 'status-color' // semantic color coding by rule (good/warn/bad)
  | 'in-cell-bar' //  a magnitude bar inside a cell
  | 'sparkline' //    an inline mini-trend
  | 'trend-arrow' //  a direction indicator
  | 'sort' //         user-sortable
  | 'search' //       user-filterable
  | 'callout' //      a labeled annotation with a leader
  | 'highlight'; //   an emphasized row/mark, others dimmed

export const CAPS: readonly Cap[] = [
  'currency',
  'percent',
  'unit',
  'total-row',
  'delta',
  'target-line',
  'status-color',
  'in-cell-bar',
  'sparkline',
  'trend-arrow',
  'sort',
  'search',
  'callout',
  'highlight',
] as const;

const CAP_SET: ReadonlySet<string> = new Set(CAPS);
export function isCap(v: string): v is Cap {
  return CAP_SET.has(v);
}

// ── Archetype derivation ──────────────────────────────────────────────────────────────────────
// Every catalog entry gets an archetype WITHOUT hand-labeling 580 rows: `createMeta` derives it
// from (per-type override → family → primary data shape), a single source of truth that a change
// to the catalog can't leave stale. Explicit overrides cover only the cases the family/shape
// heuristic gets wrong (a specialist whose base isn't obvious from its family). A wrong archetype
// only mis-CLUSTERS a menu — it never gates a pin or drops a block — so the tail need not be
// perfect; the invariant test just asserts every entry resolves to a valid archetype.

/** Per-type overrides for entries the family/shape heuristic would mislabel. Keyed by block type. */
const ARCHETYPE_OVERRIDES: Record<string, Archetype> = {
  // core primitives whose family ('core') is too generic to map on its own
  insight: 'prose',
  chart: 'trend',
  bars: 'bar',
  breakdown: 'composition',
  list: 'list',
  timeline: 'timeline',
  compare: 'compare',
  kpi: 'stat',
  ring: 'stat',
  gauge: 'stat',
  donut: 'composition',
  stack: 'composition',
  blanks: 'prose',
  // generative primitives
  diagramflow: 'graph',
  composite: 'prose', // a composed grid of other blocks — no single base; prose is the neutral bucket
  // two-axis grids / heatmaps → matrix (they'd otherwise fall to 'table' by family or a data shape)
  matrix: 'matrix',
  matrixgrid: 'matrix',
  gridmatrix: 'matrix',
  heat: 'matrix',
  calheat: 'matrix',
  confusionmatrix: 'matrix',
  correlationheatmap: 'matrix',
  expressionheatmap: 'matrix',
  riskmatrix: 'matrix',
  bcgmatrix: 'matrix',
  cohortgrid: 'matrix',
  healthgrid: 'matrix',
  // ordered how-tos that a 'sequence' shape would otherwise send to 'timeline'
  recipecard: 'steps',
  workoutplan: 'steps',
  howtosteps: 'steps',
  // bespoke spatial renders no base subsumes
  sportspitch: 'canvas',
  floorplan: 'canvas',
  chorddiagram: 'canvas',
  fretboardmap: 'canvas',
  pianokeys: 'canvas',
  molecularstructure: 'canvas',
  freebodydiagram: 'canvas',
  bohrmodel: 'canvas',
  orbitaldiagram: 'canvas',
  unitcircle: 'canvas',
  dnahelix: 'canvas',
  periodictable: 'canvas',
  odontogram: 'canvas',
  skychart: 'canvas',
  moonphase: 'canvas',
  anatomyfigure: 'canvas',
  // real document surfaces
  pdfreader: 'document',
  docview: 'document',
  // maps (real geo only; fake map/markermap are denylisted elsewhere)
  geomap: 'map',
  maproute: 'map',
};

/** Family → default archetype, for families whose members share one base. Families that vary by
 *  data shape (charts, stats) are intentionally absent so the shape mapping below decides them. */
const FAMILY_ARCHETYPE: Record<string, Archetype> = {
  tables: 'table',
  flows: 'flow',
  code: 'code',
  forms: 'control',
  pickers: 'control',
  nav: 'control',
  overlays: 'control',
};

/** Primary data shape → archetype, the final structural fallback. */
const SHAPE_ARCHETYPE: Record<DataShape, Archetype> = {
  scalar: 'stat',
  series: 'trend',
  composition: 'composition',
  comparison: 'compare',
  ranking: 'bar',
  distribution: 'distribution',
  relationship: 'scatter',
  structure: 'canvas',
  hierarchy: 'tree',
  flow: 'flow',
  sequence: 'timeline',
  keyvalue: 'stat',
  list: 'list',
  geo: 'map',
  text: 'prose',
  code: 'code',
  media: 'media',
  tabular: 'table',
  status: 'stat',
  selection: 'control',
  navigation: 'control',
  overlay: 'control',
  action: 'control',
};

/** Resolve a component's archetype from its type/family/shapes (override → family → shape → prose). */
export function deriveArchetype(
  type: string,
  family: string,
  dataShapes: readonly DataShape[],
): Archetype {
  const override = ARCHETYPE_OVERRIDES[type];
  if (override) return override;
  const byFamily = FAMILY_ARCHETYPE[family];
  if (byFamily) return byFamily;
  const primary = dataShapes[0];
  if (primary) return SHAPE_ARCHETYPE[primary];
  return 'prose';
}

/**
 * Whether a block can be embedded — rendered as its real self — inside a static export
 * (the designed PDF document, the slide deck) instead of being flattened to a text/bar
 * archetype. Set by how a block grows under a fixed figure frame:
 *  - 'fluid' — an aspect-locked `viewBox` SVG (a Sankey, a radar, a state machine). Scales
 *              to the frame cleanly, so it always fits.
 *  - 'flow'  — HTML that grows by row / node / line count (a Gantt, a wide table, a long code
 *              listing). It is measured and either fits, gets its own page, or falls back to the
 *              designed archetype — never scaled down to an unreadable size.
 *  - 'none'  — not embeddable: interactive controls (forms, pickers), or a block the designed
 *              archetype already renders well (core findings, prose, KPIs).
 * Resolved centrally by `canvas/embed/embedClass` (family default + this per-type override), so
 * the routing, the renderer, and the tests all read one capability.
 */
export type EmbedKind = 'fluid' | 'flow' | 'none';

/**
 * How reliably a model can fill a component from a short prompt:
 *  - 'base'     — even a 3B local model fills it well (insight, list, breakdown…).
 *  - 'frontier' — a capable hosted model fills it; risky for small local models.
 *  - 'cutting'  — many precise / nested props; only the strongest models, and only
 *                 once it has cleared the eval bar (see the promotion phase).
 * The tier gates which models are offered the component, so a weak model is never
 * handed a shape it will botch.
 */
export type ReliabilityTier = 'base' | 'frontier' | 'cutting';

/** How a loose LLM `props` object becomes the component's strict props:
 *  - 'generic' — driven entirely by `requires`/`optional` (the long tail).
 *  - 'custom'  — a hand-written builder in liveSchema owns it (nested/recursive
 *                shapes the generic coercer can't safely reconstruct). */
export type CoercerKind = 'generic' | 'custom';

/**
 * The shape of ONE object inside an item array (e.g. each `{text}` in takeaways'
 * `items`). Generic-coerced components advertise only their top-level prop names to
 * the model, which then has to guess what each item object looks like — and a wrong
 * guess (`{label}` where the renderer reads `it.text`) renders a blank row. An
 * `ItemSpec` closes that gap from one place: it teaches the model the exact item
 * keys AND lets the coercer repair a near-miss by aliasing synonyms onto the field
 * the renderer actually reads, then dropping any item still missing its text.
 */
export interface ItemSpec {
  /** The array prop this describes (e.g. 'items', 'rows', 'options'). */
  prop: string;
  /** The field the renderer reads as the item's visible text. A model synonym
   *  (see `textAliases`) is renamed onto this key, and an item left with no value
   *  here is dropped so the card never shows a blank row. Omit for item arrays whose
   *  identity is numeric / positional / a join key (charts, maps, graphs), where
   *  there is no single text field to repair. */
  text?: string;
  /** Field names the model commonly uses for `text`, renamed onto it when present
   *  (e.g. ['label','name','title'] → 'text'). The canonical `text` always wins. */
  textAliases?: string[];
  /** Additional sibling fields the renderer requires for safe semantics or computation. Unlike
   *  optional enrichment keys in the reference fixture, an item missing one of these is rejected
   *  before React (e.g. `quadrant`, `role`, `time`, or a status `level`). */
  requiredFields?: string[];
  /** Mark the `text` field's pipe-enum propHint as a RENDERER CONTRACT rather than guidance:
   *  the component buckets or positions by this value and silently discards (logicmodel's five
   *  stages) or breaks on (sleepcycle's four lanes) anything off-vocabulary, so an item whose
   *  value can't be snap-repaired onto the vocabulary is invalid — better a dropped block, which
   *  recovery can re-ask, than a rendered card of placeholders. Leave unset when the renderer
   *  degrades gracefully (litigationtimeline shows an unknown kind as its own capitalized text). */
  closedVocab?: boolean;
  /** A nested item array carried on each item (e.g. commandk's groups carry
   *  `commands`). Coerced and taught recursively. */
  children?: ItemSpec;
}

/** A layout-aware limit for one prop path. Paths use `items[].label` notation. Grapheme limits
 * count user-perceived characters (so emoji/combining marks are never split); line and item limits
 * bound the two other dimensions that commonly make generated cards overflow. */
export interface FieldContentBudget {
  maxGraphemes?: number;
  maxLines?: number;
  maxItems?: number;
}

/** Optional calibrated overrides for a component. Every component also receives the central safe
 * defaults from `contentBudget.ts`, so a newly-added block is bounded even before visual tuning. */
export interface ComponentContentBudget {
  fields: Record<string, FieldContentBudget>;
}

/** The fact sheet for one renderable block type. */
export interface ComponentMeta {
  /** The block `type` key — matches the render registry and the validator switch. */
  type: string;
  /** Source family ('core' for the built-in renderers, else a blocks/ family). */
  family: string;
  /** The visual BASE this component is a preset of — the clustering key the selector groups by so
   *  a menu never shows five near-identical forms, and the link that lets a specialist be treated
   *  as "base + annotations". Derived by `createMeta` (override → family → shape) unless given. */
  archetype: Archetype;
  /** The annotations/adaptations this component embodies natively (a closed vocabulary shared with
   *  the annotation grammar). A specialist declares here what a base would need annotations to do —
   *  e.g. `receipt` → ['currency','total-row']. Optional; empty for a plain base. */
  caps?: Cap[];
  /** The data shapes this component is good at — its retrieval tags. */
  dataShapes: DataShape[];
  /** Prop keys the component needs to render anything useful. */
  requires: string[];
  /** Prop keys that enrich it but aren't required. */
  optional: string[];
  /** Whether the component has real user affordances (tabs, a picker, a sheet…). */
  interactive: boolean;
  /** Override the export-embeddability class for this type. Omit to take the family default
   *  (resolved by `canvas/embed/embedClass`): set 'flow' for a count-growing block in an
   *  otherwise-fluid family (a Gantt among the charts), or 'none' to keep a block on its
   *  designed archetype. `interactive` blocks are never embedded regardless. */
  embed?: EmbedKind;
  /** Impressiveness, 0..1 — the "wow" pull when several components fit equally. */
  wowWeight: number;
  /** How reliably a model can fill it (gates which tiers are offered it). */
  tier: ReliabilityTier;
  /** Sensible default column span on the 12-col grid (1..12). */
  colDefault: number;
  /** Readable minimum span (1..12). The layout pass never shrinks the block below
   *  this, so a component is never squeezed into an unreadable sliver. Defaults to a
   *  value derived from colDefault when omitted. */
  colMin?: number;
  /** One short line describing what it's for — the only text the prompt menu shows. */
  blurb: string;
  /** Which coercion path turns loose JSON into its props (default 'generic'). */
  coercer: CoercerKind;
  /** The exact shape of each object inside this component's text-bearing item
   *  arrays — taught to the model and used by the generic coercer to alias synonyms
   *  and drop blank items, so a list-style card never renders empty rows. Only the
   *  arrays whose items carry visible TEXT need an entry; numeric/chart/graph item
   *  arrays are left out (there is no text field to repair). */
  itemShapes?: ItemSpec[];
  /** Prop names whose value the renderer reads as an array of PLAIN STRINGS (step lines,
   *  tips…). The generic coercer flattens whatever arrived — objects carrying a text field,
   *  a lone string — into clean strings and drops blanks, so a wrong item shape degrades to
   *  readable text instead of crashing the component (a thrown `.map` over an objectified
   *  `steps` array is exactly how a whole recipe once vanished from the canvas). Also taught
   *  in the prompt menu so the model emits the right shape in the first place. */
  stringItems?: string[];
  /** Per-prop hints for the model: enum values, formats, or token vocabulary.
   *  Taught verbatim in the prompt menu so the model knows the exact strings to emit.
   *  E.g. `{ tone: "'formal'|'casual'|'friendly'", iconColor: "var(--presence)|var(--insight)" }`.
   *  Only needed where a wrong guess produces a blank or broken render. */
  propHints?: Record<string, string>;
  /** Field-level visible-content limits, shared by prompt generation and runtime enforcement. */
  contentBudget?: ComponentContentBudget;
  /** Optional starter props the generator can lean on (units, default colors…). */
  defaultProps?: Record<string, unknown>;
  /** Intent categories this block serves — the user-need axis the selector narrows by BEFORE
   *  scoring data-shape fit (a block is offered for an intent only if it serves it). A small,
   *  open vocabulary, e.g. 'decide' | 'plan' | 'explain' | 'comfort' | 'quantify' | 'draft' |
   *  'howto' | 'reference' | 'navigate' | 'reflect' | 'track'. */
  intents?: string[];
  /** Real-world domains this block legitimately fits — used by the credibility/sanity gate to keep
   *  it from being chosen for an absurd domain (a sports pitch for a medical ask). Omit for
   *  domain-neutral blocks (insight, list, callout…) that fit anywhere. e.g. 'health' | 'money' |
   *  'travel' | 'cooking' | 'fitness' | 'sports' | 'code' | 'science' | 'business'. */
  domains?: string[];
}

/** Global fallbacks so a metadata entry only has to state what's distinctive. `archetype` has no
 *  fallback here — it's derived per-entry in createMeta (see deriveArchetype). */
const META_DEFAULTS: Omit<ComponentMeta, 'type' | 'archetype'> = {
  family: 'core',
  dataShapes: [],
  requires: [],
  optional: [],
  interactive: false,
  wowWeight: 0.4,
  tier: 'frontier',
  colDefault: 6,
  blurb: '',
  coercer: 'generic',
};

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}
function clampCol(n: number): number {
  return Math.min(12, Math.max(1, Math.round(n))) || 6;
}

/**
 * Build a ComponentMeta from a `type` and only the fields that differ from the
 * defaults. Normalizes the two values a human most easily gets wrong (wowWeight
 * out of 0..1, colDefault out of 1..12) and drops any non-DataShape tag rather
 * than letting a typo silently poison retrieval.
 */
export function createMeta(type: string, over: Partial<ComponentMeta> = {}): ComponentMeta {
  const shapes = (over.dataShapes ?? META_DEFAULTS.dataShapes).filter(isDataShape);
  const family = over.family ?? META_DEFAULTS.family;
  // archetype: an explicit override (validated) wins; otherwise derive it from type/family/shape.
  const archetype =
    over.archetype && isArchetype(over.archetype)
      ? over.archetype
      : deriveArchetype(type, family, shapes);
  // caps: keep only valid capability tokens (a typo silently poisons nothing, it's just dropped).
  // The facet arrays are destructured OUT of the spread rather than overwritten after it: an entry
  // authored with `caps: []` would otherwise keep the empty array, and "declares no capabilities"
  // and "declares an empty list of capabilities" must be the same fact — the generated index encodes
  // absence, so a stray `[]` here would make the index and the catalog disagree.
  const { caps: rawCaps, intents: rawIntents, domains: rawDomains, ...rest } = over;
  const caps = rawCaps?.filter(isCap);
  return {
    ...META_DEFAULTS,
    ...rest,
    type,
    family,
    archetype,
    dataShapes: shapes,
    wowWeight: clamp01(over.wowWeight ?? META_DEFAULTS.wowWeight),
    colDefault: clampCol(over.colDefault ?? META_DEFAULTS.colDefault),
    ...(over.colMin !== undefined ? { colMin: clampCol(over.colMin) } : {}),
    ...(caps?.length ? { caps } : {}),
    ...(rawIntents?.length ? { intents: rawIntents } : {}),
    ...(rawDomains?.length ? { domains: rawDomains } : {}),
  };
}

/** A whole catalog. The selector loads one of these; the build step emits one. */
export type ComponentCatalog = ComponentMeta[];
