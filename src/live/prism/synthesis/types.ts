// synthesis/types.ts — the shapes of a Synthesis World: many sources fused into ONE map, organized by
// theme (not by document), where the cross-source relations are first-class OBJECTS you can click, not
// lines you have to notice. It reuses Prism's grounded `Claim` and `Thread` verbatim — the one move
// that makes the whole thing possible is setting `claim.region` to a THEME id, so the existing
// spatial layout clusters themes as regions with no change to the geometry. Nothing here can exist
// without grounding: every quote rides on a `Claim` that already passed the verbatim gate, every count
// is a pure count over grounded claims, and every "missing" is a literal zero over real corpus text.
import type { Claim, Thread } from '../types';

/** One source in the corpus — the corpus generalization of {@link import('../types').PrismDocument}.
 *  `claim.source` still indexes the `CorpusSpec.sources` array, exactly as it indexed `documents`. */
export interface CorpusSource {
  /** 's0', 's1', … — stable id; `claim.source` is the numeric index into `sources`. */
  id: string;
  fileName: string;
  /** How the text was obtained, so the source panel picks the right renderer. */
  kind: 'pdf' | 'office' | 'text' | 'image-deck';
  pageCount: number;
  /** A short citation label — a derived author/year ("Foci et al. 2024") when the text exposes one,
   *  else the filename stem. Used on contradiction/consensus receipts so a source reads as a citation. */
  label: string;
  /** For an image-only deck: the slide images, one per page, so the source panel shows the real slide. */
  slideImages?: { data: string; mime: string }[];
}

/** A THEME is a spatial region that spans sources. Its `id` is the value carried in every member
 *  `claim.region`, so the existing `layout()` places themes on the ring and spirals each theme's
 *  claims with zero changes. `name` is the human label ("Efficacy", "Safety", "Cost"). */
export interface Theme {
  /** 't0', … — equals `claim.region` for every claim in this theme. */
  id: string;
  name: string;
  /** How many distinct sources contribute ≥1 claim here (coverage breadth, not claim count). */
  sourceCount: number;
  claimCount: number;
}

/** A clickable CONTRADICTION object: two grounded claims, from different sources, that genuinely
 *  conflict on one shared axis. The verbatim quotes + page cites already live on the referenced
 *  claims — nothing is restated here, so nothing can drift from what was grounded. */
export interface ContradictionObject {
  /** 'x0', … */
  id: string;
  /** The theme id this contradiction sits inside (both claims share it). */
  theme: string;
  /** Grounded claim ids — guaranteed different sources by the gate. */
  a: string;
  b: string;
  relation: 'contradicts' | 'in-tension';
  /** The one quantity/axis both claims speak to ("drug efficacy at 12 weeks"). */
  sharedQuantity: string;
  /** A verbatim phrase, gate-verified against BOTH sources, proving they share the same scope. Absent
   *  when the object is a soft `in-tension` we could not prove comparable. */
  matchPhrase?: string;
  /** False → the two sides are "not directly comparable"; the panel says so instead of implying a
   *  clean contradiction. A hard `contradicts` is only rendered when this is true. */
  comparable: boolean;
  /** Why a would-be hard contradiction was softened, when the local scope facets conflict. */
  caveat?: 'endpoint' | 'population' | 'timeframe' | 'unit' | 'scope';
  /** When both sides carry a number for `sharedQuantity`: the pure-code numeric delta (Reconcile). */
  delta?: { aValue: number; bValue: number; unit: string };
  /** The map headline ("Two trials disagree on efficacy"). */
  label: string;
  /** A deterministic Ask seed that interrogates WHY they differ, fed verbatim into the Ask dock on
   *  "Interrogate" — the "unknown/not-comparable beats a guess" value made literal. */
  seedQuestion: string;
}

/** The expected coverage frame for a facet — proposed by the model from the corpus's OWN themes/terms.
 *  The model makes NO presence/absence claim; it only lists the surface forms by which this facet
 *  WOULD appear in the text if a source covered it. Pure code then computes whether any source does. */
