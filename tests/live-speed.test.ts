// live-speed.test.ts — the learned per-model speed tier that makes a slow model emit less.
import { describe, it, expect, beforeEach } from 'vitest';
import { recordTurnSpeed, speedTierFor, resetModelSpeedForTest } from '../src/live/speed';

// tokens ≈ chars/4, tps = tokens / seconds. Build turns at a target tokens/sec.
const turnAt = (tps: number, tokens = 800) => ({ chars: tokens * 4, ms: (tokens / tps) * 1000 });

describe('model speed tier', () => {
  beforeEach(() => resetModelSpeedForTest());

  it('is "standard" for an unseen model (no penalty until measured)', () => {
    expect(speedTierFor('brand/new-model')).toBe('standard');
  });

  it('needs a couple of samples before it acts (one turn is not enough)', () => {
    const t = turnAt(10); // very slow
    recordTurnSpeed('m', t.chars, t.ms);
    expect(speedTierFor('m')).toBe('standard'); // only 1 sample
  });

  it('classifies a repeatedly-slow model as "slow"', () => {
    const t = turnAt(15); // ~15 tok/s, below the slow threshold
    recordTurnSpeed('slowmodel', t.chars, t.ms);
    recordTurnSpeed('slowmodel', t.chars, t.ms);
    expect(speedTierFor('slowmodel')).toBe('slow');
  });

  it('classifies a snappy model as "fast"', () => {
    const t = turnAt(140);
    recordTurnSpeed('fastmodel', t.chars, t.ms);
    recordTurnSpeed('fastmodel', t.chars, t.ms);
    expect(speedTierFor('fastmodel')).toBe('fast');
  });

  it('ignores a turn too small/quick to measure', () => {
    recordTurnSpeed('tiny', 50, 100); // below the floors
    recordTurnSpeed('tiny', 50, 100);
    expect(speedTierFor('tiny')).toBe('standard');
  });
});
