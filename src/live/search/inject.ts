// inject.ts — turns search results into (a) a compact context block the model reads
// before answering (retrieve-then-read) and (b) a normalized source list for
// citations. We cap length so grounding never blows the small-model context window.
import type { SearchResult } from './types';
import type { WebSource } from '../../data/conversation';
import { DEFAULT_RESULTS } from './limit';

const MAX_SNIPPET = 240;

/** Build the grounding context string injected ahead of the user's question. `limit` matches
 *  the count the provider fetched, so an explicit "give me 10 sources" ask isn't re-truncated
 *  back to the small default here. */
export function buildSearchContext(
  query: string,
  results: SearchResult[],
  limit = DEFAULT_RESULTS,
): string {
  if (results.length === 0) return '';
  const lines = results.slice(0, limit).map((r, i) => {
    const snip = r.snippet.slice(0, MAX_SNIPPET);
    return `[${i + 1}] ${r.title}: ${snip} (${r.url})`;
  });
  return [`Web search results for "${query}" (use these for facts; cite by title):`, ...lines].join(
    '\n',
  );
}

/** Normalize results into citation sources for the answer. We keep the snippet (capped the
 *  same way the grounding context is) so the evidence panel can show the real passage behind a
 *  claim, not just a bare link. `limit` mirrors the fetched count for the same reason. */
export function toSources(results: SearchResult[], limit = DEFAULT_RESULTS): WebSource[] {
  return results.slice(0, limit).map((r) => ({
    title: r.title,
    url: r.url,
    ...(r.snippet ? { snippet: r.snippet.slice(0, MAX_SNIPPET) } : {}),
  }));
}
