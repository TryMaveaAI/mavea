// synthesis/json.ts — the shared, defensive JSON reader for the corpus model calls. Providers wrap
// their output differently (a raw string, a pre-parsed object, prose around a JSON block); this pulls
// the first balanced top-level object out and reads fields without ever throwing — the same forgiving
// parse Prism's mapClaims/ask use, factored once for the synthesis package. Pure.

/** Pull the first balanced top-level JSON object out of a possibly-noisy model response, or null. */
export function extractJsonObject(raw: string | object): Record<string, unknown> | null {
  if (raw && typeof raw === 'object') return raw as Record<string, unknown>;
  const text = String(raw);
  const start = text.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, i + 1)) as Record<string, unknown>;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

/** A string field, or ''. */
export function asString(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

/** The array at `obj[key]`, or an empty array. */
export function asArray(obj: Record<string, unknown> | null, key: string): unknown[] {
  if (!obj) return [];
  const v = obj[key];
  return Array.isArray(v) ? v : [];
}
