import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { render } from '@testing-library/react';
import { DevelopmentMilestone } from '../src/canvas/blocks/learn/DevelopmentMilestone';
import type { DevelopmentMilestoneProps } from '../src/canvas/blocks/learn/types';

// Regression coverage for a real bug: .dm-label had no overflow-wrap, so a milestone label
// longer than the short demo fixture ("Walks independently") rendered as one unbroken run and
// overflowed past the card's edge instead of wrapping inside it, matching a class of bug already
// fixed elsewhere in the family (.lr-wx-label, .lr-qz-opttext, .bm-legend-name).

function props(labels: string[]): DevelopmentMilestoneProps {
  return {
    title: 'Development Milestones',
    ageLabel: '18 months',
    domains: [
      {
        domain: 'language',
        milestones: labels.map((label, i) => ({
          label,
          achieved: i % 2 === 0,
          note: i === 0 ? 'observed at last checkup' : undefined,
        })),
      },
    ],
  };
}

describe('DevelopmentMilestone', () => {
  it('keeps the full, untruncated label text in the DOM for a name far longer than the demo fixture', () => {
    const longLabel =
      'Uses two-to-three word combinations spontaneously in everyday conversational speech without prompting';
    const { container } = render(
      <DevelopmentMilestone {...props(['Short label', longLabel, 'Another one'])} />,
    );
    const labels = Array.from(container.querySelectorAll<HTMLSpanElement>('.dm-label'));
    expect(labels).toHaveLength(3);
    // No component-side clipping/truncation exists for this block — the long string must survive
    // verbatim; illegibility is prevented by CSS wrap, not by dropping text.
    expect(labels[1]?.textContent).toBe(longLabel);
  });

  it('renders every milestone row without collapsing or dropping items at a count well past the demo', () => {
    const n = 10;
    const labels = Array.from(
      { length: n },
      (_, i) => `Milestone number ${i + 1} with a fairly long descriptive name that keeps going`,
    );
    const { container } = render(<DevelopmentMilestone {...props(labels)} />);
    const rows = Array.from(container.querySelectorAll('.dm-milestone'));
    const rendered = Array.from(container.querySelectorAll<HTMLSpanElement>('.dm-label'));
    expect(rows).toHaveLength(n);
    expect(rendered.map((el) => el.textContent)).toEqual(labels);
  });

  it('constrains .dm-label to wrap inside its card instead of forcing the row wider', () => {
    // jsdom has no layout engine (vitest config runs with css: false), so assert the CSS
    // contract directly: the label must be allowed to break anywhere, and its flex-column
    // ancestor must not hold it to its content's natural (unwrapped) width.
    const css = readFileSync(join(__dirname, '..', 'src/canvas/blocks/learn/styles.css'), 'utf8');
    const labelRule = css.match(/\.dm-label\s*\{[^}]*\}/)?.[0] ?? '';
    expect(labelRule).toMatch(/overflow-wrap:\s*anywhere/);

    const textRule = css.match(/\.dm-text\s*\{[^}]*\}/)?.[0] ?? '';
    expect(textRule).toMatch(/min-width:\s*0/);
  });
});
