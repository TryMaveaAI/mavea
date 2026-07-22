// projectText.ts — the textual projection of an arbitrary block's props: the real words the
// model wrote (headings, list rows, step lines), recovered from whatever prop shapes they
// arrived in. FallbackCard renders this when a block's designed component can't — the user
// asked for the CONTENT, so it must survive any render failure. Walks defensively over
// hostile/unknown shapes and never throws; pure and dependency-free.

/** Keys that tend to hold an item's visible text, in the order models actually use them. */
const ITEM_TEXT_KEYS = [
  'text',
  'name',
  'label',
  'title',
  'step',
  'tip',
  'question',
  'prompt',
  'quote',
  'task',
  'term',
  'line',
  'description',
] as const;

/** Keys that tend to hold an item's short value/figure, appended after the text. */
const ITEM_VALUE_KEYS = [
  'value',
  'val',
  'qty',
  'amount',
  'display',
  'stat',
  'time',
  'detail',
] as const;

/** Prop keys that are style/plumbing tokens, never content — excluded from the projection. */
const SKIP_KEYS = new Set([
  'icon',
  'iconColor',
  'color',
  'colorVar',
  'accent',
  'id',
  'key',
  'kind',
  'variant',
  'src',
  'url',
  'href',
  'image',
  'lang',
]);

/** Heading keys, highest priority first (mirrors blockLabel's probe list). */
const TITLE_KEYS = ['title', 'label', 'heading', 'name', 'question', 'eyebrow', 'caption'] as const;

const MAX_LINES = 14;
const MAX_LINE = 200;

function clamp(s: string): string {
  const t = s.trim().replace(/\s+/g, ' ');
  return t.length > MAX_LINE ? t.slice(0, MAX_LINE - 1).trimEnd() + '…' : t;
}

/** A content string worth showing: real words, not a design token or a bare URL. */
function isContentString(v: unknown): v is string {
  return (
    typeof v === 'string' &&
    v.trim().length >= 3 &&
    !v.startsWith('var(--') &&
    !/^https?:\/\//.test(v.trim())
  );
}

/** One readable line for an array item of any shape, or null when it carries no text. */
function textOfItem(item: unknown): string | null {
  if (isContentString(item)) return clamp(item);
  if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
  const o = item as Record<string, unknown>;
  let text: string | null = null;
  for (const k of ITEM_TEXT_KEYS) {
    if (isContentString(o[k])) {
      text = clamp(o[k] as string);
      break;
    }
  }
  if (!text) {
    // No canonical key — a single string field still carries the words; more is ambiguous.
    const strs = Object.values(o).filter(isContentString);
    if (strs.length === 1) text = clamp(strs[0]);
  }
  if (!text) return null;
  for (const k of ITEM_VALUE_KEYS) {
    const v = o[k];
    if ((typeof v === 'string' && v.trim() && v.trim() !== text) || typeof v === 'number') {
      return clamp(`${text} — ${String(v).trim()}`);
    }
  }
  return text;
}

export interface ProjectedText {
  /** The block's own heading, or null when none of its props carries one. */
  title: string | null;
  /** Readable content lines, in the props' own order, capped at MAX_LINES. */
  lines: string[];
  /** How many additional lines were cut by the cap. */
  more: number;
}

/** Project arbitrary block props to a heading + readable lines. Never throws. */
export function projectText(props: unknown): ProjectedText {
  if (!props || typeof props !== 'object' || Array.isArray(props)) {
    return { title: null, lines: [], more: 0 };
  }
  const o = props as Record<string, unknown>;
  let title: string | null = null;
  let titleKey = '';
  for (const k of TITLE_KEYS) {
    if (isContentString(o[k])) {
      title = clamp(o[k] as string);
      titleKey = k;
      break;
    }
  }
  const lines: string[] = [];
  for (const [k, v] of Object.entries(o)) {
    if (k === titleKey || SKIP_KEYS.has(k)) continue;
    if (isContentString(v)) {
      lines.push(clamp(v));
    } else if (Array.isArray(v)) {
      for (const item of v) {
        const line = textOfItem(item);
        if (line) lines.push(line);
      }
    }
  }
  const more = Math.max(0, lines.length - MAX_LINES);
  return { title, lines: lines.slice(0, MAX_LINES), more };
}
