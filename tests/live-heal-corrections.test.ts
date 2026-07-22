import { describe, expect, it } from 'vitest';
import { correctionMarks } from '../src/live/heal/corrections';
import type { TurnFrame } from '../src/live/history';

// The matcher is conservative: the most recent earlier frame that actually mentions the
// corrected subject gets the mark; no mention anywhere → no victim is guessed.

function frame(question: string, narration: string, corrects?: TurnFrame['corrects']): TurnFrame {
  return {
    question,
    narration,
    mode: 'replace',
    tour: [],
    spec: { title: '', blocks: [] } as unknown as TurnFrame['spec'],
    at: 0,
    ...(corrects ? { corrects } : {}),
  };
}

describe('correctionMarks', () => {
  it('marks the most recent earlier frame that mentions the corrected subject', () => {
    const frames = [
      frame('What rate for the refi?', 'The refi rate is 6.4%.'),
      frame('And the fees?', 'About $3,200 in fees.'),
      frame('Check the refi rate again', 'Actually the refi rate is 5.9%.', {
        what: 'the refi rate',
        was: '6.4%',
        now: '5.9%',
      }),
    ];
    const marks = correctionMarks(frames);
    expect(marks.size).toBe(1);
    expect(marks.get(0)?.by).toBe(2);
    expect(marks.get(0)?.note.now).toBe('5.9%');
  });

  it('guesses no victim when nothing earlier mentions the subject', () => {
    const frames = [
      frame('Plan Tokyo', 'Late April works.'),
      frame('Now the budget', 'Per person it is $2,500.', {
        what: 'the hotel price',
        was: '$200',
        now: '$260',
      }),
    ];
    expect(correctionMarks(frames).size).toBe(0);
  });

  it('matching is case-insensitive across question, title and narration', () => {
    const frames = [
      frame('THE REFI RATE today?', 'Around 6.4%.'),
      frame('again', 'It moved.', { what: 'the refi rate', was: '6.4%', now: '6.1%' }),
    ];
    expect(correctionMarks(frames).has(0)).toBe(true);
  });
});
