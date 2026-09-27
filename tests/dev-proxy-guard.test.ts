// The dev server's proxies carry things another site must never borrow: a reader's provider key on
// /llm and /search, and GATEWAY_SECRET on /actions. Only this app's own pages may use them.
import { describe, expect, it } from 'vitest';
import { proxyRequestAllowed } from '../vite.config';

const HOST = 'localhost:5173';
const at = (url: string, headers: Record<string, string> = {}) => ({
  url,
  headers: { host: HOST, ...headers },
});

describe('the dev proxy same-origin guard', () => {
  const guarded = ['/llm/gemini/v1beta/models', '/search/brave/res', '/actions/slack-post'];

  it.each(guarded)('refuses %s from another site or from no page at all', (url) => {
    expect(proxyRequestAllowed(at(url, { origin: 'https://evil.example' }))).toBe(false);
    expect(proxyRequestAllowed(at(url, { referer: 'https://evil.example/x' }))).toBe(false);
    expect(proxyRequestAllowed(at(url, { 'sec-fetch-site': 'cross-site' }))).toBe(false);
    expect(proxyRequestAllowed(at(url))).toBe(false);
  });

  it.each(guarded)('lets this app reach %s', (url) => {
    expect(proxyRequestAllowed(at(url, { origin: `http://${HOST}` }))).toBe(true);
    expect(proxyRequestAllowed(at(url, { referer: `http://${HOST}/#/live` }))).toBe(true);
    expect(proxyRequestAllowed(at(url, { 'sec-fetch-site': 'same-origin' }))).toBe(true);
  });

  it('guards /actions by the same bare prefix its proxy entry matches', () => {
    expect(proxyRequestAllowed(at('/actions', { origin: 'https://evil.example' }))).toBe(false);
  });

  it('leaves the app’s own pages and assets alone', () => {
    expect(proxyRequestAllowed(at('/', { origin: 'https://evil.example' }))).toBe(true);
    expect(proxyRequestAllowed(at('/src/main.tsx'))).toBe(true);
  });
});
