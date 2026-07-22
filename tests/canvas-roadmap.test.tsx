import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { Roadmap } from '../src/canvas/blocks/flows/Roadmap';
import type { RoadmapProps } from '../src/canvas/blocks/flows/types';

afterEach(cleanup);

const base: RoadmapProps = {
  title: 'The negotiation lifecycle',
  quarters: ['Preparation', 'Engagement', 'Closing'],
  lanes: [
    {
      name: 'Internal',
      items: [
        { label: 'Define BATNA', startQ: 0, spanQ: 1 },
        { label: 'Identify Goals', startQ: 0, spanQ: 1 },
      ],
    },
  ],
};

describe('Roadmap — bars in the same column stack rather than overlap', () => {
  it('places two same-column items on different grid rows', () => {
    const { container } = render(<Roadmap {...base} />);
    const bars = container.querySelectorAll<HTMLElement>('.fl-rm-bar');
    expect(bars).toHaveLength(2);
    const rowA = bars[0].style.gridRow;
    const rowB = bars[1].style.gridRow;
    expect(rowA).toBeTruthy();
    expect(rowA).not.toBe(rowB); // the fix: no longer both on row 1
  });

  it('renders the phase headers and lane label', () => {
    const { getByText } = render(<Roadmap {...base} />);
    expect(getByText('Preparation')).toBeInTheDocument();
    expect(getByText('Internal')).toBeInTheDocument();
    expect(getByText('Define BATNA')).toBeInTheDocument();
    expect(getByText('Identify Goals')).toBeInTheDocument();
  });
});
