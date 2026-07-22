// Fold a conversation's per-turn frames into chapters + moments — the model behind the scrubber
// strip and the Overview. A "chapter" is a run of turns on one subject; a "moment" is one ask
// within it. The split mirrors what the user actually perceives: a turn that REPLACED the canvas
// started a fresh subject, while an augment/refine kept building the same one.
//
// Pure, dependency-free, never throws. No React, no clock — derivation is a function of the frames.
import type { TurnFrame } from '../history';
import type { Mode } from '../lifecycle';
import type { AccentVar, Block } from '../../data/conversation';
import type { IconKey } from '../../types/mavea';
import { blockLabel } from '../../canvas/blockLabel';
import { threadStarts } from '../semantic/threads';

/** One navigable element of a moment's answer — a single canvas block (the comparison table, the
 *  chart, the map…). Its `id` matches the block's `data-spot-id`, so the Overview can scroll to and
 *  flash that exact card, not just the turn it lives in. */
export interface MomentElement {
  id: string;
  label: string;
  /** A small leading glyph classifying the block's kind. */
  icon?: IconKey;
}

/** One ask within a chapter, pointing back at the frame it came from. */
export interface Moment {
  /** Index into the original frames array — the scrubber jumps the canvas here. */
  frameIndex: number;
  question: string;
  /** The kind of ask, for the little leading glyph in the Overview. */
  icon: IconKey;
  mode: Mode;
  /** The answer's own blocks, each a jump target one level below the ask. Empty when the answer has
   *  no navigable cards. Additive — the scrubber strip ignores it. */
  elements: MomentElement[];
}

/** A run of moments on one subject. */
export interface Chapter {
  /** Stable across appends (derived from the first frame's index), so React keys don't churn. */
  id: string;
  title: string;
  /** A CSS color for the track tint + chapter dot. */
  color: string;
  moments: Moment[];
}

/**
 * Per-chapter tints, cycled by chapter ordinal. Chosen for distinctness; `--text-muted` is left out
 * (it reads as "no chapter"). Ordinals only ever grow as frames append, so a chapter's colour never
 * shifts under it.
 */
export const CHAPTER_PALETTE: readonly AccentVar[] = [
  'var(--presence)',
  'var(--insight)',
  'var(--warning)',
  'var(--presence-deep)',
  'var(--insight-soft)',
  'var(--danger)',
  'var(--presence-soft)',
  'var(--warning-soft)',
];

const LEADING_QUESTION_WORD =
  /^(how|what|why|should|can|could|would|will|plan|show|make|build|tell|give|explain|who|when|where|which|is|are|do|does|did|help|me)\b[\s,]*/i;

/** Trim a real string down to a short subject label on a word boundary (never invents text). */
function shortLabel(raw: string, max = 36): string {
  const s = raw.trim().replace(/\s+/g, ' ');
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > max * 0.5 ? cut.slice(0, lastSpace) : cut).replace(/[\s,.;:–-]+$/, '') + '…';
}

/** A chapter title from real content only: the answer's own title, else the (stripped) question. */
function chapterTitle(first: TurnFrame): string {
  const t = first.spec?.title?.trim();
  if (t) return shortLabel(t);
  const q = first.question?.replace(LEADING_QUESTION_WORD, '').trim();
  if (q) return shortLabel(q.charAt(0).toUpperCase() + q.slice(1));
  return 'Moment';
}

/**
 * Classify an ask into a leading glyph from its wording (word-bounded, most-specific first), so the
 * icon matches what the user said. Defaults to `mic` — a plain spoken question.
 */
export function classifyIntent(question: string): IconKey {
  const q = question.toLowerCase();
  if (/\b(build|model|schema|architecture|data model|pipeline|system|wire up)\b/.test(q))
    return 'layers';
  if (/\b(prove|verify|evidence|sources?|cite|citation|try|test|double-check|check)\b/.test(q))
    return 'check';
  if (/\b(card|dashboard|one-?pager|slide|widget|panel)\b/.test(q)) return 'screen';
  if (/\b(show me|show|generate|draw|chart|graph|diagram|render|visuali[sz]e|design|map)\b/.test(q))
    return 'sparkle';
  return 'mic';
}

