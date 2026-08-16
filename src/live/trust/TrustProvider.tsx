// TrustProvider.tsx — one world, one open card. Any figure on the canvas can ask to be explained;
// exactly one provenance card exists at a time, so a curious reader never buries the answer under a
// field of popovers. The registry arrives as a prop: a new world is a new registry object, which
// makes a new context value, so there is nothing to invalidate — the stale card simply closes.
//
// Render this OUTSIDE any camera-transformed layer. The card is position:fixed against the
// viewport, and a transformed ancestor would re-parent that containing block and slide the card
// off its number. Hosts that pan a camera call `dismiss()` on the handle.
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
  type Ref,
} from 'react';
import { ProvenanceCard } from './ProvenanceCard';
import { TrustContext, type TrustContextValue } from './trustContext';
import type { TrustRegistry, UsedInRef } from './registry';
import './trust.css';

/** What a host can do to the open card from outside React state (a camera pan, a route change). */
export interface TrustHandle {
  dismiss: () => void;
}

interface CardState {
  valueId: string;
  anchorRect: DOMRect;
  /** Ids walked through to reach this one, oldest first — the drill-down breadcrumb. */
  trail: string[];
}

interface TrustProviderProps {
  registry: TrustRegistry;
  onNavigate?: (ref: UsedInRef) => void;
  children: ReactNode;
  ref?: Ref<TrustHandle>;
}

export function TrustProvider({
  registry,
  onNavigate,
  children,
  ref,
}: TrustProviderProps): ReactElement {
  const [card, setCard] = useState<CardState | null>(null);
  const [hinted, setHinted] = useState(false);

  // A new world means new ids and new receipts: whatever was open no longer describes anything on
  // screen, and leaving it up would attach an old proof to a new answer.
  useEffect(() => setCard(null), [registry]);

  const dismiss = useCallback(() => setCard(null), []);
  useImperativeHandle(ref, () => ({ dismiss }), [dismiss]);

  const open = useCallback((valueId: string, anchor: HTMLElement) => {
    // Focus the trigger ourselves — Safari and Firefox on macOS don't focus a button on click, and
    // the card's focus trap hands focus back to whatever was focused when it opened.
    anchor.focus();
    setCard({ valueId, anchorRect: anchor.getBoundingClientRect(), trail: [] });
  }, []);

  const markHinted = useCallback(() => setHinted(true), []);

  const drill = useCallback((valueId: string) => {
    setCard((c) => (c ? { valueId, anchorRect: c.anchorRect, trail: [...c.trail, c.valueId] } : c));
  }, []);

  const back = useCallback(() => {
    setCard((c) => {
      const previous = c?.trail[c.trail.length - 1];
      if (!c || previous === undefined) return c;
      return { valueId: previous, anchorRect: c.anchorRect, trail: c.trail.slice(0, -1) };
    });
  }, []);

  const value = useMemo<TrustContextValue>(
    () => ({ registry, open, onNavigate, hinted, markHinted }),
    [registry, open, onNavigate, hinted, markHinted],
  );

  return (
    <TrustContext.Provider value={value}>
      {children}
      {card && (
        <ProvenanceCard
          registry={registry}
          valueId={card.valueId}
          anchorRect={card.anchorRect}
          trail={card.trail}
          hinted={hinted}
          onMarkHinted={markHinted}
          onDrill={drill}
          onBack={back}
          onNavigate={onNavigate}
          onDismiss={dismiss}
        />
      )}
    </TrustContext.Provider>
  );
}
