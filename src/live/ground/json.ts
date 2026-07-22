// json.ts — tolerant JSON extraction. Canonical home for the "a model wrapped its JSON in prose or a
// ```json fence" recovery logic that was duplicated across dashboards/extract.ts (parseLoose) and
// dashboards/refresh.ts (extractJson). Pure; behavior preserved so callers can re-point here.

/** The substring from the first '{' to the last '}', or the input unchanged if there's no object.
 *  A cheap way to peel a JSON object out of "Here you go: {…}. Hope that helps!". */
export function extractJsonSlice(s: string): string {
  const a = s.indexOf('{');
  const b = s.lastIndexOf('}');
  return a >= 0 && b > a ? s.slice(a, b + 1) : s;
}

/** Parse model output that should be a JSON object but might be fenced or prose-wrapped. Returns the
 *  parsed value, or null if nothing parses. A non-string is passed through untouched (already parsed
 *  by a constrained-decoding adapter). Never throws. */
export function parseLooseJson(raw: string | object): unknown {
  if (typeof raw !== 'string') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(raw.slice(start, end + 1));
      } catch {
        /* fall through */
      }
    }
    return null;
  }
}
