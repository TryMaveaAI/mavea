import { describe, expect, it } from 'vitest';
import {
  capContentText,
  contentBudgetPromptClause,
  enforceComponentContentBudget,
} from '../src/canvas/blocks/catalog/contentBudget';
import { createMeta } from '../src/canvas/blocks/catalog/meta';
import { validateLiveResponse } from '../src/engine/liveSchema';

describe('shared model/UI content budgets', () => {
  it('caps user-perceived characters without splitting an emoji grapheme', () => {
    expect(capContentText('👨‍👩‍👧‍👦👨‍👩‍👧‍👦', { maxGraphemes: 1, maxLines: 1 })).toBe('👨‍👩‍👧‍👦');
  });

  it('teaches exact item and text limits in the component menu contract', () => {
    const meta = createMeta('budget-probe', {
      requires: ['title', 'items'],
      optional: ['footer'],
      itemShapes: [{ prop: 'items', text: 'label' }],
    });
    const clause = contentBudgetPromptClause(meta);

    expect(clause).toContain('title≤96 chars');
    expect(clause).toContain('items≤16');
    expect(clause).toContain('items[].label≤96 chars');
    expect(clause).toContain('footer≤480 chars');
  });

  it('enforces calibrated collection and nested text limits at runtime', () => {
    const rows = Array.from({ length: 75 }, (_, i) => ({
      name: `${i}-${'x'.repeat(200)}`,
    }));
    const bounded = enforceComponentContentBudget('datatable', { rows });
    const boundedRows = bounded.rows as Array<{ name: string }>;

    expect(boundedRows).toHaveLength(50);
    expect(Array.from(boundedRows[0].name)).toHaveLength(96);
  });

  it('caps runaway response and Canvas text before it reaches a renderer', () => {
    const huge = 'x'.repeat(10_000);
    const response = validateLiveResponse(
      {
        title: huge,
        sub: huge,
        narration: 'Safe narration',
        blocks: [
          {
            type: 'timeline',
            props: {
              title: huge,
              events: [
                { time: huge, title: huge, detail: huge },
                { time: 'Later', title: 'Second event', detail: 'Two events make a sequence.' },
              ],
            },
          },
        ],
      },
      new Set(['timeline']),
    );

    expect(response).not.toBeNull();
    expect(Array.from(response!.title)).toHaveLength(96);
    expect(Array.from(response!.sub)).toHaveLength(180);
    const props = response!.blocks[0].props as {
      title: string;
      events: Array<{ time: string; title: string; detail: string }>;
    };
    expect(Array.from(props.title)).toHaveLength(96);
    expect(Array.from(props.events[0].time)).toHaveLength(64);
    expect(Array.from(props.events[0].title)).toHaveLength(96);
    expect(Array.from(props.events[0].detail)).toHaveLength(320);
  });

  it('never changes action arguments while bounding the displayed label', () => {
    const body = 'important '.repeat(500);
    const bounded = enforceComponentContentBudget('action', {
      label: 'x'.repeat(1_000),
      args: { body },
    });

    expect(Array.from(bounded.label as string)).toHaveLength(96);
    expect((bounded.args as { body: string }).body).toBe(body);
  });
});
