import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// A source scan rather than a runtime assertion, for the same reason perf-lite-css.test.ts scans
// CSS: the contract lives in a file the app never imports, so nothing else would notice it drifting.
// There is no YAML parser in the dependency graph and the voice is not worth adding one for.
const compose = readFileSync(join(import.meta.dirname, '..', 'docker-compose.yml'), 'utf8');

describe('docker-compose voice service', () => {
  it('bounds the voice to a few cores instead of every core it can see', () => {
    // Unbounded, torch sizes its pool from hardware_concurrency() and takes the whole machine —
    // measured at 705% CPU for speech a playhead consumes at 1x. The ceiling is what keeps a turn
    // from starving the browser rendering it.
    const threads = /OMP_NUM_THREADS:\s*\$\{MAVEA_VOICE_THREADS:-(\d+)\}/.exec(compose);
    expect(threads, 'OMP_NUM_THREADS must stay set, with a default').not.toBeNull();
    expect(Number(threads?.[1])).toBeLessThanOrEqual(4);
    expect(Number(threads?.[1])).toBeGreaterThanOrEqual(1);
  });

  it('leaves the thread count overridable so a machine can be measured rather than assumed', () => {
    // scripts/dev.mjs probes this box and exports MAVEA_VOICE_THREADS. A literal here would pin
    // every machine to whatever was true on the one this line was written on.
    expect(compose).toMatch(/\$\{MAVEA_VOICE_THREADS:-\d+\}/);
  });

  it('sets no CPU quota — a quota starves the thread pool instead of shrinking it', () => {
    // This is the tempting wrong fix. hardware_concurrency() reads CPU topology, not the cgroup, so
    // `cpus:` does not change how many threads torch spawns: it leaves the same 8 threads competing
    // for a smaller budget, waiting on OpenMP barriers for siblings the scheduler has descheduled.
    // A quota above the thread count never binds; below it, it recreates the bug the ceiling fixes.
    expect(compose).not.toMatch(/^\s*cpus:/m);
    expect(compose).not.toMatch(/^\s*cpu_quota:/m);
  });

  it('sets no memory limit — the voice legitimately needs its resident set', () => {
    // Kokoro holds ~1.8GB with the model loaded. A limit under that is an OOM kill and a silently
    // dead voice; above it, it never fires. Memory limits do not make anything faster, and on
    // Docker Desktop they only partition memory inside the VM anyway.
    expect(compose).not.toMatch(/^\s*mem_limit:/m);
    expect(compose).not.toMatch(/memory:\s*\d/m);
  });
});
