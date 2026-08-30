import { describe, it, expect } from 'vitest';
import {
  thinkingLevelFor,
  temperatureFor,
  capSpoken,
  isHardAsk,
  spokenBudget,
  NARRATION_FIRST_LINE,
  spokenLineDirective,
} from '../src/live/effort';
import { analyzeIntent } from '../src/live/select/intent';

describe('thinkingLevelFor — cheapest effort that fits the ask', () => {
  it('keeps a trivial ask at minimal', () => {
    expect(thinkingLevelFor('lean', 'what is 2+2')).toBe('minimal');
  });

  it('never bumps a trivial ask above minimal, even on a higher quality dial', () => {
    // A lean, non-hard ask gains nothing from reasoning — the quality dial raises effort for
    // substantive asks, not "what is 1+1". (Regression: balanced used to push lean → low.)
    expect(thinkingLevelFor('lean', 'what is 1+1', 'balanced')).toBe('minimal');
    expect(thinkingLevelFor('lean', 'what is 1+1', 'thorough')).toBe('minimal');
  });

  it('keeps an ordinary rich ask at minimal (composition, not reasoning)', () => {
    expect(thinkingLevelFor('rich', 'tell me about New Jersey')).toBe('minimal');
  });

  it('steps up to low for a genuinely hard ask', () => {
    expect(thinkingLevelFor('rich', 'derive the quadratic formula step by step')).toBe('low');
    expect(thinkingLevelFor('rich', 'what is the root cause of this outage')).toBe('low');
  });

  it('spends reasoning only where it helps — never on composition, deeper only on Thorough', () => {
    // A canvas is composition, not derivation: at ANY dial an ordinary ask stays minimal.
    // The old policy bumped every rich ask one rung per dial notch, which put hundreds of hidden
    // reasoning tokens ahead of the first visible one on the most common turns — the single
    // largest slice of a measured 3.2s first-token wait.
    expect(thinkingLevelFor('rich', 'tell me about jazz', 'fast')).toBe('minimal');
    expect(thinkingLevelFor('rich', 'tell me about jazz', 'balanced')).toBe('minimal');
    expect(thinkingLevelFor('rich', 'tell me about jazz', 'thorough')).toBe('minimal');
    // A hard ask earns one real rung — and HARD matches everyday phrasings ("why does…",
    // "compare A vs B"), so the default dial is clamped there. Only the explicit Thorough dial
    // buys the deeper pass, because that user chose to trade time for it.
    expect(thinkingLevelFor('rich', 'why does inflation happen', 'balanced')).toBe('low');
    expect(thinkingLevelFor('rich', 'prove this theorem', 'fast')).toBe('low');
    expect(thinkingLevelFor('rich', 'prove this theorem', 'balanced')).toBe('low');
    expect(thinkingLevelFor('rich', 'prove this theorem', 'thorough')).toBe('high');
  });
});

describe('temperatureFor — cold for precision, hot for creativity', () => {
  // Real intent signals, the same way generateLive derives them, so the test exercises the
  // actual classifier coupling rather than a hand-built shape that could drift from reality.
  const temp = (text: string, complexity: 'lean' | 'rich' = 'rich') =>
    temperatureFor(complexity, analyzeIntent(text), text);

  it('runs hot for a creative ask — variety is the value', () => {
    expect(temp('brainstorm some names for my coffee shop')).toBe(0.75);
    expect(temp('come up with ideas for a birthday party')).toBe(0.75);
  });

  it('runs cold for a precision ask — one best answer, repeatable', () => {
    expect(temp('what is 12 * 9', 'lean')).toBe(0.1); // trivial arithmetic
    expect(temp('derive the quadratic formula step by step')).toBe(0.1); // hard derivation
    expect(temp('debug why the server keeps crashing')).toBe(0.1); // troubleshoot
  });

  it('keeps the proven 0.3 default for ordinary explainers and decisions', () => {
    expect(temp('tell me about New Jersey')).toBe(0.3);
    expect(temp('how does photosynthesis work')).toBe(0.3);
    expect(temp('should I lease or buy a car')).toBe(0.3);
  });

  it('creativity wins over precision when an ask is both (novelty is the goal)', () => {
    // "brainstorm names" carries a creative signal; even phrased as a problem it stays hot.
    expect(temp('brainstorm ways to debug a flaky test')).toBe(0.75);
  });
});

describe('isHardAsk', () => {
  it('flags derivations / trade-offs / root-cause', () => {
    expect(isHardAsk('optimize my portfolio for the trade-offs')).toBe(true);
    expect(isHardAsk('debug why the server is slow')).toBe(true);
  });
  it('does not flag a plain factual ask', () => {
    expect(isHardAsk('what is the capital of France')).toBe(false);
    expect(isHardAsk('show me a dashboard of sales')).toBe(false);
  });
});

describe('capSpoken — conversational, never a wall of text', () => {
  it('holds a lean answer to a tweet', () => {
    const long = 'a '.repeat(200);
    expect(capSpoken(long, 'lean').length).toBeLessThanOrEqual(spokenBudget('lean'));
  });

  it('allows a couple of sentences for a rich answer but still caps it', () => {
    const long = 'word '.repeat(400);
    const out = capSpoken(long, 'rich');
    expect(out.length).toBeLessThanOrEqual(spokenBudget('rich'));
    expect(out.length).toBeGreaterThan(spokenBudget('lean')); // richer than a tweet
  });

  it('leaves a short line untouched and trims at a word boundary', () => {
    expect(capSpoken('Half to needs, a third to wants.', 'rich')).toBe(
      'Half to needs, a third to wants.',
    );
    // Distinct long words so a boundary trim is observable: the result must not end with a
    // half-word — it ends on a whole word + ellipsis, never slicing through a token.
    const sentence = 'antidisestablishmentarianism '.repeat(40);
    const trimmed = capSpoken(sentence, 'rich');
    expect(trimmed.endsWith('…')).toBe(true);
    expect(trimmed).toMatch(/antidisestablishmentarianism…$/); // whole word, not a fragment
  });

  it('handles empty input', () => {
    expect(capSpoken('', 'rich')).toBe('');
  });

  it('prefers a complete sentence over a mid-sentence fragment when one fits the budget', () => {
    // A cut that lands mid-clause reads as an abandoned thought; capSpoken should back up to
    // the last full sentence that fits instead of chopping the next one short.
    const long = 'Mavéa keeps this short. '.repeat(20);
    const out = capSpoken(long, 'rich');
    expect(out.length).toBeLessThanOrEqual(spokenBudget('rich'));
    expect(out.endsWith('…')).toBe(false);
    expect(out.endsWith('short.')).toBe(true);
  });
});

describe('shared narration directives — one source of truth for generateLive AND the eval harness', () => {
  it('gives lean/brief the one-sentence spec and rich the two-or-three-sentence spec', () => {
    expect(spokenLineDirective('lean')).toMatch(/ONE short sentence/);
    expect(spokenLineDirective('brief')).toMatch(/ONE short sentence/);
    expect(spokenLineDirective('rich')).toMatch(/two or three short sentences/);
    // never both in the same directive.
    expect(spokenLineDirective('lean')).not.toMatch(/two or three/);
    expect(spokenLineDirective('rich')).not.toMatch(/ONE short sentence/);
  });

  it('states the narration-first output order as a fixed, non-empty instruction', () => {
    expect(NARRATION_FIRST_LINE).toContain('OUTPUT ORDER');
    expect(NARRATION_FIRST_LINE).toContain('narration');
  });
});
