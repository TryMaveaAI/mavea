// Said-target resolution: the hand draws on what the voice is actually saying. Given a
// card's DOM and the spoken line, find the element — down to the exact character range —
// that carries the figure ("$1,950", "828 meters") or the name ("Burj Khalifa") the line
// leans on. A gesture aimed at the very words on screen is what makes pointing feel
// accurate; the component's own data-mark remains the fallback when the line carries
// nothing locatable.
import { heroSegments } from '../voice/emphasize';

export interface SaidMatch {
  node: Text;
  start: number;
  end: number;
}

/** What the line points at: its figures (via the same detector the hero accents with),
 *  and its proper-noun names (capitalized runs that aren't just sentence starts). */
export function saidTokens(line: string): { figures: string[]; labels: string[] } {
  const figures = heroSegments(line)
    .filter((s) => s.accent)
    .map((s) => s.text.trim());
  const labels: string[] = [];
  const re = /\b[A-Z][\w+#.&-]*(?:\s+[A-Z][\w+#.&-]*)*/g;
  for (let m = re.exec(line); m; m = re.exec(line)) {
    const before = line.slice(0, m.index).trimEnd();
    const sentenceStart = before === '' || /[.!?…:—]$/.test(before) || /["“]$/.test(before);
    // A capitalized run mid-sentence is a name; a single short word opening a sentence is not.
    if (sentenceStart && !m[0].includes(' ')) continue;
    const label = m[0].replace(/[.,;:!?]+$/, '');
    if (label.length < 3) continue;
    labels.push(label);
  }
  return { figures, labels };
}

/** Lowercase and drop spaces/commas/currency/unit-prefix symbols so "$1,950" matches
 *  "1,950", "€23.5k" matches "23.5k", and "+$25.5k" matches "$25.5k". Decimal points
 *  are kept so "23.5k" doesn't collapse to "235k". */
function normWithMap(raw: string): { norm: string; map: number[] } {
  let norm = '';
  const map: number[] = [];
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (/[\s,\u00a0$€£¥₹₩₽+%°]/.test(ch)) continue;
    norm += ch.toLowerCase();
    map.push(i);
  }
  return { norm, map };
}

const DIGIT_CLASS = /[0-9.]/;

/** Whether every character of a normalized token is part of a bare number — "1950", not "18%" or
 *  "23.5k" (those keep a trailing letter after stripping). Only bare-number tokens are at risk of
 *  matching a SUBSTRING of a longer number ("5" inside "5,000"); a token that already carries a
 *  unit/letter can't glue onto one, so it keeps the plain substring search below. */
function isBareNumber(tokNorm: string): boolean {
  return tokNorm.length > 0 && [...tokNorm].every((c) => DIGIT_CLASS.test(c));
}

/** Whether the digits at `[at, at+len)` in `norm` are glued to MORE digits on either side — i.e.
 *  this occurrence is a fragment of a longer number, not the number itself. */
function gluedToLongerNumber(norm: string, at: number, len: number): boolean {
  const before = at > 0 ? norm[at - 1] : '';
  const after = at + len < norm.length ? norm[at + len] : '';
  return DIGIT_CLASS.test(before) || DIGIT_CLASS.test(after);
}

/** Find the first text node inside the host whose content carries one of the tokens,
 *  returning the exact character range of the match. Chrome the hand itself added (or
 *  controls like the per-block Ask button) never count as content. A bare-number token
 *  ("5") skips a would-be match that's actually part of a longer number ("$5,000",
 *  "500") and keeps looking, rather than drawing on the wrong value. */
export function findSaidMatch(host: Element, tokens: string[]): SaidMatch | null {
  for (const tok of tokens) {
    const tokNorm = normWithMap(tok).norm;
    if (tokNorm.length < 2) continue;
    const numeric = isBareNumber(tokNorm);
    const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const text = node as Text;
      const raw = text.textContent ?? '';
      if (!raw.trim()) continue;
      if (text.parentElement?.closest('.ink-layer, .block-ask, .card-eyebrow')) continue;
      const { norm, map } = normWithMap(raw);
      let at = norm.indexOf(tokNorm);
      while (at >= 0) {
        if (!numeric || !gluedToLongerNumber(norm, at, tokNorm.length)) {
          return { node: text, start: map[at], end: map[at + tokNorm.length - 1] + 1 };
        }
        at = norm.indexOf(tokNorm, at + 1);
      }
    }
  }
  return null;
}

