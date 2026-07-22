import { describe, expect, it } from 'vitest';
import { ALL_CHAPTERS } from '../src/tour/tourPlan';
import { DEMO_SCRIPTS } from '../src/demo/scripts';
import { naturalGuidedCopy, naturalizeGuidedFrame } from '../src/tour/guidedCopy';
import type { TurnFrame } from '../src/live/history';

const pauseDash = /[—–]|\p{L}-\p{L}/u;

describe('guided copy uses natural speech punctuation', () => {
  it('keeps walkthrough coach lines and end card hooks free of pause dashes', () => {
    for (const chapter of ALL_CHAPTERS) {
      expect(chapter.coach, chapter.id).not.toMatch(pauseDash);
      if (chapter.hook) expect(chapter.hook, chapter.id).not.toMatch(pauseDash);
    }
  });

  it('keeps demo asks and beat captions free of pause dashes', () => {
    for (const script of DEMO_SCRIPTS) {
      for (const step of script.steps) {
        if (step.ask) expect(step.ask, script.persona).not.toMatch(pauseDash);
        if (step.note) expect(step.note, script.persona).not.toMatch(pauseDash);
      }
    }
  });

  it('normalizes frozen model narration before a guided replay displays or speaks it', () => {
    const frame: TurnFrame = {
      question: 'Show a side-by-side view — clearly.',
      narration: 'First — the high-level result.',
      spoken: 'First — the high-level result.',
      mode: 'replace',
      tour: [{ index: 0, say: 'Now — zoom-in.', saySpoken: 'Now — zoom-in.' }],
      // Minimal spec — naturalizeGuidedFrame only reads the narration/tour text, not the canvas
      // (same `as unknown as` fixture shape the clip-reel tests use for a TurnFrame's spec).
      spec: {
        id: 'guided-copy-test',
        title: 'Test',
        sub: '',
        blocks: [],
      } as unknown as TurnFrame['spec'],
      at: 0,
    };
    const clean = naturalizeGuidedFrame(frame);
    expect(naturalGuidedCopy(frame.question)).not.toMatch(pauseDash);
    expect(clean.narration).not.toMatch(pauseDash);
    expect(clean.spoken).not.toMatch(pauseDash);
    expect(clean.tour[0].say).not.toMatch(pauseDash);
    expect(clean.tour[0].saySpoken).not.toMatch(pauseDash);
  });
});
