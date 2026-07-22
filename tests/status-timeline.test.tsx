import { render } from '@testing-library/react';
import { Statustimeline } from '../src/canvas/blocks/status/Statustimeline';
import type { StatustimelineProps } from '../src/canvas/blocks/status/types';

describe('Statustimeline', () => {
  it('renders a normal timeline', () => {
    const { getByText } = render(
      <Statustimeline
        title="Pipeline"
        events={[
          { status: 'done', label: 'Build', time: '2m ago' },
          { status: 'progress', label: 'Deploy', time: 'now' },
        ]}
      />,
    );
    expect(getByText('Build')).toBeInTheDocument();
  });

  it('does not crash when the model emits an unknown status', () => {
    // The model can produce a status outside the enum (e.g. "in-progress", "complete", a typo);
    // the component must fall back to neutral styling rather than throw on META[unknown].c.
    const events = [
      { status: 'done', label: 'Built', time: '2m' },
      { status: 'in-progress', label: 'Deploying', time: 'now' },
      { status: '', label: 'Empty status', time: '' },
    ] as unknown as StatustimelineProps['events'];
    expect(() => render(<Statustimeline title="Release" events={events} />)).not.toThrow();
  });
});
