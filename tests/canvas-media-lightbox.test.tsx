import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { render, fireEvent } from '@testing-library/react';
import { Lightbox } from '../src/canvas/blocks/media/Lightbox';
import type { LightboxItem } from '../src/canvas/blocks/media/types';

// Regression coverage for a real bug: the thumbnail label (.me-lb-thumblabel) and the open-modal
// hero label (.me-lb-herolabel) had no max-width/overflow-wrap, so a label longer than the demo
// fixture's short titles (~50-60+ chars) overflowed straight past the thumbnail tile / hero plate
// instead of wrapping inside it — the same bug class already fixed on TamSam/Treemap/EtymTree.
//
// jsdom doesn't apply external stylesheets (vitest.config.ts sets css: false), so layout overflow
// can't be measured directly here. This guards both ends: a source-level check that the wrapping
// rules are actually declared for both selectors, and a render-level check that the long label
// text is preserved verbatim in the DOM (i.e. nothing is being silently clipped/truncated by JS —
// the fix must be pure CSS wrapping, not lossy truncation).

const css = readFileSync(join(__dirname, '../src/canvas/blocks/media/styles.css'), 'utf8');

function rule(className: string): string {
  const escaped = className.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = css.match(new RegExp(`\\.${escaped}\\s*\\{([^}]*)\\}`));
  expect(m, `expected a .${className} rule in media/styles.css`).toBeTruthy();
  return m![1];
}

function items(n: number): LightboxItem[] {
  const longLabel =
    'A very long exhibit title that keeps going well past what any short demo fixture would use for a caption';
  return Array.from({ length: n }, (_, i) => ({
    label: i === 0 ? longLabel : `Item ${i + 1}`,
    from: 'var(--presence)',
    to: 'var(--insight)',
  }));
}

describe('Lightbox label overflow', () => {
  it('.me-lb-thumblabel constrains width and wraps instead of overflowing the tile', () => {
    const body = rule('me-lb-thumblabel');
    expect(body).toMatch(/max-width:\s*calc\(100% - 16px\)/);
    expect(body).toMatch(/overflow-wrap:\s*anywhere/);
  });

  it('.me-lb-herolabel constrains width and wraps instead of overflowing the hero plate', () => {
    const body = rule('me-lb-herolabel');
    expect(body).toMatch(/max-width:\s*calc\(100% - 32px\)/);
    expect(body).toMatch(/overflow-wrap:\s*anywhere/);
  });

  it('renders a long thumbnail label verbatim (wrapped by CSS, not truncated by JS)', () => {
    const list = items(6);
    const { container, getAllByLabelText } = render(<Lightbox title="Gallery" items={list} />);
    const thumbLabels = container.querySelectorAll('.me-lb-thumblabel');
    expect(thumbLabels).toHaveLength(6);
    expect(thumbLabels[0].textContent).toBe(list[0].label);
    // aria-label on the thumbnail button also carries the full text for a11y.
    expect(getAllByLabelText(list[0].label).length).toBeGreaterThan(0);
  });

  it('renders a long hero label verbatim when the lightbox is opened', () => {
    const list = items(3);
    const { container, getByLabelText } = render(<Lightbox title="Gallery" items={list} />);
    fireEvent.click(getByLabelText(list[0].label));
    const hero = container.querySelector('.me-lb-herolabel');
    expect(hero).toBeTruthy();
    expect(hero!.textContent).toBe(list[0].label);
  });

  it('does not overflow past the fixed-width lightbox stage container', () => {
    // .me-lb-stage caps at max-width: 460px — the hero label sits inside it. Assert the DOM
    // nesting still routes the label through that fixed-width ancestor (i.e. no one hoisted the
    // label out of the constrained container while "fixing" the overflow).
    const list = items(2);
    const { container, getByLabelText } = render(<Lightbox title="Gallery" items={list} />);
    fireEvent.click(getByLabelText(list[0].label));
    const stage = container.querySelector('.me-lb-stage');
    const hero = container.querySelector('.me-lb-herolabel');
    expect(stage).toBeTruthy();
    expect(stage!.contains(hero)).toBe(true);
  });
});
