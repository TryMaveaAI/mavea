import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { Briefing } from '../src/Briefing';
import { greetingFor } from '../src/lib/greeting';

describe('greetingFor', () => {
  it('greets by time of day', () => {
    expect(greetingFor(8)).toBe('Good morning');
    expect(greetingFor(14)).toBe('Good afternoon');
    expect(greetingFor(21)).toBe('Good evening');
  });
});

describe('Briefing', () => {
  it('speaks first with three things since yesterday', () => {
    const { container } = render(<Briefing onOpen={() => {}} hour={14} />);
    expect(container.textContent).toContain('Good afternoon');
    expect(container.textContent).toContain('Three things since yesterday');
    expect(container.querySelectorAll('.briefing-card')).toHaveLength(3);
  });

  it('dives into the matching demo topic when a card is tapped', () => {
    const onOpen = vi.fn();
    const { getByRole } = render(<Briefing onOpen={onOpen} hour={14} />);
    fireEvent.click(getByRole('button', { name: /Spending spike resolved/ }));
    expect(onOpen).toHaveBeenCalledWith('money');
    fireEvent.click(getByRole('button', { name: /Lisbon in 11 days/ }));
    expect(onOpen).toHaveBeenCalledWith('trip');
  });
});
