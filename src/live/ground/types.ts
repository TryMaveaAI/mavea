// types.ts — the provenance contract shared by every feature that puts a number on screen.
//
// The whole point: make "a precise number shown as a real fact, with no receipt" impossible to
// even construct. A value only exists on a resolution that also carries the proof of where it came
// from — a verified Receipt (T1 user data / T2 web citation) or an explicit illustrative caveat
// (T3). Model-inferred structure (T0) carries NO value at all, and an honest failure is a plain
// {ok:false}. A caller literally cannot type-check a fabricated figure into an answer.
//
// Tiers, in descending trust:
//   T1  user-data   — a value read verbatim from a file/cell the user gave us.        (has receipt)
//   T2  web-cited   — a value quoted verbatim from a real search result, with its URL. (has receipt)
//   T3  illustrative— a canonical/textbook magnitude, ALWAYS captioned "shows the      (has caveat)
//                     shape, not your numbers"; never the user's measured fact.
//   T0  structure   — a relationship with no number; qualitative, faint/provisional.   (no value)

export type Tier = 'T0' | 'T1' | 'T2' | 'T3';

/** Proof a value is real: the exact source text, plus wherever it lives (a URL for web, a
 *  file cell for user data, a page for a document). A T1/T2 resolution cannot exist without one. */
export interface Receipt {
  /** The verbatim source text the value was read from. */
  quote: string;
  /** Web source URL (T2). */
  url?: string;
  /** Display host, e.g. "gartner.com" (T2). */
  host?: string;
  /** 0-indexed attachment/document number (T1 file). */
  doc?: number;
  /** 1-indexed page (T1 document). */
  page?: number;
  /** A1 cell address, e.g. "B14" (T1 spreadsheet). */
  cell?: string;
  /** Publication date the source exposed, verbatim (T2), e.g. "2024-03-01". */
  date?: string;
  /** Publication/observation time as an epoch, if known. */
  at?: number;
}

/**
 * The result of asking the spine for one quantity. A discriminated union so the type system, not
 * discipline, enforces honesty: `value` exists only where a `receipt` or `illustrative` caveat also
 * exists; T0 has no number; a failure is explicit.
 */
export type Resolution =
  | {
      ok: true;
      tier: 'T1';
      value: number;
      raw: string;
      receipt: Receipt;
      surface: 'user' | 'blank';
    }
  | { ok: true; tier: 'T2'; value: number; raw: string; receipt: Receipt; surface: 'web' }
  | { ok: true; tier: 'T3'; value: number; raw: string; illustrative: string; surface: 'model' }
  | { ok: true; tier: 'T0'; raw: string; note: string; surface: 'model' }
  | { ok: false; reason: 'dropped' };

/** True for the tiers that represent a REAL, receipted measurement (the only ones that may wear a
 *  "receipt" badge or feed an exact delta). T3 is illustrative; T0 has no number. */
export function isReal(t: Tier): t is 'T1' | 'T2' {
  return t === 'T1' || t === 'T2';
}

/** Construct a T0 (qualitative, no-number) resolution — the honest degrade when nothing grounds. */
export function qualitative(
  raw: string,
  note = 'Leading hypothesis — here is how to confirm.',
): Resolution {
  return { ok: true, tier: 'T0', raw, note, surface: 'model' };
}
