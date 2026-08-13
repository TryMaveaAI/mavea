// types.ts — the shapes Prism renders. A document "explodes" into grounded claim cards,
// clustered into the document's own regions (sections), with contradiction threads drawn only
// between two passages that genuinely disagree. Every card carries a verbatim quote + page anchor;
// nothing here can exist without grounding (see grounding.ts / mapping.ts).
import type { GroundableClaim } from './grounding';

/** The kind palette — tints a claim card; does not organize layout (regions do that). `diagram`
 *  marks a claim ABOUT a figure/chart/table, so the source view outlines the graphic on the page.
 *  Data, not just a type: it is the one allowlist every claim from a model is coerced against. */
export const CLAIM_KINDS = [
  'forecast',
  'stat',
  'finding',
  'risk',
  'definition',
  'method',
  'diagram',
] as const;

export type ClaimKind = (typeof CLAIM_KINDS)[number];

/** Coerce a model-authored kind onto the palette. Models invent neighbours of these words
 *  ("prediction", "caveat"), and a kind outside the palette is looked up in per-kind maps that
 *  only hold the seven — so an unrecognized label reads as a plain `finding` (the neutral kind)
 *  rather than taking the surface down. */
export function asClaimKind(value: unknown): ClaimKind {
  const kind = String(value ?? '').toLowerCase();
  return (CLAIM_KINDS as readonly string[]).includes(kind) ? (kind as ClaimKind) : 'finding';
}

/** How much weight a claim carries in the document's case — drives the answer-first hierarchy so the
 *  few claims that matter bloom large and the camera frames them, instead of dumping 20 equal cards.
 *  `load-bearing`: the thesis, the headline number, the assertion the conclusion rests on (a handful).
 *  `supporting`: real evidence/findings. `context`: definitions, background, method detail. The model
 *  proposes it; the layout/render treat it as emphasis only — it never reorganizes the regions. */
export type ClaimRole = 'load-bearing' | 'supporting' | 'context';

/** A box on a slide image, in normalized 0–1000 coordinates (origin top-left), so it scales to any
 *  rendered size. Returned by the vision model for an image-deck claim — where its quote/figure sits
 *  on the slide — so the source panel can highlight (text) or circle (figure) the exact spot. */
export interface ClaimBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A grounded claim, ready to render. Extends GroundableClaim so the grounding gate accepts it. */
export interface Claim extends GroundableClaim {
  /** Stable id for layout + thread references. */
  id: string;
  kind: ClaimKind;
  /** Short headline (the model's, or derived) — never the full quote. */
  title: string;
  /** A one-line follow-up the card offers ("Ask: …"). */
  ask: string;
  /** How central this claim is to the document's case — drives the answer-first hierarchy. */
  role: ClaimRole;
  /** The region (document section) this claim belongs to. */
  region: string;
  /** Which attached document this claim came from (index into PrismSpec.documents). 0 for a
   *  single PDF; the source is what makes cross-document comparison possible. */
  source: number;
  /** For an image-deck claim: where the quote/figure is on the slide (normalized 0–1000). Absent for
   *  text documents (those highlight via the text layer instead). */
  box?: ClaimBox;
}

/** How two claims relate. Across documents, "agrees" is as interesting as "contradicts" — two papers
 *  saying the same thing is a finding too. "in-tension" is a softer pull than a hard contradiction. */
export type ThreadRelation = 'contradicts' | 'in-tension' | 'agrees';
export interface Thread {
  a: string; // claim id
  b: string; // claim id
  relation: ThreadRelation;
  /** True when the two claims come from different documents — the cross-document threads are the
   *  headline of multi-PDF mode (this paper vs. that paper). */
  crossDoc?: boolean;
}

/** One attached document in the world. */
export interface PrismDocument {
  fileName: string;
  pageCount: number;
  /** For a deck exported as IMAGES (no selectable text): the slide images, one per page, so the
   *  source panel shows the real slide. `page` (1-based) indexes this. */
  slideImages?: { data: string; mime: string }[];
  /** For a spreadsheet: the real sheet/tab name behind each page, index-aligned (page N's name is
   *  `pageLabels[N - 1]`) — lets a claim cite its sheet by name instead of a bare page number. */
  pageLabels?: string[];
}

/** The settled Prism world — claims (each tagged by source document), the regions they cluster into,
 *  and the threads between them (within and across documents). */
export interface PrismSpec {
  /** The attached documents, in order; `claim.source` indexes this. */
  documents: PrismDocument[];
  /** Convenience for the single-document chrome (documents[0].fileName). */
  fileName: string;
  /** Total pages across all documents (for the counter). */
  pageCount: number;
  claims: Claim[];
  /** Distinct region names in first-seen order (the documents' sections). */
  regions: string[];
  threads: Thread[];
}

export type PrismPhase = 'idle' | 'igniting' | 'blooming' | 'settled' | 'error';

/** A model-proposed claim BEFORE grounding — exactly what mapClaims parses from the LLM. The
 *  grounding gate (selectGroundedClaims) turns surviving ones into {@link Claim}s. */
export interface CandidateClaim extends GroundableClaim {
  kind?: string;
  title?: string;
  ask?: string;
  /** The model's proposed role (free string until coerced to {@link ClaimRole}). */
  role?: string;
  region?: string;
  /** Optional same-page contradiction hint from the model (still verified before a thread is drawn). */
  contradictsPage?: number;
  /** Image-deck only: where the quote/figure sits on the slide (normalized 0–1000). */
  box?: ClaimBox;
}
