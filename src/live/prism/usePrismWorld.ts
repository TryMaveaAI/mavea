// usePrismWorld.ts — drives the "explode" lifecycle for one PDF: idle → igniting (the shard burst)
// → blooming (the model maps + grounds claims) → settled (the flyable map). One model call via
// mapClaims; the phases are timed so the ignition animation plays while the (real) mapping runs,
// then settles when the grounded spec is in hand. Aborts cleanly on unmount or a new explode.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Attachment } from '../attachments';
import type { ModelConfig } from '../../types/mavea';
import { mapClaims } from './mapClaims';
import type { PrismPhase, PrismSpec } from './types';

export interface UsePrismWorldReturn {
  phase: PrismPhase;
  spec: PrismSpec | null;
  /** The per-document page text the claims were grounded against — kept so "Ask It" can verify an
   *  answer's spans verbatim against the real pages. Null until a map settles. */
  corpus: string[][] | null;
  /** Honest count of claims the model proposed before grounding (for "N grounded of M"). */
  proposed: number;
  error: string | null;
  /** Start (or restart) the explode for one PDF or several (multi-PDF compares them). */
  explode: (pdf: Attachment | readonly Attachment[]) => void;
  /** Return to idle (the document, un-exploded). */
  reset: () => void;
}

// The ignition beat is short — long enough to read as a burst, not a stall. The real work
// (mapClaims) usually outlasts it, so we hold on "blooming" until the spec lands.
const IGNITE_MS = 900;

export function usePrismWorld(cfg: ModelConfig | null): UsePrismWorldReturn {
  const [phase, setPhase] = useState<PrismPhase>('idle');
  const [spec, setSpec] = useState<PrismSpec | null>(null);
  const [corpus, setCorpus] = useState<string[][] | null>(null);
  const [proposed, setProposed] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const igniteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Guards a late mapClaims resolve from a superseded run writing stale state.
  const runIdRef = useRef(0);

  const cleanup = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    if (igniteTimer.current !== null) {
      clearTimeout(igniteTimer.current);
      igniteTimer.current = null;
    }
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const reset = useCallback(() => {
    cleanup();
    runIdRef.current += 1;
    setPhase('idle');
    setSpec(null);
    setCorpus(null);
    setProposed(0);
    setError(null);
  }, [cleanup]);

  const explode = useCallback(
    (pdf: Attachment | readonly Attachment[]) => {
      if (!cfg) {
        setError('Connect a model that reads documents (Anthropic or Gemini) to explode one.');
        setPhase('error');
        return;
      }
      cleanup();
      const runId = (runIdRef.current += 1);
      const ac = new AbortController();
      abortRef.current = ac;
      setSpec(null);
      setCorpus(null);
      setProposed(0);
      setError(null);
      setPhase('igniting');

      // Move to the "blooming" (mapping) phase after the ignition beat — but the model call
      // starts now so the real work overlaps the animation.
      igniteTimer.current = setTimeout(() => {
        if (runIdRef.current === runId) setPhase((p) => (p === 'igniting' ? 'blooming' : p));
      }, IGNITE_MS);

      void mapClaims(pdf, cfg, ac.signal)
        .then((res) => {
          if (runIdRef.current !== runId) return; // superseded
          setProposed(res.proposed);
          if (res.spec) {
            setSpec(res.spec);
            setCorpus(res.corpus ?? null);
            setPhase('settled');
          } else {
            setError(res.error ?? 'This document could not be mapped.');
            setPhase('error');
          }
        })
        .catch((err: unknown) => {
          if (runIdRef.current !== runId) return;
          if (ac.signal.aborted) return; // intentional cancel — stay where the caller left us
          setError(err instanceof Error ? err.message : 'Mapping failed.');
          setPhase('error');
        });
    },
    [cfg, cleanup],
  );

  return { phase, spec, corpus, proposed, error, explode, reset };
}
