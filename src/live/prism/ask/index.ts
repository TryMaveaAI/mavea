// ask/ — "chat the document; it answers by lighting up." Public surface for the Ask It feature: the
// dock component, the thread hook, and the grounded one-call answerer. Everything stays doc-grounded
// (verbatim spans) and silent by default — see ask.ts / AskPanel.tsx.

export { selectPages, groundSpans } from './ask';
export type { AskTurn } from './types';
