// tavily.ts — the Tavily Search provider (an LLM-tuned search API with clean,
// answer-ready snippets). BYOK: the user pastes their own Tavily key (free tier
// available). Tavily expects a server-side call, so it rides the same-origin
// /search/tavily proxy, which forwards the Bearer key. Feeds retrieve-then-read.
import type { SearchProvider, SearchResult, SearchOpts } from './types';
import { timedFetch } from './net';
import { stripHtml } from './wikipedia';
import { resultLimit } from './limit';

const PROXY_BASE = '/search/tavily';
const PATH = '/search';
const TIMEOUT_MS = 8_000;

interface TavilyHit {
  title?: unknown;
  url?: unknown;
  content?: unknown;
}

/** Parse Tavily's response (results[]) into normalized results. */
export function parseTavily(body: unknown): SearchResult[] {
  const hits = Array.isArray((body as { results?: unknown } | null)?.results)
    ? ((body as { results: unknown[] }).results as TavilyHit[])
    : [];
  const out: SearchResult[] = [];
  for (const h of hits) {
    const url = typeof h.url === 'string' ? h.url : '';
    const title = typeof h.title === 'string' ? h.title : '';
    if (!url || !title) continue;
    out.push({ title: stripHtml(title), url, snippet: stripHtml(String(h.content ?? '')) });
  }
  return out;
}

export const tavilyProvider: SearchProvider = {
  id: 'tavily',
  needsKey: true,
  async search(query: string, opts: SearchOpts = {}): Promise<SearchResult[]> {
    const q = query.trim();
    if (!q || !opts.apiKey) return [];
    const res = await timedFetch(
      `${PROXY_BASE}${PATH}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${opts.apiKey}` },
        body: JSON.stringify({
          query: q,
          max_results: resultLimit(opts.limit),
          search_depth: 'basic',
        }),
      },
      TIMEOUT_MS,
      opts.signal,
    );
    if (!res?.ok) return [];
    try {
      return parseTavily(await res.json());
    } catch {
      return [];
    }
  },
};
