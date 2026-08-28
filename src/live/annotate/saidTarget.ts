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

/** Chrome the hand itself added, or controls like the per-block Ask button — never content. */
const NOT_CONTENT = '.ink-layer, .block-ask, .card-eyebrow';

/** One searchable text node: its raw text plus the normalized form and index map, computed ONCE. */
interface TextRun {
  node: Text;
  raw: string;
  norm: string;
  map: number[];
}

/** Every text run inside the host worth searching, in document order.
 *
 *  Walked once per lookup, not once per token: a mark offers up to a dozen tokens (the line's
 *  figures, its names, or every label the card renders), and a walker per token made marking one
 *  card N walks of its whole subtree — with a fresh `normWithMap` of every node inside each. The
 *  normalized form doesn't depend on the token, so it is computed here and reused. */
function textRuns(host: Element): TextRun[] {
  const runs: TextRun[] = [];
  const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node as Text;
    const raw = text.textContent ?? '';
    if (!raw.trim()) continue;
    if (text.parentElement?.closest(NOT_CONTENT)) continue;
    const { norm, map } = normWithMap(raw);
    runs.push({ node: text, raw, norm, map });
  }
  return runs;
}

/** First token (in the caller's priority order) that any run carries, and where. */
function matchIn(runs: readonly TextRun[], tokens: string[]): SaidMatch | null {
  for (const tok of tokens) {
    const tokNorm = normWithMap(tok).norm;
    if (tokNorm.length < 2) continue;
    const numeric = isBareNumber(tokNorm);
    for (const { node, norm, map } of runs) {
      let at = norm.indexOf(tokNorm);
      while (at >= 0) {
        if (!numeric || !gluedToLongerNumber(norm, at, tokNorm.length)) {
          return { node, start: map[at], end: map[at + tokNorm.length - 1] + 1 };
        }
        at = norm.indexOf(tokNorm, at + 1);
      }
    }
  }
  return null;
}

/** Find the first text node inside the host whose content carries one of the tokens,
 *  returning the exact character range of the match. Chrome the hand itself added (or
 *  controls like the per-block Ask button) never count as content. A bare-number token
 *  ("5") skips a would-be match that's actually part of a longer number ("$5,000",
 *  "500") and keeps looking, rather than drawing on the wrong value. */
export function findSaidMatch(host: Element, tokens: string[]): SaidMatch | null {
  return matchIn(textRuns(host), tokens);
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
  return echoedIn(textRuns(host), line);
}

function echoedIn(runs: readonly TextRun[], line: string): SaidMatch | null {
  const spoken = normWithMap(line).norm;
  if (spoken.length < ECHO_MIN_CHARS) return null;
  const seen = new Set<string>();
  const candidates: string[] = [];
  for (const run of runs) {
    // `normWithMap` drops whitespace, so the run's normalized form is the trimmed label's too.
    const raw = run.raw.trim();
    if (raw.length < ECHO_MIN_CHARS || raw.length > ECHO_MAX_CHARS) continue;
    const norm = run.norm;
    if (norm.length < ECHO_MIN_CHARS || ECHO_STOPWORDS.has(norm) || seen.has(norm)) continue;
    if (!spoken.includes(norm)) continue;
    seen.add(norm);
    candidates.push(raw);
  }
  // Longest first: "order book" is the thing being talked about, "order" is a fragment of it.
  candidates.sort((a, b) => b.length - a.length);
  // The SAME walk answers the lookup — going back through `findSaidMatch` re-walked the card once
  // per candidate, and a label-rich card offers plenty.
  return candidates.length ? matchIn(runs, candidates) : null;
}

/** One read of a card's text, shared by every lookup a single placement makes.
 *
 *  Placing one mark asks the same card up to four questions — the model's named text and a span's
 *  far anchor, or (generously) the line's figures, then its names, then the labels the card itself
 *  renders. Each was its own walk, on a path that re-runs per measurement while the canvas streams.
 *  One `SaidText` answers them all off a single walk; a fresh one per measurement is what keeps a
 *  card that has since re-rendered from being matched against stale text nodes. */
export interface SaidText {
  /** First of `tokens` (in the caller's priority order) that the card carries, and where. */
  find(tokens: string[]): SaidMatch | null;
  /** The longest label the card renders that this line names in plain prose. */
  echoed(line: string): SaidMatch | null;
}

export function readSaidText(host: Element): SaidText {
  const runs = textRuns(host);
  return {
    find: (tokens) => matchIn(runs, tokens),
    echoed: (line) => echoedIn(runs, line),
  };
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
/**
 * Whether text a reader could actually reach.
 *
 * `getClientRects` reports where text WOULD be; it knows nothing about an ancestor's overflow. A
 * collapsed accordion keeps its content laid out and clips it to no height, so the words inside hand
 * back a perfectly ordinary box sitting at the closed section's own position — and a pen stroke drawn
 * there loops blank space beside the header. That is worse than no mark: it reads as the feature being
 * broken rather than as a gesture with nowhere to land.
 *
 * The test is COLLAPSED, not "currently on screen". Intersecting the target against every clipping
 * ancestor also refuses a target the reader has merely scrolled past — and that one is still a target,
 * because the layer scrolls its own scroller to bring it back (`scrollerOf`). A scroller has a real
 * box; a closed section has none. So: does any ancestor that clips have nothing left to clip into?
 */
const clips = (cs: CSSStyleDeclaration): boolean =>
  [cs.overflow, cs.overflowX, cs.overflowY].some((v) => v !== '' && v !== 'visible');

export function reachable(node: Node): boolean {
  const start = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
  for (let el = start; el; el = el.parentElement) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) {
      return false;
    }
    // The shorthand as well as both axes: a stylesheet may set any of the three, and not every
    // engine expands `overflow: hidden` into `overflow-x`/`overflow-y` on the computed style.
    if (!clips(cs)) continue;
    const box = el.getBoundingClientRect();
    if (box.height <= 1 || box.width <= 1) return false;
  }
  return true;
}

export function saidRect(match: SaidMatch): DOMRect | null {
  const range = document.createRange();
  range.setStart(match.node, match.start);
  range.setEnd(match.node, match.end);
  // jsdom's Range measures nothing — the caller falls back to element-level targets there.
  if (typeof range.getClientRects !== 'function') return null;
  const rects = range.getClientRects();
  const r = rects.length > 0 ? rects[0] : range.getBoundingClientRect();
  if (!r || r.width <= 0 || r.height <= 0) return null;
  return reachable(match.node) ? r : null;
}

/** EVERY line box of the matched words — a phrase that wraps reports one rect per rendered
 *  line, so a highlight can re-touch each row the way a real marker does. Empty when layout
 *  gives nothing (jsdom), where callers keep the single-box path via `saidRect`'s fallback. */
export function saidRects(match: SaidMatch): DOMRect[] {
  const range = document.createRange();
  range.setStart(match.node, match.start);
  range.setEnd(match.node, match.end);
  if (typeof range.getClientRects !== 'function') return [];
  if (!reachable(match.node)) return [];
  return Array.from(range.getClientRects()).filter((r) => r.width > 0 && r.height > 0);
}
