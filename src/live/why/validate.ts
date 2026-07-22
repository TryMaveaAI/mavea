// why/validate.ts — turn raw model output into a safe WhyDag, and GROUND it. The model proposes tiers,
// values, and weights; this file verifies them. A node/edge that claims a real (T1/T2) figure must
// carry a quote that appears verbatim in the corpus (the user's attached text + fetched search
// snippets); if it doesn't, its number is stripped and it is demoted to T0 (qualitative, provisional).
// Unlike the speech grounder, there is NO fail-open: no corpus ⇒ nothing grounds ⇒ an all-T0 web.
// A precise causal number can never reach the screen on the model's say-so alone.
import { parseLooseJson } from '../ground/json';
import { makeVerbatimGrounder } from '../ground/verbatim';
import { hostOf } from '../ground/citation';
import type { Receipt, Tier } from '../ground/types';
import type { CausalRole, WhyDag, WhyEdge, WhyNode } from './types';

const ROLES = new Set<CausalRole>(['root', 'mechanism', 'outcome']);
const TIERS: readonly Tier[] = ['T0', 'T1', 'T2', 'T3'];
const isReal = (t: Tier): boolean => t === 'T1' || t === 'T2';

function str(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (!s) return null;
  return s.length > max ? s.slice(0, max) : s;
}

const clampWeight = (w: number): number => (w < 0 ? 0 : w > 1 ? 1 : w);

/** A verbatim grounder over the corpus, which every node and edge of one web is checked against —
 *  so it is normalized once, here, not per quote. Fail-CLOSED: an empty corpus grounds nothing. */
export function makeWhyGrounder(corpus: string): (quote: string) => boolean {
  return makeVerbatimGrounder(corpus ?? '');
}

/** Build a Receipt from a raw receipt object + a verified quote. */
function pickReceipt(rawReceipt: unknown, quote: string): Receipt {
  const r = (rawReceipt && typeof rawReceipt === 'object' ? rawReceipt : {}) as Record<
    string,
    unknown
  >;
  const url = str(r.url, 400);
  const host = str(r.host, 80) ?? (url ? hostOf(url) : null);
  const date = str(r.date, 40);
  const cell = str(r.cell, 12);
  return {
    quote,
    ...(url ? { url } : {}),
    ...(host ? { host } : {}),
    ...(date ? { date } : {}),
    ...(cell ? { cell } : {}),
  };
}

function quoteOf(r: Record<string, unknown>): string | null {
  if (r.receipt && typeof r.receipt === 'object')
    return str((r.receipt as Record<string, unknown>).quote, 240);
  return str(r.quote, 240);
}

/**
 * Parse + ground a WhyDag from raw model output. Returns null if unsalvageable (no center, <2 nodes).
 * `corpus` is the concatenated grounding text (attachment + search snippets); pass '' for a purely
 * from-knowledge web, which correctly yields an all-T0 (qualitative) result.
 */
export function coerceWhyDag(raw: unknown, corpus: string): WhyDag | null {
  const parsed = typeof raw === 'string' ? parseLooseJson(raw) : raw;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const o = parsed as Record<string, unknown>;

  const center = str(o.center, 140);
  if (!center) return null;

  const prov = (o.provenance && typeof o.provenance === 'object' ? o.provenance : {}) as Record<
    string,
    unknown
  >;
  const illustrative = prov.illustrative === true;
  const ground = makeWhyGrounder(corpus);

  const nodes: WhyNode[] = [];
  for (const rn of Array.isArray(o.nodes) ? o.nodes : []) {
    if (!rn || typeof rn !== 'object') continue;
    const r = rn as Record<string, unknown>;
    const id = str(r.id, 40);
    const label = str(r.label, 120);
    if (!id || !label) continue;
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
    const unit = str(r.unit, 12) ?? undefined;
    const quote = quoteOf(r);
    let receipt: Receipt | undefined;

    if (isReal(tier)) {
      if (quote && ground(quote)) {
        receipt = pickReceipt(r.receipt, quote);
        // A grounded node keeps its receipt even without a number (a real event); but a claimed value
        // must have its digits present in the quote, or it's stripped (no number on the model's say-so).
        // Matched per NUMBER TOKEN in the quote, not the whole quote's digits concatenated — a raw
        // substring check would let a fabricated value pass by splicing digits from two unrelated
        // numbers in the same sentence, or matching as a sub-run of one larger, different number.
        if (value !== undefined) {
          const digits = String(value).replace(/[^0-9]/g, '');
          const quoteNumbers = quote.match(/\d[\d,.]*\d|\d/g)?.map((s) => s.replace(/[^0-9]/g, ''));
          if (digits && !quoteNumbers?.includes(digits)) value = undefined;
        }
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

    nodes.push({
      id,
      label,
      role,
      depth,
      tier,
      ...(value !== undefined ? { value } : {}),
      ...(unit ? { unit } : {}),
      ...(receipt ? { receipt } : {}),
    });
  }
  if (nodes.length < 2) return null;
  const ids = new Set(nodes.map((n) => n.id));

  const edges: WhyEdge[] = [];
  for (const re of Array.isArray(o.edges) ? o.edges : []) {
    if (!re || typeof re !== 'object') continue;
    const r = re as Record<string, unknown>;
    const from = str(r.from, 40);
    const to = str(r.to, 40);
    if (!from || !to || !ids.has(from) || !ids.has(to) || from === to) continue;
    const sign: 1 | -1 = r.sign === -1 ? -1 : 1;
    const verb = str(r.verb, 24) ?? undefined;
    let tier: Tier = TIERS.includes(r.tier as Tier) ? (r.tier as Tier) : 'T0';
    let weight =
      typeof r.weight === 'number' && Number.isFinite(r.weight) ? clampWeight(r.weight) : undefined;
    const quote = quoteOf(r);
    let receipt: Receipt | undefined;
    let provisional = false;

    if (isReal(tier) && weight !== undefined && quote && ground(quote)) {
      receipt = pickReceipt(r.receipt, quote);
    } else {
      tier = 'T0'; // ungrounded link → qualitative, faint, no weight
      weight = undefined;
      provisional = true;
    }

    edges.push({
      from,
      to,
      sign,
      tier,
      ...(verb ? { verb } : {}),
      ...(weight !== undefined ? { weight } : {}),
      ...(receipt ? { receipt } : {}),
      ...(provisional ? { provisional: true } : {}),
    });
  }

  let outcomeId = str(o.outcomeId, 40);
  if (!outcomeId || !ids.has(outcomeId)) {
    const outcome =
      nodes.find((n) => n.role === 'outcome') ??
      nodes.reduce((a, b) => (b.depth > a.depth ? b : a));
    outcomeId = outcome.id;
  }

  const notes = Array.isArray(prov.notes)
    ? prov.notes.map((n) => String(n)).slice(0, 6)
    : undefined;
  return {
    center,
    outcomeId,
    nodes,
    edges,
    provenance: {
      ...(illustrative ? { illustrative: true } : {}),
      ...(notes && notes.length ? { notes } : {}),
    },
  };
}
