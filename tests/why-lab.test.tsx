// why-lab.test.tsx — the Why Machine's grounded readout, rendered.
//
// The seed webs are pinned as data in why-seed.test.ts; this is the other half — that the overlay
// actually PRINTS the exact figures on the grounded rung and refuses to on the illustrative one.
// Until the grounded seed existed there was no way to see the precise-delta experience at all, so
// the path that turns a lever into "7.4 → 4.7pp" had never been exercised end to end.
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { WhyLab } from '../src/live/why/WhyLab';

afterEach(cleanup);

/** One card on the web, found by its own label — which the conclusion panel also prints for the
 *  outcome, so the match is narrowed to the card that carries it. */
function card(label: string): HTMLElement {
  const found = screen
    .getAllByText(label)
    .map((el) => el.closest('.wm-node'))
    .filter((el): el is HTMLElement => el !== null);
  expect(found, `one card labelled “${label}”`).toHaveLength(1);
  return found[0];
}

describe('#/whylab — the grounded rung answers exactly', () => {
  it('opens on the grounded web and shows what the causes explain', () => {
    render(<WhyLab />);
    expect(screen.getByText('Why did late deliveries jump in June?')).toBeTruthy();
    // Grounded, so no banner is claiming otherwise.
    expect(screen.queryByText(/Illustrative model/)).toBeNull();
    expect(screen.queryByText(/Structure only/)).toBeNull();
    expect(screen.getByText('83% explained')).toBeTruthy();
    // The outcome's own card and the live conclusion panel, both reading the measured figure.
    expect(screen.getAllByText('7.4pp')).toHaveLength(2);
  });

  it('re-cascades to an exact new figure when a cause is pruned', () => {
    render(<WhyLab />);
    fireEvent.click(within(card('Heatwave closed the north route')).getByText('remove'));
    // 7.4pp, less the 70% of the depot queue the heatwave carried into 52% of the jump.
    expect(screen.getByText('4.7pp')).toBeTruthy();
    expect(screen.getByText('7.4→4.7pp')).toBeTruthy();
    expect(screen.getByText('47% explained')).toBeTruthy();
  });

  it('shows a receipt for the figure it just used', () => {
    render(<WhyLab />);
    fireEvent.click(card('Late deliveries +7.4pp'));
    expect(
      screen.getByText(/Late deliveries rose 7.4 points in June/),
      'the outcome names the sentence its number came from',
    ).toBeTruthy();
  });

  it('refuses the same arithmetic on the illustrative rung', () => {
    render(<WhyLab />);
    fireEvent.click(screen.getByRole('button', { name: 'Illustrative (no figures)' }));
    expect(screen.getByText(/Illustrative model/)).toBeTruthy();
    expect(screen.getByText('Why did churn spike in March?')).toBeTruthy();
    // Weighted and receipted throughout, and still not one exact figure: no "% explained", and
    // the outcome's measured 6.2pp is nowhere on screen.
    expect(screen.queryByText(/explained/)).toBeNull();
    expect(screen.queryByText('6.2pp')).toBeNull();
    expect(screen.getByText(/relative, not measured/)).toBeTruthy();
  });

  it('moves the structure-only rung in relative strength instead', () => {
    render(<WhyLab />);
    fireEvent.click(screen.getByRole('button', { name: 'Structure-only (relative)' }));
    expect(screen.getByText(/Structure only/)).toBeTruthy();
    expect(screen.getByText(/relative, not measured/)).toBeTruthy();
  });
});

describe('#/whylab — a link says what it does not claim', () => {
  it('shows the trust layer’s evidence panel when a link is opened', () => {
    // The Why Machine used to print its own single-receipt block here, which had no way to say
    // "contributes, not causes", and no way to show a source that disagreed. Both surfaces now
    // read a link the same way, out of the same component.
    const { container } = render(<WhyLab />);
    const link = container.querySelector('.wm-edge');
    expect(link).not.toBeNull();
    fireEvent.click(link!);

    const panel = container.querySelector('.tr-edge');
    expect(panel).not.toBeNull();
    // The always-present honesty line: what this relation is NOT.
    expect(panel!.textContent).toMatch(/Not represented as:/);
    // And the derived status, never a claim the model made about itself.
    expect(container.querySelector('[data-status]')).not.toBeNull();
  });
});
