// extractCards.ts — pull flashcard data out of a canvas block list so it can be
// fed into the SRS store. Strips HTML tags from front/back so the store sees plain
// text (the card viewer re-renders with formatting; the SRS key is the text itself).
import type { Block } from '../../data/conversation';

/** A flashcard block as it arrives from the canvas — narrow just enough to read props. */
type FlashcardBlock = {
  type: 'flashcard';
  props: { cards: Array<{ front: string; back: string; tag?: string }> };
};

function isFlashcardBlock(b: Block): b is Block & FlashcardBlock {
  return (
    b.type === 'flashcard' &&
    Array.isArray((b as unknown as { props?: { cards?: unknown } }).props?.cards)
  );
}

export function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, '').trim();
}

/**
 * Extract all flashcard front/back pairs from a block list as plain text.
 * Deduplication is deferred to the store layer — this just returns everything found.
 */
export function extractFlashcards(
  blocks: Block[],
): Array<{ front: string; back: string; tag?: string }> {
  const result: Array<{ front: string; back: string; tag?: string }> = [];
  for (const block of blocks) {
    if (!isFlashcardBlock(block)) continue;
    const raw = block as unknown as FlashcardBlock;
    for (const card of raw.props.cards) {
      const front = stripHtml(card.front ?? '');
      const back = stripHtml(card.back ?? '');
      if (!front || !back) continue;
      result.push({
        front,
        back,
        tag: card.tag ? stripHtml(card.tag) : undefined,
      });
    }
  }
  return result;
}
