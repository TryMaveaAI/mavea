// ask/useRippleAsk.ts — drives the repo ask thread. Each question becomes a turn that resolves to a
// grounded answer; the thread accumulates so findings build up across a session. One question is
// answered at a time (a new ask is ignored while one is in flight — the rail disables its send
// button to match), and everything aborts cleanly on reset/unmount. Mirrors Prism's useAsk
// (ask/useAsk.ts) exactly; the only difference is the answerer (askRepo vs. askDocument).
import { useCallback, useEffect, useRef, useState } from 'react';
import { askRepo, type RepoAskContext } from './repoAsk';
import type { RepoAskAnswer, RepoAskTurn } from './types';

export interface UseRippleAskReturn {
  turns: RepoAskTurn[];
  busy: boolean;
  ask: (question: string) => void;
  reset: () => void;
}

export function useRippleAsk(
  ctx: RepoAskContext | null,
  onAnswer?: (answer: RepoAskAnswer, question: string) => void,
): UseRippleAskReturn {
  const [turns, setTurns] = useState<RepoAskTurn[]>([]);
  const [busy, setBusy] = useState(false);
  // Latest context/callback read at ask time, so a long-lived `ask` never closes over stale props.
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;
  const onAnswerRef = useRef(onAnswer);
  onAnswerRef.current = onAnswer;
  const abortRef = useRef<AbortController | null>(null);
  const pendingRef = useRef(false);
  const idRef = useRef(0);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    pendingRef.current = false;
    setBusy(false);
    setTurns([]);
  }, []);

  useEffect(() => () => abortRef.current?.abort(), []);

  const ask = useCallback((question: string) => {
    if (pendingRef.current) return; // one question at a time
    const q = question.trim();
    const base = ctxRef.current;
    if (!q || !base) return;
    const ac = new AbortController();
    abortRef.current = ac;
    pendingRef.current = true;
    setBusy(true);
    const id = `q${(idRef.current += 1)}`;
    setTurns((t) => [...t, { id, question: q, status: 'pending' }]);
    askRepo(q, { ...base, signal: ac.signal })
      .then((answer) => {
        if (ac.signal.aborted) return;
        pendingRef.current = false;
        setBusy(false);
        setTurns((t) => t.map((x) => (x.id === id ? { ...x, status: 'done', answer } : x)));
        onAnswerRef.current?.(answer, q);
      })
      .catch((err: unknown) => {
        if (ac.signal.aborted) return;
        pendingRef.current = false;
        setBusy(false);
        const msg = err instanceof Error ? err.message : 'Could not answer.';
        setTurns((t) => t.map((x) => (x.id === id ? { ...x, status: 'error', error: msg } : x)));
      });
  }, []);

  return { turns, busy, ask, reset };
}
