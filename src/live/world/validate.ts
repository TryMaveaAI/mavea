// world/validate.ts — turn raw model output into a safe WorldSpec, and GROUND it. The world's
// version of why/validate's contract: the model proposes tiers, values, series, and receipts; the
// corpus disposes. Fail-CLOSED throughout — no corpus ⇒ nothing grounds ⇒ an all-T0 world — and
// anything that references an id which doesn't resolve is DROPPED, never guessed (the tourRemap
// philosophy). Structure is gated the same way: a self-link and a link that closes a causal loop are
// both cut, because the engine refuses a cycle rather than resolving it, and each cut is written
// into provenance.notes so it is a fact about the world rather than a silence.
// mapOntoWorld is the follow-up merge: a new turn's world is mapped onto the standing
// one by exact id, then by unique normalized label; an existing grounded fact is never downgraded
// by an incoming ungrounded claim, and mappedFraction tells the caller when too little of a turn
// mapped to trust the merge at all.
import { parseLooseJson } from '../ground/json';
import { makeVerbatimGrounder } from '../ground/verbatim';
import { EMPTY_CORPUS, makeAttributor, textCorpus } from '../ground/evidence';
import type { EvidenceCorpus, EvidenceSource } from '../ground/evidence';
import { shareInQuote, valueInQuote } from '../ground/number';
import { isReal } from '../ground/types';
import type { Receipt, Tier } from '../ground/types';
import { asEdgeRelation } from '../trust/relations';
import {
  EDGE_RECEIPT_CAP,
  collectReceipts,
  deriveEdgeStatus,
  pickReceipt,
  quoteOf,
} from '../trust/receipts';
import type { CausalRole } from '../why/types';
import { humanizeSlug } from './labels';
import { asWorldDomain, parseWorldTime } from './types';
import type {
  WorldDate,
  WorldEdge,
  WorldNode,
  WorldSeries,
  WorldSeriesPoint,
  WorldSpec,
} from './types';

// Re-exported so the world surface keeps importing its evidence vocabulary from one place.
export { deriveEdgeStatus };

const ROLES = new Set<CausalRole>(['root', 'mechanism', 'outcome']);
const TIERS: readonly Tier[] = ['T0', 'T1', 'T2', 'T3'];

// Every cap explicit, so a runaway payload degrades predictably instead of flooding the world.
const TITLE_MAX = 140;
const ID_MAX = 40;
const LABEL_MAX = 120;
const QUOTE_MAX = 240;
const DETAIL_MAX = 240;
const VERB_MAX = 24;
const UNIT_MAX = 12;
const NOTES_CAP = 6;
const NODE_CAP = 16;
const CHILD_CAP = 4;
const EDGE_CAP = 48;
const SERIES_POINT_CAP = 40;
const SERIES_T_MAX = 24;
const SLUG_MAX = 24;

function str(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (!s) return null;
  return s.length > max ? s.slice(0, max) : s;
}

const clampWeight = (w: number): number => (w < 0 ? 0 : w > 1 ? 1 : w);

/** A child's id fragment: lowercase alphanumeric runs joined by '-', or '' when nothing survives. */
function slugOf(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX)
    .replace(/-+$/, '');
}

/** One time label, verbatim or not at all. Unlike every other field here it is NOT truncated to its
 *  cap: chopping a timestamp changes the instant it names (a lost offset is hours), so an over-long
 *  label is refused rather than trimmed into a different, plausible date. */
function timeLabel(v: unknown): { label: string; at: number } | null {
  if (typeof v !== 'string') return null;
  const label = v.trim();
  if (!label || label.length > SERIES_T_MAX) return null;
  const at = parseWorldTime(label);
  return at === null ? null : { label, at };
}

/** How the coercer reads the corpus: whether a quote is really in it, and — when the corpus kept
 *  its sources apart — which one it was really in. The two travel together everywhere, because a
 *  receipt is only honest when both questions were answered by Mavéa rather than by the model. */
interface Evidence {
  holds: (quote: string) => boolean;
  sourceOf: (quote: string) => EvidenceSource | null;
}

/** A node's own date, and the evidence for it. It must READ as a time, or the timeline would shelve
 *  it while the gate claimed it was placeable. A bare string is accepted as the instant form
 *  (`"2008"`), which is how a model usually writes one; an `until` that is not strictly after `t` is
 *  not a period and is dropped. A date that nothing backs still places the node — the model's own
 *  knowledge of when things happened is usually right — but it says so, because on the timeline the
 *  node's POSITION is the claim and an unbacked one must not read like a measured one. */
