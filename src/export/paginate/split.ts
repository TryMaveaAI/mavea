// Per-archetype fragment splitters — the "how" of turning one section that measured taller than a
// page into an ordered set of page-fitting fragments. `expandOversized` (paginate.ts) is the
// "when": it walks every section and, for any one taller than the cap, looks up its splitter here
// and pushes the fragments in its place; a kind with no entry stays atomic (placed whole, however
// tall — the last resort, never a silent clip since the fixed page is a hard box).
//
// Two shapes of splitter live here:
//  - ARRAY splitters (the original set — specTable, rankedList, checklist, …): the payload is
//    literally a rows/items array of roughly-uniform-height entries, so it chunks by INDEX with
//    widow control (never a lone final row).
//  - FRAGMENT splitters (prose, findingCallout, spotlightCard, flow-class figure): the payload has
//    no uniform item array. Prose/callout/spotlight carry a block of TEXT, cut at a sentence (or,
//    failing that, word) boundary; a flow-class figure (a code-family block whose content grows by
//    line) is chunked by its own declared item array, the same widow-safe math as the array kinds.
import type {
  FigureData,
  FindingCalloutData,
  ProseData,
  Section,
  SectionKind,
  SpotlightCardData,
} from '../model/ExportDoc';

/** Roughly how much of a section's height is fixed chrome (heading + padding) vs. per-item/char. */
export const HEADING_OVERHEAD = 56;

/** The page windows a split fills: `first` is the space available where the section starts (the
 *  remainder of the current page when the packer splits-to-fit, or a whole page when a section is
 *  simply taller than one), `rest` is the cap of every later page a continuation lands on. The two
 *  differ whenever a split starts mid-page — sizing every fragment to one shared cap either wastes
 *  the tail of the current page or overflows the next. */
export interface SplitCaps {
  first: number;
  rest: number;
  /** True when `first` is a mid-page remainder (a split-to-fit) rather than a whole page. Enables
   *  the head-orphan guards: a two-row/80-char minimum is good typography for filling the bottom
   *  of a page, but on a whole-page window the same guard would refuse to split a section whose
   *  rows are taller than half a page — reintroducing the clipping the splitters exist to stop.
   *  Whole-page splits keep the old one-item-per-page floor instead. */
  fromRemainder?: boolean;
}

/** Turn one oversized section into its ordered fragments — the first sized to `caps.first`, the
 *  rest to `caps.rest`. A single-element result (the section unchanged) means "couldn't usefully
 *  split" — callers treat that the same as no splitter at all. */
export type FragmentSplitter = (section: Section, caps: SplitCaps) => Section[];

/* ── shared widow-safe chunk sizing ───────────────────────────────────────────────────────────── */

/** Chunk sizes covering `total` items: up to `firstPer` in the opening chunk (the current page's
 *  remaining window), up to `restPer` in each later one (a full page). Widow control: never strand
 *  a lone final item — borrow one back from the previous chunk when it has one to spare, because
 *  an orphaned single row/frame reads as a typesetting mistake. */
function chunkSizes(total: number, firstPer: number, restPer: number): number[] {
  const sizes: number[] = [Math.min(firstPer, total)];
  for (let done = sizes[0]; done < total; done += restPer) {
    sizes.push(Math.min(restPer, total - done));
  }
  if (sizes.length >= 2 && sizes[sizes.length - 1] === 1 && sizes[sizes.length - 2] >= 2) {
    sizes[sizes.length - 1] = 2;
    sizes[sizes.length - 2] -= 1;
  }
  return sizes;
}

/* ── array splitters (rows/items/cells/… archetypes) ──────────────────────────────────────────── */

/** Array-bearing archetypes we can split across pages, with get/set over their item array. */
type Accessor = {
  get: (data: unknown) => unknown[];
  set: (data: unknown, items: unknown[], cont: boolean) => unknown;
};

/** Append the continuation marker exactly once — a fragment that is itself re-split on a later
 *  measure pass (or at a page boundary) must read "X (cont.)", never "X (cont.) (cont.)". */
function contHeading(heading: string): string {
  return heading.endsWith(' (cont.)') ? heading : `${heading} (cont.)`;
}

