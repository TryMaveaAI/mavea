// FigureReceiptCard.tsx — the provenance card for a figure on an ordinary answer, in its own chunk:
// the card and its sheet load the first time an answer has a figure to prove, not with Live.
import { useMemo, type ReactElement } from 'react';
import { ProvenanceCard } from './ProvenanceCard';
import type { TrustRegistry } from './registry';
import './trust.css';

const NOOP = (): void => {};

export default function FigureReceiptCard({
  registry,
  valueId,
  anchorRect,
  hinted,
  onMarkHinted,
  onDismiss,
}: {
  registry: TrustRegistry;
  valueId: string;
  anchorRect: DOMRect;
  hinted: boolean;
  onMarkHinted: () => void;
  onDismiss: () => void;
}): ReactElement | null {
  // "Used in" names the card the reader just pressed inside; on an answer that is the only place a
  // figure is ever used, so the section would repeat the card's own title back to them.
  const bare = useMemo<TrustRegistry>(
    () => ({ values: registry.values, usedIn: new Map() }),
    [registry],
  );
  return (
    <ProvenanceCard
      registry={bare}
      valueId={valueId}
      anchorRect={anchorRect}
      trail={[]}
      hinted={hinted}
      onMarkHinted={onMarkHinted}
      onDrill={NOOP}
      onBack={NOOP}
      onDismiss={onDismiss}
    />
  );
}
