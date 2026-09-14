// @vitest-environment node
// The lazy voice assets stage inside the app's own cache directory, which — unlike the OS temp
// directory — nothing ever sweeps. What matters here is that a killed download's leftovers go and
// a live download's staging directory stays.
import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
// @ts-expect-error — the published CLI is intentionally a dependency-free ESM module.
import * as cli from '../bin/mavea.mjs';

const { sweepStaleDownloads } = cli as {
  sweepStaleDownloads: (dir?: string, now?: number) => void;
};

const dirs: string[] = [];
function cacheDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'mavea-cache-'));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('CLI lazy asset cache', () => {
  it('drops a killed download’s staging directory and nothing else', () => {
    const dir = cacheDir();
    mkdirSync(join(dir, '.download-AaBbCc'));
    writeFileSync(join(dir, '.download-AaBbCc', 'asset'), 'half a wasm');
    writeFileSync(join(dir, 'silero_vad_v5.onnx'), 'a cached asset');
    writeFileSync(join(dir, 'silero_vad_v5.onnx.sha256'), 'abc\n');

    sweepStaleDownloads(dir, Date.now() + 60 * 60_000);

    expect(readdirSync(dir).sort()).toEqual(['silero_vad_v5.onnx', 'silero_vad_v5.onnx.sha256']);
  });

  it('leaves a staging directory young enough to be a live download alone', () => {
    const dir = cacheDir();
    mkdirSync(join(dir, '.download-DdEeFf'));

    sweepStaleDownloads(dir);

    expect(readdirSync(dir)).toEqual(['.download-DdEeFf']);
  });

  it('says nothing about a cache directory that was never created', () => {
    expect(() => sweepStaleDownloads(join(cacheDir(), 'never-downloaded'))).not.toThrow();
  });

  // The abort timer has to be armed after staging: mkdtempSync throws outright on a read-only or
  // full cache directory, and a timer armed above that throw is never cleared — the request 502s
  // and the timeout holds the event loop open for its full 30s. Reproducing that needs a directory
  // this process cannot write to, which a suite running as root cannot create, so the ordering
  // itself is what is pinned.
  it('arms the download abort timer only once staging has succeeded', () => {
    const source = readFileSync(new URL('../bin/mavea.mjs', import.meta.url), 'utf8');
    const body = source.slice(
      source.indexOf('async function fetchToCache'),
      source.indexOf('async function serveLazyAsset'),
    );
    expect(body).toContain('mkdtempSync');
    expect(body.indexOf('mkdtempSync')).toBeLessThan(body.indexOf('setTimeout'));
  });
});
