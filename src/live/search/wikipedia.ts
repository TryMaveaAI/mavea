// wikipedia.ts — the keyless, browser-direct search provider (the free default).
// Uses the MediaWiki Action API, which is the one mainstream knowledge source that
// permits anonymous cross-origin reads: appending `origin=*` returns proper CORS
// headers, so a static SPA can call it with no proxy and no API key. Coverage is
// encyclopedic facts, not breaking news — for full real-time web a keyed provider
// (Brave/Tavily) is wired later.
import type { SearchProvider, SearchResult, SearchOpts } from './types';
import { resultLimit } from './limit';

const ENDPOINT = 'https://en.wikipedia.org/w/api.php';
const TIMEOUT_MS = 6_000;

/** Build the list=search Action-API URL. `origin=*` is what unlocks anonymous CORS. */
export function wikipediaSearchUrl(query: string, limit = 5): string {
  const params = new URLSearchParams({
    action: 'query',
    list: 'search',
    srsearch: query,
    srlimit: String(limit),
    srprop: 'snippet',
    format: 'json',
    origin: '*',
  });
  return `${ENDPOINT}?${params.toString()}`;
}

/** Strip the HTML the API returns in snippets (it wraps matches in <span> tags). */
export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

interface WikiSearchHit {
  title?: unknown;
  snippet?: unknown;
}

/** Parse the Action-API body into normalized results (defensive — unknown shape). */
export function parseWikipedia(body: unknown): SearchResult[] {
  const query = (body as { query?: { search?: unknown } } | null)?.query;
  const hits = Array.isArray(query?.search) ? (query.search as WikiSearchHit[]) : [];
  const out: SearchResult[] = [];
  for (const h of hits) {
    const title = typeof h.title === 'string' ? h.title : '';
    if (!title) continue;
    out.push({
      title,
      url: `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`,
      snippet: typeof h.snippet === 'string' ? stripHtml(h.snippet) : '',
    });
  }
  return out;
}

export const wikipediaProvider: SearchProvider = {
  id: 'wikipedia',
  needsKey: false,
  async search(query: string, opts: SearchOpts = {}): Promise<SearchResult[]> {
    const q = query.trim();
    if (!q) return [];
    const { signal } = opts;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    // Honor a caller-supplied signal (new turn / unmount) AND our own timeout.
    const onAbort = () => ctrl.abort();
    signal?.addEventListener('abort', onAbort, { once: true });
    try {
      const res = await fetch(wikipediaSearchUrl(q, resultLimit(opts.limit)), {
        signal: ctrl.signal,
      });
      if (!res.ok) return [];
      return parseWikipedia(await res.json());
    } catch {
      return []; // never throw — an ungrounded answer beats a broken turn
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }
  },
};
