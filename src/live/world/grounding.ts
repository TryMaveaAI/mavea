// world/grounding.ts — the evidence a world will be built FROM, parked by the turn that offered it.
//
// A world is exploded only when the reader opens one, which can be minutes after the turn that
// offered it. Re-fetching the grounding then would spend the user's search budget a second time on
// material the turn already had, so the turn parks what it is ALREADY holding — the files the user
// attached and the sources its answer cited — and the explode assembles its corpus from that, on
// demand. Nothing here searches: a world with nothing parked is honestly structure-only (all-T0),
// which is exactly what an ungrounded world should be.
import type { WebSource } from '../../data/conversation';
import type { Attachment } from '../attachments';
import { attachmentsToText } from '../why/corpus';

/** Two questions' worth, no more. The parked attachments are the user's real files — the same
 *  objects the composer holds, so parking costs nothing while they are attached, but it KEEPS them
 *  alive after they are cleared. Without a cap that is a session-long leak keyed by question text:
 *  whole documents held for worlds nobody ever opens. Two is what the surface can actually use —
 *  the world on screen, and the one the reader just asked about. */
export const GROUNDING_CAP = 2;
/** why/corpus' own ceiling — the same corpus, assembled from cheaper material. */
const MAX_CHARS = 8000;

interface TurnGrounding {
  attachments: readonly Attachment[];
  sources: readonly WebSource[];
}

const parked = new Map<string, TurnGrounding>();

/** Park a turn's own grounding under the question its world card carries. Re-parking the same
 *  question refreshes it (and its recency), so a re-ask grounds on the newer turn. */
export function rememberTurnGrounding(question: string, grounding: TurnGrounding): void {
  parked.delete(question);
  parked.set(question, grounding);
  // Map iterates in insertion order, so the first key is always the least recently parked.
  while (parked.size > GROUNDING_CAP) {
    const oldest = parked.keys().next().value;
    if (oldest === undefined) break;
    parked.delete(oldest);
  }
}

/** The grounding corpus for `question`, assembled from parked material ONLY — never a new fetch.
 *  Empty when the turn had nothing to give, which the explode degrades to honestly. */
export async function turnCorpus(question: string): Promise<string> {
  const grounding = parked.get(question);
  if (!grounding) return '';
  const fromFiles = await attachmentsToText(grounding.attachments);
  const fromWeb = grounding.sources
    .map((s) => (s.url ? `${s.title}. ${s.url}` : s.title))
    .filter((line) => line.trim())
    .join('\n');
  return [fromFiles, fromWeb]
    .filter((s) => s.trim())
    .join('\n\n')
    .slice(0, MAX_CHARS);
}
