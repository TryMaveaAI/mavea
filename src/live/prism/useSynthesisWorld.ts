// useSynthesisWorld.ts — the lifecycle for a Synthesis World (many sources → one map). Mirrors
// usePrismWorld's idle → igniting → blooming → settled staging, but "blooming" now reports which stage
// the frugal pipeline is on ("Reading 100 sources…", "Finding themes…", "Mapping claims…", "Finding
// contradictions…") because a corpus takes longer to settle than one document and the honest thing is
// to show the work. One AbortController threads into every stage; a superseded run never writes state.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Attachment } from '../attachments';
import type { ModelConfig } from '../../types/mavea';
import { mapCorpus } from './synthesis/mapCorpus';
import { synthesisMapKey, readSynthesisMap, writeSynthesisMap, rehydrateSources } from './cache';
import type { CachedSynthesisMap } from './cache';
import type { CorpusPhase, CorpusSpec } from './synthesis/types';

export interface UseSynthesisWorldReturn {
  phase: CorpusPhase;
  spec: CorpusSpec | null;
  /** Per-source page text the claims were grounded against — kept so corpus Ask verifies verbatim. */
  corpus: string[][] | null;
  /** The surviving source attachments in claim.source order, for the shared source panels. */
  sourcesAtt: Attachment[] | null;
  /** Claims the model proposed before grounding — feeds the shared "N read · M grounded" counter. */
  proposed: number;
  /** The current pipeline stage line, shown under the bloom animation. */
  stage: string;
  error: string | null;
  /** Start (or restart) the synthesis for a pile of sources. `fresh` skips the remembered map
   *  and re-reads every source for real. */
  synthesize: (sources: readonly Attachment[], opts?: { fresh?: boolean }) => void;
  reset: () => void;
}

const IGNITE_MS = 900;

export function useSynthesisWorld(cfg: ModelConfig | null): UseSynthesisWorldReturn {
  const [phase, setPhase] = useState<CorpusPhase>('idle');
  const [spec, setSpec] = useState<CorpusSpec | null>(null);
  const [corpus, setCorpus] = useState<string[][] | null>(null);
  const [sourcesAtt, setSourcesAtt] = useState<Attachment[] | null>(null);
  const [proposed, setProposed] = useState(0);
  const [stage, setStage] = useState('');
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const igniteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
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
    setSourcesAtt(null);
    setProposed(0);
    setStage('');
    setError(null);
  }, [cleanup]);

  const synthesize = useCallback(
    (sources: readonly Attachment[], opts?: { fresh?: boolean }) => {
      if (!cfg) {
        setError('Connect a model to synthesize a corpus.');
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
      setStage(`Reading ${sources.length} sources…`);
      setPhase('igniting');

      igniteTimer.current = setTimeout(() => {
        if (runIdRef.current === runId) setPhase((p) => (p === 'igniting' ? 'blooming' : p));
      }, IGNITE_MS);

      const key = synthesisMapKey(sources, cfg);
      const settle = (res: CachedSynthesisMap) => {
        setSpec(res.spec);
        setCorpus(res.corpus);
        // A remembered map names its sources; it never carries their bytes. The panels get those
        // from the files the reader still has open, matched back by identity.
        setSourcesAtt(rehydrateSources(res.sourcesAtt, sources));
        setProposed(res.proposed);
        setPhase('settled');
      };

      void (async () => {
        try {
          // A corpus already fused from these exact sources under this exact model. Synthesis is
          // the most expensive thing Prism does — many documents, several calls — and re-opening
          // one is the common case, so re-running it charges the reader again for a result that
          // cannot have changed. See prism/cache.ts.
          if (!opts?.fresh) {
            const hit = await readSynthesisMap(key);
            if (runIdRef.current !== runId) return;
            if (hit) {
              settle(hit);
              return;
            }
          }
          const res = await mapCorpus(sources, cfg, ac.signal, {
            onProgress: (s) => {
              if (runIdRef.current === runId) setStage(s);
            },
          });
          if (runIdRef.current !== runId) return;
          if (res.spec) {
            const value: CachedSynthesisMap = {
              spec: res.spec,
              corpus: res.corpus ?? null,
              sourcesAtt: res.sourcesAtt ?? null,
              proposed: res.proposed,
            };
            settle(value);
            // Best-effort; a failed write only costs the next open a re-run. Failures are never
            // written — an error is not a result worth remembering.
            void writeSynthesisMap(key, value);
          } else {
            setError(res.error ?? 'This corpus could not be synthesized.');
            setPhase('error');
          }
        } catch (err: unknown) {
          if (runIdRef.current !== runId) return;
          if (ac.signal.aborted) return;
          setError(err instanceof Error ? err.message : 'Synthesis failed.');
          setPhase('error');
        }
      })();
    },
    [cfg, cleanup],
  );

  return { phase, spec, corpus, sourcesAtt, proposed, stage, error, synthesize, reset };
}
