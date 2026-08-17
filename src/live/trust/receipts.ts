// trust/receipts.ts — how a link earns the right to be drawn as established.
//
// Both causal validators (why/ and world/) had grown their own copy of this: read a receipt object,
// keep only what the corpus actually says, and decide from what survived how strongly the link is
// backed. Two copies of an honesty rule is one copy too many — the day they disagree, one surface
// starts showing a claim the other would have refused. This is the single implementation; the
// validators keep their own field gates and call in here for the evidence.
import { hostOf } from '../ground/citation';
import { isReal } from '../ground/types';
import type { Receipt, Tier } from '../ground/types';
import type { EdgeStatus } from './relations';

/** How many independent quotes a link may carry. A third receipt is already the point where a
 *  reader stops reading; past it they are being buried rather than convinced. */
export const EDGE_RECEIPT_CAP = 3;

const QUOTE_MAX = 240;

function str(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (!s) return null;
  return s.length > max ? s.slice(0, max) : s;
}

/** Build a Receipt from a raw receipt object and a quote that has ALREADY been verified against
 *  the corpus. Every field is clamped; the T1 document anchors (`doc`/`page`) ride along when the
 *  payload names them, so a receipt from an attached file can point back into it.
 *
 *  `source`, when the caller can supply it, is where the quote was actually FOUND, and it wins over
 *  anything the payload says. A verbatim gate proves the words are real; it cannot stop real words
 *  being filed under the wrong link, and the model does not get to answer that question about its
 *  own claim. Callers whose corpus is a flat string pass nothing and keep the old behaviour. */
export function pickReceipt(
  rawReceipt: unknown,
  quote: string,
  source?: { url?: string; host?: string } | null,
): Receipt {
  const r = (rawReceipt && typeof rawReceipt === 'object' ? rawReceipt : {}) as Record<
    string,
    unknown
  >;
  const url = source ? (source.url ?? null) : str(r.url, 400);
  const host = source
    ? (source.host ?? (source.url ? hostOf(source.url) : null))
    : (str(r.host, 80) ?? (url ? hostOf(url) : null));
  const date = str(r.date, 40);
  const cell = str(r.cell, 12);
  const doc = typeof r.doc === 'number' && Number.isInteger(r.doc) && r.doc >= 0 ? r.doc : null;
  const page =
    typeof r.page === 'number' && Number.isInteger(r.page) && r.page >= 1 ? r.page : null;
  return {
    quote,
    ...(url ? { url } : {}),
    ...(host ? { host } : {}),
    ...(date ? { date } : {}),
    ...(cell ? { cell } : {}),
    ...(doc !== null ? { doc } : {}),
    ...(page !== null ? { page } : {}),
  };
}

/** The quote a payload offers for itself, from either shape a model writes it in. */
export function quoteOf(r: Record<string, unknown>): string | null {
  if (r.receipt && typeof r.receipt === 'object')
    return str((r.receipt as Record<string, unknown>).quote, QUOTE_MAX);
  return str(r.quote, QUOTE_MAX);
}

/** Every receipt a link can prove, capped and de-duplicated by quote.
 *
 *  Each one is verified INDEPENDENTLY: three quotes where only the first is real leave a link with
 *  exactly one receipt, not a link that looks three times as certain as it is. De-duplication is by
 *  quote text for the same reason — the same sentence cited twice is one piece of evidence. */
export function collectReceipts(
  r: Record<string, unknown>,
  ground: (quote: string) => boolean,
  sourceOf?: (quote: string) => { url?: string; host?: string } | null,
): Receipt[] {
  const out: Receipt[] = [];
  const seen = new Set<string>();
  const push = (rawReceipt: unknown, quote: string | null): void => {
    if (!quote || out.length >= EDGE_RECEIPT_CAP || seen.has(quote) || !ground(quote)) return;
    seen.add(quote);
    out.push(pickReceipt(rawReceipt, quote, sourceOf?.(quote)));
  };
  push(r.receipt, quoteOf(r));
  for (const rr of Array.isArray(r.receipts) ? r.receipts : []) {
    if (!rr || typeof rr !== 'object') continue;
    push(rr, str((rr as Record<string, unknown>).quote, QUOTE_MAX));
  }
  return out;
}

/**
 * A link's support level, DERIVED from its verified shape — a model's own `status` claim is never
 * read. Evidence on both sides is 'contested' even when the claim itself was demoted, because a
 * reader who has seen a counter-quote must never be shown the link as settled; a receipted,
 * weighted, real-tier claim is 'supported'; everything else is 'provisional'.
 */
export function deriveEdgeStatus(e: {
  tier: Tier;
  weight?: number;
  receipt?: Receipt;
  receipts?: Receipt[];
  counter?: Receipt;
}): EdgeStatus {
  const receipted = (e.receipts?.length ?? 0) > 0 || !!e.receipt;
  if (receipted && e.counter) return 'contested';
  if (receipted && isReal(e.tier) && e.weight !== undefined) return 'supported';
  return 'provisional';
}
