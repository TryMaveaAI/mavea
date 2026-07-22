// synthesis/gaps.ts — negative space, honestly. You cannot prove a universal negative by reading, but
// you CAN prove a true statement about the corpus text: "not one of these surface forms appears in any
// source." A gap is asserted only when a facet's synonym set matches a literal ZERO across the whole
// corpus (or a small "thin" fraction). The model proposes only the FRAME (which facets to expect, and
// the 3–8 phrasings each would appear under); this pure code computes the coverage and the gate
// (gate.ts) decides. A gap dissolves for free the instant a covering source is added. Pure + tested.
import { normalizePdfText } from '../grounding';
import { classifyGap, type GapGateOptions } from './gate';
import type { ExpectedFacet, GapObject } from './types';

/** A compiled whole-token matcher for one surface form, over PDF-normalized text. Word boundaries are
 *  modelled as "not a letter/digit" on each side (the text is already lowercased + single-spaced by
 *  normalizePdfText), so "pediatric" does NOT match inside "orthopediatric", while a multi-word form
 *  like "under 18" still matches across its single space. */
function formMatcher(form: string): RegExp | null {
  const norm = normalizePdfText(form);
  if (!norm) return null;
  const escaped = norm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:[^a-z0-9]|$)`);
}

/** True if any of the facet's surface forms appears (whole-token) in the already-normalized text. */
export function textCoversFacet(normText: string, facet: ExpectedFacet): boolean {
  for (const form of facet.surfaceForms) {
    const re = formMatcher(form);
    if (re && re.test(normText)) return true;
  }
  return false;
}

/**
 * Scan the corpus for one facet: how many sources' text contains ANY of its surface forms, and which.
 * `perSourceNormText[i]` must be the i-th source's full text, already run through normalizePdfText
 * (normalize once, scan many facets). Returns the count and the covering source indices (for a "thin"
 * gap's "the k sources that do touch it").
 */
export function scanFacetCoverage(
  facet: ExpectedFacet,
  perSourceNormText: readonly string[],
): { coveredCount: number; coveringSources: number[] } {
  const coveringSources: number[] = [];
  perSourceNormText.forEach((text, i) => {
    if (textCoversFacet(text, facet)) coveringSources.push(i);
  });
  return { coveredCount: coveringSources.length, coveringSources };
}

/** The honest map label for a gap — a statement about the corpus text, never about the world. */
function gapLabel(facet: ExpectedFacet, kind: 'absent' | 'thin'): string {
  return kind === 'absent' ? `No coverage — ${facet.label}` : `Thin coverage — ${facet.label}`;
}

/**
 * Turn a set of model-proposed expected facets into grounded gap objects by scanning the real corpus
 * text and applying the gate. `themeOf(facet)` assigns each gap to a theme id (or '' for corpus-wide).
 * A facet that is well covered, thinly covered on too small a corpus, or under-specified (too few
 * synonyms) yields no gap — nothing is called "missing" that we cannot literally show absent.
 */
export function buildGaps(
  facets: readonly ExpectedFacet[],
  perSourceNormText: readonly string[],
  themeOf: (facet: ExpectedFacet) => string,
  opts: GapGateOptions = {},
): GapObject[] {
  const n = perSourceNormText.length;
  const out: GapObject[] = [];
  facets.forEach((facet, i) => {
    const { coveredCount } = scanFacetCoverage(facet, perSourceNormText);
    const kind = classifyGap(coveredCount, n, facet.surfaceForms.length, opts);
    if (!kind) return;
    out.push({
      id: `g${i}`,
      theme: themeOf(facet),
      facet,
      sourcesScanned: n,
      coveredCount,
      kind,
      searchedForms: facet.surfaceForms.slice(),
      label: gapLabel(facet, kind),
    });
  });
  return out;
}

/** Parse the model's expected-facet checklist (returned alongside themes in the reduce call) into
 *  {@link ExpectedFacet}s. Defensive: any field may be missing; a facet needs a label and ≥1 form to
 *  survive (the gate later enforces the ≥3-synonym sufficiency rule). Pure. */
export function parseFacets(raw: unknown): ExpectedFacet[] {
  const arr = Array.isArray(raw) ? raw : [];
  const out: ExpectedFacet[] = [];
  arr.forEach((f, i) => {
    if (!f || typeof f !== 'object') return;
    const r = f as Record<string, unknown>;
    const label = typeof r.label === 'string' ? r.label.trim() : '';
    const forms = Array.isArray(r.surfaceForms)
      ? Array.from(
          new Set(
            r.surfaceForms
              .filter((s): s is string => typeof s === 'string')
              .map((s) => s.trim())
              .filter((s) => s.length >= 3),
          ),
        )
      : [];
    if (!label || forms.length === 0) return;
    out.push({
      id: `f${i}`,
      label,
      surfaceForms: forms,
      ...(typeof r.rationale === 'string' && r.rationale.trim()
        ? { rationale: r.rationale.trim() }
        : {}),
    });
  });
  return out;
}
