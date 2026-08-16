// An arrow is the easiest thing on a canvas to over-read, so the edge panel's job is as much what
// it refuses to claim as what it shows. These lock the status badges, the counter-evidence a
// contested link must surface, and the one line that can never go missing — what the relation is
// NOT represented as, for every relation in the palette.
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EDGE_RELATIONS, NOT_REPRESENTED_AS } from '../src/live/trust';
import { EdgeEvidencePanel } from '../src/live/trust/EdgeEvidencePanel';
import type { Receipt } from '../src/live/ground/types';

const SUPPORT: Receipt = {
  quote: 'Support tickets fell 18% after the onboarding fix',
  url: 'https://www.example.com/q2-report',
  host: 'example.com',
};

const COUNTER: Receipt = {
  quote: 'Ticket volume was flat once seasonality is removed',
  url: 'https://www.example.org/seasonality',
  host: 'example.org',
};

describe('EdgeEvidencePanel', () => {
  it('badges each status', () => {
    const supported = render(
      <EdgeEvidencePanel relation="causes" sign={1} status="supported" receipts={[SUPPORT]} />,
    );
    expect(supported.container.querySelector('.tr-edge-badge')?.textContent).toContain('SUPPORTED');
    supported.unmount();

    const contested = render(
      <EdgeEvidencePanel
        relation="causes"
        sign={1}
        status="contested"
        receipts={[SUPPORT]}
        counter={COUNTER}
      />,
    );
    expect(contested.container.querySelector('.tr-edge-badge')?.textContent).toContain('CONTESTED');
    contested.unmount();

    const provisional = render(
      <EdgeEvidencePanel
        relation="correlates"
        sign={-1}
        status="provisional"
        receipts={[]}
        provisional
      />,
    );
    expect(provisional.container.querySelector('.tr-edge-badge')?.textContent).toContain(
      'PROVISIONAL',
    );
    expect(provisional.container.querySelector('.tr-edge')?.getAttribute('data-provisional')).toBe(
      '1',
    );
    // An unreceipted link says so in words, not just in a dashed border.
    expect(provisional.container.querySelector('.tr-unverified')?.textContent).toBe(
      "Mavéa's reading — no source, unverified.",
    );
  });

  it('states what every relation is NOT represented as', () => {
    for (const relation of EDGE_RELATIONS) {
      const { container, unmount } = render(
        <EdgeEvidencePanel relation={relation} sign={1} status="supported" receipts={[SUPPORT]} />,
      );
      expect(container.querySelector('.tr-not-as')?.textContent).toBe(
        `Not represented as: ${NOT_REPRESENTED_AS[relation]}.`,
      );
      unmount();
    }
  });

  it('shows the counter-evidence beside the support when contested', () => {
    const { container } = render(
      <EdgeEvidencePanel
        relation="dampens"
        sign={-1}
        status="contested"
        receipts={[SUPPORT]}
        counter={COUNTER}
      />,
    );
    const counter = container.querySelector('.tr-counter');
    expect(counter?.querySelector('.tr-sec-title')?.textContent).toBe('But:');
    expect(counter?.querySelector('.tr-quote')?.textContent).toContain(
      'Ticket volume was flat once seasonality is removed',
    );
    expect(screen.getByRole('link', { name: 'example.org' }).getAttribute('href')).toBe(
      'https://www.example.org/seasonality',
    );
  });

  it('never activates a non-http source', () => {
    const { container } = render(
      <EdgeEvidencePanel
        relation="enables"
        sign={1}
        status="supported"
        receipts={[{ quote: 'looks legitimate', url: 'javascript:alert(1)', host: 'evil.example' }]}
      />,
    );
    expect(container.querySelector('a')).toBeNull();
    expect(container.querySelector('.tr-host')?.textContent).toBe('evil.example');
  });
});
