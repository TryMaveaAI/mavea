import { useEffect, useRef, type ReactElement } from 'react';
import { AskPanel } from './AskPanel';
import { useAsk } from './useAsk';
import type { AnswerSpan, AskAnswer } from './types';
import type { AskContext } from './ask';

export interface PrismAskControllerProps {
  open: boolean;
  ctx: AskContext;
  seed?: { id: number; question: string } | null;
  onAnswer: (answer: AskAnswer) => void;
  onFocusSpan: (span: AnswerSpan) => void;
  activeSpan: AnswerSpan | null;
  multiDoc: boolean;
  docLabel: (doc: number) => string;
  onClose: () => void;
}

/** Owns Ask's provider/controller graph and is not imported until the dock is first opened. */
export function PrismAskController({
  open,
  ctx,
  seed,
  onAnswer,
  onFocusSpan,
  activeSpan,
  multiDoc,
  docLabel,
  onClose,
}: PrismAskControllerProps): ReactElement | null {
  const { turns, busy, ask } = useAsk(ctx, onAnswer);
  const askedSeed = useRef<number | null>(null);

  useEffect(() => {
    if (!open || !seed || askedSeed.current === seed.id) return;
    askedSeed.current = seed.id;
    ask(seed.question);
  }, [ask, open, seed]);

  if (!open) return null;
  return (
    <AskPanel
      turns={turns}
      busy={busy}
      onAsk={ask}
      onFocusSpan={onFocusSpan}
      activeSpan={activeSpan}
      multiDoc={multiDoc}
      docLabel={docLabel}
      onClose={onClose}
    />
  );
}
