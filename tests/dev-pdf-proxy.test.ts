// @vitest-environment node
import { createServer, type Server } from 'node:http';
import { createServer as createViteServer, type ViteDevServer } from 'vite';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { pdfProxyUrl } from '../src/live/doc/safeUrl';
import viteConfig from '../vite.config';

const request = globalThis.fetch;
const target = 'https://bitcoin.org/bitcoin.pdf';
const sameOrigin = { 'sec-fetch-site': 'same-origin' };
const pdf = '%PDF-1.7\n';
let vite: ViteDevServer;
let server: Server;
let endpoint: string;

function signalOnDemand() {
  let signal = () => {};
  const promise = new Promise<void>((resolve) => {
    signal = resolve;
  });
  return { promise, signal };
}

beforeAll(async () => {
  vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    server: { middlewareMode: true, ws: false, watch: null },
  });
  server = createServer(vite.middlewares);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected TCP listener');
  endpoint = `http://127.0.0.1:${address.port}${pdfProxyUrl(target)}`;
});

afterAll(async () => {
  if (server) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  await vite?.close();
});

afterEach(() => vi.unstubAllGlobals());

describe('development PDF forwarder', () => {
  it('applies the browser request guard and method check before contacting the source', async () => {
    const upstream = vi.fn();
    vi.stubGlobal('fetch', upstream);

    expect((await request(endpoint)).status).toBe(403);
    const post = await request(endpoint, { method: 'POST', headers: sameOrigin });
    expect(post.status).toBe(405);
    expect(post.headers.get('allow')).toBe('GET');
    expect(upstream).not.toHaveBeenCalled();
  });

  it('stops when a redirect leaves the PDF allowlist', async () => {
    const upstream = vi.fn().mockResolvedValue(Response.redirect('https://example.com/file.pdf'));
    vi.stubGlobal('fetch', upstream);

    expect((await request(endpoint, { headers: sameOrigin })).status).toBe(502);
    expect(upstream).toHaveBeenCalledExactlyOnceWith(
      target,
      expect.objectContaining({ redirect: 'manual' }),
    );
  });

  it('follows a reviewed relative redirect and serves hardened PDF headers', async () => {
    const upstream = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, { status: 302, headers: { location: '/paper.pdf' } }),
      )
      .mockResolvedValueOnce(new Response(pdf, { headers: { 'content-type': 'application/pdf' } }));
    vi.stubGlobal('fetch', upstream);

    const reply = await request(endpoint, { headers: sameOrigin });
    expect(reply.status).toBe(200);
    expect(await reply.text()).toBe(pdf);
    expect(reply.headers.get('x-content-type-options')).toBe('nosniff');
    expect(reply.headers.get('x-frame-options')).toBe('SAMEORIGIN');
    expect(reply.headers.get('cache-control')).toMatch(/^private/);
    expect(upstream).toHaveBeenNthCalledWith(
      2,
      'https://bitcoin.org/paper.pdf',
      expect.objectContaining({ redirect: 'manual' }),
    );
  });

  it('bounds repeated redirects', async () => {
    const upstream = vi.fn(() => Response.redirect(target));
    vi.stubGlobal('fetch', upstream);

    expect((await request(endpoint, { headers: sameOrigin })).status).toBe(502);
    expect(upstream).toHaveBeenCalledTimes(4);
  });

  it.each([
    ['text/html', pdf],
    ['application/pdf', '<html>Unexpected content</html>'],
  ])('rejects an invalid document served as %s', async (type, body) => {
    vi.stubGlobal('fetch', () => new Response(body, { headers: { 'content-type': type } }));

    expect((await request(endpoint, { headers: sameOrigin })).status).toBe(502);
  });

  it('bounds the streamed body without relying on Content-Length', async () => {
    const chunk = new Uint8Array(1024 * 1024);
    const upstream = vi.fn(
      () =>
        new Response(
          new ReadableStream({
            pull(controller) {
              controller.enqueue(chunk);
            },
          }),
          { headers: { 'content-type': 'application/pdf' } },
        ),
    );
    vi.stubGlobal('fetch', upstream);

    expect((await request(endpoint, { headers: sameOrigin })).status).toBe(413);
  });

  it('keeps the deadline active while waiting for the response body', async () => {
    const reading = signalOnDemand();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const upstream = vi.fn((_target: string, { signal }: { signal: AbortSignal }) => {
      const body = new ReadableStream<Uint8Array>(
        {
          start(controller) {
            signal.addEventListener('abort', () => controller.error(signal.reason), { once: true });
          },
          pull() {
            reading.signal();
          },
        },
        { highWaterMark: 0 },
      );
      return new Response(body, { headers: { 'content-type': 'application/pdf' } });
    });
    vi.stubGlobal('fetch', upstream);

    try {
      const reply = request(endpoint, { headers: sameOrigin });
      await reading.promise;
      await vi.advanceTimersByTimeAsync(12_000);
      expect((await reply).status).toBe(502);
    } finally {
      vi.useRealTimers();
    }
  });

  it('caps concurrent document forwards and releases capacity after completion', async () => {
    const reachedCapacity = signalOnDemand();
    const release = signalOnDemand();
    const upstream = vi.fn(async () => {
      if (upstream.mock.calls.length === 4) reachedCapacity.signal();
      await release.promise;
      return new Response(pdf, { headers: { 'content-type': 'application/pdf' } });
    });
    vi.stubGlobal('fetch', upstream);

    const pending = Array.from({ length: 4 }, () => request(endpoint, { headers: sameOrigin }));
    try {
      await reachedCapacity.promise;
      expect((await request(endpoint, { headers: sameOrigin })).status).toBe(503);
      expect(upstream).toHaveBeenCalledTimes(4);
    } finally {
      release.signal();
      await Promise.all(pending);
    }
    expect((await request(endpoint, { headers: sameOrigin })).status).toBe(200);
  });
});
