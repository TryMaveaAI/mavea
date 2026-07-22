import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { DiagramFlow } from '../src/canvas/blocks/diagrams/DiagramFlow';

// Regression coverage for a real bug: DiagramFlow char-capped each node label against its fixed
// ellipse geometry and ellipsized the rest, so a day-plan node read "Brunch + shower…". Labels
// now shrink-to-fit via the shared fitText primitive — the full text always renders.

const dayPlan = {
  nodes: [
    { id: 'a', label: 'Pickleball warm-up', sub: '2 hours' },
    { id: 'b', label: 'Brunch + shower + reset', sub: 'recharge' },
    { id: 'c', label: 'Lakefront snack + walk', sub: 'reset pace' },
    { id: 'd', label: 'Comedy club or late show', sub: 'easy evening' },
  ],
  edges: [
    { from: 'a', to: 'b' },
    { from: 'b', to: 'c' },
    { from: 'c', to: 'd' },
  ],
};

describe('DiagramFlow node labels', () => {
  it('never truncates a node label to an ellipsis', () => {
    const { container } = render(
      <DiagramFlow title="Day plan" layout="layered" nodes={dayPlan.nodes} edges={dayPlan.edges} />,
    );
    for (const t of container.querySelectorAll('text')) {
      expect(t.textContent ?? '').not.toContain('…');
    }
  });

  it('keeps the full label available (title tooltip + wrapped tspans)', () => {
    const { container } = render(
      <DiagramFlow title="Day plan" layout="layered" nodes={dayPlan.nodes} edges={dayPlan.edges} />,
    );
    // The <title> carries the full, unwrapped label for every node.
    const titles = [...container.querySelectorAll('title')].map((t) => t.textContent ?? '');
    expect(titles.some((t) => t.includes('Brunch + shower + reset'))).toBe(true);
    expect(titles.some((t) => t.includes('Comedy club or late show'))).toBe(true);
    // Words from a long label all render (wrapped across tspans), none dropped.
    const rendered = container.textContent ?? '';
    for (const word of ['Comedy', 'club', 'late', 'show']) expect(rendered).toContain(word);
  });
});
