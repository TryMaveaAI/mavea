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

/** The first BALANCED `{…}` run, brace-counted with string and escape awareness so a brace inside a
 *  quoted value never closes the object early. Returns null if no run closes.
 *
 *  This is what the first-brace-to-LAST-brace slice cannot do: a model that emits two objects back to
 *  back ("{…}\n{…}") makes that slice span both, and parsing the span fails with "Unexpected
 *  non-whitespace character after JSON". The widest slice is still tried first, because an object
 *  followed by trailing prose needs it; this is the narrower second chance. */
function firstBalancedObject(s: string): string | null {
  const start = s.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) return s.slice(start, i + 1);
  }
  return null;
}

/** Parse model output that should be a JSON object but might be fenced or prose-wrapped. Returns the
 *  parsed value, or null if nothing parses. A non-string is passed through untouched (already parsed
 *  by a constrained-decoding adapter). Never throws — that guarantee is the point: every caller here
 *  replaced a hand-rolled recovery whose own fallback parse was unguarded, so a model reply that
 *  defeated the fallback threw out of the catch and reached the reader as a raw parser message. */
export function parseLooseJson(raw: string | object): unknown {
  if (typeof raw !== 'string') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    /* fenced, prose-wrapped, or several objects — the recoveries below */
  }
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(raw.slice(start, end + 1));
    } catch {
      /* fall through to the balanced scan */
    }
  }
  const balanced = firstBalancedObject(raw);
  if (balanced !== null) {
    try {
      return JSON.parse(balanced);
    } catch {
      /* fall through */
    }
  }
  return null;
}

/** parseLooseJson narrowed to a plain object, degrading to {} on anything else — the shape the
 *  single-call generators want, so their coercion runs on an empty object and fails their own way. */
export function parseLooseJsonObject(raw: string | object): Record<string, unknown> {
  const parsed = parseLooseJson(raw);
  return parsed !== null && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
}
