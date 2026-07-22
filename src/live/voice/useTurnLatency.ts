// Honest time-to-first-word for the topbar's model pill: the stretch from "the ask left"
// (status enters thinking) to "the answer started" (speaking, or showing when narration
// never streamed). Measured, never estimated — the pill stays empty until a real turn
// has been clocked, and keeps the last settled reading between turns.
import { useEffect, useRef, useState } from 'react';
import type { LiveStatus } from '../useLiveTurn';

export function useTurnLatency(status: LiveStatus): number | null {
  const t0 = useRef<number | null>(null);
  const [ms, setMs] = useState<number | null>(null);
  useEffect(() => {
    if (status === 'thinking') {
      t0.current = performance.now();
      return;
    }
    if ((status === 'speaking' || status === 'showing') && t0.current !== null) {
      setMs(Math.round(performance.now() - t0.current));
      t0.current = null;
    }
  }, [status]);
  return ms;
}

/** "96ms" under a second, "1.4s" above — the instrument-readout format. */
export function formatLatency(ms: number | null): string | null {
  if (ms === null || !Number.isFinite(ms) || ms < 0) return null;
  return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`;
}
