// tokens.ts — shared "same subject?" word tokenizer. Canonical home for the word-tokenizing helper
// that was private to dashboards/relate.ts (topic matching) and is now also the coherence check in
// dashboards/extract.ts (dropping a metric/tripwire that's bled in from an unrelated line of the
// transcript). Deliberately crude: a 4+ char length floor is enough to skip filler ("the", "and",
// "was") without maintaining a stopword list. Pure.

/** Lowercased, non-alphanumeric-stripped, 4+ char word tokens of `s` — the fingerprint two texts are
 *  compared by to guess whether they're about the same thing. */
export function meaningfulTokens(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .split(' ')
      .filter((w) => w.length > 3),
  );
}

/** Whitespace-collapsed, trimmed, lowercased label — the normalization a dedup-by-label check
 *  compares against (folding a draft/template into an existing dashboard without double-tracking
 *  the same metric/tripwire under two labels that only differ in casing or stray spacing). Shared
 *  by extract.ts's foldDraftIntoDashboard and templates/instantiate.ts's foldTemplateIntoDashboard. */
export function normLabel(s: string): string {
  return s.replace(/\s+/g, ' ').trim().toLowerCase();
}
