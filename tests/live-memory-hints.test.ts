import { select as selectComponents } from './helpers/select';
import { describe, it, expect, beforeEach } from 'vitest';
import { mergeNodes, getMemoryNodes, forgetAll } from '../src/live/memory/store';
import { proceduralHints } from '../src/live/memory/retrieve';
import { correctionUpdate, inkCorrectionUpdate } from '../src/live/memory/procedural';

beforeEach(() => forgetAll());

describe('proceduralHints — turning learned lessons into answer-loop hints', () => {
  it('reads a stated depth preference (global — applies to any question)', () => {
    mergeNodes([
      {
        concept: 'preferences.depth',
        body: 'Likes to keep it brief and skip the fluff.',
        source: 'user-stated',
      },
    ]);
    expect(proceduralHints(getMemoryNodes(), 'explain compound interest').depth).toBe('tight');
  });

  it('maps a stated FORMAT preference to concrete block types to prefer', () => {
    mergeNodes([
      {
        concept: 'preferences.form',
        body: 'Prefers answers as comparison tables.',
        source: 'user-stated',
      },
    ]);
    const h = proceduralHints(getMemoryNodes(), 'should I rent or buy?');
    expect(h.prefer).toContain('compare');
  });

  it('applies a correction (verify) only when its subject bears on the question', () => {
    mergeNodes([correctionUpdate({ what: 'mortgage rate', was: '7.2%', now: '6.4%' })]);
    expect(proceduralHints(getMemoryNodes(), 'what is my mortgage rate now?').verify).toBe(true);
    expect(proceduralHints(getMemoryNodes(), 'suggest a pasta recipe').verify).toBe(false);
  });

  it('honours ink-correction prefer/avoid despite a loss (the user taught it directly)', () => {
    mergeNodes([
      inkCorrectionUpdate('revenue trend', 'make it a line chart', {
        prefer: ['chart'],
        avoid: ['donut'],
      }),
    ]);
    const h = proceduralHints(getMemoryNodes(), 'show the revenue trend');
    expect(h.prefer).toContain('chart');
    expect(h.avoid).toContain('donut');
  });

  it('does NOT let a FRESH model-inferred lesson (no track record) steer component choice', () => {
    // A model-guessed format preference with no outcomes must earn standing before it can bias the
    // draw — provenance-gated steering, so a self-inferred guess never steers the answer.
    mergeNodes([
      {
        concept: 'preferences.form',
        body: 'Maybe prefers comparison tables.', // would map to 'compare' if the gate were broken
        kind: 'procedural',
        source: 'model-inferred',
      },
    ]);
    const h = proceduralHints(getMemoryNodes(), 'should I rent or buy?');
    expect(h.prefer).not.toContain('compare');
  });

  it('does NOT let a low-confidence inferred lesson steer component choice', () => {
    // A model-inferred procedural lesson with a net-negative record must be ignored for prefer/avoid.
    mergeNodes([
      {
        concept: 'topics.sales',
        body: 'Maybe likes flashy charts.',
        kind: 'procedural',
        source: 'model-inferred',
        prefer: ['gauge'],
        outcome: 'loss',
      },
    ]);
    mergeNodes([
      {
        concept: 'topics.sales',
        body: 'Maybe likes flashy charts.',
        kind: 'procedural',
        outcome: 'loss',
      },
    ]);
    const h = proceduralHints(getMemoryNodes(), 'how are sales doing?');
    expect(h.prefer).not.toContain('gauge');
  });
});

describe('selectComponents — lessons are advisory and can never empty the canvas', () => {
  it('still returns a non-empty type set even when every preference is set to avoid', () => {
    const all = selectComponents({ userText: 'compare two cities', tier: 'frontier' }).types;
    const avoided = selectComponents({
      userText: 'compare two cities',
      tier: 'frontier',
      lessons: { avoid: all },
    });
    expect(avoided.types.length).toBeGreaterThan(0); // base floor always merges in
  });

  it('accepts prefer/avoid hints without throwing and keeps a valid selection', () => {
    const r = selectComponents({
      userText: 'show the revenue trend over time',
      tier: 'frontier',
      lessons: { prefer: ['chart'], avoid: ['donut'] },
    });
    expect(r.types.length).toBeGreaterThan(0);
    expect(r.allowed.size).toBeGreaterThan(0);
  });
});
