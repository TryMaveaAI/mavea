// veracity/types.ts — the shapes for Prism's "is this TRUE?" layer. After the map settles, the few
// load-bearing claims are checked against the live world. Each gets a verdict + a world-side receipt
// (a quote from a real retrieved source, with its URL). Trust is the product: the doc-side verbatim
// gate is unchanged and sacred; the world-side receipt is honestly WEAKER (a search snippet, not a
// fetched page body) and is always rendered in its own, distinct tint — never blended with the
// document's own words.

/** The verdict a load-bearing claim earns once checked against the public record.
 *  - `holds`: the world backs it (a current source agrees).
 *  - `outdated`: it was true, but a newer figure/finding supersedes it.
 *  - `disputed`: credible sources genuinely conflict.
 *  - `contradicted`: a current, credible source directly contradicts it.
 *  - `unsupported`: nothing in the searched sources backs it — the honest grey, the DEFAULT when
 *    evidence is thin. Never a fake green check; the absence of support is shown plainly. */
export type Verdict = 'holds' | 'outdated' | 'disputed' | 'contradicted' | 'unsupported';

/** A world-side receipt: a quote from a REAL retrieved source. The quote must appear verbatim in a
 *  search result and the URL must come from that same retrieval set — never the model's imagination
 *  (the citation-must-verify gate). Absent on an `unsupported` verdict (there's nothing to cite). */
export interface WorldCitation {
  /** The exact source text the verdict rests on (verified present in a retrieved result snippet). */
  quote: string;
  /** The source URL — guaranteed to be one of the URLs the search actually returned. */
  url: string;
  /** Display host, e.g. "gartner.com" (derived from the URL). */
  host: string;
  /** Publication date if the source exposed one — used by the freshness guard and shown to the user. */
  date?: string;
}

/** The veracity result for one claim. `note` is a short, plain restatement ("the public record shows
 *  X") — never "they lied". A claim that wasn't checked has no Veracity record at all (no seal). */
export interface Veracity {
  claimId: string;
  verdict: Verdict;
  note: string;
  /** The world-side receipt. Always present except on `unsupported`. */
  citation?: WorldCitation;
}

/** Display metadata per verdict — the seal label + the design token its tint keys off. Kept here so
 *  the engine and the UI agree on the vocabulary. Tints resolve to light/dark via the tokens. */
export const VERDICT_META: Record<Verdict, { label: string; token: string }> = {
  holds: { label: 'HOLDS', token: 'var(--insight)' },
  outdated: { label: 'OUTDATED', token: 'var(--warning)' },
  disputed: { label: 'DISPUTED', token: 'var(--warning)' },
  contradicted: { label: 'CONTRADICTED', token: 'var(--danger)' },
  // a fixed neutral grey — the others are theme-stable accent tokens, but --text-muted would flip with
  // the app theme, and Prism is an immersive dark stage (like Atlas) that must read the same either way.
  unsupported: { label: 'UNSUPPORTED', token: '#8c90a0' },
};

/** Verdicts that mean "this needs a second look" — everything except a clean `holds`. */
export const TROUBLED: readonly Verdict[] = ['outdated', 'disputed', 'contradicted', 'unsupported'];
