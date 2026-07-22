// ask/ — "chat the document; it answers by lighting up." Public surface for the Ask It feature: the
// dock component, the thread hook, and the grounded one-call answerer. Everything stays doc-grounded
// (verbatim spans) and silent by default — see ask.ts / AskPanel.tsx.
export { AskPanel, type AskPanelProps } from './AskPanel';
export { useAsk, type UseAskReturn } from './useAsk';
export { askDocument, selectPages, groundSpans, type AskContext } from './ask';
export type { AskAnswer, AnswerSpan, AskTurn, AskCoverage, OutsideFact } from './types';
