import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { render } from '@testing-library/react';
import { Carousel } from '../src/canvas/blocks/media/Carousel';
import type { CarouselSlide } from '../src/canvas/blocks/media/types';

// Regression coverage for a real bug: .me-car-img is a fixed aspect-ratio (16/9) plate with
// overflow: hidden, and .me-car-label had no line-clamp — a label longer than the demo fixture's
// short titles was simply cut off mid-glyph by the box's overflow, instead of wrapping onto a
// second line with an ellipsis. Same bug class already fixed on TamSam/Treemap/EtymTree/Lightbox.
//
// jsdom doesn't apply external stylesheets (vitest.config.ts sets css: false), so the clamp can't
// be measured via layout here. This guards both ends: a source-level check that the clamp rule is
// actually declared on .me-car-label, and a render-level check that the long label text is still
// preserved verbatim in the DOM (i.e. nothing is silently truncated by JS — the fix must be pure
// CSS clamping, not lossy truncation of the underlying content).

const css = readFileSync(join(__dirname, '../src/canvas/blocks/media/styles.css'), 'utf8');

function rule(className: string): string {
  const escaped = className.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = css.match(new RegExp(`\\.${escaped}\\s*\\{([^}]*)\\}`));
  expect(m, `expected a .${className} rule in media/styles.css`).toBeTruthy();
  return m![1];
}

function slides(n: number): CarouselSlide[] {
  const longLabel =
    'A very long slide headline that keeps going well past what any short demo fixture would use for a caption';
  return Array.from({ length: n }, (_, i) => ({
    label: i === 0 ? longLabel : `Slide ${i + 1}`,
    from: 'var(--presence)',
    to: 'var(--insight)',
  }));
}

describe('Carousel label overflow', () => {
  it('.me-car-label clamps to 2 lines instead of being clipped by the fixed-aspect plate', () => {
    const body = rule('me-car-label');
    expect(body).toMatch(/-webkit-line-clamp:\s*2/);
    expect(body).toMatch(/overflow:\s*hidden/);
  });

  it('renders a long label verbatim (clamped by CSS, not truncated by JS)', () => {
    const list = slides(4);
    const { container } = render(<Carousel title="Gallery" slides={list} />);
    const labels = container.querySelectorAll('.me-car-label');
    expect(labels).toHaveLength(4);
    expect(labels[0].textContent).toBe(list[0].label);
  });

  it('does not overflow past the fixed aspect-ratio plate that clips it', () => {
    // .me-car-img is the fixed 16/9 plate with overflow: hidden — the label sits inside it.
    // Assert the DOM nesting still routes the label through that clipping ancestor (i.e. no one
    // hoisted the label out of the plate while "fixing" the overflow).
    const list = slides(1);
    const { container } = render(<Carousel title="Gallery" slides={list} />);
    const plate = container.querySelector('.me-car-img');
    const label = container.querySelector('.me-car-label');
    expect(plate).toBeTruthy();
    expect(plate!.contains(label)).toBe(true);
  });
});
