// brave.ts — the Brave Search provider (higher-quality, real-time web results than
// the keyless Wikipedia default). BYOK: the user pastes their own Brave key (the free
// tier is generous). Brave's API doesn't allow browser-origin calls, so it rides the
// same-origin /search/brave proxy, which forwards the key header — never exposing it
// cross-origin. Results feed the SAME retrieve-then-read pipeline as Wikipedia.
import type { SearchProvider, SearchResult, SearchOpts } from './types';
import { timedFetch } from './net';
import { stripHtml } from './wikipedia';
import { resultLimit } from './limit';

const PROXY_BASE = '/search/brave';
const PATH = '/res/v1/web/search';
const TIMEOUT_MS = 6_000;

/** Build the Brave web-search URL (query + a small result count). */
export function braveSearchUrl(query: string, count = 5): string {
  const params = new URLSearchParams({ q: query, count: String(count) });
  return `${PROXY_BASE}${PATH}?${params.toString()}`;
}

interface BraveHit {
  title?: unknown;
  url?: unknown;
  description?: unknown;
}

/** Parse Brave's response (web.results[]) into normalized results. */
export function parseBrave(body: unknown): SearchResult[] {
  const web = (body as { web?: { results?: unknown } } | null)?.web;
  const hits = Array.isArray(web?.results) ? (web.results as BraveHit[]) : [];
  const out: SearchResult[] = [];
  for (const h of hits) {
    const url = typeof h.url === 'string' ? h.url : '';
    const title = typeof h.title === 'string' ? h.title : '';
    if (!url || !title) continue;
    out.push({ title: stripHtml(title), url, snippet: stripHtml(String(h.description ?? '')) });
  }
  return out;
}

export const braveProvider: SearchProvider = {
  id: 'brave',
  needsKey: true,
  async search(query: string, opts: SearchOpts = {}): Promise<SearchResult[]> {
    const q = query.trim();
    if (!q || !opts.apiKey) return [];
    const res = await timedFetch(
      braveSearchUrl(q, resultLimit(opts.limit)),
      {
        method: 'GET',
        headers: { Accept: 'application/json', 'X-Subscription-Token': opts.apiKey },
      },
      TIMEOUT_MS,
      opts.signal,
    );
    if (!res?.ok) return [];
    try {
      return parseBrave(await res.json());
    } catch {
      return [];
    }
  },
};
