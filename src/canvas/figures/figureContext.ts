// figureContext.ts — the channel between a figure a card prints and the sentence that states it.
// The host (Live) knows which of an answer's figures its own sources state; a card knows only its
// block and the text it prints. Split from the component so the contexts stay a plain module and
// every .tsx exports components only.
import { createContext, useContext } from 'react';

export interface FigureReceipts {
  /** The receipt for the figure a block prints as `shown` beside `label`, or undefined when no
   *  source sentence states it. `shown` is checked against the receipt's own number, so two figures
   *  that share a label can never borrow each other's proof. */
  idFor: (blockId: string, label: string, shown: string) => string | undefined;
  /** Open the receipt, anchored to the control the reader pressed. */
  open: (valueId: string, anchor: HTMLElement) => void;
}

export const FigureReceiptsContext = createContext<FigureReceipts | null>(null);

/** The top-level block a card belongs to, set by the canvas around each block it draws. A block
 *  nested in a composite looks up under the composite, which carries no figures of its own, so its
 *  figures stay plain. */
export const FigureBlockContext = createContext<string | null>(null);

/** How to open the receipt for one printed figure, or null when it has none. */
export function useFigureReceipt(
  label: string,
  shown: string,
): ((anchor: HTMLElement) => void) | null {
  const receipts = useContext(FigureReceiptsContext);
  const blockId = useContext(FigureBlockContext);
  const id = receipts && blockId !== null ? receipts.idFor(blockId, label, shown) : undefined;
  if (!receipts || id === undefined) return null;
  return (anchor) => receipts.open(id, anchor);
}