function coerceDate(
  raw: unknown,
  ev: Evidence,
  /** The node's OWN verified receipt, which is usually what dates it: a source writes "In September
   *  2008 Lehman filed" once, and that one sentence backs both the cause and its place in time. The
   *  model is asked for `date` as a bare string (see explode's schema note — it never emits the
   *  object form), so this is in practice the only way a date is ever backed. */
  own: { quote: string; tier: Tier } | null,
): WorldDate | undefined {
  const r = typeof raw === 'string' ? { t: raw } : raw;
  if (!r || typeof r !== 'object' || Array.isArray(r)) return undefined;
  const o = r as Record<string, unknown>;
  const start = timeLabel(o.t);
  if (!start) return undefined;
  const end = timeLabel(o.until);

  // Gated like a value's: the quote must be in the corpus AND must actually contain the label being
  // claimed. A sentence that grounds but never says "2007" dates nothing — it would put the node on
  // the axis at a year no source ever attached to it, which is the whole failure this closes.
  const ownTier: Tier = TIERS.includes(o.tier as Tier) ? (o.tier as Tier) : 'T0';
  const ownQuote = str(o.quote, QUOTE_MAX);
  const candidate =
    isReal(ownTier) && ownQuote
      ? { quote: ownQuote, tier: ownTier, receipt: o.receipt }
      : own
        ? { ...own, receipt: undefined }
        : null;
  const dated =
    candidate && candidate.quote.includes(start.label) && ev.holds(candidate.quote)
      ? {
          tier: candidate.tier,
          receipt: pickReceipt(candidate.receipt, candidate.quote, ev.sourceOf(candidate.quote)),
        }
      : { tier: 'T0' as Tier };

  return {
    t: start.label,
    ...(end && end.at > start.at ? { until: end.label } : {}),
    ...dated,
  };
}

/** The why-node field set + detail, gated exactly like why/validate's node loop: a claimed T1/T2
 *  figure needs a verbatim quote containing its own digits; a claimed T3 figure needs the world's
 *  illustrative opt-in; everything ungrounded demotes to T0 with the number stripped. */
function coerceNodeCore(
  r: Record<string, unknown>,
  label: string,
  ev: Evidence,
  illustrative: boolean,
): Omit<WorldNode, 'id' | 'series' | 'children'> {
  const role: CausalRole = ROLES.has(r.role as CausalRole) ? (r.role as CausalRole) : 'mechanism';
  const depth =
    typeof r.depth === 'number' && Number.isFinite(r.depth)
      ? Math.max(0, Math.round(r.depth))
      : role === 'root'
        ? 0
        : role === 'outcome'
          ? 2
          : 1;
  let tier: Tier = TIERS.includes(r.tier as Tier) ? (r.tier as Tier) : 'T0';
  let value = typeof r.value === 'number' && Number.isFinite(r.value) ? r.value : undefined;
  const unit = str(r.unit, UNIT_MAX) ?? undefined;
  const detail = str(r.detail, DETAIL_MAX) ?? undefined;
  const domain = asWorldDomain(r.domain);
  const quote = quoteOf(r);
  let receipt: Receipt | undefined;

  if (isReal(tier)) {
    if (quote && ev.holds(quote)) {
      receipt = pickReceipt(r.receipt, quote, ev.sourceOf(quote));
      if (value !== undefined && !valueInQuote(value, quote)) value = undefined;
    } else {
      tier = 'T0'; // claimed real but ungrounded → demote, strip the number
      value = undefined;
    }
  } else if (tier === 'T3') {
    if (!illustrative || value === undefined) {
      tier = 'T0';
      value = undefined;
    }
  } else {
    value = undefined; // T0 carries no number
  }

  // After the node's own receipt is settled, because that receipt is what usually dates it.
  const date = coerceDate(
    r.date,
    ev,
    receipt && isReal(tier) ? { quote: receipt.quote, tier } : null,
  );

  return {
    label,
    role,
    depth,
    tier,
    ...(value !== undefined ? { value } : {}),
    ...(unit ? { unit } : {}),
    ...(receipt ? { receipt } : {}),
    ...(detail ? { detail } : {}),
    ...(date ? { date } : {}),
    ...(domain ? { domain } : {}),
  };
}

/** Ground a proposed series. Real (T1/T2) points each earn their own receipt — verbatim quote with
 *  the point's digits inside it — and a fabricated point is stripped, never averaged in. A T3
 *  series exists only in an illustrative world; a T0 (or unrecognized) tier can't carry a series at
 *  all. A series with no surviving points is no series. */
function coerceSeries(raw: unknown, ev: Evidence, illustrative: boolean): WorldSeries | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const r = raw as Record<string, unknown>;
  const tier: Tier = TIERS.includes(r.tier as Tier) ? (r.tier as Tier) : 'T0';
  if (tier === 'T0') return undefined;
  if (tier === 'T3' && !illustrative) return undefined;
  const unit = str(r.unit, UNIT_MAX) ?? undefined;
  const seriesQuote = quoteOf(r);
  const receipt =
    isReal(tier) && seriesQuote && ev.holds(seriesQuote)
      ? pickReceipt(r.receipt, seriesQuote)
      : undefined;

  const points: WorldSeriesPoint[] = [];
  for (const rp of Array.isArray(r.points) ? r.points : []) {
    if (points.length >= SERIES_POINT_CAP) break;
    if (!rp || typeof rp !== 'object') continue;
    const p = rp as Record<string, unknown>;
    const t = str(p.t, SERIES_T_MAX);
    const value = typeof p.value === 'number' && Number.isFinite(p.value) ? p.value : undefined;
    if (!t || value === undefined) continue;
    if (isReal(tier)) {
      const q = quoteOf(p);
      if (!q || !ev.holds(q) || !valueInQuote(value, q)) continue;
      points.push({ t, value, receipt: pickReceipt(p.receipt, q, ev.sourceOf(q)) });
    } else {
      points.push({ t, value }); // T3 — caveated at world level, no receipt to wear
    }
  }
  if (points.length === 0) return undefined;
  return { points, tier, ...(unit ? { unit } : {}), ...(receipt ? { receipt } : {}) };
}

