#!/usr/bin/env node
// dev.mjs — `pnpm dev` brings up EVERYTHING Mavéa needs, not just the web server.
//
// Speech lives in local containers (Kokoro TTS + whisper.cpp STT) while the app runs on the host,
// and for a long time
// starting them was two separate commands. That split is invisible from the browser: the app looks
// completely healthy, `speak()` no-ops, and you are left wondering why Mavéa never talks. So this
// script owns the whole local stack — start the voice, start Vite, and say plainly which pieces are
// live. Nothing here is required for the app to run: if no container runtime is ready, Vite still
// comes up and says plainly which local speech capabilities are unavailable.
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { credSafeConfigDir } from './docker-cred-safe.mjs';

const VOICE_HEALTH = 'http://localhost:8880/health';
const VOICE_SPEECH = 'http://localhost:8880/v1/audio/speech';
const STT_HEALTH = 'http://localhost:8100/';
/** Kokoro loads its voice model on first run; a cold pull can take a while, so poll generously. */
const VOICE_READY_TIMEOUT_MS = 180_000;
const VOICE_POLL_MS = 1_000;

/** How far ahead of the playhead synthesis should run. Speech is played at 1x, so anything above
 *  1x is only margin — but the margin has to absorb a busy machine mid-sentence, and falling behind
 *  is audible as a stutter. 2x is the smallest comfortable cushion. */
const VOICE_TARGET_REALTIME = 2;
/** The measured peak of Kokoro's thread-scaling curve; past this it gets slower AND hungrier. */
const VOICE_MAX_THREADS = 4;
const VOICE_PROBE_TEXT =
  'Mavéa is a voice first thinking companion that draws what it means as it speaks.';
/** Kokoro emits 24kHz mono 16-bit PCM, so byte length converts straight to seconds of audio. */
const PCM_BYTES_PER_SECOND = 24_000 * 2;

const cacheFile = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'node_modules/.cache/mavea/voice-threads.json',
);

const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;

function commandReady(command, args) {
  return spawnSync(command, args, { stdio: 'ignore' }).status === 0;
}

function containerRuntime() {
  if (commandReady('podman', ['info'])) {
    if (commandReady('podman', ['compose', 'version'])) {
      return { command: 'podman', prefix: ['compose'], label: 'Podman' };
    }
    if (commandReady('podman-compose', ['--version'])) {
      return { command: 'podman-compose', prefix: [], label: 'Podman' };
    }
  }
  if (commandReady('docker', ['info'])) {
    return { command: 'docker', prefix: ['compose'], label: 'Docker' };
  }
  return null;
}

function installedRuntimeHint() {
  if (commandReady('podman', ['--version'])) {
    return 'Podman is installed but not ready — start `podman machine` and re-run `pnpm dev`';
  }
  if (commandReady('docker', ['--version'])) {
    return 'Docker is installed but not ready — start its engine and re-run `pnpm dev`';
  }
  return 'install Podman (Apache-2.0) and re-run `pnpm dev` to enable local speech';
}

/** Start both local speech services. Docker gets one credential-helper-safe retry because every
 *  image is public; Podman has no equivalent credential helper failure on this path. */
function startVoice(runtime, threads) {
  const env = threads ? { ...process.env, MAVEA_VOICE_THREADS: String(threads) } : process.env;
  const args = [...runtime.prefix, 'up', '-d', '--build'];
  if (spawnSync(runtime.command, args, { stdio: 'inherit', env }).status === 0) return true;
  if (runtime.command !== 'docker') return false;
  return (
    spawnSync('docker', ['--config', credSafeConfigDir(), 'compose', 'up', '-d', '--build'], {
      stdio: 'inherit',
      env,
    }).status === 0
  );
}

/** The thread count this machine settled on last time, or null on a first run. */
function cachedThreads() {
  try {
    const { threads } = JSON.parse(readFileSync(cacheFile, 'utf8'));
    return Number.isInteger(threads) && threads > 0 && threads <= VOICE_MAX_THREADS
      ? threads
      : null;
  } catch {
    return null;
  }
}

function rememberThreads(threads, realtimePerThread) {
  try {
    mkdirSync(dirname(cacheFile), { recursive: true });
    writeFileSync(cacheFile, JSON.stringify({ threads, realtimePerThread }, null, 2));
  } catch {
    // A cache that cannot be written costs one probe per run, which is not worth failing over.
  }
}

/** Synthesize one clause and return how many seconds of audio came back per second of wall clock. */
async function measureRealtimeFactor() {
  const started = performance.now();
  const res = await fetch(VOICE_SPEECH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'kokoro',
      input: VOICE_PROBE_TEXT,
      voice: 'af_heart',
      response_format: 'pcm',
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) return null;
  const bytes = (await res.arrayBuffer()).byteLength;
  const seconds = (performance.now() - started) / 1000;
  if (!bytes || seconds <= 0) return null;
  return bytes / PCM_BYTES_PER_SECOND / seconds;
}

/** Decide how many cores this machine's voice actually needs, and remember it.
 *
 *  There is no number that is right for every machine: the same 4 threads that leave a fast box
 *  idling at 4x realtime are barely enough on an older one, and a static cap set for either is
 *  wrong for the other — the answer depends on per-core speed, which nothing in a compose file can
 *  see. So measure instead of guess, the way the browser's perf tier already does.
 *
 *  Kokoro's throughput is close to linear in threads up to the peak (measured 1.12x / 2.47x / 3.38x
 *  / 4.23x at 1-4 threads), so one probe at a known thread count yields per-thread speed, and the
 *  smallest count clearing the target follows. A fast machine lands on 2 and hands the rest of the
 *  cores back to the browser; a slow one keeps all 4 and stays as close to realtime as it can. */
