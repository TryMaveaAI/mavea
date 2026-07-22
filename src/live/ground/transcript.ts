// transcript.ts — the FUZZY speech grounder. Canonical home for MindShape's verbatim-against-what-
// -was-said gate (validate.ts now builds its grounder from here).
//
// Speech is misheard, so this match is deliberately loose: ASCII-fold, drop apostrophes, and accept a
// contiguous span with ≥90% token overlap (tolerating one dropped/misheard word). That forgiveness is
// right for a live transcript and WRONG for a document — documents use the strict gate in verbatim.ts.
//
// One deliberate change from the original: the no-transcript policy is now EXPLICIT. The old grounder
// failed OPEN (no transcript → every quote passes), which is correct for re-validating a persisted
// mindshape but a silent hole for any self-driven caller that has no transcript to check against
// (e.g. an autonomous investigator). So `makeTranscriptGrounder` defaults to failOpen:false; MindShape
// opts back in with {failOpen:true} to preserve its behavior exactly.

/** ASCII-fold for fuzzy speech matching: lowercase, drop apostrophes so STT "it's" matches "its",
 *  collapse every other non-alphanumeric run to a single space. */
export function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export type Grounder = (quote: string) => boolean;

/**
 * Build the speech-grounding predicate. A quote grounds if it appears in the transcript as a
 * contiguous span, allowing a 90% token-overlap window (one misheard/dropped word).
 *
 * With no transcript, behavior is governed by `failOpen`:
 *   · false (default) — nothing grounds. The honest choice for a caller with no source of truth.
 *   · true — everything grounds. For re-validating a persisted block / unit tests where the
 *            quote-non-empty gate is the only check that still applies.
 */
export function makeTranscriptGrounder(
  transcript?: string,
  opts?: { failOpen?: boolean },
): Grounder {
  const failOpen = opts?.failOpen ?? false;
  if (!transcript || !transcript.trim()) return () => failOpen;
  const normT = normalizeForMatch(transcript);
  const tTokens = normT.split(' ').filter(Boolean);
  return (quote: string): boolean => {
    const q = normalizeForMatch(quote);
    if (!q) return false;
    if (normT.includes(q)) return true;
    const qTokens = q.split(' ').filter(Boolean);
    const win = qTokens.length;
    if (win === 0) return false;
    const need = Math.ceil(win * 0.9);
    const qSet = new Set(qTokens);
    for (let i = 0; i + win <= tTokens.length; i++) {
      let hit = 0;
      for (let j = 0; j < win; j++) if (qSet.has(tTokens[i + j])) hit++;
      if (hit >= need) return true;
    }
    return false;
  };
}
