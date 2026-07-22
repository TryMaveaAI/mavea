// deckLine.ts — the one-line summary of a course's flashcard deck, shared by the course rail and
// the courses list so the two can't drift. `due` is already zero unless the user chose spaced
// study, so this reads as plain inventory for someone keeping a pile of cards.
import type { SrsCounts } from './store';

export type DeckTally = SrsCounts['decks'][number];

export function deckLine(deck: Pick<DeckTally, 'total' | 'due'>): string {
  if (deck.due > 0) return `${deck.due} card${deck.due === 1 ? '' : 's'} due`;
  return `${deck.total} card${deck.total === 1 ? '' : 's'} saved`;
}
