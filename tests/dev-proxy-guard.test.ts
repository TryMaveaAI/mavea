// The dev server's proxies carry things another site must never borrow: a reader's provider key on
// /llm and /search and the reader's own voice services on /tts and /stt. Only this app's own
// pages may use them.
import { resolve } from 'node:path';
import { isFileLoadingAllowed, normalizePath, resolveConfig } from 'vite';
import { describe, expect, it } from 'vitest';
import viteConfig, { proxyRequestAllowed } from '../vite.config';

const HOST = 'localhost:5173';
const at = (url: string, headers: Record<string, string> = {}) => ({
  url,
  headers: { host: HOST, ...headers },
});

describe('the dev proxy same-origin guard', () => {
  const guarded = [
    '/llm/gemini/v1beta/models',
    '/search/brave/res',
    '/tts/v1/audio/speech',
    '/tts/health',
    '/stt/inference',
    '/pdf?url=https%3A%2F%2Fbitcoin.org%2Fbitcoin.pdf',
  ];

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

  it.each(['/tts', '/stt'])('guards %s by the bare prefix its proxy entry matches', (url) => {
    expect(proxyRequestAllowed(at(url, { origin: 'https://evil.example' }))).toBe(false);
  });

  it('refuses a same-site request even when its referrer shares the host', () => {
    expect(
      proxyRequestAllowed(
        at('/pdf', { referer: `https://${HOST}/`, 'sec-fetch-site': 'same-site' }),
      ),
    ).toBe(false);
  });

  it('compares the scheme when falling back to Origin or Referer', () => {
    const req = at('/pdf', { referer: `https://${HOST}/` });
    expect(proxyRequestAllowed(req)).toBe(false);
    expect(proxyRequestAllowed(req, 'https')).toBe(true);
  });

  it('leaves the app’s own pages and assets alone', () => {
    expect(proxyRequestAllowed(at('/', { origin: 'https://evil.example' }))).toBe(true);
    expect(proxyRequestAllowed(at('/src/main.tsx'))).toBe(true);
  });
});

describe('retired actions gateway', () => {
  it('registers no proxy and denies serving legacy credential files', async () => {
    const config = await resolveConfig({ ...viteConfig, configFile: false }, 'serve');
    const canServe = (file: string) =>
      isFileLoadingAllowed(config, normalizePath(resolve(config.root, file)));

    expect(config.server.proxy).not.toHaveProperty('/actions');
    expect(canServe('gateway/.gateway-data/fixture.json')).toBe(false);
    expect(canServe('.env')).toBe(false);
    expect(canServe('src/main.tsx')).toBe(true);
  });
});
