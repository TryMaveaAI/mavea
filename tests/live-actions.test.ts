import { describe, expect, it } from 'vitest';
import { validateLiveResponse } from '../src/engine/liveSchema';

describe('retired action proposals', () => {
  it.each(['calendar.addEvent', 'github.openDraftPr'])(
    'drops %s even when a caller passes a legacy allowlist',
    (id) => {
      const response = validateLiveResponse(
        {
          title: 'Next steps',
          blocks: [
            { type: 'insight', props: { title: 'Review your plan' } },
            { type: 'action', props: { id, label: 'Confirm', args: { title: 'Review' } } },
          ],
        },
        new Set(['insight', 'action']),
      );

      expect(response?.blocks.map((block) => block.type)).toEqual(['insight']);
    },
  );
});
