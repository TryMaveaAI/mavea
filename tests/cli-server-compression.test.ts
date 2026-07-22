// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { request as httpRequest, type Server } from 'node:http';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { brotliDecompressSync, gunzipSync } from 'node:zlib';
// @ts-expect-error — the published CLI is intentionally a dependency-free ESM module.
import * as cliServer from '../bin/mavea.mjs';

const { createMaveaServer, listenOnLoopback, LOOPBACK_HOST, negotiateEncoding } = cliServer;

const servers: Server[] = [];
const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => new Promise((ok) => s.close(ok))));
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

/** A dist/ holding one compressible asset and one already-compressed one. */
async function serveFixture(): Promise<{ port: number; js: string }> {
  const dir = await mkdtemp(join(tmpdir(), 'mavea-compress-'));
  dirs.push(dir);
  await mkdir(join(dir, 'assets'), { recursive: true });
  // Repetitive enough to compress, long enough that a bug can't hide in the noise.
  const js = `export const greet = () => 'hello';\n`.repeat(400);
  await writeFile(join(dir, 'assets', 'app-abc123.js'), js);
  await writeFile(join(dir, 'assets', 'logo-abc123.png'), Buffer.alloc(4096, 7));
  await writeFile(join(dir, 'index.html'), '<!doctype html><title>t</title>');
  const server = createMaveaServer({ distDir: dir });
  servers.push(server);
  const address = await listenOnLoopback(server, 0);
  return { port: address.port as number, js };
}

function fetchRaw(
  port: number,
  path: string,
  acceptEncoding?: string,
): Promise<{ status: number; encoding?: string; vary?: string; body: Buffer }> {
  return new Promise((ok, fail) => {
    const req = httpRequest(
      {
        host: LOOPBACK_HOST,
        port,
        path,
        headers: acceptEncoding ? { 'accept-encoding': acceptEncoding } : {},
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c as Buffer));
        res.on('end', () =>
          ok({
            status: res.statusCode ?? 0,
            encoding: res.headers['content-encoding'] as string | undefined,
            vary: res.headers['vary'] as string | undefined,
            body: Buffer.concat(chunks),
          }),
        );
      },
    );
    req.on('error', fail);
    req.end();
  });
}

describe('mavea CLI — static compression', () => {
  it('sends text assets compressed, and they decode back to the exact bytes on disk', async () => {
    // The whole point: a browser must receive the identical file, just smaller. Anything else is a
    // corrupted bundle that only reproduces for users with a particular Accept-Encoding.
    const { port, js } = await serveFixture();
    const identity = await fetchRaw(port, '/assets/app-abc123.js', 'identity');
    expect(identity.encoding).toBeUndefined();
    expect(identity.body.toString()).toBe(js);

    const br = await fetchRaw(port, '/assets/app-abc123.js', 'br, gzip');
    expect(br.encoding).toBe('br');
    expect(brotliDecompressSync(br.body).toString()).toBe(js);
    expect(br.body.length).toBeLessThan(identity.body.length);

    const gzip = await fetchRaw(port, '/assets/app-abc123.js', 'gzip');
    expect(gzip.encoding).toBe('gzip');
    expect(gunzipSync(gzip.body).toString()).toBe(js);
    expect(gzip.body.length).toBeLessThan(identity.body.length);
  });

  it('marks compressed responses Vary: Accept-Encoding so a cache cannot serve br to a gzip client', async () => {
    const { port } = await serveFixture();
    const res = await fetchRaw(port, '/assets/app-abc123.js', 'br');
    expect(res.vary).toBe('Accept-Encoding');
  });

  it('leaves already-compressed assets alone', async () => {
    // Re-compressing a PNG spends CPU to make the file bigger.
    const { port } = await serveFixture();
    const res = await fetchRaw(port, '/assets/logo-abc123.png', 'br, gzip');
    expect(res.encoding).toBeUndefined();
    expect(res.body.length).toBe(4096);
  });

  it('sends the file verbatim when the client asks for no encoding', async () => {
    const { port, js } = await serveFixture();
    const res = await fetchRaw(port, '/assets/app-abc123.js');
    expect(res.encoding).toBeUndefined();
    expect(res.body.toString()).toBe(js);
  });

  describe('negotiateEncoding', () => {
    it('prefers brotli, falls back to gzip, and declines anything else', () => {
      expect(negotiateEncoding('br, gzip, deflate', '.js')).toBe('br');
      expect(negotiateEncoding('gzip, deflate', '.js')).toBe('gzip');
      expect(negotiateEncoding('deflate', '.js')).toBeNull();
      expect(negotiateEncoding(undefined, '.js')).toBeNull();
    });

    it('never compresses a format that already carries its own compression', () => {
      for (const ext of ['.png', '.jpg', '.woff2', '.pdf', '.mp4', '.onnx']) {
        expect(negotiateEncoding('br, gzip', ext)).toBeNull();
      }
    });

    it('does not mistake a substring for an accepted encoding', () => {
      // "brotli-ish" tokens and encodings named inside another word must not match.
      expect(negotiateEncoding('xbr', '.js')).toBeNull();
      expect(negotiateEncoding('notgzip', '.js')).toBeNull();
    });
  });
});
