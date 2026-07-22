// citation.ts — the "is this web citation REAL?" gate. Canonical home for Prism's veracity gate
// helpers (veracity/gate.ts now re-exports these).
//
// A model that cites the world must earn it: the cited quote must appear verbatim in a snippet the
// search ACTUALLY returned, AND the cited URL must be one of the URLs that search returned. A model
// that invents a plausible-looking citation gets null — never dressed as a real receipt. Reuses the
// document gate's unicode-preserving normalization (verbatim.ts) so snippet matching is as forgiving
// of punctuation/ligatures as the doc match, and no more. Pure + deterministic.
import { isVerbatimOnPage } from './verbatim';

/** One retrieved web result the gate works from. Search returns SNIPPETS (not fetched page bodies),
 *  so a web receipt is honestly snippet-level. */
export interface Evidence {
  title: string;
  url: string;
  snippet: string;
  /** Publication date if the source exposed one. */
  date?: string;
}

/** A verified web citation: a quote proven present in a retrieved result, with the real URL it came
 *  from. Structurally the T2 form of a Receipt. */
export interface Citation {
  quote: string;
  url: string;
  host: string;
  date?: string;
}

/** What a model proposes for a citation before gating. */
export interface RawCitation {
  citationQuote?: string;
  citationUrl?: string;
  citationDate?: string;
}

/** Display host for a URL ("https://www.gartner.com/x" → "gartner.com"). Returns '' on a bad URL. */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/** Canonical form for comparing two URLs: drop protocol, query, hash, trailing slash; lowercase. So a
 *  model that copies "http://x.com/a/" matches the retrieved "https://x.com/a?utm=1". */
export function canonUrl(url: string): string {
  return url
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .split(/[?#]/)[0]
    .replace(/\/+$/, '')
    .toLowerCase();
}

/**
 * Gate a proposed citation against the evidence search actually returned. Returns a verified
 * {@link Citation} ONLY when a single retrieved result both (a) matches the cited URL and (b) contains
 * the cited quote verbatim (in its title or snippet). Otherwise null — the model either mis-quoted or
 * invented the URL, and we refuse to dress it as a real receipt.
 */
export function gateCitation(raw: RawCitation, evidence: readonly Evidence[]): Citation | null {
  const quote = (raw.citationQuote ?? '').trim();
  const url = (raw.citationUrl ?? '').trim();
  if (!quote || !url) return null;
  const target = canonUrl(url);
  for (const e of evidence) {
    if (canonUrl(e.url) !== target) continue;
    // the cited quote must be verbatim in THIS result's own text (title + snippet), not just somewhere
    if (isVerbatimOnPage(quote, `${e.title} ${e.snippet}`)) {
      // Prefer the date the source actually exposed; only fall back to the model's when the evidence
      // carries none (the model's date is unverified — never let it override a real one).
      const date = e.date || raw.citationDate?.trim();
      return {
        quote,
        url: e.url, // use the REAL retrieved URL, never the model's transcription
        host: hostOf(e.url),
        ...(date ? { date } : {}),
      };
    }
  }
  return null;
}
