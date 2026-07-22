import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { LiveEvidence } from '../src/live/LiveEvidence';
import type { WebSource } from '../src/data/conversation';

afterEach(cleanup);

const sources: WebSource[] = [
  { title: 'NASA — Mars', url: 'https://nasa.gov/mars' },
  { title: 'Wikipedia — Mars', url: 'https://en.wikipedia.org/wiki/Mars' },
];

describe('LiveEvidence — honest receipts for a grounded answer', () => {
  it('shows the claim, the source count, and every source as a real link', () => {
    render(
      <LiveEvidence open onClose={() => {}} claim="Mars facts" conf="inferred" sources={sources} />,
    );
    expect(screen.getByText('Mars facts')).toBeInTheDocument();
    expect(screen.getByText(/2 live sources/i)).toBeInTheDocument();
    const a = screen.getByText('NASA — Mars').closest('a');
    expect(a).toHaveAttribute('href', 'https://nasa.gov/mars');
    expect(a).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });

  it('uses the singular for one source', () => {
    render(<LiveEvidence open onClose={() => {}} claim="One" sources={[sources[0]]} />);
    expect(screen.getByText(/1 live source\b/i)).toBeInTheDocument();
  });

  it('shows the real excerpt as a quoted receipt when a source carries one', () => {
    render(
      <LiveEvidence
        open
        onClose={() => {}}
        claim="Mars facts"
        sources={[
          {
            title: 'NASA — Mars',
            url: 'https://nasa.gov/mars',
            snippet: 'Mars has two small moons.',
          },
        ]}
      />,
    );
    // The passage the answer leaned on is shown — proof, not just a link.
    expect(screen.getByText('Mars has two small moons.')).toBeInTheDocument();
  });

  it('renders a source with no excerpt as a link only — never invents a quote', () => {
    render(<LiveEvidence open onClose={() => {}} claim="C" sources={[sources[0]]} />);
    expect(document.querySelector('.evidence-quote')).toBeNull();
    expect(screen.getByText('NASA — Mars').closest('a')).toHaveAttribute(
      'href',
      'https://nasa.gov/mars',
    );
  });

  it('shows the bare host, not the full URL, in the source row', () => {
    render(<LiveEvidence open onClose={() => {}} claim="C" sources={[sources[1]]} />);
    expect(screen.getByText('en.wikipedia.org')).toBeInTheDocument();
  });

  it('closes via the scrim and the X', () => {
    const onClose = vi.fn();
    render(<LiveEvidence open onClose={onClose} claim="C" sources={sources} />);
    fireEvent.click(screen.getByLabelText(/close evidence/i));
    expect(onClose).toHaveBeenCalled();
  });

  it('is truly inert when closed — hidden from a11y AND unfocusable/unclickable', () => {
    // The closed drawer is only translated offscreen by CSS; without `inert`, its source
    // links stay focusable, and focusing one horizontally scrolls the overflow-hidden app
    // shell, dragging the "closed" panel over the topbar where it eats clicks.
    render(<LiveEvidence open={false} onClose={() => {}} claim="C" sources={sources} />);
    const drawer = document.querySelector('aside.drawer')!;
    expect(drawer.getAttribute('aria-hidden')).toBe('true');
    expect(drawer.hasAttribute('inert')).toBe(true);
    expect(drawer.classList.contains('show')).toBe(false);
  });

  it('drops inert and aria-hidden when open', () => {
    render(<LiveEvidence open onClose={() => {}} claim="C" sources={sources} />);
    const drawer = document.querySelector('aside.drawer')!;
    expect(drawer.getAttribute('aria-hidden')).toBe('false');
    expect(drawer.hasAttribute('inert')).toBe(false);
    expect(drawer.classList.contains('show')).toBe(true);
  });
});

describe('LiveEvidence — honest copy when nothing backs the answer', () => {
  it('says plainly the answer is model knowledge when there are no sources and no files', () => {
    render(<LiveEvidence open onClose={() => {}} claim="C" conf="inferred" sources={[]} />);
    // No fake rigor: never "grounded in 0 live sources", never "summarized these sources".
    expect(screen.queryByText(/grounded in/i)).toBeNull();
    expect(screen.queryByText(/summarized these sources/i)).toBeNull();
    expect(screen.getByText("· from the model's own knowledge")).toBeInTheDocument();
    expect(
      screen.getByText(/nothing here was checked against live sources or your files/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/starting point, not verified fact/i)).toBeInTheDocument();
    // No empty "Sources" list pretending there's something to open.
    expect(screen.queryByRole('list', { name: /sources/i })).toBeNull();
  });

  it('gives the badge an honest tooltip when nothing backs the answer', () => {
    render(<LiveEvidence open onClose={() => {}} claim="C" conf="inferred" sources={[]} />);
    expect(
      screen.getByTitle(/best estimate from the model's knowledge — not verified/i),
    ).toBeInTheDocument();
    expect(screen.queryByTitle(/based on your files/i)).toBeNull();
  });

  it('mentions files only when files were actually attached', () => {
    render(
      <LiveEvidence open onClose={() => {}} claim="C" conf="inferred" sources={[]} hadFiles />,
    );
    expect(screen.getByText(/based on your attached files/i)).toBeInTheDocument();
    expect(screen.getByTitle(/based on your files/i)).toBeInTheDocument();
    expect(screen.queryByText(/grounded in/i)).toBeNull();
  });

  it('keeps the grounded copy when real sources exist', () => {
    render(<LiveEvidence open onClose={() => {}} claim="C" conf="inferred" sources={sources} />);
    expect(screen.getByText(/grounded in 2 live sources/i)).toBeInTheDocument();
    expect(screen.getByText(/summarized these sources/i, { exact: false })).toBeInTheDocument();
  });
});
