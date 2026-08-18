// @vitest-environment node
// The measured Kokoro thread tuner, ported from scripts/dev.mjs into the published CLI. What
// matters here is the arithmetic and the cache contract: the CLI applies a remembered number on
// the NEXT spawn, and never asks for more cores than the measured peak of the scaling curve.
import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
// @ts-expect-error — the published CLI is intentionally a dependency-free ESM module.
import * as cli from '../bin/mavea.mjs';

const { readCachedVoiceThreads, rememberVoiceThreads, voiceThreadsFor, voiceThreadEnv } = cli as {
  readCachedVoiceThreads: (file?: string) => number | null;
  rememberVoiceThreads: (threads: number, realtimePerThread: number, file?: string) => boolean;
  voiceThreadsFor: (realtimePerThread: number) => number;
  voiceThreadEnv: (
    threads: number | null | undefined,
    env?: NodeJS.ProcessEnv,
  ) => NodeJS.ProcessEnv;
};

const dirs: string[] = [];
function cacheFile(): string {
  const dir = mkdtempSync(join(tmpdir(), 'mavea-threads-'));
  dirs.push(dir);
  return join(dir, 'nested', 'voice-threads.json');
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('CLI voice thread tuning', () => {
  it('asks for the fewest cores that clear the 2x realtime cushion', () => {
    // Measured on an 8-vCPU box: 4.23x at 4 threads ≈ 1.06x per thread → two cores is plenty.
    expect(voiceThreadsFor(4.23 / 4)).toBe(2);
    // A fast machine synthesizing at 2x on a single core keeps just that one.
    expect(voiceThreadsFor(2)).toBe(1);
    // A slow one wants seven and gets the measured peak: past 4 Kokoro is slower AND hungrier.
    expect(voiceThreadsFor(0.3)).toBe(4);
    // A probe that produced nothing usable falls back to the container default, never to 1.
    expect(voiceThreadsFor(0)).toBe(4);
    expect(voiceThreadsFor(Number.NaN)).toBe(4);
  });

  it('remembers a measurement across runs, and ignores a cache it cannot trust', () => {
    const file = cacheFile();
    expect(readCachedVoiceThreads(file)).toBeNull(); // first run on this machine
    expect(rememberVoiceThreads(2, 1.058, file)).toBe(true); // creates the cache dir
    expect(readCachedVoiceThreads(file)).toBe(2);

    for (const junk of ['{"threads":0}', '{"threads":9}', '{"threads":"four"}', 'not json']) {
      writeFileSync(file, junk);
      expect(readCachedVoiceThreads(file)).toBeNull();
    }
  });

  it('applies a tuned count to the spawn, and leaves the compose default alone otherwise', () => {
    const base = { PATH: '/usr/bin' } as NodeJS.ProcessEnv;
    expect(voiceThreadEnv(2, base).MAVEA_VOICE_THREADS).toBe('2');
    expect(voiceThreadEnv(2, base).PATH).toBe('/usr/bin'); // the rest of the environment survives
    expect(base.MAVEA_VOICE_THREADS).toBeUndefined(); // …and is not mutated
    // Nothing measured yet: the variable stays unset so docker-compose.yml's own default (4) wins.
    expect(voiceThreadEnv(null, base)).toBe(base);
    expect(voiceThreadEnv(undefined, base).MAVEA_VOICE_THREADS).toBeUndefined();
  });
});