/**
 * The leading glyph for a moment's element, chosen from the block's kind so the sub-list reads at a
 * glance — a table for a comparison, a globe for a map, a chart for a plot. Falls back to a small
 * spark for any kind without a dedicated glyph.
 */
const BLOCK_GLYPH: Record<string, IconKey> = {
  compare: 'table',
  standings: 'table',
  scoreboard: 'table',
  table: 'table',
  kpi: 'table',
  chart: 'chart',
  bars: 'chart',
  stack: 'chart',
  scatter: 'chart',
  heat: 'chart',
  donut: 'chart',
  gauge: 'chart',
  ring: 'chart',
  map: 'globe',
  geomap: 'globe',
  gallery: 'image',
  timeline: 'clock',
  quotes: 'quote',
  pullquote: 'quote',
  checklist: 'check',
  checks: 'check',
  insight: 'spark',
  codemap: 'layers',
  schema: 'layers',
  diff: 'layers',
  flow: 'layers',
  pipeline: 'layers',
};

/** Block kinds that are page furniture, not answer content — dropped from the element list even
 *  when the model gave them an id (a divider is a section header, not a thing to jump to). */
const NON_ELEMENT_TYPES = new Set<string>(['divider']);

/** Cap on the element sub-list, so a sprawling answer never walls off the Overview. */
const MAX_ELEMENTS = 8;

/**
 * The navigable elements of one answer: its own canvas blocks, in render order. Only blocks that
 * carry an `id` are listed — an id is exactly what makes a block a spotlightable card (TopicCanvas
 * renders `data-spot-id={block.id}` and treats `!!id` as "is a card"), so an element can never point
 * at something the canvas can't scroll to. Deduped by id, capped, and labelled via {@link blockLabel}.
 * Pure — reads only the blocks it's handed.
 */
function deriveElements(blocks: readonly Block[]): MomentElement[] {
  const elements: MomentElement[] = [];
  const seen = new Set<string>();
  for (const b of blocks) {
    const id = b.id;
    if (!id || seen.has(id) || NON_ELEMENT_TYPES.has(b.type)) continue;
    seen.add(id);
    elements.push({ id, label: blockLabel(b), icon: BLOCK_GLYPH[b.type] ?? 'spark' });
    if (elements.length >= MAX_ELEMENTS) break;
  }
  return elements;
}

/**
 * Group frames into chapters — one chapter per topic thread. When per-frame `vectors` are supplied
 * (the on-device embedder is warm), the boundary is SEMANTIC: a turn opens a new chapter when it's
 * unrelated to the current thread by meaning (see semantic/threads.ts), so a follow-up that reuses
 * few words still stays in its thread. Without vectors it falls back to the `mode` boundary — a
 * `replace` opens a new chapter; `augment`/`refine` extend the current one — byte-identical to before.
 * The very first surviving frame always opens a chapter (so a capped history whose oldest frame
 * happens to be an augment never leaves an orphan moment).
 */
export function deriveChapters(
  frames: readonly TurnFrame[],
  vectors?: readonly (Float32Array | null)[] | null,
): Chapter[] {
  const chapters: Chapter[] = [];
  const starts = threadStarts(frames, vectors ?? null);
  frames.forEach((frame, i) => {
    const moment: Moment = {
      frameIndex: i,
      question: frame.question || '',
      icon: classifyIntent(frame.question || ''),
      mode: frame.mode,
      elements: deriveElements(frame.spec?.blocks ?? []),
    };
    const startsChapter = starts[i];
    if (startsChapter) {
      const ordinal = chapters.length;
      chapters.push({
        id: 'ch-' + i,
        title: chapterTitle(frame),
        color: frame.spec?.tint || CHAPTER_PALETTE[ordinal % CHAPTER_PALETTE.length],
        moments: [moment],
      });
    } else {
      chapters[chapters.length - 1].moments.push(moment);
    }
  });
  return chapters;
}

/** The moment currently on screen — the one whose frame the canvas is showing. */
export function currentMoment(chapters: readonly Chapter[], currentIndex: number): Moment | null {
  for (const ch of chapters) {
    for (const m of ch.moments) if (m.frameIndex === currentIndex) return m;
  }
  return null;
}

/** Total moments across all chapters (the Overview header count). */
export function countMoments(chapters: readonly Chapter[]): number {
  return chapters.reduce((n, ch) => n + ch.moments.length, 0);
}
