// ask/types.ts — the shapes of a repo Ask turn. You ask anything about the repo/PR Ripple is
// showing; the answer comes back with citations pointing at a real file or the diff, plus an honest
// coverage verdict. A citation whose quote can't be verified verbatim is still shown — labeled
// `unpinned` — never silently trusted, never silently dropped. Mirrors Prism's Ask It shapes
// (ask/types.ts) so both features read the same to a maintainer; adapted from pages to files.

/** How well the gathered material answered the question. `full` — wholly answered; `partial` — part
 *  of it is; `none` — nothing gathered addresses it. */
export type AskCoverage = 'full' | 'partial' | 'none';

/** One citation the model offered for its answer: a real path and a quote it claims comes from
 *  there (or from the diff). `unpinned` is set when the quote could NOT be verified verbatim in the
 *  fetched file text or the diff — kept and shown honestly rather than dropped, so a reader can
 *  still judge it, but never presented as a proven quote. */
export interface RepoCitation {
  file: string;
  quote: string;
  unpinned?: boolean;
}

/** A grounded answer to one question about the repo/PR. */
export interface RepoAskAnswer {
  text: string;
  coverage: AskCoverage;
  citations: RepoCitation[];
}

/** One entry in the ask thread: the question and its resolving state. */
export interface RepoAskTurn {
  id: string;
  question: string;
  status: 'pending' | 'done' | 'error';
  answer?: RepoAskAnswer;
  error?: string;
}
