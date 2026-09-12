// layered.ts — the rank-and-column engine DataPipeline, SysArchDiagram, SynthesisRoute and
// DiagramFlow's `layered` mode all draw with.
//
// It works in ARRAY INDICES, never in ids. Keying placement by id meant one missing or repeated
// id collapsed every colliding node onto a single slot: `new Map(placed.map(p => [p.id, p]))`
// kept ONE entry per id, the column loop wrote cx/cy onto that single object, and every other
// node kept its (0,0) seed — a pile of overlapping labels at the SVG origin under a card grown
// one row taller per node, while a single survivor sat alone in the middle. An index is unique
// by construction, so every node is placed exactly once whatever the model wrote. Ids are still
// what edges speak, so they resolve to indices — leniently, since a model routinely writes the
// label it can see where an id belongs.
//
// Shared rather than copied for the reason placement.ts is: the four figures carried the same
// thirty lines each, and fixing one would have left the others drawing the pile.

/** The shape all four figures' nodes share, as far as ranking is concerned. */
export interface Rankable {
  id?: string;
  label?: string;
}

/** One resolved connection, as node indices. Direction decides the columns. */
export interface LayeredLink {
  from: number;
  to: number;
}

export interface LayeredOptions {
  /** The indices this plan is responsible for — the nodes without a placement of their own.
   *  Omit to plan the whole array. */
  placeable?: readonly number[];
  /** The widest the UNRANKED fallback may spread before it wraps onto another row. Omit for no
   *  bound; see `columnsAcross`. */
  maxColumns?: number;
}

export interface LayeredPlan {
  /** Node indices per column, left to right; authored order within a column. */
  readonly columns: readonly (readonly number[])[];
  /** The tallest column — the row count the card's height has to follow. */
  readonly rows: number;
  /** True when nothing ranked and the nodes were laid row-major instead: every column then shares
   *  the same row lines (see `rowFraction`), because a column here is a position in a reading
   *  order, not a depth. */
  readonly grid: boolean;
}

/**
 * Resolve an authored endpoint onto the INDEX of the node it names: exact id first, then
 * case/whitespace drift, then a node's LABEL when that label is unambiguous. Models routinely
 * write `{from: 'Crude oil', to: 'Distillation'}` against ids s1/s2, and an exact-id-only lookup
 * silently dropped every such arrow — a lineage whose flow is gone still LOOKS intact.
 */
export function endpointIndex(nodes: readonly Rankable[]): (endpoint?: string) => number | null {
  const byId = new Map<string, number>();
  const byLoose = new Map<string, number>();
  const byLabel = new Map<string, number | null>();
  nodes.forEach((node, index) => {
    const id = typeof node?.id === 'string' ? node.id.trim() : '';
    if (id) {
      if (!byId.has(id)) byId.set(id, index);
      const loose = id.toLowerCase();
      if (!byLoose.has(loose)) byLoose.set(loose, index);
    }
    const label = typeof node?.label === 'string' ? node.label.trim().toLowerCase() : '';
    // Ambiguous labels (a decision figure's repeated "Yes"/"No") resolve to nothing rather than
    // to whichever node happened to come first.
    if (label) byLabel.set(label, byLabel.has(label) ? null : index);
  });
  return (endpoint?: string): number | null => {
    const key = typeof endpoint === 'string' ? endpoint.trim() : '';
    if (!key) return null;
    const exact = byId.get(key);
    if (exact !== undefined) return exact;
    const lower = key.toLowerCase();
    // Judged before the loose lookup: a node whose id was derived from its label (engine/
    // itemIdentity) has `yes` as its id, and the loose match would otherwise find the first of
    // two "Yes" nodes and call an ambiguous endpoint resolved.
    if (byLabel.get(lower) === null) return null;
    const loose = byLoose.get(lower);
    if (loose !== undefined) return loose;
    return byLabel.get(lower) ?? null;
  };
}