/** Shortest/longest card label worth echoing. Under 4 chars matches noise ("of", "km"); over 40 is
 *  a sentence, not a label, and underlining it would smear across the card. */
const ECHO_MIN_CHARS = 4;
const ECHO_MAX_CHARS = 40;
/** Function words that can legitimately appear as a standalone label but carry no meaning to point
 *  at — underlining "into" because the line said "flows into the book" is worse than drawing nothing. */
const ECHO_STOPWORDS = new Set([
  'the',
  'and',
  'with',
  'from',
  'into',
  'this',
  'that',
  'then',
  'than',
  'over',
  'under',
  'each',
  'both',
  'more',
  'less',
  'total',
  'other',
]);

/** The card's own label, echoed back by the spoken line.
 *
 *  `saidTokens` can only locate what the line spells out as a figure or a Capitalized name. A line
 *  of ordinary prose about a diagram — "think of the order book as a reservoir" — yields neither
 *  (its only capital is a sentence opener), so the generous path found nothing and a teach turn
 *  logged gestures that could never draw. Search the other direction: take the labels the CARD
 *  actually renders and find the longest one the line mentions. That is still the model's own
 *  words, just lowercase, so it never invents a target the line wasn't talking about. */
export function findEchoedLabel(host: Element, line: string): SaidMatch | null {
  const spoken = normWithMap(line).norm;
  if (spoken.length < ECHO_MIN_CHARS) return null;
  const seen = new Set<string>();
  const candidates: string[] = [];
  const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const raw = (node.textContent ?? '').trim();
    if (raw.length < ECHO_MIN_CHARS || raw.length > ECHO_MAX_CHARS) continue;
    if ((node as Text).parentElement?.closest('.ink-layer, .block-ask, .card-eyebrow')) continue;
    const norm = normWithMap(raw).norm;
    if (norm.length < ECHO_MIN_CHARS || ECHO_STOPWORDS.has(norm) || seen.has(norm)) continue;
    if (!spoken.includes(norm)) continue;
    seen.add(norm);
    candidates.push(raw);
  }
  // Longest first: "order book" is the thing being talked about, "order" is a fragment of it.
  candidates.sort((a, b) => b.length - a.length);
  return candidates.length ? findSaidMatch(host, candidates) : null;
}

/** The row-like container around a matched label — so "circle Seattle" loops the Seattle
 *  row (its bar and value), not just the word. Bounded to a few hops and to row-shaped
 *  elements; null when the text isn't part of a recognizable row. */
export function rowOf(match: SaidMatch, host: Element): Element | null {
  let el: Element | null = match.node.parentElement;
  for (let hops = 0; el && el !== host && hops < 4; hops++, el = el.parentElement) {
    if (
      el.matches(
        'li, tr, .bar-col, .cat-row, .kpi, [class*="-row"], [class*="-item"], [class*="-col"]',
      )
    ) {
      return el;
    }
  }
  return null;
}

/** The viewport rect of the matched words themselves (first line box when wrapped),
 *  via a DOM Range — null when layout gives nothing (jsdom, display:none). */
export function saidRect(match: SaidMatch): DOMRect | null {
  const range = document.createRange();
  range.setStart(match.node, match.start);
  range.setEnd(match.node, match.end);
  // jsdom's Range measures nothing — the caller falls back to element-level targets there.
  if (typeof range.getClientRects !== 'function') return null;
  const rects = range.getClientRects();
  const r = rects.length > 0 ? rects[0] : range.getBoundingClientRect();
  return r && r.width > 0 && r.height > 0 ? r : null;
}

/** EVERY line box of the matched words — a phrase that wraps reports one rect per rendered
 *  line, so a highlight can re-touch each row the way a real marker does. Empty when layout
 *  gives nothing (jsdom), where callers keep the single-box path via `saidRect`'s fallback. */
export function saidRects(match: SaidMatch): DOMRect[] {
  const range = document.createRange();
  range.setStart(match.node, match.start);
  range.setEnd(match.node, match.end);
  if (typeof range.getClientRects !== 'function') return [];
  return Array.from(range.getClientRects()).filter((r) => r.width > 0 && r.height > 0);
}
