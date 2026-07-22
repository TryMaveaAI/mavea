// ask/useAsk.ts — drives the ask thread (the research notebook). Each question becomes a turn that
// resolves to a grounded answer; the thread accumulates so findings build up across a session. One
// question is answered at a time (a new ask is ignored while one is in flight — the panel disables its
// send button to match), and everything aborts cleanly on reset/unmount. `onAnswer` lets the overlay
// fly the camera to the first span + light the cited cards the moment an answer lands.
import { useCallback, useEffect, useRef, useState } from 'react';
import { askDocument, type AskContext } from './ask';
import type { AskAnswer, AskTurn } from './types';

export interface UseAskReturn {
  turns: AskTurn[];
  busy: boolean;
  ask: (question: string) => void;
  reset: () => void;
}

export function useAsk(
  ctx: AskContext | null,
  onAnswer?: (answer: AskAnswer, question: string) => void,
): UseAskReturn {
  const [turns, setTurns] = useState<AskTurn[]>([]);
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
    askDocument(q, { ...base, signal: ac.signal })
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
