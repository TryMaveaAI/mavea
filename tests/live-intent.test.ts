import { describe, it, expect } from 'vitest';
import { analyzeIntent } from '../src/live/select';
import { chooseArc } from '../src/live/story/arcs';

// intent.ts reads WHAT KIND of answer an ask wants (decide / plan / troubleshoot / reflect …)
// and how heavy the stakes are; arcs.ts turns that into the narrative ordering of the canvas.
describe('analyzeIntent', () => {
  it('reads a high-stakes career decision', () => {
    const i = analyzeIntent('Should I quit my job and start freelancing?');
    expect(i.decision).toBe(true);
    expect(i.highStakes).toBe(true);
    expect(i.serious).toBe(true);
    expect(i.domain).toBe('career');
  });

  it('reads a troubleshooting ask', () => {
    const i = analyzeIntent("why isn't my code working");
    expect(i.troubleshoot).toBe(true);
    expect(i.domain).toBe('tech');
  });

  it('reads a personal reflection (serious, not a clear decision)', () => {
    const i = analyzeIntent('is my friendship draining me');
    expect(i.reflection).toBe(true);
    expect(i.serious).toBe(true);
    expect(i.decision).toBe(false);
  });

  it('reads an explicit comparison', () => {
    expect(analyzeIntent('compare the iphone vs the pixel').comparison).toBe(true);
  });

  it('stays neutral for a trivial fact', () => {
    const i = analyzeIntent('what is 2+2');
    expect(i.highStakes).toBe(false);
    expect(i.serious).toBe(false);
    expect(i.reflection).toBe(false);
  });
});

describe('chooseArc', () => {
  it('keeps a lean ask on simple_answer with no directive (today’s behavior)', () => {
    const arc = chooseArc(analyzeIntent('Should I quit my job?'), 'lean');
    expect(arc.id).toBe('simple_answer');
    expect(arc.directive).toBe('');
  });

  it('routes a high-stakes decision to its arc, ending on action', () => {
    const arc = chooseArc(analyzeIntent('Should I quit my job and start freelancing?'), 'rich');
    expect(arc.id).toBe('high_stakes_decision');
    expect(arc.directive).toMatch(/END with/);
  });

  it('routes troubleshooting, reflection, and comparison to the right arcs', () => {
    expect(chooseArc(analyzeIntent("why isn't my app working"), 'rich').id).toBe(
      'diagnose_and_fix',
    );
    expect(chooseArc(analyzeIntent('is my friendship draining me'), 'rich').id).toBe(
      'personal_reflection',
    );
    expect(chooseArc(analyzeIntent('compare the iphone vs the pixel'), 'rich').id).toBe(
      'compare_and_decide',
    );
  });

  it('falls back to a clean explanation arc for a neutral rich ask', () => {
    expect(chooseArc(analyzeIntent(''), 'rich').id).toBe('explain');
  });
});