async function tuneVoiceThreads(ranAt) {
  // Best of three, not an average: a busy moment can only ever make synthesis look slower, so the
  // fastest run is the one closest to what this machine can actually do. Averaging a stray spike
  // in would permanently over-provision the voice on a machine that was merely busy once. The
  // first call also pays for warmup, which the later ones do not.
  const runs = [];
  for (let i = 0; i < 3; i++) {
    const realtime = await measureRealtimeFactor();
    if (realtime !== null) runs.push(realtime);
  }
  if (!runs.length) return null;
  const perThread = Math.max(...runs) / ranAt;
  const want = Math.min(
    VOICE_MAX_THREADS,
    Math.max(1, Math.ceil(VOICE_TARGET_REALTIME / perThread)),
  );
  rememberThreads(want, Number(perThread.toFixed(3)));
  return want;
}

async function voiceHealthy() {
  try {
    const res = await fetch(VOICE_HEALTH, { signal: AbortSignal.timeout(2_000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function sttHealthy() {
  try {
    const res = await fetch(STT_HEALTH, { signal: AbortSignal.timeout(2_000) });
    return res.ok;
  } catch {
    return false;
  }
}

/** Announce the voice when it actually answers, not when the container was merely created — the
 *  model load is what the user is waiting on, and a premature "ready" is worse than silence. */
async function announceVoiceWhenReady(startedAt, alreadyTuned) {
  const deadline = Date.now() + VOICE_READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await voiceHealthy()) {
      console.log(green('  ✓ voice   ') + dim('Kokoro TTS ready on :8880 — Mavéa will speak'));
      if (!alreadyTuned) await settleVoiceThreads(startedAt);
      return;
    }
    await new Promise((r) => setTimeout(r, VOICE_POLL_MS));
  }
  console.log(
    yellow('  ! voice   ') + dim('Kokoro did not become healthy — answers stay captioned'),
  );
}

async function announceSttWhenReady() {
  const deadline = Date.now() + VOICE_READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await sttHealthy()) {
      console.log(green('  ✓ mic     ') + dim('whisper.cpp ready on :8100 — speech stays local'));
      return;
    }
    await new Promise((resolvePoll) => setTimeout(resolvePoll, VOICE_POLL_MS));
  }
  console.log(yellow('  ! mic     ') + dim('whisper.cpp did not become healthy — use typing'));
}

/** First run on this machine: measure it and record the answer for next time.
 *
 *  Deliberately does NOT restart the container to apply the new number now. Restarting drops the
 *  voice for as long as the model takes to reload, and kokoroAvailable() probes health once per
 *  page session and caches it — a browser that happens to ask during that window would go silent
 *  for the whole session with nothing to show for it. The default is already safe, so the tuned
 *  value simply takes effect on the next `pnpm dev`; nobody waits, and nothing goes quiet. */
async function settleVoiceThreads(startedAt) {
  const want = await tuneVoiceThreads(startedAt);
  if (want === null || want === startedAt) return;
  console.log(
    dim(`  … voice   this machine only needs ${want} core${want === 1 ? '' : 's'} — from next run`),
  );
}

async function bringUpVoice() {
  const tuned = cachedThreads();
  const startedAt = tuned ?? VOICE_MAX_THREADS;
  const [voiceWasHealthy, sttWasHealthy] = await Promise.all([voiceHealthy(), sttHealthy()]);
  if (voiceWasHealthy) {
    console.log(green('  ✓ voice   ') + dim('Kokoro TTS already running on :8880'));
  }
  if (sttWasHealthy) {
    console.log(green('  ✓ mic     ') + dim('whisper.cpp already running on :8100'));
  }
  if (voiceWasHealthy && sttWasHealthy) return;

  const runtime = containerRuntime();
  if (!runtime) {
    console.log(yellow('  ! speech  ') + dim(installedRuntimeHint()));
    return;
  }
  if (!startVoice(runtime, startedAt)) {
    console.log(
      yellow('  ! speech  ') +
        dim(`could not start the local services with ${runtime.label} — app still works`),
    );
    return;
  }
  if (!voiceWasHealthy) {
    console.log(dim('  … voice   Kokoro starting (first run downloads the model)'));
    void announceVoiceWhenReady(startedAt, tuned !== null);
  }
  if (!sttWasHealthy) {
    console.log(
      dim('  … mic     whisper.cpp starting (first run builds it and downloads the model)'),
    );
    void announceSttWhenReady();
  }
}

console.log(dim('\n  Mavéa — starting the local stack\n'));
await bringUpVoice();

// Vite owns the foreground: its banner prints the URL, and Ctrl-C stops it. Speech containers use
// `restart: unless-stopped`, so they survive between dev sessions; `podman compose down` (or the
// Docker equivalent) is the deliberate way to stop them.
// Resolve Vite through the repository's pinned pnpm graph. `npx vite` is allowed to consult the
// registry and can select a different package when node_modules is incomplete — both surprising
// and avoidable in a deterministic local stack.
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const vite = spawn(pnpm, ['exec', 'vite', ...process.argv.slice(2)], { stdio: 'inherit' });
const stop = (sig) => vite.kill(sig);
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
vite.on('exit', (code, signal) => process.exit(signal ? 1 : (code ?? 0)));