function listAccessor(key: string, headingKey = 'heading'): Accessor {
  return {
    get: (data) => ((data as Record<string, unknown>)[key] as unknown[]) ?? [],
    set: (data, items, cont) => {
      const d = data as Record<string, unknown>;
      const heading = d[headingKey];
      return {
        ...d,
        [key]: items,
        ...(cont && typeof heading === 'string' ? { [headingKey]: contHeading(heading) } : {}),
      };
    },
  };
}

/** An array-payload splitter over `acc`: chunk its item array to fit the page windows, uniform
 *  per-item height assumed (a fair approximation for rows/tiles/cells of similar size). */
function arraySplitter(acc: Accessor): FragmentSplitter {
  return (s, caps) => {
    const h = s.measuredH ?? 0;
    const items = acc.get(s.data);
    if (items.length <= 1) return [s];
    const perItem = Math.max(1, (h - HEADING_OVERHEAD) / items.length);
    // A whole-page window keeps the one-item-per-page floor (a row taller than half a page still
    // spills page by page rather than clipping); a mid-page remainder may hold zero.
    const firstPer = Math.max(
      caps.fromRemainder ? 0 : 1,
      Math.floor((caps.first - HEADING_OVERHEAD) / perItem),
    );
    const restPer = Math.max(1, Math.floor((caps.rest - HEADING_OVERHEAD) / perItem));
    if (firstPer >= items.length) return [s];
    const sizes = chunkSizes(items.length, firstPer, restPer);
    // Split-to-fit only: a head of fewer than two rows under its heading reads as an orphan — not
    // worth the "(cont.)" it buys. Checked on the FINAL sizes, because the widow borrow above can
    // thin the head (3 rows at 2-per-window chunk to [2,1], then rebalance to [1,2]).
    if (caps.fromRemainder && sizes[0] < 2) return [s];
    const out: Section[] = [];
    for (let i = 0, c = 0; c < sizes.length; i += sizes[c], c += 1) {
      const chunk = items.slice(i, i + sizes[c]);
      out.push({
        ...s,
        id: `${s.id}~${c}`,
        // The cast mirrors `s` (the accessor only ever rebuilds the same archetype's data).
        data: acc.set(s.data, chunk, c > 0) as Section['data'],
        measuredH: HEADING_OVERHEAD + chunk.length * perItem,
        lead: c === 0 ? s.lead : false,
      } as Section);
    }
    return out;
  };
}

/* ── text-fragment splitters (prose / findingCallout / spotlightCard) ─────────────────────────── */

/** How many characters of body text a page cap `capH` can hold, given the section's own measured
 *  height `h` for `totalChars` of that text — the array splitters' "average weight per unit"
 *  estimate, just measured in characters instead of items. The DOM re-measure pass that follows
 *  splitting (see `layoutDoc`) corrects whatever imprecision this rough linear model leaves. */
function targetChars(totalChars: number, h: number, capH: number): number {
  const pxPerChar = Math.max(0.01, (h - HEADING_OVERHEAD) / Math.max(1, totalChars));
  return Math.max(1, Math.floor((capH - HEADING_OVERHEAD) / pxPerChar));
}

/** A sentence-ending boundary: a terminator, an optional closing quote/bracket, then whitespace. */
const SENTENCE_END = /[.!?]["')\]]?\s+/g;

/** The index to cut `text` at, aiming for `target` characters: the last sentence boundary at or
 *  before the target, or — when every boundary falls past it (one very long sentence) — the first
 *  boundary past it, so a fragment still ends cleanly instead of growing without limit. With no
 *  sentence boundary in the text at all, falls back to the nearest word boundary so a cut never
 *  lands mid-word. */
function findCut(text: string, target: number): number {
  let lastBefore = -1;
  SENTENCE_END.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = SENTENCE_END.exec(text))) {
    const end = m.index + m[0].length;
    if (end <= target) {
      lastBefore = end;
    } else {
      return lastBefore >= 0 ? lastBefore : end;
    }
  }
  if (lastBefore >= 0) return lastBefore;
  const before = text.lastIndexOf(' ', target);
  if (before > 0) return before;
  const after = text.indexOf(' ', target);
  if (after > 0) return after;
  return Math.min(text.length, Math.max(1, target)); // no whitespace anywhere — forced hard cut
}

/** The fewest characters a split-to-fit opening fragment is allowed to carry. A couple of words
 *  under a heading, alone at the bottom of a page, reads as an orphan — below this, give up and
 *  let the packer push the section whole. (A whole-page window always clears it by orders of
 *  magnitude.) */
