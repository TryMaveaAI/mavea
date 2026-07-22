// veracity/gate.ts — Prism's citation gate. The reusable machinery (gateCitation / hostOf / canonUrl /
// Evidence) now lives in the shared honesty spine (src/live/ground/citation.ts) so Live and the Why
// Machine gate a web citation the same way Prism does. This file keeps the Prism-specific verdict layer —
// RawVerdict and resolveVerdict, which downgrade a world-asserting verdict to "unsupported" when its
// citation doesn't survive — and re-exports the shared helpers so existing importers are unchanged.
import { gateCitation, hostOf, type Evidence } from '../../ground/citation';
import type { Verdict, Veracity } from './types';

export { gateCitation, hostOf, type Evidence };

/** What the model proposes for one claim before gating — verdict + a citation it claims to have found. */
export interface RawVerdict {
  claimId: string;
  verdict: Verdict;
  /** Plain restatement of what the world shows; sanitized/replaced if the citation doesn't survive. */
  note?: string;
  citationQuote?: string;
  citationUrl?: string;
  citationDate?: string;
}

/** A verdict that asserts something about the world (anything but a clean miss) needs a real citation. */
const NEEDS_CITATION: readonly Verdict[] = ['holds', 'outdated', 'disputed', 'contradicted'];

/**
 * Resolve one claim's verdict: gate its citation, and if a world-asserting verdict has no surviving
 * citation, downgrade it to the honest "unsupported". This is the hard rule that keeps Prism from ever
 * stamping "contradicted"/"holds" on the strength of a citation the model imagined.
 */
export function resolveVerdict(raw: RawVerdict, evidence: readonly Evidence[]): Veracity {
  const citation = gateCitation(raw, evidence);
  const asserts = (NEEDS_CITATION as string[]).includes(raw.verdict);
  if (asserts && !citation) {
    return {
      claimId: raw.claimId,
      verdict: 'unsupported',
      note: 'Nothing in the searched sources backs this up.',
    };
  }
  const note = (raw.note ?? '').trim();
  return {
    claimId: raw.claimId,
    verdict: raw.verdict,
    note:
      note ||
      (raw.verdict === 'unsupported'
        ? 'Nothing in the searched sources backs this up.'
        : 'The public record speaks to this.'),
    ...(citation ? { citation } : {}),
  };
}
