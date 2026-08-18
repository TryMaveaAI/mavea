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

interface ComposeRuntime {
  command: string;
  prefix: string[];
  label: string;
}

const {
  readCachedVoiceThreads,
  rememberVoiceThreads,
  voiceThreadsFor,
  voiceThreadEnv,
  composeUpArgs,
  settleStartup,
} = cli as {
  readCachedVoiceThreads: (file?: string) => number | null;
  rememberVoiceThreads: (threads: number, realtimePerThread: number, file?: string) => boolean;
  voiceThreadsFor: (realtimePerThread: number) => number;
  voiceThreadEnv: (
    threads: number | null | undefined,
    env?: NodeJS.ProcessEnv,
  ) => NodeJS.ProcessEnv;
  composeUpArgs: (runtime: ComposeRuntime, composeFile?: string) => string[];
  settleStartup: (
    args: { voice: boolean; open: boolean },
    steps: { offerVoice: () => Promise<void> | void; openApp: () => void },
  ) => Promise<void>;
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

describe('first-run startup', () => {
  const docker: ComposeRuntime = { command: 'docker', prefix: ['compose'], label: 'Docker' };
  const podman: ComposeRuntime = { command: 'podman', prefix: ['compose'], label: 'Podman' };
  const composeless: ComposeRuntime = { command: 'podman-compose', prefix: [], label: 'Podman' };

  it('never forces a rebuild of images the machine already has, on either runtime', () => {
    // `--build` re-resolves an image that is already present on every single run. Compose builds a
    // missing image on its own, and the whisper tag carries its version, so a bump still builds.
    for (const runtime of [docker, podman, composeless]) {
      expect(composeUpArgs(runtime, '/tmp/compose.yml')).not.toContain('--build');
      expect(composeUpArgs(runtime, '/tmp/compose.yml')).toEqual([
        ...runtime.prefix,
        '-f',
        '/tmp/compose.yml',
        'up',
        '-d',
      ]);
    }
  });

  it('asks the speech questions before opening the browser over them', async () => {
    const order: string[] = [];
    await settleStartup(
      { voice: true, open: true },
      {
        offerVoice: async () => {
          // A slow answer must still land first — the prompt lives in the terminal the browser is
          // about to cover. Anything else configures speech by a default nobody chose.
          await new Promise((resolve) => setTimeout(resolve, 5));
          order.push('voice');
        },
        openApp: () => order.push('open'),
      },
    );
    expect(order).toEqual(['voice', 'open']);
  });

  it('honours --no-voice and --no-open without reordering the other', async () => {
    const opened: string[] = [];
    await settleStartup(
      { voice: false, open: true },
      {
        offerVoice: () => {
          opened.push('voice');
        },
        openApp: () => opened.push('open'),
      },
    );
    expect(opened).toEqual(['open']);

    const quiet: string[] = [];
    await settleStartup(
      { voice: true, open: false },
      {
        offerVoice: () => {
          quiet.push('voice');
        },
        openApp: () => quiet.push('open'),
      },
    );
    expect(quiet).toEqual(['voice']);
  });
});
