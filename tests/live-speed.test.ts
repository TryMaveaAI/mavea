// live-speed.test.ts — the learned per-model speed tier that makes a slow model emit less.
import { describe, it, expect, beforeEach } from 'vitest';
import {
  recordTurnSpeed,
  recordTurnStall,
  speedTierFor,
  resetModelSpeedForTest,
} from '../src/live/speed';

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

  // An OpenRouter `:free` route queues behind every other free user, so it starts slow by
  // construction. Measuring it first was unreachable in practice: it timed out every turn, and
  // only a SUCCESSFUL turn was ever measured.
  describe('known-slow routes', () => {
    it('starts a `:free` route at "slow" without waiting to measure it', () => {
      expect(speedTierFor('nvidia/nemotron-3.5-lightning:free')).toBe('slow');
      expect(speedTierFor('dots-studio/dots-3-note-preview:free')).toBe('slow');
    });

    it('leaves the paid variant of the same model alone', () => {
      expect(speedTierFor('nvidia/nemotron-3.5-lightning')).toBe('standard');
    });

    it('does not match a model whose name merely contains "free"', () => {
      expect(speedTierFor('acme/freeform-7b')).toBe('standard');
      expect(speedTierFor('acme/carefree')).toBe('standard');
    });

    it('lets real measurements overrule the prior in both directions', () => {
      const t = turnAt(140);
      recordTurnSpeed('vendor/quick:free', t.chars, t.ms);
      recordTurnSpeed('vendor/quick:free', t.chars, t.ms);
      expect(speedTierFor('vendor/quick:free')).toBe('fast');
    });
  });

  // A turn that waits a long time and returns nothing is the strongest speed evidence there is.
  describe('a stalled turn', () => {
    it('counts as slow evidence even though it produced no answer', () => {
      recordTurnStall('stalled', 0, 180_000);
      recordTurnStall('stalled', 0, 180_000);
      expect(speedTierFor('stalled')).toBe('slow');
    });

    it('uses whatever did stream before the abort', () => {
      // ~1200 tokens over 180s ≈ 6.7 tok/s — slow, and measured rather than assumed.
      recordTurnStall('partial', 4800, 180_000);
      recordTurnStall('partial', 4800, 180_000);
      expect(speedTierFor('partial')).toBe('slow');
    });

    it('ignores a fast failure — a rejected key is a broken request, not a slow model', () => {
      recordTurnStall('rejected', 0, 300);
      recordTurnStall('rejected', 0, 300);
      expect(speedTierFor('rejected')).toBe('standard');
    });

    it('cannot drag a proven-fast model down on one bad turn', () => {
      const t = turnAt(140);
      recordTurnSpeed('sturdy', t.chars, t.ms);
      recordTurnSpeed('sturdy', t.chars, t.ms);
      recordTurnStall('sturdy', 0, 60_000);
      expect(speedTierFor('sturdy')).not.toBe('slow');
    });
  });
});
