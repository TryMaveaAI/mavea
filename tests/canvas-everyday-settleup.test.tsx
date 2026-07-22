import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { SettleUp } from '../src/canvas/blocks/everyday/SettleUp';
import type { Settlement } from '../src/canvas/blocks/everyday/types';

// Regression coverage for a real bug: .su-settle is a flex row and its .su-from/.su-to name
// spans had no flex-basis or truncation, so a settlement between people with names longer than
// the short demo fixture ("Alex" → "Sam") overflowed the row horizontally instead of shrinking
// to fit alongside the arrow and amount pill.

function settlements(nameLen: number): Settlement[] {
  return [
    { from: 'A'.repeat(nameLen), to: 'B'.repeat(nameLen), amount: '$42.00' },
    {
      from: 'Priya Chandrasekaran-Whitfield',
      to: 'Montgomery Okonkwo-Fitzgerald',
      amount: '$18.50',
    },
  ];
}

describe('SettleUp', () => {
  it('renders the demo-sized fixture with short names untouched', () => {
    const { container, getByText } = render(
      <SettleUp title="Split" settlements={[{ from: 'Alex', to: 'Sam', amount: '$12.00' }]} />,
    );
    expect(getByText('Alex')).toBeInTheDocument();
    expect(getByText('Sam')).toBeInTheDocument();
    const from = container.querySelector('.su-from') as HTMLElement;
    const to = container.querySelector('.su-to') as HTMLElement;
    expect(from.style.overflow).toBe('hidden');
    expect(to.style.overflow).toBe('hidden');
  });

  it('constrains names far longer than the demo data instead of overflowing the row', () => {
    const { container } = render(<SettleUp title="Split" settlements={settlements(24)} />);
    const froms = Array.from(container.querySelectorAll<HTMLElement>('.su-from'));
    const tos = Array.from(container.querySelectorAll<HTMLElement>('.su-to'));
    expect(froms).toHaveLength(2);
    expect(tos).toHaveLength(2);

    // Every name span must carry the flex-shrink-to-fit + ellipsis contract — without it, a
    // long name renders at its full intrinsic width and blows out the fixed-width flex row.
    for (const el of [...froms, ...tos]) {
      // jsdom expands the `flex: 1` shorthand to its longhand components.
      expect(el.style.flex).toBe('1 1 0%');
      expect(el.style.minWidth).toBe('0px');
      expect(el.style.overflow).toBe('hidden');
      expect(el.style.textOverflow).toBe('ellipsis');
      expect(el.style.whiteSpace).toBe('nowrap');
    }

    // The settlement row itself stays a bounded flex container — the arrow and amount pill are
    // still present and not pushed out by an unconstrained name.
    const rows = container.querySelectorAll('.su-settle');
    expect(rows).toHaveLength(2);
    for (const row of Array.from(rows)) {
      expect(row.querySelector('.su-arrow')).toBeTruthy();
      expect(row.querySelector('.su-amt-pill')).toBeTruthy();
    }

    // The full untruncated name survives as a native title tooltip, matching the truncation
    // pattern used elsewhere in the family (PrayerTimes, EtymTree).
    expect(froms[1].getAttribute('title')).toBe('Priya Chandrasekaran-Whitfield');
    expect(tos[1].getAttribute('title')).toBe('Montgomery Okonkwo-Fitzgerald');
  });
});
