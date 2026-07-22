import { describe, it, expect } from 'vitest';
import {
  simpleAsk,
  standardAsk,
  effectiveExplainLevel,
  simpleLevelMenu,
} from '../src/live/select/simpleLevel';

// The per-turn explanation-level override: plain-language triggers flip the level for one turn,
// overriding the persisted setting. Pure detectors, so a table test pins exactly what counts.
describe('simpleAsk — detects a request for the simplest explanation', () => {
  it('fires on the natural ways people ask to simplify', () => {
    for (const t of [
      "explain like I'm 5",
      'explain like im 10',
      'can you explain it simpler',
      'put it in simple terms',
      'eli5 this please',
      'eli10',
      'just dumb it down for me',
      'keep it simple',
    ]) {
      expect(simpleAsk(t), t).toBe(true);
    }
  });

  it('does not fire on ordinary or deeper asks', () => {
    for (const t of [
      'explain how transistors work',
      'compare rents in Seattle vs Austin',
      'go deeper on the tradeoffs',
      'give me the technical version',
      '',
      null,
      undefined,
    ]) {
      expect(simpleAsk(t), String(t)).toBe(false);
    }
  });
});

describe('standardAsk — detects a request for the normal / deeper explanation', () => {
  it('fires on "go deeper" style asks', () => {
    for (const t of ['go deeper', 'give me more detail', 'more technical please', 'normal mode']) {
      expect(standardAsk(t), t).toBe(true);
    }
  });
  it('does not fire on plain or simplify asks', () => {
    for (const t of ['what is osmosis', "explain like i'm 5", null]) {
      expect(standardAsk(t), String(t)).toBe(false);
    }
  });
});

describe('effectiveExplainLevel — a one-turn trigger overrides the persisted base', () => {
  it('a simplify trigger forces simple regardless of base', () => {
    expect(effectiveExplainLevel("explain like i'm 5", 'standard')).toBe('simple');
    expect(effectiveExplainLevel('eli5', 'simple')).toBe('simple');
  });
  it('a deeper trigger forces standard, even from a simple base', () => {
    expect(effectiveExplainLevel('go deeper', 'simple')).toBe('standard');
  });
  it('no trigger leaves the persisted base untouched', () => {
    expect(effectiveExplainLevel('how does the immune system work', 'simple')).toBe('simple');
    expect(effectiveExplainLevel('how does the immune system work', 'standard')).toBe('standard');
  });
  it('a self-contradiction resolves to simple (the friendlier surprise)', () => {
    expect(effectiveExplainLevel('explain simpler but go deeper', 'standard')).toBe('simple');
  });
});

describe('simpleLevelMenu — the prompt fragment for a simple turn', () => {
  it('steers BOTH the words and the visuals, without thinning the answer', () => {
    const menu = simpleLevelMenu();
    expect(menu).toContain('EXPLANATION LEVEL — SIMPLE');
    expect(menu).toMatch(/WORDS:/);
    expect(menu).toMatch(/VISUALS:/);
    // it must NOT tell the model to answer less — simpler, not thinner.
    expect(menu).toMatch(/simpler, not thinner/i);
  });
});