/** One level of children, force-namespaced `${parent}.${slug}` (idempotent when the id already
 *  carries the prefix), capped at CHILD_CAP, duplicates first-wins. Grandchildren are dropped —
 *  depth-1 only. */
function coerceChildren(
  raw: unknown,
  parentId: string,
  ev: Evidence,
  illustrative: boolean,
): WorldNode[] {
  const out: WorldNode[] = [];
  const seen = new Set<string>();
  for (const rc of Array.isArray(raw) ? raw : []) {
    if (out.length >= CHILD_CAP) break;
    if (!rc || typeof rc !== 'object') continue;
    const r = rc as Record<string, unknown>;
    const proposed = str(r.id, ID_MAX) ?? str(r.label, LABEL_MAX);
    if (!proposed) continue;
    const local = proposed.startsWith(`${parentId}.`)
      ? proposed.slice(parentId.length + 1)
      : proposed;
    const slug = slugOf(local);
    if (!slug) continue;
    const id = `${parentId}.${slug}`;
    if (seen.has(id)) continue;
    seen.add(id);
    // A slug is an ID, not a name. Where a child arrived without a label, its words are read out of
    // the id rather than printed as one — otherwise a card says "consumer-switch-to-digit" beside a
    // sibling that says "Digital imaging displaced consumer demand for film". And read out of `local`,
    // not `slug`: slugOf caps at SLUG_MAX (24) because an id has to stay short and stable, which is
    // what chopped that label mid-word. A label the model DID write is used verbatim — "Alt-A" and
    // "Third-party retail expansion" mean their hyphens.
    const label = str(r.label, LABEL_MAX) ?? humanizeSlug(local);
    const series = coerceSeries(r.series, ev, illustrative);
    out.push({
      id,
      ...coerceNodeCore(r, label, ev, illustrative),
      ...(series ? { series } : {}),
    });
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * The acyclic guard. A causal web is a DAG or it is nothing: why/engine's topoOrder REFUSES a cycle
 * rather than resolving it to an arbitrary fixed point, so one back-edge leaves every lever dead and
 * nothing on screen saying why. The gate breaks the loop instead — and writes the break down, so a
 * dropped link is a fact about the world rather than a silence.
 * ------------------------------------------------------------------ */

type Link = Pick<WorldEdge, 'from' | 'to'>;

/** True when every node can be ordered — Kahn, as a detector only. O(V+E), and the common (already
 *  acyclic) path pays nothing beyond it. */
function isAcyclic(ids: readonly string[], edges: readonly Link[]): boolean {
  const indeg = new Map<string, number>(ids.map((id) => [id, 0]));
  const out = new Map<string, string[]>(ids.map((id) => [id, []]));
  for (const e of edges) {
    // An edge to or from an id that is not a node is ignored, exactly as topoOrder ignores it — it
    // is already unreachable, and counting it would make an ordinary web look cyclic.
    const from = out.get(e.from);
    if (!from || !indeg.has(e.to)) continue;
    indeg.set(e.to, indeg.get(e.to)! + 1);
    from.push(e.to);
  }
  // Seeded from the id ROSTER rather than the argument, so a repeated id cannot be ordered twice
  // and make an acyclic web look cyclic.
  const queue = [...out.keys()].filter((id) => indeg.get(id) === 0);
  let ordered = 0;
  for (let head = 0; head < queue.length; head += 1) {
    ordered += 1;
    for (const to of out.get(queue[head])!) {
      const left = indeg.get(to)! - 1;
      indeg.set(to, left);
      if (left === 0) queue.push(to);
    }
  }
  return ordered === out.size;
}

/** The indices of the edges that CLOSE a loop, found by one depth-first walk: an edge into a node
 *  still on the stack is a back-edge, and removing exactly those leaves a DAG. Iterative, so a long
 *  chain cannot overflow the stack. O(V+E). */
function backEdges(ids: readonly string[], edges: readonly Link[]): Set<number> {
  const out = new Map<string, number[]>(ids.map((id) => [id, []]));
  edges.forEach((e, i) => {
    const from = out.get(e.from);
    if (from && out.has(e.to)) from.push(i); // an edge off the roster can close nothing
  });
  const OPEN = 1;
  const DONE = 2;
  const state = new Map<string, number>();
  const back = new Set<number>();
  for (const root of ids) {
    if (state.has(root)) continue;
    state.set(root, OPEN);
    const stack: Array<{ id: string; next: number }> = [{ id: root, next: 0 }];
    while (stack.length > 0) {
      const frame = stack[stack.length - 1];
      const outgoing = out.get(frame.id)!;
      if (frame.next >= outgoing.length) {
        state.set(frame.id, DONE);
        stack.pop();
        continue;
      }
      const i = outgoing[frame.next];
      frame.next += 1;
      const { to } = edges[i];
      const seen = state.get(to);
      if (seen === OPEN) back.add(i);
      else if (seen === undefined) {
        state.set(to, OPEN);
        stack.push({ id: to, next: 0 });
      }
    }
  }
  return back;
}

/** Up to three of the dropped links, named the way the reader sees them (`from → to`). */
const namedLinks = (links: readonly Link[]): string => {
  const shown = links.slice(0, 3).map((e) => `${e.from} → ${e.to}`);
  return links.length > shown.length
    ? `${shown.join(', ')}, +${links.length - shown.length} more`
    : shown.join(', ');
};

/** Break every cycle in a coerced edge list, returning the surviving edges and a note per drop. */
function enforceAcyclic<E extends Link>(
  ids: readonly string[],
  edges: readonly E[],
): { edges: E[]; notes: string[] } {
  if (isAcyclic(ids, edges)) return { edges: [...edges], notes: [] };
  const dropped = backEdges(ids, edges);
  const cut = edges.filter((_, i) => dropped.has(i));
  return {
    edges: edges.filter((_, i) => !dropped.has(i)),
    notes: [
      `Dropped ${cut.length} link${cut.length === 1 ? '' : 's'} that closed a causal loop (${namedLinks(cut)}) — a causal web cannot come back round to its own cause.`,
    ],
  };
}

/** The note for the self-links the edge loop refused. Separate from the cycle note because it is a
 *  different mistake: a one-node loop is a model restating a process, not a feedback claim. */
const selfLinkNote = (links: readonly Link[]): string[] =>
  links.length === 0
    ? []
    : [
        `Dropped ${links.length} self-link${links.length === 1 ? '' : 's'} (${namedLinks(links)}) — nothing causes itself.`,
      ];

/** The world's notes, with the gate's own structural record kept: a model can write NOTES_CAP notes
 *  of its own, and what the gate had to change to make the web hold outranks them. */
function withStructuralNotes(
  authored: readonly string[] | undefined,
  structural: readonly string[],
): string[] | undefined {
  const room = Math.max(0, NOTES_CAP - structural.length);
  const notes = [...(authored ?? []).slice(0, room), ...structural];
  return notes.length > 0 ? notes.slice(0, NOTES_CAP) : undefined;
}

/**
 * Parse + ground a WorldSpec from raw model output. Returns null when unsalvageable (no title,
 * <2 nodes). `corpus` is the parked evidence; pass '' or EMPTY_CORPUS for a from-knowledge world,
 * which correctly yields an all-T0 (qualitative) result. A bare string still works and simply has
 * no source provenance to attribute a quote to — the receipt then keeps whatever it was given. Edges may only reference TOP-LEVEL node
 * ids — a child is a breakdown, not a causal actor — and anything referencing an unknown id is
 * dropped, never rewired.
 */
export function coerceWorldSpec(raw: unknown, corpus: EvidenceCorpus | string): WorldSpec | null {
  const parsed = typeof raw === 'string' ? parseLooseJson(raw) : raw;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const o = parsed as Record<string, unknown>;

  const title = str(o.title, TITLE_MAX);
  if (!title) return null;

  const prov = (o.provenance && typeof o.provenance === 'object' ? o.provenance : {}) as Record<
    string,
    unknown
  >;
  const evidence = typeof corpus === 'string' ? textCorpus(corpus) : (corpus ?? EMPTY_CORPUS);
  // Illustrative when the MODEL said so — or when the corpus cannot ground anything, which is the
  // same fact arrived at from the other side and is Mavéa's to decide rather than the model's.
  //
  // A world built where no source carries a quotable sentence IS an explanation from general
  // knowledge; that is what illustrative means. Saying so lets a well-known textbook figure survive
  // behind the banner instead of being stripped to a bare label, and every one of them is typed
  // `illustrative` downstream, drawn in its own ink, and counted as "every cause" rather than as
  // evidence. The alternative was not honesty — it was a shape with the numbers deleted and no
  // statement anywhere that they had been.
  //
  // This has to be decided HERE, before the node loop: the value is passed into every coercer, and
  // by the time coercion has finished a T3 figure has already been demoted and its series dropped.
  const illustrative = prov.illustrative === true || !evidence.quotable;
  const ev: Evidence = {
    holds: makeVerbatimGrounder(evidence.text),
    sourceOf: makeAttributor(evidence),
  };

  const nodes: WorldNode[] = [];
  const seenIds = new Set<string>();
  for (const rn of Array.isArray(o.nodes) ? o.nodes : []) {
    if (nodes.length >= NODE_CAP) break;
    if (!rn || typeof rn !== 'object') continue;
    const r = rn as Record<string, unknown>;
    const id = str(r.id, ID_MAX);
    const label = str(r.label, LABEL_MAX);
    // A label that PAINTS nothing (U+200B is not whitespace, so it survives every trim) is caught at
    // the render layer instead — world/labels' readableLabel names it. Not here, because a scenario
    // and a demo corpus are authored and never pass through this gate, so the render layer is the only
    // place that covers both; and `edge-label-degenerates` exists to prove the layout survives one.
    if (!id || !label || seenIds.has(id)) continue; // duplicate — first wins
    seenIds.add(id);
    const series = coerceSeries(r.series, ev, illustrative);
    const children = coerceChildren(r.children, id, ev, illustrative);
    nodes.push({
      id,
      ...coerceNodeCore(r, label, ev, illustrative),
      ...(series ? { series } : {}),
      ...(children.length ? { children } : {}),
    });
  }
  if (nodes.length < 2) return null;
  const ids = new Set(nodes.map((n) => n.id));

  const edges: WorldEdge[] = [];
  const selfLinks: Link[] = [];
  for (const re of Array.isArray(o.edges) ? o.edges : []) {
    if (edges.length >= EDGE_CAP) break;
    if (!re || typeof re !== 'object') continue;
    const r = re as Record<string, unknown>;
    const from = str(r.from, ID_MAX);
    const to = str(r.to, ID_MAX);
    if (!from || !to || !ids.has(from) || !ids.has(to)) continue;
    if (from === to) {
      selfLinks.push({ from, to });
      continue;
    }
    const sign: 1 | -1 = r.sign === -1 ? -1 : 1;
    const verb = str(r.verb, VERB_MAX) ?? undefined;
    const relation = r.relation == null ? undefined : asEdgeRelation(r.relation);
    let tier: Tier = TIERS.includes(r.tier as Tier) ? (r.tier as Tier) : 'T0';
    let weight =
      typeof r.weight === 'number' && Number.isFinite(r.weight) ? clampWeight(r.weight) : undefined;
    const receipts = collectReceipts(r, ev.holds, ev.sourceOf);
    let provisional = false;

    // A weight is a MEASUREMENT and needs the same proof a node's value needs: a quote that says
    // the number. Receipts alone only prove the SENTENCE is real, and "low rates contributed to the
    // boom" backs no particular share of anything — yet the graph drew the link thicker for it and
    // the contribution ribbons sized themselves by it, which is an orphan pixel with a citation
    // stapled to it. A share is checked in both the forms a source writes one (`shareInQuote`).
    //
    // A node's value HAS an illustrative path (content/value hedges a T3 magnitude rather than
    // dropping it) and a weight deliberately does not, which is why Contribution is unreachable on a
    // from-knowledge world. That asymmetry is not an oversight to patch here: the prompt forbids an
    // illustrative share in the first place, so exempting one would be dead code — and permitting one
    // means asking a model to invent proportions, which is a product decision about honesty rather
    // than a gate to loosen. A world with nothing measured shows the causal web and withholds the
    // ribbons, which is the honest reading of it.
    const claimed = weight;
    if (claimed !== undefined && !receipts.some((rc) => shareInQuote(claimed, rc.quote))) {
      weight = undefined;
    }

    if (!(isReal(tier) && weight !== undefined && receipts.length > 0)) {
      tier = 'T0'; // ungrounded link → qualitative, faint, no weight — the why rule
      weight = undefined;
      provisional = true;
    }

    // The counter-receipt is verified exactly like a support receipt; an ungrounded one vanishes.
    const rawCounter = r.counter && typeof r.counter === 'object' ? r.counter : null;
    const counterQuote = rawCounter
      ? str((rawCounter as Record<string, unknown>).quote, QUOTE_MAX)
      : null;
    const counter =
      counterQuote && ev.holds(counterQuote)
        ? pickReceipt(rawCounter, counterQuote, ev.sourceOf(counterQuote))
        : undefined;

    edges.push({
      from,
      to,
      sign,
      tier,
      ...(verb ? { verb } : {}),
      ...(weight !== undefined ? { weight } : {}),
      ...(receipts.length ? { receipt: receipts[0], receipts } : {}),
      ...(provisional ? { provisional: true } : {}),
      ...(relation ? { relation } : {}),
      ...(counter ? { counter } : {}),
      status: deriveEdgeStatus({ tier, weight, receipt: receipts[0], receipts, counter }),
    });
  }

  // A cycle is refused by the engine, not resolved, so a world that keeps one arrives on screen with
  // every lever dead. Break it here instead, and record both structural drops in the provenance.
  const acyclic = enforceAcyclic([...ids], edges);

  let outcomeId = str(o.outcomeId, ID_MAX);
  if (!outcomeId || !ids.has(outcomeId)) {
    const outcome =
      nodes.find((n) => n.role === 'outcome') ??
      nodes.reduce((a, b) => (b.depth > a.depth ? b : a));
    outcomeId = outcome.id;
  }

  const authored = Array.isArray(prov.notes) ? prov.notes.map((n) => String(n)) : undefined;
  const notes = withStructuralNotes(authored, [...selfLinkNote(selfLinks), ...acyclic.notes]);
  return {
    title,
    outcomeId,
    nodes,
    edges: acyclic.edges,
    provenance: {
      ...(illustrative ? { illustrative: true } : {}),
      ...(notes ? { notes } : {}),
    },
  };
}

/* ------------------------------------------------------------------ *
 * Follow-up mapping — a new turn's WorldSpec lands ON the standing world, it never replaces it
 * wholesale. Identity resolves by exact id, then by unique normalized label; what can't resolve is
 * either appended (a genuinely new node, within the caps) or dropped (an edge/series/child whose
 * anchor is gone). The honesty rule carries through: merging never lets an ungrounded incoming
 * claim overwrite an existing grounded one.
 * ------------------------------------------------------------------ */

const normLabel = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, '');

interface IncomingResolution {
  /** Incoming node id → its id in the merged world. Absent = the node was dropped. */
  idMap: Map<string, string>;
  /** Incoming ids that landed ON an existing node (exact id or unique-label). */
  matched: Set<string>;
  /** Genuinely new incoming nodes, with their collision-checked final ids. */
  fresh: { node: WorldNode; id: string }[];
}

function resolveIncoming(existing: WorldSpec, incoming: WorldSpec): IncomingResolution {
  const existingIds = new Set(existing.nodes.map((n) => n.id));
  const idsByLabel = new Map<string, string[]>();
  for (const n of existing.nodes) {
    const key = normLabel(n.label);
    const list = idsByLabel.get(key);
    if (list) list.push(n.id);
    else idsByLabel.set(key, [n.id]);
  }

  const idMap = new Map<string, string>();
  const matched = new Set<string>();
  const claimed = new Set<string>();
  const fresh: IncomingResolution['fresh'] = [];
  // Ids a fresh node may not reuse: top-level ids AND child ids — a child never matches by id
  // (it is a breakdown, not a peer), but a new top-level node landing on its id would collide.
  const taken = new Set(existingIds);
  for (const n of existing.nodes) for (const c of n.children ?? []) taken.add(c.id);
  for (const inc of incoming.nodes) {
    if (idMap.has(inc.id)) continue; // duplicate incoming id — first wins
    let target = existingIds.has(inc.id) ? inc.id : null;
    if (!target) {
      // The label rescue is UNIQUE-match only: two existing nodes sharing a normalized label is
      // ambiguity, and ambiguity means "new node", never a guess.
      const hits = idsByLabel.get(normLabel(inc.label));
      if (hits && hits.length === 1) target = hits[0];
    }
    if (target) {
      if (claimed.has(target)) continue; // two incoming claiming one node — first wins
      claimed.add(target);
      idMap.set(inc.id, target);
      matched.add(inc.id);
      continue;
    }
    if (existing.nodes.length + fresh.length >= NODE_CAP) continue; // the world stays bounded
    let id = inc.id;
    for (let i = 2; taken.has(id); i += 1) id = `${inc.id}-${i}`;
    taken.add(id);
    idMap.set(inc.id, id);
    fresh.push({ node: inc, id });
  }
  return { idMap, matched, fresh };
}

/** The fraction of the incoming turn's nodes that mapped onto the EXISTING world (0..1). Callers
 *  discard a merge below their threshold — an incoming world that barely maps is a different
 *  subject, not a follow-up. An empty incoming maps nothing (0): the gate fails closed. */
export function mappedFraction(existing: WorldSpec, incoming: WorldSpec): number {
  if (incoming.nodes.length === 0) return 0;
  return resolveIncoming(existing, incoming).matched.size / incoming.nodes.length;
}

/** A node whose tier claim is backed by a receipt — the shape the no-downgrade rule keys on. */
const isGroundedNode = (n: Pick<WorldNode, 'tier' | 'receipt'>): boolean =>
  isReal(n.tier) && !!n.receipt;

/** Prefer the incoming series only when it is at least as grounded as the standing one. */
function pickSeries(base?: WorldSeries, inc?: WorldSeries): WorldSeries | undefined {
  if (!inc) return base;
  if (!base) return inc;
  return isReal(inc.tier) || !isReal(base.tier) ? inc : base;
}

/** Merge one incoming node onto its standing counterpart. Identity (id/label/role/depth) is the
 *  standing node's; the measured core (tier/value/unit/receipt) is adopted from the incoming node
 *  only when IT is grounded — an ungrounded follow-up claim never erases a receipted fact. Series,
 *  children, and detail attach. */
function mergeNodeCore(base: WorldNode, inc: WorldNode): Omit<WorldNode, 'children'> {
  const adopt = isGroundedNode(inc) ? inc : base;
  const series = pickSeries(base.series, inc.series);
  const detail = inc.detail ?? base.detail;
  // A date is not a measured claim, so the no-downgrade rule does not apply to it: a follow-up that
  // finally dates a standing node is the whole point, and it can only ever add one.
  const date = inc.date ?? base.date;
  // Same reasoning for the domain: a category is a description, not a measurement, so a follow-up
  // that finally places a node in one is an addition rather than a downgrade.
  const domain = inc.domain ?? base.domain;
  return {
    id: base.id,
    label: base.label,
    role: base.role,
    depth: base.depth,
    tier: adopt.tier,
    ...(adopt.value !== undefined ? { value: adopt.value } : {}),
    ...(adopt.unit ? { unit: adopt.unit } : {}),
    ...(adopt.receipt ? { receipt: adopt.receipt } : {}),
    ...(date ? { date } : {}),
    ...(series ? { series } : {}),
    ...(detail ? { detail } : {}),
    ...(domain ? { domain } : {}),
  };
}

/** Children merged by id, rebased from the incoming parent's namespace onto the merged one (a
 *  label-rescued parent changes its children's prefix). Same no-downgrade rule per child; new
 *  children append within the cap; a child whose slug dissolves is dropped. */
function mergeChildren(
  base: WorldNode[] | undefined,
  inc: WorldNode[] | undefined,
  oldParent: string,
  newParent: string,
): WorldNode[] | undefined {
  const out = base ? [...base] : [];
  const slot = new Map(out.map((c, i) => [c.id, i] as const));
  for (const c of inc ?? []) {
    const local = c.id.startsWith(`${oldParent}.`)
      ? c.id.slice(oldParent.length + 1)
      : (c.id.split('.').pop() ?? '');
    const slug = slugOf(local);
    if (!slug) continue;
    const id = `${newParent}.${slug}`;
    const { children: _grandchildren, ...flat } = c; // depth-1 invariant survives the merge too
    const rebased: WorldNode = { ...flat, id };
    const i = slot.get(id);
    if (i !== undefined) {
      out[i] = mergeNodeCore(out[i], rebased);
    } else if (out.length < CHILD_CAP) {
      slot.set(id, out.length);
      out.push(rebased);
    }
  }
  return out.length ? out : undefined;
}

function mergeNode(base: WorldNode, inc: WorldNode): WorldNode {
  const children = mergeChildren(base.children, inc.children, inc.id, base.id);
  return { ...mergeNodeCore(base, inc), ...(children ? { children } : {}) };
}

const receiptsOf = (e: WorldEdge): Receipt[] => e.receipts ?? (e.receipt ? [e.receipt] : []);

/** Merge an incoming edge onto the standing one between the same nodes: the claim (tier/weight/
 *  sign/verb/relation) is adopted from the incoming edge only when it is receipted and the
 *  standing one is bare; receipts union (by quote, capped) and the status is re-derived. */
function mergeEdge(base: WorldEdge, inc: WorldEdge): WorldEdge {
  const baseR = receiptsOf(base);
  const incR = receiptsOf(inc);
  const adopt = incR.length > 0 && baseR.length === 0 ? inc : base;
  const other = adopt === inc ? base : inc;
  const receipts: Receipt[] = [];
  const seen = new Set<string>();
  for (const r of [...receiptsOf(adopt), ...receiptsOf(other)]) {
    if (receipts.length >= EDGE_RECEIPT_CAP || seen.has(r.quote)) continue;
    seen.add(r.quote);
    receipts.push(r);
  }
  const relation = adopt.relation ?? other.relation;
  const counter = adopt.counter ?? other.counter;
  return {
    from: base.from,
    to: base.to,
    sign: adopt.sign,
    tier: adopt.tier,
    ...(adopt.verb ? { verb: adopt.verb } : {}),
    ...(adopt.weight !== undefined ? { weight: adopt.weight } : {}),
    ...(receipts.length ? { receipt: receipts[0], receipts } : {}),
    ...(adopt.provisional ? { provisional: true } : {}),
    ...(relation ? { relation } : {}),
    ...(counter ? { counter } : {}),
    status: deriveEdgeStatus({
      tier: adopt.tier,
      ...(adopt.weight !== undefined ? { weight: adopt.weight } : {}),
      ...(receipts.length ? { receipt: receipts[0], receipts } : {}),
      ...(counter ? { counter } : {}),
    }),
  };
}

/**
 * Map an incoming turn's world onto the standing one. The standing world's identity — title (the
 * blockSignature key), outcome, illustrative flag — is pinned; matched nodes merge under the
 * no-downgrade rule, genuinely new nodes append with collision-checked ids, and every incoming
 * edge/series/child whose reference cannot be resolved is dropped, never guessed. The merged web is
 * put back through the acyclic guard, which is the only thing the standing provenance gains. Pure:
 * both inputs untouched.
 */
export function mapOntoWorld(existing: WorldSpec, incoming: WorldSpec): WorldSpec {
  const { idMap, fresh } = resolveIncoming(existing, incoming);
  const incById = new Map(incoming.nodes.map((n) => [n.id, n]));

  const nodes = [...existing.nodes];
  const slotById = new Map(existing.nodes.map((n, i) => [n.id, i] as const));
  for (const [incId, target] of idMap) {
    const slot = slotById.get(target);
    if (slot === undefined) continue; // a fresh node — appended below
    const inc = incById.get(incId);
    if (inc) nodes[slot] = mergeNode(nodes[slot], inc);
  }
  for (const { node, id } of fresh) {
    const { children: _stale, ...flat } = node;
    const children = mergeChildren(undefined, node.children, node.id, id);
    nodes.push({ ...flat, id, ...(children ? { children } : {}) });
  }

  const edges = [...existing.edges];
  // NUL-separated pair key: an id can contain anything but NUL, so two different from/to pairs can
  // never collapse onto one key (the explode cache-key precedent).
  const edgeSlot = new Map<string, number>(existing.edges.map((e, i) => [`${e.from}\0${e.to}`, i]));
  // An edge endpoint resolves through the incoming node map first, then as an EXACT standing
  // top-level id (a follow-up may point at a node it didn't bother re-declaring). Anything else
  // is unresolvable and the edge is dropped, never guessed.
  const resolveRef = (ref: string): string | undefined =>
    idMap.get(ref) ?? (slotById.has(ref) ? ref : undefined);
  for (const e of incoming.edges) {
    const from = resolveRef(e.from);
    const to = resolveRef(e.to);
    if (!from || !to || from === to) continue;
    const key = `${from}\0${to}`;
    const slot = edgeSlot.get(key);
    if (slot !== undefined) {
      edges[slot] = mergeEdge(edges[slot], { ...e, from, to });
    } else if (edges.length < EDGE_CAP) {
      edgeSlot.set(key, edges.length);
      edges.push({ ...e, from, to });
    }
  }
  // Every merged edge resolves by construction: idMap only ever points at an existing node or a
  // fresh one that made it into `nodes` — an over-cap fresh node never enters idMap at all.
  //
  // The merge is a SECOND way into the world, so it re-runs the acyclic guard: both sides can be
  // perfectly acyclic on their own and still close a loop together (the standing world has a → b,
  // the follow-up adds b → a), and nothing downstream coerces this output again.
  const acyclic = enforceAcyclic(
    nodes.map((n) => n.id),
    edges,
  );
  const notes = withStructuralNotes(existing.provenance.notes, acyclic.notes);
  return {
    title: existing.title,
    outcomeId: existing.outcomeId,
    nodes,
    edges: acyclic.edges,
    provenance: {
      ...(existing.provenance.illustrative ? { illustrative: true } : {}),
      ...(notes ? { notes } : {}),
    },
  };
}

/** Coerce an on-demand breakdown of ONE node — the same honesty gate the initial explode applies
 *  to authored children, reached from a narrower payload. Every rule that matters is inherited:
 *  ids are force-namespaced under the parent (so a breakdown can never masquerade as a top-level
 *  cause), the cap holds, a claimed real figure needs a verbatim quote carrying its own digits, and
 *  a T3 figure survives only inside a world that already declared itself illustrative.
 *
 *  Returns an empty array when nothing survives, which the caller reads as "no honest breakdown"
 *  rather than an error — an unbacked expansion is a node with nothing to show, not a failure. */
export function coerceExpansion(
  raw: unknown,
  parentId: string,
  corpus: EvidenceCorpus | string,
  illustrative: boolean,
): WorldNode[] {
  const parsed = typeof raw === 'string' ? parseLooseJson(raw) : raw;
  if (!parsed || typeof parsed !== 'object') return [];
  const children = (parsed as { children?: unknown }).children;
  const evidence = typeof corpus === 'string' ? textCorpus(corpus) : (corpus ?? EMPTY_CORPUS);
  return coerceChildren(
    children,
    parentId,
    { holds: makeVerbatimGrounder(evidence.text), sourceOf: makeAttributor(evidence) },
    illustrative,
  );
}

/** Attach a breakdown to one TOP-LEVEL node, purely. An authored breakdown is never overwritten:
 *  the world the model built for the question is the one the reader is looking at, and a later
 *  on-demand call must not quietly restate it. Returns the same spec object when nothing applies,
 *  so a caller can compare by identity. */
export function applyExpansion(
  prior: WorldSpec,
  nodeId: string,
  children: readonly WorldNode[],
): WorldSpec {
  if (children.length === 0) return prior;
  const attached = attach(prior.nodes, nodeId, children);
  return attached === prior.nodes ? prior : { ...prior, nodes: [...attached] };
}

/** Attach `children` to `nodeId` wherever it sits, returning the SAME array when nothing applied so
 *  a caller can compare by identity. Recursive because a part has parts: the depth a reader can go
 *  is a property of the answer, not of this function. An authored breakdown is never overwritten. */
function attach(
  nodes: readonly WorldNode[],
  nodeId: string,
  children: readonly WorldNode[],
): readonly WorldNode[] {
  let changed = false;
  const next = nodes.map((n) => {
    if (n.id === nodeId) {
      if ((n.children?.length ?? 0) > 0) return n;
      changed = true;
      return { ...n, children: [...children] };
    }
    if (n.children === undefined) return n;
    const deeper = attach(n.children, nodeId, children);
    if (deeper === n.children) return n;
    changed = true;
    return { ...n, children: [...deeper] };
  });
  return changed ? next : nodes;
}
