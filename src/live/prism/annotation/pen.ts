// Domain helpers for Prism's pen annotations: the deterministic explanation for a clicked claim
// (no model call — the binding constraint), concrete ink colors, and the claim-aware pen accents.
// The colors are concrete on purpose: the live pen and the reel share them, and a `var(--…)`
// token resolves to the app theme, which the reel rasterizer can't carry. Tuned to read as ink
// on a white page (where the pen lives).
import type { PenAccent } from '../../annotate/penStrokes';
import type { Claim, ClaimKind, ClaimRole } from '../types';

/** Concrete ink per claim kind — deeper/more saturated than the app tokens so it reads on a white
 *  page. Mirrors the kind semantics (presence→indigo, stat→teal, risk→red, method→amber). */
const KIND_INK: Record<ClaimKind, string> = {
  forecast: '#5468e0',
  stat: '#12a37a',
  finding: '#1f9d7e',
  risk: '#e0474d',
  definition: '#5a6678',
  method: '#cf8327',
  diagram: '#5468e0',
};

/** The ink for an Ask answer's mark — a single vivid "key" violet (the most important mark). */
export const INK_KEY = '#6a4fd0';

export function inkForKind(kind: ClaimKind): string {
  return KIND_INK[kind];
}

/** How the role reads in the explanation. */
const ROLE_PHRASE: Record<ClaimRole, string> = {
  'load-bearing': 'The document leans on this',
  supporting: 'Supporting evidence',
  context: 'Context',
};

/** A deterministic one-line explanation for a clicked claim — built entirely from the claim's own
 *  fields (no model call). No page reference: the reel's visual already shows where in the doc. */
export function claimExplain(claim: Claim): string {
  return `${ROLE_PHRASE[claim.role]} — ${claim.title}`;
}

/** The judgment ink a claim earns from its own fields — one derivation shared by the live pen
 *  and the reel, so both draw the same accents. A load-bearing claim is starred (the document
 *  leans on it); a forecast gets the scrawled "?" (doubt is the honest read of a projection).
 *  Undefined when the claim earns neither, so the pen stays plain by default. */
export function accentForClaim(claim: Claim): PenAccent | undefined {
  const star = claim.role === 'load-bearing';
  const question = claim.kind === 'forecast';
  if (!star && !question) return undefined;
  return { ...(star ? { star } : {}), ...(question ? { question } : {}) };
}

/** A plain noun for a claim's kind, for guided-tour captions ("the forecast the document leans on"). */
const KIND_NOUN: Record<ClaimKind, string> = {
  forecast: 'forecast',
  stat: 'figure',
  finding: 'finding',
  risk: 'risk',
  definition: 'definition',
  method: 'method',
  diagram: 'figure',
};

/** Frames a claim by its role, reading naturally with the kind noun. */
const ROLE_FRAME: Record<ClaimRole, (kind: string) => string> = {
  'load-bearing': (k) => `The ${k} the document leans on`,
  supporting: (k) => `Supporting ${k}`,
  context: (k) => `Context — ${k}`,
};

/** The guided-tour caption for a claim in the share reel: frames WHY it matters and WHERE it sits,
 *  without repeating the headline (the reel shows the claim title above this line). Deterministic,
 *  no model call — the binding constraint for the no-director annotation reel. */
export function claimReelCaption(claim: Claim): string {
  return `${ROLE_FRAME[claim.role](KIND_NOUN[claim.kind])} · page ${claim.page}`;
}
