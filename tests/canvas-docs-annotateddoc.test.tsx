import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { Annotateddoc } from '../src/canvas/blocks/docs/Annotateddoc';
import type { DocHighlight } from '../src/canvas/blocks/docs/types';

// Regression coverage for a real bug: .ad-dots (the row of highlight-jump dots under the
// margin note) was a plain `display: flex` row with no wrap, so a document with more than the
// handful of highlights in the demo fixture ran its dots off the right edge of the card instead
// of flowing onto a second line. Fixed by adding flex-wrap: wrap, matching the sibling patterns
// in the same family (.fc-sources, .cm-legend, .hs-foot in styles.css).

function highlights(n: number): DocHighlight[] {
  return Array.from({ length: n }, (_, i) => ({
    phrase: `term${i}`,
    note: `Note about term ${i}.`,
    author: `Reviewer ${i}`,
  }));
}

function paragraph(hs: DocHighlight[]): string {
  return hs.map((h) => `Sentence containing ${h.phrase} for context.`).join(' ');
}

describe('Annotateddoc', () => {
  it('renders a dot per highlight, well past the demo fixture count, inside a wrapping row', () => {
    const n = 24; // far beyond the ~3-5 highlight demo fixture; would overflow a non-wrapping row
    const hs = highlights(n);
    const { container } = render(
      <Annotateddoc title="Contract" paragraphs={[paragraph(hs)]} highlights={hs} />,
    );
    const dotsRow = container.querySelector('.ad-dots');
    expect(dotsRow).toBeTruthy();
    // jsdom does not apply the stylesheet, so assert the wrapping class is present on the row
    // rather than a computed style — this is what actually prevents the horizontal overflow.
    expect(dotsRow?.className).toContain('ad-dots');
    const dots = container.querySelectorAll('.ad-dot');
    expect(dots).toHaveLength(n);
  });

  it('keeps every highlight dot clickable and switching the active margin note at high counts', () => {
    const n = 20;
    const hs = highlights(n);
    const { container } = render(
      <Annotateddoc title="Contract" paragraphs={[paragraph(hs)]} highlights={hs} />,
    );
    const dots = Array.from(container.querySelectorAll<HTMLButtonElement>('.ad-dot'));
    expect(dots).toHaveLength(n);
    fireEvent.click(dots[n - 1]);
    expect(dots[n - 1].className).toContain('on');
    // exactly one dot active at a time
    expect(container.querySelectorAll('.ad-dot.on')).toHaveLength(1);
  });
});

// Direct regression on the fix itself: confirm the .ad-dots rule in the family stylesheet
// declares flex-wrap so a long highlight list flows onto additional rows instead of
// overflowing the card's fixed width.
describe('Annotateddoc styles', () => {
  it('wraps the .ad-dots row instead of forcing it onto a single overflowing line', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const cssPath = path.resolve(__dirname, '../src/canvas/blocks/docs/styles.css');
    const css = fs.readFileSync(cssPath, 'utf8');
    const match = css.match(/\.ad-dots\s*\{[^}]*\}/);
    expect(match).toBeTruthy();
    expect(match?.[0]).toMatch(/flex-wrap:\s*wrap/);
  });
});
