import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Timepicker } from '../src/canvas/blocks/pickers/Timepicker';

// Regression coverage for a real bug: the `hour`/`minute` props were rendered verbatim into
// state without running them through the component's own wrapH/wrapM clamps (which exist and
// are used for every later +/- step), unlike every sibling picker that clamps its initial value
// (Numberstepper's clamp(value), Searchselect's Math.min/max on `selected`). An out-of-range
// hour (e.g. 15 in 12h format) rendered outside the picker's own 1-12 dial, and a negative
// minute broke pad()'s single-digit assumption and printed a malformed two-part string like
// "0-10" instead of a valid "50".

describe('Timepicker', () => {
  it('clamps an hour outside the 12h format window instead of rendering it verbatim', () => {
    const { container } = render(<Timepicker title="Meeting" format={12} hour={15} minute={30} />);
    const readout = container.querySelector('.tp-readout');
    expect(readout?.textContent).toMatch(/^(0?[1-9]|1[0-2]):\d{2} (AM|PM)$/);
  });

  it('clamps a negative hour into the active format window in 24h mode', () => {
    const { container } = render(<Timepicker title="Meeting" format={24} hour={-3} minute={0} />);
    const readout = container.querySelector('.tp-readout');
    expect(readout?.textContent).toMatch(/^\d{2}:\d{2}$/);
  });

  it('wraps a negative minute into 0-59 instead of leaking a malformed two-part string', () => {
    const { container } = render(
      <Timepicker title="Meeting" format={24} hour={9} minute={-10} step={5} />,
    );
    const readout = container.querySelector('.tp-readout');
    // The old bug: JS's `%` doesn't wrap negatives, so pad(-10) rendered "0-10" — a value with
    // more than two digits after the colon. Assert the minute half is always exactly 2 digits.
    expect(readout?.textContent).toMatch(/^\d{2}:\d{2}$/);
    const minuteCell = container.querySelectorAll('.tp-cell')[1];
    expect(minuteCell?.textContent).toHaveLength(2);
  });

  it('renders a valid two-digit reading for in-range hour/minute (no regression)', () => {
    const { container } = render(
      <Timepicker title="Meeting" format={12} hour={9} minute={30} meridiem="AM" />,
    );
    const readout = container.querySelector('.tp-readout');
    expect(readout?.textContent).toBe('09:30 AM');
  });
});
