// reconcile/extractNumbers.ts — pull the figures out of grounded claim quotes, in pure code. Each
// figure keeps the exact text it was written as (so the receipt quotes the document), a normalized
// value (so the arithmetic can run), and a unit (so only comparable figures are ever checked). The
// quotes already passed the verbatim grounding gate, so every figure here genuinely appears in the
// document. Deterministic; no model.
import type { NumberAtom, NumUnit } from './types';

/** The minimal claim shape this needs (a grounded claim: a verbatim quote + its page). */
export interface NumberSource {
  id: string;
  page: number;
  quote: string;
}

/** Scale word → multiplier. */
function scaleOf(word: string | undefined): number {
  switch ((word ?? '').toLowerCase()) {
    case 'k':
    case 'thousand':
      return 1e3;
    case 'm':
    case 'mn':
    case 'million':
      return 1e6;
    case 'b':
    case 'bn':
    case 'billion':
      return 1e9;
    case 't':
    case 'tn':
    case 'trillion':
      return 1e12;
    default:
      return 1;
  }
}

function toNumber(s: string): number {
  return Number(s.replace(/,/g, ''));
}

interface Hit {
  start: number;
  end: number;
  raw: string;
  value: number;
  unit: NumUnit;
}

/** A short label from the words just before the figure — strip stopwords, keep a few content words. */
const STOP = new Set([
  'a',
  'an',
  'the',
  'of',
  'in',
  'to',
  'by',
  'and',
  'or',
  'for',
  'at',
  'on',
  'with',
  'from',
  'is',
  'are',
  'was',
  'were',
  'be',
  'we',
  'our',
  'it',
  'its',
  'their',
  'this',
  'that',
  'these',
  'those',
  'about',
  'over',
  'up',
  'than',
  'as',
  'reached',
  'reaches',
  'rose',
  'grew',
  'delivered',
  'posted',
]);
function labelBefore(quote: string, start: number): string {
  const before = quote.slice(0, start);
  const words = before
    .toLowerCase()
    .replace(/[^a-z0-9\s%$€£-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  const content: string[] = [];
  for (let i = words.length - 1; i >= 0 && content.length < 4; i -= 1) {
    const w = words[i];
    if (STOP.has(w) || /^[\d.,%$€£-]+$/.test(w)) continue;
    content.unshift(w);
  }
  return content.join(' ');
}

// Priority order matters: a "$10M" must be read as currency, not as the magnitude "10 million", and a
// "40%" must not also be read as a bare number. We claim character ranges in priority order and skip
// any later match that overlaps an already-claimed range.
const PATTERNS: { unit: NumUnit; re: RegExp; value: (m: RegExpExecArray) => number }[] = [
  {
    unit: 'currency',
    re: /([$€£])\s?(\d[\d,]*(?:\.\d+)?)\s*(k|m|mn|b|bn|t|tn|thousand|million|billion|trillion)?/gi,
    value: (m) => toNumber(m[2]) * scaleOf(m[3]),
  },
  { unit: '%', re: /(\d[\d,]*(?:\.\d+)?)\s*%/g, value: (m) => toNumber(m[1]) },
  { unit: 'x', re: /(\d[\d,]*(?:\.\d+)?)\s?(?:x|×)(?![a-z])/gi, value: (m) => toNumber(m[1]) },
  {
    unit: 'count',
    re: /(\d[\d,]*(?:\.\d+)?)\s?(thousand|million|billion|trillion)\b/gi,
    value: (m) => toNumber(m[1]) * scaleOf(m[2]),
  },
];

/** Extract every figure from one claim's quote, in document reading order. */
function fromQuote(src: NumberSource): Hit[] {
  const hits: Hit[] = [];
  const claimed: [number, number][] = [];
  const overlaps = (s: number, e: number): boolean => claimed.some(([cs, ce]) => s < ce && e > cs);
  for (const p of PATTERNS) {
    p.re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = p.re.exec(src.quote)) !== null) {
      const start = m.index;
      const end = start + m[0].length;
      if (overlaps(start, end)) continue;
      const value = p.value(m);
      if (!Number.isFinite(value)) continue;
      claimed.push([start, end]);
      hits.push({ start, end, raw: m[0].trim(), value, unit: p.unit });
    }
  }
  return hits.sort((x, y) => x.start - y.start);
}

/** Extract all figures across the grounded claims as NumberAtoms (each tied back to its claim+page). */
export function extractNumbers(sources: readonly NumberSource[]): NumberAtom[] {
  const atoms: NumberAtom[] = [];
  for (const src of sources) {
    const hits = fromQuote(src);
    hits.forEach((h, i) => {
      atoms.push({
        id: `${src.id}#${i}`,
        claimId: src.id,
        page: src.page,
        raw: h.raw,
        value: h.value,
        unit: h.unit,
        label: labelBefore(src.quote, h.start),
        quote: src.quote,
      });
    });
  }
  return atoms;
}
