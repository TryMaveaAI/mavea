// types.ts — the SearchProvider seam. Mirrors the ProviderAdapter shape: one
// interface, swappable implementations. A search provider takes a query and
// returns ranked results; generateLive injects them as context (retrieve-then-read)
// and surfaces them as citations. The keyless Wikipedia provider is the free
// default; keyed providers (Brave/Tavily) ride the /search proxy (added later).

/** One web result, normalized across providers. */
export interface SearchResult {
  title: string;
  url: string;
  /** A short plain-text snippet (HTML stripped). */
  snippet: string;
}

/** Options for one search: the user's key (keyed providers) + an abort signal. The optional
 *  `limit` lets a caller honor an explicit "give me 10 results" ask; providers fall back to
 *  their own small default when it's absent. */
export interface SearchOpts {
  apiKey?: string;
  signal?: AbortSignal;
  limit?: number;
}

/** A connected search backend. `search` never throws — it resolves to [] on any
 *  failure so a grounded turn degrades to an ungrounded one instead of breaking. */
export interface SearchProvider {
  id: SearchProviderId;
  /** Keyless providers (Wikipedia) work browser-direct; keyed ones need a proxy + key. */
  needsKey: boolean;
  search(query: string, opts?: SearchOpts): Promise<SearchResult[]>;
}

export type SearchProviderId = 'wikipedia' | 'brave' | 'tavily';
