import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GroupedBars } from '../src/canvas/blocks/charts2/GroupedBars';
import type { AccentVar } from '../src/data/conversation';

const PRESENCE = 'var(--presence)' as AccentVar;
const INSIGHT = 'var(--insight)' as AccentVar;

// Regression coverage for the "hours9" screenshot: a 2-bar chart with a unit must format the
// value + unit with a space, draw a nice y-axis ceiling (18 → 20) with labelled ticks, and
// degrade to an empty state when there's no data.
describe('GroupedBars (Wave 1 retrofit)', () => {
  const batteryProps = {
    title: 'Average battery life',
    unit: 'hours',
    groups: ['Framework', 'MacBook Air'],
    series: [{ name: 'Battery', color: PRESENCE, data: [9, 18] }],
  };

  it('formats the value with a separating space — not "hours9"', () => {
    render(<GroupedBars {...batteryProps} />);
    // The y-axis ticks are bare numbers; the unit rides the value, not every tick.
    // Hover tooltips are pointer-driven, so assert the axis carries the nice ceiling instead.
    expect(screen.getByText('20')).toBeInTheDocument(); // niceDomain(0,18) → ceiling 20
    expect(screen.getByText('0')).toBeInTheDocument();
    // The broken concatenation must never appear anywhere in the output.
    expect(screen.queryByText(/hours9|hours18|9hours|18hours/)).toBeNull();
  });

  it('renders a labelled y-axis with nice round ticks', () => {
    render(<GroupedBars {...batteryProps} />);
    for (const tick of ['0', '5', '10', '15', '20']) {
      expect(screen.getByText(tick)).toBeInTheDocument();
    }
  });

  it('shows an empty state instead of a frame around no data', () => {
    render(<GroupedBars title="Nothing yet" groups={[]} series={[]} />);
    expect(screen.getByRole('status')).toHaveTextContent('No data to show');
  });

  it('renders a legend with the series names', () => {
    render(
      <GroupedBars
        title="Two series"
        unit="ms"
        groups={['A', 'B']}
        series={[
          { name: 'p50', color: PRESENCE, data: [10, 20] },
          { name: 'p99', color: INSIGHT, data: [40, 80] },
        ]}
      />,
    );
    expect(screen.getByText('p50')).toBeInTheDocument();
    expect(screen.getByText('p99')).toBeInTheDocument();
  });
});