/** Every link whose two ends both resolve, as index pairs. Self-links are dropped: they rank a
 *  node behind itself and draw an arrow of zero length. */
export function resolveLinks<E>(
  links: readonly E[],
  at: (endpoint?: string) => number | null,
  ends: (link: E) => readonly [string | undefined, string | undefined],
): LayeredLink[] {
  const out: LayeredLink[] = [];
  for (const link of links) {
    const [rawFrom, rawTo] = ends(link);
    const from = at(rawFrom);
    const to = at(rawTo);
    if (from === null || to === null || from === to) continue;
    out.push({ from, to });
  }
  return out;
}

/**
 * Columns by longest path over the resolved links (Kahn-style relax, bounded by node count), so
 * a source → transform → transform → sink chain reads left-to-right regardless of authored order
 * and a fan-out still ranks correctly.
 */
export function planLayered(
  count: number,
  links: readonly LayeredLink[],
  { placeable, maxColumns }: LayeredOptions = {},
): LayeredPlan {
  const order = placeable ?? Array.from({ length: count }, (_, i) => i);
  if (order.length === 0) return { columns: [], rows: 1, grid: false };
  const planned = new Set(order);
  const inPlan = links.filter((l) => planned.has(l.from) && planned.has(l.to));

  const rank = new Map<number, number>();
  const grid = inPlan.length === 0;
  if (grid) {
    // Nothing connects. Ranking every node 0 stacks the whole figure into one column and grows
    // the card a row per node — a tall, near-empty picture that says less than the plain
    // left-to-right reading the authored order already gives. A pipeline whose hops did not
    // resolve is still a pipeline.
    //
    // It wraps at `maxColumns` rather than running on: nothing here carries a dependency depth
    // that a row break would misstate, and a row that widens per node scales the picture down
    // until its labels fall under the legibility floor. Row-major, so the authored order still
    // reads left to right.
    const across = Math.max(1, Math.min(order.length, maxColumns ?? order.length));
    order.forEach((index, position) => rank.set(index, position % across));
  } else {
    for (const index of order) rank.set(index, 0);
    for (let pass = 0; pass < order.length; pass++) {
      let moved = false;
      for (const { from, to } of inPlan) {
        const next = (rank.get(from) ?? 0) + 1;
        if (next > (rank.get(to) ?? 0) && next < order.length) {
          rank.set(to, next);
          moved = true;
        }
      }
      if (!moved) break;
    }
  }

  const byRank = new Map<number, number[]>();
  for (const index of order) {
    const r = rank.get(index) ?? 0;
    const column = byRank.get(r);
    if (column) column.push(index);
    else byRank.set(r, [index]);
  }
  const columns = [...byRank.keys()].sort((a, b) => a - b).map((key) => byRank.get(key)!);
  return { columns, rows: columns.reduce((tallest, c) => Math.max(tallest, c.length), 1), grid };
}

/**
 * Where a node sits down its column, as a fraction of the frame's inner height. A ranked column
 * spreads its own members and centres a lone one; a wrapped grid divides every column by the
 * plan's row count instead, so the short last row stays level with the row it continues — under
 * the same divisor a lone node in a two-row grid would sit at the centre, between the rows, while
 * the column beside it split top and bottom.
 */
export function rowFraction(plan: LayeredPlan, column: readonly number[], row: number): number {
  return (row + 0.5) / (plan.grid ? plan.rows : column.length);
}

/**
 * How many columns fit the frame a figure declares, at the spacing its own shapes need — the
 * bound the unranked fallback wraps at.
 *
 * A figure with no flow to draw has no reason to widen the card past its declared frame, and the
 * cost of widening is not cosmetic: the stage scales the whole picture to whatever width the card
 * gives it, so twelve unlinked stages spread across twelve columns measure 2712 units wide and
 * paint their labels at about 4px.
 */
export function columnsAcross(frameW: number, pad: number, spacing: number): number {
  return Math.max(1, Math.floor((frameW - pad * 2) / spacing) + 1);
}
