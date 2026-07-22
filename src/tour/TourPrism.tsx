// TourPrism — the walkthrough's Prism host. Replays a baked analysis of a real public document
// through the SAME PrismOverlay a live explode uses, feeding the explode lifecycle externally:
// ignition burst → bloom → the settled map (then the overlay's own auto-briefing flies the claims,
// opening the real source page with its quote highlighted). No model call, no key — but the
// experience uses the same production Prism renderer as exploding your own document.
import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { PrismOverlay } from '../live/prism/PrismOverlay';
import type { ExternalWorld } from '../live/prism/PrismOverlay';
import type { PrismPhase } from '../live/prism/types';
import type { ModelConfig } from '../types/mavea';
import type { TourPrismDoc } from './corpus/prism';

// Mirrors the live lifecycle: usePrismWorld holds ignition ~900ms, then blooms while the model maps.
// The bloom here is fixed (the "mapping" already happened at bake time) — long enough to read as
// real work, short enough to stay snappy.
const IGNITE_MS = 900;
const BLOOM_MS = 1400;

export function TourPrism({
  doc,
  cfg,
  onClose,
}: {
  doc: TourPrismDoc;
  cfg: ModelConfig | null;
  onClose: () => void;
}): ReactElement {
  const [phase, setPhase] = useState<PrismPhase>('igniting');

  useEffect(() => {
    const bloom = setTimeout(() => setPhase('blooming'), IGNITE_MS);
    const settle = setTimeout(() => setPhase('settled'), IGNITE_MS + BLOOM_MS);
    return () => {
      clearTimeout(bloom);
      clearTimeout(settle);
    };
  }, []);

  // corpus stays null (not []): the Ask/analysis features need a live model anyway, and an empty
  // corpus would half-light the Ask panel instead of cleanly hiding it.
  const world = useMemo<ExternalWorld>(
    () => ({
      phase,
      spec: phase === 'settled' ? doc.spec : null,
      corpus: null,
      proposed: doc.proposed,
      error: null,
    }),
    [phase, doc],
  );

  return <PrismOverlay pdf={doc.doc} world={world} cfg={cfg} autoBriefing onClose={onClose} />;
}