const MIN_FIRST_CHARS = 80;

/** Split `text` into ordered fragments — the first aiming for `firstTarget` characters, later ones
 *  for `restTarget` — breaking at a sentence (or, failing that, a word) boundary, so a long
 *  paragraph/summary spills across continuation fragments without ever cutting mid-word or losing
 *  a single character. */
function cutText(text: string, firstTarget: number, restTarget: number): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const out: string[] = [];
  let rest = trimmed;
  let target = firstTarget;
  // 15% slack absorbs the arithmetic estimate's rounding noise without forcing a near-empty
  // trailing fragment.
  while (rest.length > target * 1.15) {
    const cut = findCut(rest, target);
    const head = rest.slice(0, cut).trim();
    const tail = rest.slice(cut).trim();
    if (!head || tail.length >= rest.length) break; // no real progress — stop rather than loop
    out.push(head);
    rest = tail;
    target = restTarget;
  }
  if (rest) out.push(rest);
  return out;
}

function splitProse(s: Section, caps: SplitCaps): Section[] {
  if (s.kind !== 'prose') return [s];
  const data: ProseData = s.data;
  if (!data.body) return [s];
  const h = s.measuredH ?? 0;
  const firstTarget = targetChars(data.body.length, h, caps.first);
  if (caps.fromRemainder && firstTarget < MIN_FIRST_CHARS) return [s];
  const fragments = cutText(data.body, firstTarget, targetChars(data.body.length, h, caps.rest));
  if (fragments.length <= 1) return [s];
  const pxPerChar = Math.max(0.01, (h - HEADING_OVERHEAD) / Math.max(1, data.body.length));
  return fragments.map((frag, i) => ({
    ...s,
    id: `${s.id}~${i}`,
    data: {
      heading: i === 0 ? data.heading : data.heading ? contHeading(data.heading) : undefined,
      body: frag,
    },
    measuredH: HEADING_OVERHEAD + frag.length * pxPerChar,
    lead: i === 0 ? s.lead : false,
  }));
}

function splitFindingCallout(s: Section, caps: SplitCaps): Section[] {
  if (s.kind !== 'findingCallout') return [s];
  const data: FindingCalloutData = s.data;
  if (!data.summary) return [s];
  const h = s.measuredH ?? 0;
  const firstTarget = targetChars(data.summary.length, h, caps.first);
  if (caps.fromRemainder && firstTarget < MIN_FIRST_CHARS) return [s];
  const fragments = cutText(
    data.summary,
    firstTarget,
    targetChars(data.summary.length, h, caps.rest),
  );
  if (fragments.length <= 1) return [s];
  const pxPerChar = Math.max(0.01, (h - HEADING_OVERHEAD) / Math.max(1, data.summary.length));
  return fragments.map((frag, i) => ({
    ...s,
    id: `${s.id}~${i}`,
    // The first fragment keeps the full header (num/conf/title); a continuation fragment carries
    // only the remaining summary text — `cont` tells the renderer to omit the header block.
    data: i === 0 ? { ...data, summary: frag } : { title: data.title, summary: frag, cont: true },
    measuredH: HEADING_OVERHEAD + frag.length * pxPerChar,
    lead: i === 0 ? s.lead : false,
  }));
}

function splitSpotlightCard(s: Section, caps: SplitCaps): Section[] {
  if (s.kind !== 'spotlightCard') return [s];
  const data: SpotlightCardData = s.data;
  if (!data.body) return [s];
  const h = s.measuredH ?? 0;
  const firstTarget = targetChars(data.body.length, h, caps.first);
  if (caps.fromRemainder && firstTarget < MIN_FIRST_CHARS) return [s];
  const fragments = cutText(data.body, firstTarget, targetChars(data.body.length, h, caps.rest));
  if (fragments.length <= 1) return [s];
  const pxPerChar = Math.max(0.01, (h - HEADING_OVERHEAD) / Math.max(1, data.body.length));
  return fragments.map((frag, i) => ({
    ...s,
    id: `${s.id}~${i}`,
    data: i === 0 ? { ...data, body: frag } : { title: data.title, body: frag, cont: true },
    measuredH: HEADING_OVERHEAD + frag.length * pxPerChar,
    lead: i === 0 ? s.lead : false,
  }));
}

