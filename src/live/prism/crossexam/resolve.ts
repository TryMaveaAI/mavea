// crossexam/resolve.ts — the pure gate that turns a model-proposed objection into a grounded one. An
// objection may only point at the document's OWN verbatim words (the anchor must be verbatim on the
// claim's page), and it is "addressed" only if the document answers it with a REAL verbatim rebuttal
// somewhere in the corpus. A model that invents an anchor gets the objection dropped; one that claims
// "addressed" without a real rebuttal is honestly left "open". No model in this path — pure + deterministic.
import { groundedPageOf } from '../grounding';
import type { Objection, ObjectionKind } from './types';

const KINDS: readonly ObjectionKind[] = [
  'unstated-assumption',
  'missing-baseline',
  'cherry-pick',
  'overgeneralization',
  'undefined-term',
  'circular',
];

/** Coerce a model-proposed kind to the taxonomy (unknown → 'unstated-assumption', a neutral default). */
export function asObjectionKind(s: unknown): ObjectionKind {
  const k = String(s ?? '')
    .toLowerCase()
    .trim();
  return (KINDS as readonly string[]).includes(k) ? (k as ObjectionKind) : 'unstated-assumption';
}

/** A model-proposed objection before gating (any field may be missing). */
export interface RawObjection {
  claimId?: string;
  kind?: string;
  question?: string;
  anchorQuote?: string;
  addressed?: boolean;
  rebuttalQuote?: string;
}

/**
 * Gate one proposed objection against the real document text. Returns a grounded {@link Objection}, or
 * null when the anchor isn't verbatim on the claim's document (the objection isn't tied to the doc's
 * own words). The rebuttal is searched across the whole corpus (an appendix in another document may
 * answer it); if no real rebuttal is found, the objection stands "open" regardless of what the model claimed.
 */
export function resolveObjection(
  raw: RawObjection,
  claim: { id: string; source: number },
  corpus: readonly (readonly string[])[],
  index: number,
): Objection | null {
  const anchorQuote = (raw.anchorQuote ?? '').trim();
  const question = (raw.question ?? '').trim();
  if (!anchorQuote || !question) return null;
  const docPages = corpus[claim.source];
  if (!docPages) return null;
  const anchorPage = groundedPageOf(anchorQuote, docPages);
  if (anchorPage === 0) return null; // the objection must target the document's real words

  let rebuttal: { quote: string; page: number; doc: number } | undefined;
  const rq = (raw.rebuttalQuote ?? '').trim();
  if (raw.addressed && rq) {
    for (let d = 0; d < corpus.length; d += 1) {
      const p = groundedPageOf(rq, corpus[d]);
      if (p > 0) {
        rebuttal = { quote: rq, page: p, doc: d };
        break;
      }
    }
  }

  return {
    id: `obj-${claim.id}-${index}`,
    claimId: claim.id,
    doc: claim.source,
    kind: asObjectionKind(raw.kind),
    question,
    anchorQuote,
    anchorPage,
    status: rebuttal ? 'addressed' : 'open',
    ...(rebuttal
      ? { rebuttalQuote: rebuttal.quote, rebuttalPage: rebuttal.page, rebuttalDoc: rebuttal.doc }
      : {}),
  };
}
