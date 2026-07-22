import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Codeblock } from '../src/canvas/blocks/display/Codeblock';

// Shiki is a bundled dependency now (no CDN), so the real highlighter runs here in jsdom — these
// lock genuine grammar-driven output, the verbatim copy path, the plain-text fallback when the
// highlighter chunk is unavailable, and the legacy pre-tokenized `lines` form.

describe('Codeblock', () => {
  beforeEach(() => {
    // Provide a clipboard stub so the copy affordance can be exercised deterministically.
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
  });

  it('highlights raw `code` with the bundled Shiki and copies the source verbatim', async () => {
    const { container } = render(
      <Codeblock title="Ethanol" lang="ts" code={'const a = 1;\nconst b = 2;'} />,
    );
    await waitFor(() => expect(container.querySelector('.cb-shiki')).toBeInTheDocument());
    // Real tokenization, not a passthrough: the keyword sits in its own themed span.
    const spans = [...container.querySelectorAll('.cb-shiki span')];
    expect(spans.some((s) => s.textContent === 'const')).toBe(true);
    expect(container.querySelector('.cb-shiki')!.textContent).toContain('const a = 1;');

    fireEvent.click(screen.getByRole('button', { name: /copy/i }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('const a = 1;\nconst b = 2;');
  });

  it('preserves real angle brackets in the source (no tag-neutralization at the renderer)', async () => {
    const { container } = render(
      <Codeblock title="Generics" lang="ts" code={'type Box<T> = { v: T };'} />,
    );
    await waitFor(() => expect(container.querySelector('.cb-shiki')).toBeInTheDocument());
    // The `<T>` must read as literal angle brackets, not guillemets — and not spawn an element.
    expect(container.querySelector('.cb-shiki')!.textContent).toContain('type Box<T> = { v: T };');
    expect(container.querySelector('.cb-shiki T')).toBeNull();
  });

  it('falls back to plain readable text when the highlighter chunk fails to load', async () => {
    vi.doMock('../src/canvas/blocks/display/shikiHighlight', () => ({
      highlightCode: vi.fn().mockRejectedValue(new Error('chunk failed')),
    }));
    // Re-import so the component under test resolves the mocked highlighter module.
    const { Codeblock: MockedCodeblock } = await import('../src/canvas/blocks/display/Codeblock');
    render(<MockedCodeblock title="Offline" lang="ts" code={'const a = 1;'} />);
    await waitFor(() => expect(document.querySelector('.cb-plain')).toBeInTheDocument());
    expect(screen.getByText(/const a = 1;/)).toBeInTheDocument();
    vi.doUnmock('../src/canvas/blocks/display/shikiHighlight');
  });

  it('still renders the legacy pre-tokenized `lines` form when no `code` is given', () => {
    const { container } = render(
      <Codeblock
        title="Legacy"
        lang="ts"
        lines={[
          [
            { text: 'const ', kind: 'kw' },
            { text: 'x', kind: 'var' },
          ],
        ]}
      />,
    );
    expect(container.querySelectorAll('.tok')).toHaveLength(2);
    expect(container.querySelector('.cb-plain')).not.toBeInTheDocument();
  });

  it('sanitizes a hostile footer at the render boundary', () => {
    const { container } = render(
      <Codeblock
        title="Hostile"
        lang="ts"
        code={'const a = 1;'}
        footer={'fine <b>bold</b> <img src=x onerror=alert(1)> <script>alert(2)</script>'}
      />,
    );
    const footer = container.querySelector('.insight-summary')!;
    expect(footer.querySelector('img, script')).toBeNull();
    expect(footer.querySelector('b')).not.toBeNull();
    expect(footer.textContent).toContain('fine bold');
  });
});
