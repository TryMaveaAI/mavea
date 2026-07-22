// The on-device semantic component-fit layer.
//
// Keyword + intent rules (../select) anchor the asks whose wording trips a rule. This layer covers
// the rest: a static text embedder (Model2Vec potion-base-8M, run in pure JS — see encode.ts) scores
// the user's question against a per-component exemplar vector, so a vague or novel ask still reaches
// the right component. It is a STRICT ENHANCEMENT — it runs in a Web Worker, never blocks the answer,
// and degrades to the keyword/intent path on any device that can't or hasn't yet loaded the ~7MB
// model. The selector folds its output in as a bounded, additive boost (see rank.ts `semanticFit`).
export { warmSemanticFit, semanticFit, embedText, resetSemanticFitForTest } from './client';
export { threadStarts, THREAD_KEEP, THREAD_UNRELATED } from './threads';

/** The model the shipped vectors were built with. The query matrix and the component vectors MUST
 *  share this id (the build step versions them together); a mismatch means stale assets, so the
 *  worker refuses to load rather than score in the wrong space. */
export const SEMANTIC_MODEL_ID = 'minishlab/potion-base-8M';

/** Where the build step writes the assets (index.json, matrix.i8, vocab.txt), served statically.
 *  Honors a non-root deploy base. */
export const SEMANTIC_ASSET_BASE = `${import.meta.env.BASE_URL}semantic/`;
