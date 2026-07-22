// Labeled skeletons for the working state — never an unlabeled spinner, and never a
// fabricated fact. Before the first block arrives, the plan is derived from the ask
// itself (its detected data shapes + the user's own words); once blocks stream, the one
// trailing skeleton carries the REAL type of the block being built. Labels only ever
// contain words the user said or honest kind-names; shimmer lines carry no content.
import type { DataShape } from '../../canvas/blocks/catalog/meta';
import type { ChatMessage } from '../providers/types';
import { detectShapes } from '../select/shapes';
import { classifyAsk } from '../select/complexity';

export interface SkeletonCard {
  /** Small-caps eyebrow, e.g. "Comparison — bijan vs gibbs". Ellipsis added by the UI. */
  label: string;
  /** Shimmer line widths (%), purely decorative. */
  lines: number[];
}

/** How a detected shape announces itself — kind names, not content. */
export const SHAPE_LABEL: Partial<Record<DataShape, string>> = {
  scalar: 'Key figure',
  series: 'Trend',
  composition: 'Breakdown',
  comparison: 'Comparison',
  ranking: 'Ranking',
  distribution: 'Distribution',
  relationship: 'Relationship',
  hierarchy: 'Structure',
  flow: 'Process',
  sequence: 'Timeline',
  keyvalue: 'Readouts',
  list: 'Checklist',
  geo: 'Map',
  code: 'Code',
  tabular: 'Table',
  status: 'Status',
};

const LEADING_ASK_WORDS =
  /^(please|hey|ok(ay)?|so|now|can|could|would|will|you|how|what|why|when|where|which|who|should|is|are|do|does|did|tell|show|give|make|build|plan|help|i|me|us|my|about|the|a|an)\b[\s,'’]*/i;

/** A short subject from the user's OWN words — never invented, never reworded. */
export function askTopic(ask: string, maxWords = 4): string {
  let s = ask.trim().replace(/\s+/g, ' ');
  for (let guard = 0; guard < 8; guard++) {
    const next = s.replace(LEADING_ASK_WORDS, '');
    if (next === s) break;
    s = next;
  }
  const words = s
    .replace(/[?!.]+$/, '')
    .split(' ')
    .slice(0, maxWords)
    .join(' ');
  return words.trim();
}

export const LINE_WIDTHS: readonly number[][] = [
  [78, 52],
  [64, 88],
  [82, 40],
];

/** The pre-first-block plan: shape-labeled skeletons around the user's own subject. */
export function skeletonPlan(ask: string, history?: ChatMessage[]): SkeletonCard[] {
  const topic = askTopic(ask);
  const shapes = detectShapes(ask, history);
  const ranked = (Object.entries(shapes) as [DataShape, number][])
    .filter(([shape, w]) => w > 0 && SHAPE_LABEL[shape])
    .sort((a, b) => b[1] - a[1])
    .map(([shape]) => SHAPE_LABEL[shape] as string);
  // A rich answer previews 3 skeleton kinds; a lean or explicitly-brief one previews 2.
  const count = classifyAsk(ask) === 'rich' ? 3 : 2;
  const kinds: string[] = ['Finding'];
  for (const k of ranked) {
    if (kinds.length >= count) break;
    if (!kinds.includes(k)) kinds.push(k);
  }
  while (kinds.length < count) kinds.push(kinds.length === 1 ? 'Readouts' : 'Details');
  return kinds.map((kind, i) => ({
    label: topic ? `${kind} — ${topic}` : kind,
    lines: LINE_WIDTHS[i % LINE_WIDTHS.length],
  }));
}
