// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createServer, request as httpRequest, type Server } from 'node:http';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
// @ts-expect-error — the published CLI is intentionally a dependency-free ESM module.
import * as cliServer from '../bin/mavea.mjs';

const {
  createMaveaServer,
  listenOnLoopback,
  LOCAL_SECURITY_HEADERS,
  LOOPBACK_HOST,
  parseArgs,
  readBoundedAsset,
} = cliServer;

type Response = {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
};

const servers: Server[] = [];
let distDir = '';

function close(server: Server): Promise<void> {
  return new Promise((resolve) => {
    server.closeAllConnections?.();
    server.close(() => resolve());
  });
}

function request(
  port: number,
  path: string,
  {
    method = 'GET',
    headers = {},
    body = '',
  }: { method?: string; headers?: Record<string, string>; body?: string } = {},
): Promise<Response> {
  return new Promise((resolve, reject) => {
    const req = httpRequest({ hostname: LOOPBACK_HOST, port, path, method, headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () =>
        resolve({
          status: res.statusCode ?? 0,
          headers: res.headers,
          body: Buffer.concat(chunks).toString('utf8'),
        }),
      );
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function start(server: Server): Promise<number> {
  servers.push(server);
  const address = await listenOnLoopback(server, 0);
  if (!address || typeof address === 'string') throw new Error('expected a TCP server address');
  expect(address.address).toBe(LOOPBACK_HOST);
  return address.port;
}

beforeEach(async () => {
  distDir = await mkdtemp(join(tmpdir(), 'mavea-cli-test-'));
  await writeFile(join(distDir, 'index.html'), '<!doctype html><title>Mavéa test</title>');
});

afterEach(async () => {
  await Promise.all(servers.splice(0).map(close));
  if (distDir) await rm(distDir, { recursive: true, force: true });
});

describe('mavea CLI server security boundary', () => {
  it('accepts only the exact pinned byte count for lazy voice assets', async () => {
    const exact = await readBoundedAsset(new globalThis.Response(new Uint8Array([1, 2, 3])), 3);
    expect([...exact]).toEqual([1, 2, 3]);

    await expect(
      readBoundedAsset(new globalThis.Response(new Uint8Array([1, 2, 3])), 2),
    ).rejects.toThrow(/pinned size/);
  });

  it('validates CLI input and never accepts a public bind address', () => {
    expect(parseArgs([], {})).toMatchObject({ port: 4173, open: true, voice: true });
    expect(parseArgs(['--port', '0', '--no-open'], {})).toMatchObject({ port: 0, open: false });
    expect(() => parseArgs(['--port', '70000'], {})).toThrow(/invalid port/i);
    expect(() => parseArgs(['--host', '0.0.0.0'], {})).toThrow(/unknown option/i);
  });

  it('binds loopback, returns 400 for malformed encoding, and remains healthy', async () => {
    const port = await start(createMaveaServer({ distDir, proxies: [] }));

    const malformed = await request(port, '/%');
    expect(malformed.status).toBe(400);
    expect(malformed.headers['x-frame-options']).toBe('DENY');

    const healthy = await request(port, '/');
    expect(healthy.status).toBe(200);
    expect(healthy.body).toContain('Mavéa test');
    expect(healthy.headers['content-security-policy']).toBe(
      LOCAL_SECURITY_HEADERS['Content-Security-Policy'],
    );
    expect(healthy.headers['permissions-policy']).toContain('microphone=(self)');
  });

  it('revalidates HTML and caches content-hashed assets for one year', async () => {
    await writeFile(join(distDir, 'entry-abc123.js'), 'export default 1');
    const assets = join(distDir, 'assets');
    await mkdir(assets);
    await writeFile(join(assets, 'entry-abc123.js'), 'export default 1');
    const port = await start(createMaveaServer({ distDir, proxies: [] }));

    const html = await request(port, '/');
    expect(html.headers['cache-control']).toBe('no-cache');
    const asset = await request(port, '/assets/entry-abc123.js');
    expect(asset.headers['cache-control']).toBe('public, max-age=31536000, immutable');
  });

  it('keeps HTML unframeable while allowing only a same-origin PDF response in the reader', async () => {
    await writeFile(join(distDir, 'primer.pdf'), '%PDF-1.7\n%%EOF');
    const port = await start(createMaveaServer({ distDir, proxies: [] }));

    const html = await request(port, '/');
    expect(html.headers['x-frame-options']).toBe('DENY');
    expect(html.headers['content-security-policy']).toBe("frame-ancestors 'none'");

    const pdf = await request(port, '/primer.pdf');
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect(pdf.headers['content-disposition']).toBe('inline');
    expect(pdf.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(pdf.headers['content-security-policy']).toBe("frame-ancestors 'self'");
    expect(pdf.headers['cross-origin-resource-policy']).toBe('same-origin');
  });

  it('requires a same-origin browser request and forwards only safe headers', async () => {
    let upstreamCalls = 0;
    let receivedCookie: string | undefined;
    let receivedOrigin: string | undefined;
    const upstream = createServer((req, res) => {
      upstreamCalls++;
      receivedCookie = req.headers.cookie;
      receivedOrigin = req.headers.origin;
      const chunks: Buffer[] = [];
      req.on('data', (chunk) => chunks.push(chunk));
      req.on('end', () => {
        res.setHeader('Set-Cookie', 'provider=secret');
        res.end(Buffer.concat(chunks));
      });
    });
    const upstreamPort = await start(upstream);
    const route = {
      prefix: '/proxy',
      target: `http://${LOOPBACK_HOST}:${upstreamPort}`,
      methods: ['POST'],
      bodyLimit: 32,
      responseLimit: 32,
      requestsPerMinute: 10,
      timeoutMs: 1_000,
    };
    const port = await start(createMaveaServer({ distDir, proxies: [route] }));

    const rejected = await request(port, '/proxy', { method: 'POST', body: 'hello' });
    expect(rejected.status).toBe(403);
    expect(upstreamCalls).toBe(0);

    const accepted = await request(port, '/proxy', {
      method: 'POST',
      headers: {
        Origin: `http://${LOOPBACK_HOST}:${port}`,
        Cookie: 'mavea=private',
        'Content-Type': 'text/plain',
      },
      body: 'hello',
    });
    expect(accepted.status).toBe(200);
    expect(accepted.body).toBe('hello');
    expect(accepted.headers['set-cookie']).toBeUndefined();
    expect(receivedCookie).toBeUndefined();
    expect(receivedOrigin).toBeUndefined();
  });

  it('enforces route boundaries, methods, body limits, and per-client rate limits', async () => {
    let upstreamCalls = 0;
    const upstream = createServer((_req, res) => {
      upstreamCalls++;
      res.end('ok');
    });
    const upstreamPort = await start(upstream);
    const route = {
      prefix: '/proxy',
      target: `http://${LOOPBACK_HOST}:${upstreamPort}`,
      methods: ['POST'],
      bodyLimit: 4,
      responseLimit: 16,
      // The rejected oversized request also consumes budget, which prevents an attacker from
      // bypassing rate limiting by sending only invalid payloads.
      requestsPerMinute: 2,
      timeoutMs: 1_000,
    };
    const port = await start(createMaveaServer({ distDir, proxies: [route] }));
    const origin = { Origin: `http://${LOOPBACK_HOST}:${port}` };

    expect((await request(port, '/proxy-impersonator')).status).toBe(200);
    expect((await request(port, '/proxy', { headers: origin })).status).toBe(405);
    expect(
      (
        await request(port, '/proxy', {
          method: 'POST',
          headers: origin,
          body: '12345',
        })
      ).status,
    ).toBe(413);
    expect(upstreamCalls).toBe(0);

    expect(
      (await request(port, '/proxy', { method: 'POST', headers: origin, body: '1234' })).status,
    ).toBe(200);
    expect(
      (await request(port, '/proxy', { method: 'POST', headers: origin, body: '1234' })).status,
    ).toBe(429);
    expect(upstreamCalls).toBe(1);
  });

  it('rejects a declared oversized upstream response before streaming it', async () => {
    const upstream = createServer((_req, res) => {
      res.setHeader('Content-Length', '8');
      res.end('12345678');
    });
    const upstreamPort = await start(upstream);
    const route = {
      prefix: '/proxy',
      target: `http://${LOOPBACK_HOST}:${upstreamPort}`,
      methods: ['POST'],
      bodyLimit: 4,
      responseLimit: 4,
      requestsPerMinute: 10,
      timeoutMs: 1_000,
    };
    const port = await start(createMaveaServer({ distDir, proxies: [route] }));
    const response = await request(port, '/proxy', {
      method: 'POST',
      headers: { Origin: `http://${LOOPBACK_HOST}:${port}` },
    });

    expect(response.status).toBe(502);
    expect(response.body).toMatch(/configured limit/i);
  });

  it('bounds concurrent upstream work until the first response really finishes', async () => {
    let releaseUpstream!: () => void;
    let markReady!: () => void;
    const upstreamReady = new Promise<void>((resolve) => {
      markReady = resolve;
    });
    const upstream = createServer((_req, res) => {
      releaseUpstream = () => res.end('ok');
      markReady();
    });
    const upstreamPort = await start(upstream);
    const route = {
      prefix: '/proxy',
      target: `http://${LOOPBACK_HOST}:${upstreamPort}`,
      methods: ['POST'],
      bodyLimit: 4,
      responseLimit: 4,
      requestsPerMinute: 10,
      maxConcurrent: 1,
      timeoutMs: 1_000,
    };
    const port = await start(createMaveaServer({ distDir, proxies: [route] }));
    const options = {
      method: 'POST',
      headers: { Origin: `http://${LOOPBACK_HOST}:${port}` },
    };

    const first = request(port, '/proxy', options);
    await upstreamReady;
    const busy = await request(port, '/proxy', options);
    expect(busy.status).toBe(503);
    expect(busy.headers['retry-after']).toBe('1');

    releaseUpstream();
    expect((await first).status).toBe(200);
  });

  it('turns an idle upstream into a bounded 502 instead of hanging forever', async () => {
    const upstream = createServer(() => {
      // Intentionally never respond: the CLI timeout must terminate this request.
    });
    const upstreamPort = await start(upstream);
    const route = {
      prefix: '/proxy',
      target: `http://${LOOPBACK_HOST}:${upstreamPort}`,
      methods: ['POST'],
      bodyLimit: 4,
      responseLimit: 4,
      requestsPerMinute: 10,
      maxConcurrent: 1,
      timeoutMs: 30,
    };
    const port = await start(createMaveaServer({ distDir, proxies: [route] }));
    const response = await request(port, '/proxy', {
      method: 'POST',
      headers: { Origin: `http://${LOOPBACK_HOST}:${port}` },
    });

    expect(response.status).toBe(502);
    expect(response.body).toMatch(/unavailable/i);
  });
});
