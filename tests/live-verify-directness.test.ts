import { describe, expect, it } from 'vitest';
import { validateLiveResponse } from '../src/engine/liveSchema';
import { checkConsistency, hasHardIssue, opensWithPreamble } from '../src/live/verify';

function response(narration: string) {
  const result = validateLiveResponse({
    title: 'Answer',
    narration,
    blocks: [
      { type: 'insight', props: { title: 'The answer' } },
      { type: 'kpi', props: { title: 'Number', items: [{ label: 'Result', value: '42' }] } },
      { type: 'list', props: { title: 'Context', items: ['One', 'Two'] } },
    ],
  });
  if (!result) throw new Error('fixture failed to validate');
  return result;
}

describe('verify — answer-first opener', () => {
  it('reports obvious throat-clearing as a soft issue', () => {
    const issues = checkConsistency(response("Sure, let's break this down. The answer is 42."));

    expect(issues.map((issue) => issue.code)).toContain('preamble-opener');
    expect(hasHardIssue(issues)).toBe(false);
  });

  it('accepts an opener that commits immediately', () => {
    expect(opensWithPreamble('The answer is 42, because six multiplied by seven is 42.')).toBe(
      false,
    );
  });
});
