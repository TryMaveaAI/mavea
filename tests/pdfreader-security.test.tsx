import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Pdfreader } from '../src/canvas/blocks/docs/Pdfreader';

afterEach(cleanup);

const base = { title: 'Document', pages: [] };

describe('Pdfreader URL boundary', () => {
  it.each([
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'file:///etc/passwd',
  ])('never frames or links an active URL: %s', (file) => {
    const { container } = render(<Pdfreader {...base} file={file} />);
    expect(container.querySelector('iframe')).toBeNull();
    expect(container.querySelector('a[href]')).toBeNull();
    expect(screen.getByText('This PDF link could not be verified.')).toBeInTheDocument();
  });

  it('frames a same-origin PDF with a relative URL', () => {
    const { container } = render(<Pdfreader {...base} file="/demo-assets/pdf/primer.pdf" />);
    const frame = container.querySelector('iframe');
    expect(frame).toHaveAttribute('src', '/demo-assets/pdf/primer.pdf');
    expect(frame).toHaveAttribute('referrerpolicy', 'no-referrer');
    expect(container.querySelector('a[href]')).toBeNull();
  });

  it('does NOT sandbox the frame — a sandboxed PDF renders as a browser error tile', () => {
    // This assertion is inverted on purpose, and it is the point of the whole boundary below.
    // Chrome's built-in viewer refuses to run inside a sandboxed frame: measured against the
    // shipped NASA memorandum, `sandbox=""`, `allow-scripts`, and `allow-scripts
    // allow-same-origin` all painted the broken-document placeholder, and only an unsandboxed
    // frame showed the pages. Re-adding the attribute buys no isolation — the URL gate exercised
    // in the neighbouring cases plus CSP frame-src 'self' are what contain this frame — and it
    // silently turns every embedded PDF in the product back into an error tile.
    const { container } = render(<Pdfreader {...base} file="/demo-assets/pdf/primer.pdf" />);
    expect(container.querySelector('iframe')).not.toHaveAttribute('sandbox');
  });

  it('does not become a general same-origin HTML iframe', () => {
    const { container } = render(<Pdfreader {...base} file="/settings?embedded=true" />);
    expect(container.querySelector('iframe')).toBeNull();
    expect(container.querySelector('a[href]')).toBeNull();
    expect(screen.getByText('This PDF link could not be verified.')).toBeInTheDocument();
  });

  it('renders an external http(s) document as an explicit safe link instead of a frame', () => {
    const { container } = render(<Pdfreader {...base} file="https://www.w3.org/TR/example.pdf" />);
    expect(container.querySelector('iframe')).toBeNull();
    const link = screen.getByRole('link', { name: /open the pdf/i });
    expect(link).toHaveAttribute('href', 'https://www.w3.org/TR/example.pdf');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('frames only a same-origin proxy URL even when the source file is external', () => {
    const { container } = render(
      <Pdfreader
        {...base}
        file="https://bitcoin.org/bitcoin.pdf"
        embedSrc="/pdf?url=https%3A%2F%2Fbitcoin.org%2Fbitcoin.pdf"
      />,
    );
    expect(container.querySelector('iframe')).toHaveAttribute(
      'src',
      '/pdf?url=https%3A%2F%2Fbitcoin.org%2Fbitcoin.pdf',
    );
  });
});
