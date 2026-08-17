// live-prove-it.test.tsx — the "Prove it" affordance, end to end.
//
// It is the one control on an answer that makes a promise about EVIDENCE, so the gate matters as much
// as the panel: the button exists only where the turn was actually grounded in real sources
// (generateLive marks the lead insight `prove` only when `sources.length`), and it opens a drawer that
// shows those sources, the figures the answer printed, and what backs each one.
//
// Pinned here: the button appears only when a host wires it, it is a real labelled button, pressing it
// opens the drawer, the drawer is inert and hidden while closed (so a source link inside it can never
// be tabbed to or drag the app shell sideways), and it closes by the X, by the scrim, and by Escape.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import type { Block, WebSource } from '../src/data/conversation';
import { InsightCard } from '../src/canvas/InsightCard';
import { LiveEvidence } from '../src/live/LiveEvidence';

afterEach(cleanup);

const SOURCES: WebSource[] = [
  {
    title: 'Great Salt Lake levels',
    url: 'https://example.test/gsl',
    snippet: 'The lake fell to 4,188 feet above sea level in 2022.',
  },
];

const CHART: Block = {
  id: 'b0',
  type: 'chart',
  props: {
    title: 'Lake level',
    unit: 'ft',
    labels: ['2020', '2022'],
    series: [{ name: 'Level', color: 'var(--insight)', data: [4193, 4188] }],
  },
} as unknown as Block;

/** The affordance and the panel wired together the way LiveApp wires them. */
function Answer({ prove = true }: { prove?: boolean }): React.ReactElement {
  const [open, setOpen] = useState(false);
  return (
    <>
      <InsightCard
        num="1"
        title="Why the lake is shrinking"
        summary="Upstream diversion outpaced inflow."
        conf="strong"
        {...(prove ? { onProve: () => setOpen(true) } : {})}
      />
      <LiveEvidence
        open={open}
        onClose={() => setOpen(false)}
        claim="Why the lake is shrinking"
        conf="strong"
        sources={SOURCES}
        blocks={[CHART]}
      />
    </>
  );
}

const proveButton = () => screen.getByRole('button', { name: /prove it/i });

describe('the Prove it button', () => {
  it('is offered only where a host wired it — never as a dead promise of evidence', () => {
    const { unmount } = render(<Answer prove={false} />);
    expect(screen.queryByRole('button', { name: /prove it/i })).toBeNull();
    unmount();
    render(<Answer />);
    expect(proveButton()).toBeTruthy();
  });

  it('is a real button carrying its own words, not an icon alone', () => {
    render(<Answer />);
    const button = proveButton();
    expect(button.tagName).toBe('BUTTON');
    expect(button.textContent).toContain('Prove it');
  });

  it('opens the drawer, and the drawer is inert until it does', () => {
    const { container } = render(<Answer />);
    const drawer = container.querySelector('.drawer')!;
    // Closed: hidden from the tree AND inert, so a source link inside cannot be focused — focusing
    // one used to scroll the overflow-hidden app shell and drag the panel over the topbar.
    expect(drawer.getAttribute('aria-hidden')).toBe('true');
    expect(drawer.hasAttribute('inert')).toBe(true);
    expect(drawer.className).not.toContain('show');

    fireEvent.click(proveButton());

    expect(drawer.className).toContain('show');
    expect(drawer.getAttribute('aria-hidden')).toBe('false');
    expect(drawer.hasAttribute('inert')).toBe(false);
  });

  it('shows the actual sources, each a real link the reader can open', () => {
    const { container } = render(<Answer />);
    fireEvent.click(proveButton());
    const link = container.querySelector<HTMLAnchorElement>('.evidence-src')!;
    expect(link.href).toBe('https://example.test/gsl');
    expect(link.rel).toContain('noopener');
    expect(link.target).toBe('_blank');
    expect(link.textContent).toContain('Great Salt Lake levels');
    expect(container.textContent).toContain('grounded in 1 live source');
  });

  it('shows the figures the answer printed, and what backs each', () => {
    const { container } = render(<Answer />);
    fireEvent.click(proveButton());
    expect(screen.getByText('The figures in this answer')).toBeTruthy();
    const rows = [...container.querySelectorAll('.evidence-figure')];
    expect(rows).toHaveLength(2);
    // 4188 is stated by the source sentence; 4193 is not.
    const grounded = rows.filter((r) => r.textContent?.includes('GROUNDED'));
    expect(grounded).toHaveLength(1);
    expect(grounded[0].querySelector('.evidence-quote')?.textContent).toContain('4,188 feet');
    expect(rows.filter((r) => r.textContent?.includes('ILLUSTRATIVE'))).toHaveLength(1);
  });

  it('closes on the X', () => {
    const { container } = render(<Answer />);
    fireEvent.click(proveButton());
    fireEvent.click(screen.getByRole('button', { name: /close evidence/i }));
    expect(container.querySelector('.drawer')!.className).not.toContain('show');
  });

  it('closes on the scrim, which is only clickable while open', () => {
    const { container } = render(<Answer />);
    const scrim = container.querySelector<HTMLElement>('.scrim')!;
    expect(scrim.style.pointerEvents).toBe('none');
    fireEvent.click(proveButton());
    expect(scrim.style.pointerEvents).toBe('auto');
    fireEvent.click(scrim);
    expect(container.querySelector('.drawer')!.className).not.toContain('show');
  });

  it('closes on Escape, the way every other overlay here does', () => {
    // A panel a reader cannot dismiss from the keyboard is a trap for anyone not using a mouse. Bound
    // only while open, so it never swallows an Escape meant for the walkthrough or a spotlight.
    const { container } = render(<Answer />);
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.click(proveButton());
    expect(container.querySelector('.drawer')!.className).toContain('show');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(container.querySelector('.drawer')!.className).not.toContain('show');
  });

  it('states the answer’s own confidence rather than inventing one', () => {
    render(<Answer />);
    fireEvent.click(proveButton());
    // The badge is the turn's conf, and with sources present it is titled against those sources.
    const badge = screen.getByTitle('How sure Mavéa is, based on these sources');
    expect(badge).toBeTruthy();
  });

  it('never claims live sources it does not have', () => {
    const onClose = vi.fn();
    const { container } = render(
      <LiveEvidence open onClose={onClose} claim="Anything" sources={[]} blocks={[CHART]} />,
    );
    expect(container.textContent).toContain("from the model's own knowledge");
    expect(container.querySelector('.evidence-src')).toBeNull();
    // And the figures section says the same thing in its own terms.
    expect(container.querySelector('.evidence-note')?.textContent).toContain(
      'None of these is stated by a source',
    );
  });
});