/* ── figure (flow-class) splitter ──────────────────────────────────────────────────────────────── */

/** For a FLOW-class figure (a code-family block whose content grows by line), the prop that holds
 *  its ordered content array — mirrors each type's own declared item shape in
 *  `canvas/blocks/catalog/families/code.ts`, so a code-family type not listed here just stays
 *  atomic (shrinks to fit its frame) rather than being guessed at. FLUID-class figures (charts,
 *  diagrams — viewBox SVG) never reach this map; they are never chunked, only scaled. */
const FLOW_ITEM_PROP: Readonly<Record<string, string>> = {
  stacktrace: 'frames',
  syntaxbreakdown: 'lines',
  codewalk: 'steps',
  terminal: 'lines',
  logstream: 'entries',
  gitgraph: 'commits',
  queryplan: 'nodes',
  flamegraph: 'frames',
  regexscope: 'parts',
  sequencealign: 'sequences',
  componentapi: 'props',
};

function splitFigureFlow(s: Section, caps: SplitCaps): Section[] {
  if (s.kind !== 'figure') return [s];
  const data: FigureData = s.data;
  if (data.embed !== 'flow') return [s]; // fluid figures are atomic — scale, never split
  const prop = FLOW_ITEM_PROP[data.block.type];
  const props = (data.block.props ?? {}) as Record<string, unknown>;
  const items = prop ? props[prop] : undefined;
  if (!Array.isArray(items) || items.length <= 1) return [s];

  const h = s.measuredH ?? 0;
  const perItem = Math.max(1, (h - HEADING_OVERHEAD) / items.length);
  const firstPer = Math.max(
    caps.fromRemainder ? 0 : 1,
    Math.floor((caps.first - HEADING_OVERHEAD) / perItem),
  );
  const restPer = Math.max(1, Math.floor((caps.rest - HEADING_OVERHEAD) / perItem));
  if (firstPer >= items.length) return [s];
  const sizes = chunkSizes(items.length, firstPer, restPer);
  // Same orphan guard as the array splitters — split-to-fit only, on the final sizes.
  if (caps.fromRemainder && sizes[0] < 2) return [s];

  const out: Section[] = [];
  for (let i = 0, c = 0; c < sizes.length; i += sizes[c], c += 1) {
    const chunk = items.slice(i, i + sizes[c]);
    const isLast = c === sizes.length - 1;
    out.push({
      ...s,
      id: `${s.id}~${c}`,
      data: {
        ...data,
        // Real block, real type — only the declared item array shrinks to this page's slice.
        block: { ...data.block, props: { ...props, [prop]: chunk } } as FigureData['block'],
        heading: c === 0 ? data.heading : data.heading ? contHeading(data.heading) : undefined,
        caption: isLast ? data.caption : undefined,
      },
      measuredH: HEADING_OVERHEAD + chunk.length * perItem,
      lead: c === 0 ? s.lead : false,
    } as Section);
  }
  return out;
}

/* ── the registry ──────────────────────────────────────────────────────────────────────────────── */

export const SPLIT_REGISTRY: Partial<Record<SectionKind, FragmentSplitter>> = {
  specTable: arraySplitter(listAccessor('rows')),
  rankedList: arraySplitter(listAccessor('items')),
  checklist: arraySplitter(listAccessor('items')),
  numberedMilestones: arraySplitter(listAccessor('items')),
  verticalTimeline: arraySplitter(listAccessor('events')),
  ratingMatrix: arraySplitter(listAccessor('rows')),
  // Grids/tiles/bars can legitimately run tall on long answers — split them by their item array
  // too, so a 12-tile KPI block or a wide figure grid spills to the next page instead of clipping.
  figureGrid: arraySplitter(listAccessor('cells')),
  metricTiles: arraySplitter(listAccessor('tiles')),
  distributionBars: arraySplitter(listAccessor('bars')),
  prose: splitProse,
  findingCallout: splitFindingCallout,
  spotlightCard: splitSpotlightCard,
  figure: splitFigureFlow,
  // A contents/sources list is just another ruled row array — a document bundling many answers
  // or citing many sources spills the same widow-safe way rankedList does above.
  contents: arraySplitter(listAccessor('items')),
  sourcesAppendix: arraySplitter(listAccessor('items')),
};
