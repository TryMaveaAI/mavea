// layout.ts — the deterministic space-filling pass for a Live canvas.
//
// A generated answer is just a list of blocks; without a layout pass each one stamps
// a fixed column span regardless of how many siblings it has, which produces exactly
// the failures we kept seeing: a lone block stranded at a third of the width, a tall
// card sitting next to a starved sliver whose text wraps to an unreadable ribbon, and
// ragged rows that leave half the canvas empty.
//
// adaptiveCols rewrites every block's `col` so the grid reads the way a person expects
// a dashboard to read — the principles are deliberate:
//   · FULL ROWS. Every row sums to exactly the column budget, so there is no ragged edge.
//   · EVEN & EQUAL. Within a row, widths are pushed toward equality (6+6, 4+4+4),
//     because balance reads as calm and considered (the aesthetic-usability effect).
//   · NO SLIVERS. A block never drops below its readable minimum, so content never
//     wraps into a vertical ribbon.
//   · FEW VOIDS. Similar-height blocks share a row, so a short card isn't paired with
//     a tall one (which would leave dead space beneath the short one).
//   · VIEWPORT-AWARE. The optional `budget` parameter shrinks the logical column grid
//     for smaller viewports; output cols are always mapped back to CSS 12-col space.
//
// Pure and model-independent: this runs the same for a 3B local answer and a frontier
// one, which is what lets a sparse canvas still feel composed. The catalog supplies
// per-component spans when available; sensible built-in defaults keep it correct on
// its own.
import type { Block } from '../data/conversation';

/** The CSS grid always has 12 tracks; all output `col` values are in this space. */
const CSS_GRID = 12;
/** A row of four is the tightest that stays readable on a wide grid. */
const MAX_PER_ROW = 4;

/** How a block wants to be sized. `height` (0..1) is a rough intrinsic tallness used
 *  only to keep same-height blocks together, never to size them. */
export interface SpanSpec {
  min: number;
  pref: number;
  max: number;
  height: number;
}

/** Look up a block's sizing (e.g. from the component catalog). Any field it omits
 *  falls back to the built-in default for that block type. */
export type SpanLookup = (block: Block) => Partial<SpanSpec> | undefined;

/** Built-in spans for the core renderers, so layout is correct without the catalog.
 *  `pref` mirrors the established grid rhythm; `min` is the readability floor; `height`
 *  groups tall things (a comparison, a timeline) away from short ones (a stat).
 *  All values are in CSS_GRID (12-col) terms. */
export const CORE_SPANS: Record<string, Partial<SpanSpec>> = {
  insight: { min: 4, pref: 4, height: 0.3 },
  kpi: { min: 4, pref: 6, height: 0.3 },
  ring: { min: 4, pref: 5, height: 0.45 },
  gauge: { min: 4, pref: 5, height: 0.45 },
  donut: { min: 4, pref: 5, height: 0.5 },
  breakdown: { min: 4, pref: 6, height: 0.55 },
  stack: { min: 5, pref: 7, height: 0.4 },
  bars: { min: 5, pref: 7, height: 0.6 },
  chart: { min: 6, pref: 8, height: 0.6 },
  scatter: { min: 6, pref: 8, height: 0.6 },
  list: { min: 4, pref: 6, height: 0.55 },
  checklist: { min: 4, pref: 6, height: 0.55 },
  timeline: { min: 6, pref: 8, height: 0.7 },
  flow: { min: 6, pref: 8, height: 0.5 },
  compare: { min: 8, pref: 12, height: 0.8 },
  map: { min: 8, pref: 12, height: 0.8 },
  heat: { min: 8, pref: 12, height: 0.75 },
  gallery: { min: 6, pref: 8, height: 0.7 },
};

/** Default sizing for a block we have no specific knowledge of: a balanced half. */
const FALLBACK: SpanSpec = { min: 4, pref: 6, max: CSS_GRID, height: 0.5 };

function clampSpan(n: number, lo = 1, hi = CSS_GRID): number {
  return Math.min(hi, Math.max(lo, Math.round(n)));
}

/** Resolve a block's full SpanSpec in 12-col terms: catalog override → core default → fallback,
 *  with pref kept ≥ min and within the grid. */
function resolveSpan(block: Block, lookup?: SpanLookup): SpanSpec {
  const type = (block as { type?: string }).type ?? '';
  const base = { ...FALLBACK, ...CORE_SPANS[type], ...(lookup?.(block) ?? {}) };
  const min = clampSpan(base.min ?? FALLBACK.min);
  const max = clampSpan(base.max ?? CSS_GRID);
  const pref = clampSpan(Math.max(min, base.pref ?? FALLBACK.pref), min, max);
  const height = Math.min(1, Math.max(0, base.height ?? FALLBACK.height));
  return { min, pref, max, height };
}

/** Scale a resolved 12-col SpanSpec to a narrower column budget.
 *  All values are scaled proportionally and clamped to [1, budget]. */
function scaleSpec(spec: SpanSpec, budget: number): SpanSpec {
  if (budget === CSS_GRID) return spec;
  const scale = budget / CSS_GRID;
  const min = Math.max(1, Math.round(spec.min * scale));
  const max = budget;
  const pref = Math.min(max, Math.max(min, Math.round(spec.pref * scale)));
  return { min, pref, max, height: spec.height };
}

/** True when adding the candidate to a row that already has substance would mix a
 *  noticeably taller/shorter block in — the cause of dead space under the short one. */
function heightClash(rowSpecs: SpanSpec[], rowWidth: number, cand: SpanSpec): boolean {
  if (rowSpecs.length === 0 || rowWidth < 3) return false;
  for (const s of rowSpecs) {
    if (Math.abs(s.height - cand.height) > 0.45) return true;
  }
  return false;
}

