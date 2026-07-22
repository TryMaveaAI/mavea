import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { SequenceDiagram } from '../src/canvas/blocks/diagrams/SequenceDiagram';

// Regression coverage: actor name boxes and message labels are plain SVG text with no wrap
// or clip, so a name/label longer than the demo fixture bled past its box or collided with
// the neighbouring lane. Both must now truncate to fit, with the full text as a <title>.

describe('SequenceDiagram', () => {
  it('truncates a long actor name instead of overflowing its box', () => {
    const { container } = render(
      <SequenceDiagram
        title="Flow"
        actors={[
          { id: 'a', label: 'Database Administrator' },
          { id: 'b', label: 'API' },
        ]}
        messages={[{ from: 'a', to: 'b', label: 'Request' }]}
      />,
    );
    const actorNodes = Array.from(container.querySelectorAll('text.dg-seq-actor'));
    expect(actorNodes).toHaveLength(2);
    const long = actorNodes.find((n) => n.textContent?.includes('…'));
    expect(long).toBeTruthy();
    expect(long!.querySelector('title')?.textContent).toBe('Database Administrator');
  });

  it('truncates a message label to fit the gap between adjacent lanes', () => {
    const { container } = render(
      <SequenceDiagram
        title="Flow"
        actors={[
          { id: 'a', label: 'A' },
          { id: 'b', label: 'B' },
        ]}
        messages={[
          {
            from: 'a',
            to: 'b',
            label: 'Acknowledge receipt and signature verification response',
          },
        ]}
      />,
    );
    const lbl = container.querySelector('text.dg-seq-lbl');
    expect(lbl).toBeTruthy();
    expect(lbl!.querySelector('title')?.textContent).toBe(
      'Acknowledge receipt and signature verification response',
    );
    // The visible text (excluding the tooltip's text node) must be short enough to fit
    // between two adjacent lanes, not the full 57-character sentence.
    const visible = Array.from(lbl!.childNodes)
      .filter((n) => n.nodeType === Node.TEXT_NODE)
      .map((n) => n.textContent)
      .join('');
    expect(visible.length).toBeLessThan(20);
  });

  it('leaves short labels untouched', () => {
    const { container } = render(
      <SequenceDiagram
        title="Flow"
        actors={[
          { id: 'a', label: 'A' },
          { id: 'b', label: 'B' },
        ]}
        messages={[{ from: 'a', to: 'b', label: 'ping' }]}
      />,
    );
    expect(container.querySelector('title')).toBeNull();
    expect(container.querySelector('text.dg-seq-lbl')?.textContent).toBe('ping');
  });
});