export interface ExpectedFacet {
  id: string;
  /** "Pediatric population", "Long-term outcomes". */
  label: string;
  /** 3–8 alternative phrasings/synonyms — the set that makes the literal "0" true, not a spelling miss. */
  surfaceForms: string[];
  /** Advisory only (the model's reason it expected this facet). Never shown as a fact about the world. */
  rationale?: string;
}

/** A first-class NEGATIVE SPACE object: what is MISSING across the corpus. Never a fabricated finding —
 *  a measured hole, asserted only when NO source's text contains any of the facet's surface forms. The
 *  label is a true statement ABOUT THE TEXT ("None of the 84 sources report pediatric data"), never a
 *  claim about the world; it dissolves for free the moment a covering source is added. */
export interface GapObject {
  /** 'g0', … */
  id: string;
  /** The theme id it belongs to, or '' for a corpus-wide gap. */
  theme: string;
  facet: ExpectedFacet;
  /** N — how many sources were scanned (the denominator, shown on the receipt). */
  sourcesScanned: number;
  /** How many sources' text contains any surface form: 0 = a true absence; a small k = thin coverage. */
  coveredCount: number;
  /** 'absent' (coveredCount === 0) or 'thin' (0 < k ≤ a small fraction of N). */
  kind: 'absent' | 'thin';
  /** The exact surface forms searched — surfaced on click so the absence is fully auditable. */
  searchedForms: string[];
  /** The honest label ("None of the 84 sources report pediatric data"). */
  label: string;
}

/** Measured AGREEMENT: grounded claims from ≥2 distinct sources that make the same point, clustered and
 *  counted. The count is DISTINCT SOURCES, never claim count; the `proposition` is a marked paraphrase,
 *  proven by each member's verbatim quote beneath it. */
export interface ConsensusCluster {
  /** 'c0', … */
  id: string;
  theme: string;
  /** The shared point, one sentence — clearly a paraphrase/summary, never dressed as a quote. */
  proposition: string;
  /** Grounded, gate-passed member claim ids. */
  memberClaimIds: string[];
  /** Distinct sources with a gate-passing member — the honest "k" in "k of N". */
  sourceCount: number;
  /** N, so the receipt reads "k of N sources". */
  corpusSize: number;
  /** Pure-code agreement evidence when the members carry a shared number (values fall in this band). */
  band?: { unit: string; min: number; max: number };
}

/** Live counts for the lens switcher: "3 contradictions · 2 gaps · 71 in consensus". Pure — read
 *  straight off the settled objects, no tokens. `consensus` counts distinct sources in any cluster. */
export interface CorpusCounts {
  contradictions: number;
  gaps: number;
  consensus: number;
}

/** The settled Synthesis World. Satisfies `LayoutInput` via `{ claims, regions: themes.map(t => t.id) }`
 *  so the existing `layout()` renders it directly; the corpus objects layer on top via `layoutCorpus`. */
export interface CorpusSpec {
  sources: CorpusSource[];
  themes: Theme[];
  /** Reused as-is. `claim.region` = theme id, `claim.source` = index into `sources`. */
  claims: Claim[];
  /** Reused. `agrees` threads feed consensus; `contradicts`/`in-tension` feed contradiction objects. */
  threads: Thread[];
  contradictions: ContradictionObject[];
  gaps: GapObject[];
  consensus: ConsensusCluster[];
  counts: CorpusCounts;
  /** Total pages across all sources (for the corpus chrome/counter). */
  pageCount: number;
}

/** The corpus lens: filter the whole map to everything, only the disputes, only the holes, or only the
 *  agreement. A pure view state — it dims + reframes; it never reflows the deterministic layout. */
export type Lens = 'all' | 'contradictions' | 'gaps' | 'consensus';

/** The corpus lifecycle phases — mirrors {@link import('../types').PrismPhase} so the sibling
 *  overlay reuses the same ignite → bloom → settled staging. */
export type CorpusPhase = 'idle' | 'igniting' | 'blooming' | 'settled' | 'error';
