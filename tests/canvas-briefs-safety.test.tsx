import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CareInstructions } from '../src/canvas/blocks/briefs/CareInstructions';
import { ClauseCompare } from '../src/canvas/blocks/briefs/ClauseCompare';
import { StatusBadge } from '../src/canvas/blocks/briefs/BriefFrame';
import { ContactDirectory } from '../src/canvas/blocks/briefs/ContactDirectory';
import { CoverageCheck } from '../src/canvas/blocks/briefs/CoverageCheck';
import { OfferBreakdown } from '../src/canvas/blocks/briefs/OfferBreakdown';
import type { BriefStatus } from '../src/canvas/blocks/briefs/types';

describe('applied brief safety boundaries', () => {
  it('always scopes medical, legal, and coverage summaries', () => {
    const { rerender } = render(<CareInstructions title="Care" do={['Rest']} />);
    expect(screen.getByText(/not a diagnosis or a substitute for professional care/i)).toBeTruthy();

    rerender(
      <ClauseCompare
        title="Terms"
        left={{ label: 'Current', text: 'Thirty days.' }}
        right={{ label: 'Proposed', text: 'Sixty days.' }}
        differences={[{ topic: 'Notice', change: 'The notice period changes.' }]}
      />,
    );
    expect(screen.getByText(/review the full text with a qualified professional/i)).toBeTruthy();

    rerender(
      <CoverageCheck title="Coverage" rows={[{ item: 'Mechanical fault', status: 'unknown' }]} />,
    );
    expect(
      screen.getByText(/verify current terms, exclusions, limits, and eligibility/i),
    ).toBeTruthy();
  });

  it('fails closed with privacy and compensation verification notes', () => {
    const { rerender } = render(
      <ContactDirectory
        title="Contacts"
        entries={[{ name: 'Jordan Lee', methods: [{ label: 'Work', value: '(555) 010-0184' }] }]}
      />,
    );
    expect(screen.getByText(/only with the intended recipients/i)).toBeTruthy();

    rerender(<OfferBreakdown title="Offer" parts={[{ label: 'Base', value: '$100,000' }]} />);
    expect(
      screen.getByText(/verify bonus, equity, vesting, tax, and repayment terms/i),
    ).toBeTruthy();

    rerender(
      <ContactDirectory
        title="Contacts"
        entries={[{ name: 'Jordan Lee', methods: [] }]}
        privacyNote="Keep this within the project team."
      />,
    );
    expect(screen.getByText(/only with the intended recipients/i)).toHaveTextContent(
      /keep this within the project team/i,
    );

    rerender(
      <OfferBreakdown
        title="Offer"
        parts={[]}
        assumptions={['Bonus assumes target performance.', '']}
      />,
    );
    expect(
      screen.getByText(/verify bonus, equity, vesting, tax, and repayment terms/i),
    ).toHaveTextContent(/bonus assumes target performance/i);
  });

  it('does not let blank supplemental copy suppress permanent safeguards', () => {
    const { rerender } = render(
      <ContactDirectory title="Contacts" entries={[]} privacyNote="   " />,
    );
    expect(screen.getByText(/only with the intended recipients/i)).toBeTruthy();

    rerender(<OfferBreakdown title="Offer" parts={[]} assumptions={['', '   ']} />);
    expect(
      screen.getByText(/verify bonus, equity, vesting, tax, and repayment terms/i),
    ).toBeTruthy();
  });

  it('renders a visible safe fallback for an unexpected runtime status', () => {
    render(<StatusBadge status={'model-invented' as BriefStatus} />);
    expect(screen.getByText('Unknown')).toHaveClass('brf-status--unknown');
  });
});
