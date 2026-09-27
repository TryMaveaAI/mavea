// The dev server's proxies carry things another site must never borrow: a reader's provider key on
// /llm and /search, GATEWAY_SECRET on /actions, and the reader's own voice services on /tts and
// /stt. Only this app's own pages may use them.
import { describe, expect, it } from 'vitest';
import { proxyRequestAllowed } from '../vite.config';

const HOST = 'localhost:5173';
const at = (url: string, headers: Record<string, string> = {}) => ({
  url,
  headers: { host: HOST, ...headers },
});

describe('the dev proxy same-origin guard', () => {
  const guarded = [
    '/llm/gemini/v1beta/models',
    '/search/brave/res',
    '/actions/slack-post',
    '/tts/v1/audio/speech',
    '/tts/health',
    '/stt/inference',
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

  it.each(['/actions', '/tts', '/stt'])(
    'guards %s by the bare prefix its proxy entry matches',
    (url) => {
      expect(proxyRequestAllowed(at(url, { origin: 'https://evil.example' }))).toBe(false);
    },
  );

  it('leaves the app’s own pages and assets alone', () => {
    expect(proxyRequestAllowed(at('/', { origin: 'https://evil.example' }))).toBe(true);
    expect(proxyRequestAllowed(at('/src/main.tsx'))).toBe(true);
  });
});
