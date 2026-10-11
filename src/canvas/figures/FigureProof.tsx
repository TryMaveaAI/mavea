// FigureProof.tsx — a printed figure that can show the sentence stating it. A figure with a receipt
// becomes a button around exactly what the card already prints, wearing a quiet dotted underline at
// rest: the mark means "a source says this", so it is drawn only where that is true. A figure with no
// receipt renders exactly as it did — nothing about it is a control.
import type { ReactElement, ReactNode } from 'react';
import { useFigureReceipt } from './figureContext';
import './figures.css';

export function FigureProof({
  label,
  shown,
  block = false,
  children,
}: {
  /** What the figure measures, as the card labels it. */
  label: string;
  /** The figure as the card prints it ("36%", "$1.2M"). */
  shown: string;
  /** Wraps a graphic (a ring) rather than a run of text. */
  block?: boolean;
  children: ReactNode;
}): ReactElement {
  const open = useFigureReceipt(label, shown);
  if (!open) return <>{children}</>;
  return (
    <button
      type="button"
      className={'fig-proof' + (block ? ' fig-proof--block' : '')}
      onClick={(e) => open(e.currentTarget)}
    >
      {children}
      <span className="fig-proof-sr">, {label}: show the source</span>
    </button>
  );
}
