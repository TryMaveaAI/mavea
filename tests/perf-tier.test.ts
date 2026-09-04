import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PERF_MODE_KEY,
  PERF_VERDICT_KEY,
  type PerfVerdict,
  heuristicTier,
  resolveTier,
  readPerfMode,
  writePerfMode,
  readVerdict,
  writeVerdict,
  hardwareSignature,
  applyPerfTier,
  currentAppliedTier,
} from '../src/lib/perfTier';
import { classifyWindow } from '../src/lib/perfProbe';

beforeEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.perf;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('heuristicTier — the first-load guess', () => {
  it('demotes low-end Intel-class hardware on core count (≤4 threads)', () => {
    expect(heuristicTier(2, undefined)).toBe('lite');
    expect(heuristicTier(1, 8)).toBe('lite');
    expect(heuristicTier(4, 8)).toBe('lite');
    expect(heuristicTier(4, undefined)).toBe('lite');
  });

  it('demotes on low reported memory', () => {
    expect(heuristicTier(8, 4)).toBe('lite');
    expect(heuristicTier(8, 2)).toBe('lite');
  });

  it('keeps a capable machine full (M1 reports 8 cores)', () => {
    expect(heuristicTier(8, 8)).toBe('full');
    expect(heuristicTier(16, undefined)).toBe('full');
  });

  it('never demotes on absent/zero signals alone (a high memory value proves nothing)', () => {
    expect(heuristicTier(undefined, undefined)).toBe('full');
    expect(heuristicTier(8, undefined)).toBe('full');
    expect(heuristicTier(0, 0)).toBe('full'); // 0 is "unknown", not "weak"
  });
});

describe('resolveTier — precedence', () => {
  const sig = '8x8x2';
  const verdictLite: PerfVerdict = { v: 3, tier: 'lite', sig };
  const verdictFull: PerfVerdict = { v: 3, tier: 'full', sig };

  it('honors an explicit full/lite override regardless of verdict or heuristic', () => {
    expect(resolveTier('full', verdictLite, sig, 'lite')).toBe('full');
    expect(resolveTier('lite', verdictFull, sig, 'full')).toBe('lite');
  });

  it('under auto, a matching-signature verdict wins over the heuristic', () => {
    expect(resolveTier('auto', verdictLite, sig, 'full')).toBe('lite');
    expect(resolveTier('auto', verdictFull, sig, 'lite')).toBe('full');
  });

  it('under auto, a stale-signature verdict is ignored and the heuristic decides', () => {
    expect(resolveTier('auto', verdictLite, 'DIFFERENT-sig', 'full')).toBe('full');
    expect(resolveTier('auto', { v: 3, tier: 'lite', sig: '4x4x1' }, sig, 'full')).toBe('full');
  });

  it('under auto with no verdict, the heuristic decides', () => {
    expect(resolveTier('auto', null, sig, 'lite')).toBe('lite');
    expect(resolveTier('auto', null, sig, 'full')).toBe('full');
  });
});

describe('readPerfMode / writePerfMode', () => {
  it('defaults to auto on empty storage', () => {
    expect(readPerfMode()).toBe('auto');
  });

  it('round-trips each valid mode', () => {
    for (const mode of ['auto', 'full', 'lite'] as const) {
      writePerfMode(mode);
      expect(readPerfMode()).toBe(mode);
    }
  });

  it('falls back to auto for an invalid stored value', () => {
    localStorage.setItem(PERF_MODE_KEY, 'turbo');
    expect(readPerfMode()).toBe('auto');
  });

  it('defaults to auto when storage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('nope');
    });
    expect(readPerfMode()).toBe('auto');
  });
});

describe('readVerdict / writeVerdict', () => {
  it('round-trips a verdict tagged with the current hardware signature', () => {
    writeVerdict('lite');
    const v = readVerdict();
    expect(v).not.toBeNull();
    expect(v!.tier).toBe('lite');
    expect(v!.sig).toBe(hardwareSignature());
    expect(v!.v).toBe(3);
  });

  it('returns null for absent, malformed, or wrong-schema stored verdicts', () => {
    expect(readVerdict()).toBeNull();
    localStorage.setItem(PERF_VERDICT_KEY, 'not json');
    expect(readVerdict()).toBeNull();
    localStorage.setItem(PERF_VERDICT_KEY, JSON.stringify({ v: 99, tier: 'lite', sig: 'x' }));
    expect(readVerdict()).toBeNull();
    localStorage.setItem(PERF_VERDICT_KEY, JSON.stringify({ v: 3, tier: 'zoom', sig: 'x' }));
    expect(readVerdict()).toBeNull();
  });

  it('discards v1 verdicts — the over-eager policy that wrote them is not trusted', () => {
    // Anyone demoted by the old ≤4-thread heuristic or twitchy probe must reload into full,
    // not stay flattened forever. The schema bump is that amnesty.
    localStorage.setItem(
      PERF_VERDICT_KEY,
      JSON.stringify({ v: 1, tier: 'lite', sig: hardwareSignature() }),
    );
    expect(readVerdict()).toBeNull();
  });

  it('discards v2 verdicts so four-thread machines receive the new policy', () => {
    localStorage.setItem(
      PERF_VERDICT_KEY,
      JSON.stringify({ v: 2, tier: 'full', sig: hardwareSignature() }),
    );
    expect(readVerdict()).toBeNull();
  });
});

describe('applyPerfTier / currentAppliedTier', () => {
  it('reflects the tier onto data-perf and reads it back', () => {
    applyPerfTier('lite');
    expect(document.documentElement.dataset.perf).toBe('lite');
    expect(currentAppliedTier()).toBe('lite');
    applyPerfTier('full');
    expect(currentAppliedTier()).toBe('full');
  });

  it('defaults to full when unset', () => {
    expect(currentAppliedTier()).toBe('full');
  });
});

describe('classifyWindow — the probe classifier', () => {
  const steady = (n: number, ms: number) => Array.from({ length: n }, () => ms);

  it('is inconclusive (full) on too few frames — never demotes on noise', () => {
    expect(classifyWindow([100, 100, 100], 9999)).toBe('full');
  });

  it('passes a smooth 60Hz window', () => {
    expect(classifyWindow(steady(120, 16.7), 0)).toBe('full');
  });

  it('passes a smooth 120Hz window (relative threshold, not absolute)', () => {
    // 8.3ms frames are fine on ProMotion; they must not be judged against a 60Hz yardstick.
    expect(classifyWindow(steady(200, 8.3), 0)).toBe('full');
  });

  it('demotes when >25% of frames are long', () => {
    const frames = [...steady(70, 16.7), ...steady(30, 120)]; // 30% bad
    expect(classifyWindow(frames, 0)).toBe('lite');
  });

  it('demotes on heavy main-thread blocking even if frames look ok', () => {
    expect(classifyWindow(steady(120, 16.7), 1800)).toBe('lite');
  });

  it('tolerates a real turn rendering — a busy window is not a weak machine', () => {
    // 20% long frames + ~1s of longtasks is what parsing catalog shards and mounting blocks
    // looks like on perfectly good hardware; it must not read as "struggling".
    const frames = [...steady(80, 16.7), ...steady(20, 120)];
    expect(classifyWindow(frames, 1000)).toBe('full');
  });

  it('tolerates a small fraction of dropped frames', () => {
    const frames = [...steady(95, 16.7), ...steady(5, 120)]; // 5% bad
    expect(classifyWindow(frames, 0)).toBe('full');
  });
});
