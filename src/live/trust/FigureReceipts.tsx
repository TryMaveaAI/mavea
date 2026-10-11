// FigureReceipts.tsx — lets a card's printed figures open the sentence that states them. Live wraps
// the canvas in this with the answer's ContentGraph; a card's figure asks the context for a receipt
// and becomes a control only when there is one. One card is open at a time, and a new answer closes
// it: a receipt left up would attach an old proof to a new number.
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import { createPreloadableLazy } from '../../lib/preloadableLazy';
import {
  FigureReceiptsContext,
  type FigureReceipts as Receipts,
} from '../../canvas/figures/figureContext';
import { figureIndex, receiptFor } from '../content/figureIndex';
import type { Block } from '../../data/conversation';
import type { ContentGraph } from '../content/types';

const cardLoad = createPreloadableLazy(() => import('./FigureReceiptCard'));
const FigureReceiptCard = cardLoad.Component;

export function FigureReceipts({
  blocks,
  content,
  children,
}: {
  /** The blocks the canvas draws — the list `content` was read from. */
  blocks: readonly Block[] | undefined;
  /** The answer's figures, grounded against its sources; null when the turn had none. */
  content: ContentGraph | null;
  children: ReactNode;
}): ReactElement {
  const [card, setCard] = useState<{ valueId: string; anchorRect: DOMRect } | null>(null);
  const [hinted, setHinted] = useState(false);

  const index = useMemo(
    () => (blocks && content ? figureIndex(blocks, content) : null),
    [blocks, content],
  );
  useEffect(() => setCard(null), [index]);
  // An answer with something to prove fetches the card's chunk while the reader is still reading,
  // so the first press opens at once. An answer with nothing to prove fetches nothing.
  const hasReceipts = !!index && index.byKey.size > 0;
  useEffect(() => {
    if (hasReceipts) void cardLoad.preload();
  }, [hasReceipts]);

  const receipts = useMemo<Receipts | null>(
    () =>
      index && hasReceipts
        ? {
            idFor: (blockId, label, shown) => receiptFor(index, blockId, label, shown),
            open: (valueId, anchor) => {
              // Safari and Firefox on macOS do not focus a button on click, and the card's focus
              // trap hands focus back to whatever held it when it opened.
              anchor.focus();
              setCard({ valueId, anchorRect: anchor.getBoundingClientRect() });
            },
          }
        : null,
    [index, hasReceipts],
  );
  const dismiss = useCallback(() => setCard(null), []);
  // The card is fixed to where the figure WAS; once the answer scrolls it points at nothing. A scroll
  // inside the card itself (a long quote) is the reader reading it.
  const open = card !== null;
  useEffect(() => {
    if (!open) return;
    const onScroll = (e: Event): void => {
      if (e.target instanceof Element && e.target.closest('.tr-card')) return;
      setCard(null);
    };
    window.addEventListener('scroll', onScroll, { capture: true, passive: true });
    return () => window.removeEventListener('scroll', onScroll, { capture: true });
  }, [open]);
  const markHinted = useCallback(() => setHinted(true), []);

  return (
    <FigureReceiptsContext.Provider value={receipts}>
      {children}
      {card && index && (
        <Suspense fallback={null}>
          <FigureReceiptCard
            registry={index.trust}
            valueId={card.valueId}
            anchorRect={card.anchorRect}
            hinted={hinted}
            onMarkHinted={markHinted}
            onDismiss={dismiss}
          />
        </Suspense>
      )}
    </FigureReceiptsContext.Provider>
  );
}