/** Greedily group block indices into rows whose preferred widths fit the column budget,
 *  keeping same-height blocks together and capping a row at maxPerRow cells. */
function groupRows(specs: SpanSpec[], budget: number): number[][] {
  // At narrower budgets fewer items per row keeps things readable
  const maxPerRow = Math.max(2, Math.round((MAX_PER_ROW * budget) / CSS_GRID));
  const rows: number[][] = [];
  let i = 0;
  while (i < specs.length) {
    const row = [i];
    let width = specs[i].pref;
    let j = i + 1;
    while (j < specs.length && row.length < maxPerRow) {
      const next = specs[j];
      if (width + next.pref > budget) break;
      if (
        heightClash(
          row.map((k) => specs[k]),
          width,
          next,
        )
      )
        break;
      row.push(j);
      width += next.pref;
      j++;
    }
    rows.push(row);
    i = j;
  }
  // Eliminate LONE blocks ANYWHERE in the grid — a single card that then justifies to full width
  // with its content stranded in a narrow strip (the void the screenshots kept showing). Fold each
  // lone row into a neighbour so the answer tiles into even 2-/3-/4-up rows ("a third or a half"),
  // and only ever leave a block full-width when nothing may legally share its row.
  const rowMinSum = (row: number[]): number => row.reduce((s, k) => s + specs[k].min, 0);
  // A merged row must still clear every block's readable minimum — this is what keeps a genuinely
  // wide block (a data table, a big chart: min 8+) on its own full-width row instead of being
  // crushed into a pair, while letting ordinary content (min ≤ 6) tile.
  const canShare = (a: number[], b: number[]): boolean =>
    a.length + b.length <= maxPerRow && rowMinSum(a) + rowMinSum(b) <= budget;
  for (let r = 0; r < rows.length; ) {
    if (rows[r].length !== 1) {
      r++;
      continue;
    }
    const next = rows[r + 1];
    const prev = rows[r - 1];
    if (next && canShare(rows[r], next)) {
      // Fold forward → [C] + [D,E] becomes [C,D,E] (justifyRow then equalizes); reading order kept.
      rows.splice(r, 2, [...rows[r], ...next]);
    } else if (prev && canShare(prev, rows[r])) {
      // Fold back → [A,B] + [C] becomes [A,B,C].
      rows.splice(r - 1, 2, [...prev, ...rows[r]]);
      r = Math.max(0, r - 1);
    } else if (prev && prev.length >= 3 && canShare([prev[prev.length - 1]], rows[r])) {
      // Neither whole-row merge fits, but the previous row can spare a cell (stays ≥ 2): borrow its
      // last block to PAIR the orphan — [A,B,C] + [D] becomes [A,B] + [C,D].
      rows[r].unshift(prev.pop() as number);
      r++;
    } else {
      r++;
    }
  }
  return rows;
}

/**
 * Resize one row's blocks so their spans sum to exactly the budget, pushing toward
 * equal widths: slack is handed to the narrowest cell first (which equalizes), and any
 * overflow is taken from the widest cell first — never below a block's readable min.
 */
function justifyRow(specs: SpanSpec[], budget: number): number[] {
  const widths = specs.map((s) => s.pref);
  const total = () => widths.reduce((a, b) => a + b, 0);

  // grow the narrowest cell that can still grow, until the row fills the budget
  for (let guard = 0; total() < budget && guard < 200; guard++) {
    let idx = -1;
    for (let k = 0; k < widths.length; k++) {
      if (widths[k] >= specs[k].max) continue;
      if (idx === -1 || widths[k] < widths[idx]) idx = k;
    }
    if (idx === -1) break; // every cell is at its max
    widths[idx]++;
  }
  // shrink the widest cell that can still shrink, until the row fits the budget
  for (let guard = 0; total() > budget && guard < 200; guard++) {
    let idx = -1;
    for (let k = 0; k < widths.length; k++) {
      if (widths[k] <= specs[k].min) continue;
      if (idx === -1 || widths[k] > widths[idx]) idx = k;
    }
    if (idx === -1) break; // every cell is at its readable min
    widths[idx]--;
  }
  return widths;
}

/**
 * Rewrite every block's `col` so the canvas tiles into full, balanced, sliver-free
 * rows. Never mutates the input; a block whose `col` is already right passes through
 * BY REFERENCE (only re-tiled blocks are cloned). Keeping identity for the unchanged
 * blocks is what lets the canvas's memoized cards skip re-rendering when a stream
 * partial or a viewport re-tile leaves them exactly as they were. An empty list
 * passes through unchanged.
 *
 * The optional `budget` (1–12, default 12) sets the logical column count for the
 * current viewport. The algorithm works in budget-col space; output `col` values are
 * always mapped back to CSS 12-col space so callers never need to know the budget.
 */
export function adaptiveCols(blocks: Block[], lookup?: SpanLookup, budget = CSS_GRID): Block[] {
  if (blocks.length === 0) return blocks;
  const effectiveBudget = Math.max(1, Math.min(CSS_GRID, Math.round(budget)));
  const specs = blocks.map((b) => scaleSpec(resolveSpan(b, lookup), effectiveBudget));
  const cols = blocks.map((b) => b.col);
  for (const row of groupRows(specs, effectiveBudget)) {
    const budgetWidths = justifyRow(
      row.map((i) => specs[i]),
      effectiveBudget,
    );
    row.forEach((i, k) => {
      // Map budget-space span back to CSS 12-col: a span of half the budget = col-6
      cols[i] = clampSpan(Math.round((budgetWidths[k] / effectiveBudget) * CSS_GRID), 1, CSS_GRID);
    });
  }
  return blocks.map((b, i) => (b.col === cols[i] ? b : { ...b, col: cols[i] }));
}
