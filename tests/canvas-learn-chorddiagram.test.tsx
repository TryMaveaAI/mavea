import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ChordDiagram } from '../src/canvas/blocks/learn/ChordDiagram';

// Regression coverage for a real bug: the note-name row lays each label out with an even
// `flex: 1` share and no wrap constraint, so it only ever worked for the 6-string demo fixture's
// single-character names ("G", "B", "D" …). A wider neck (up to the component's 12-string clamp)
// paired with longer spellings ("F♯m", "B♭") had no room to render without overflowing its own
// label box and bleeding into its neighbours — every rendered label must be able to wrap instead.

describe('ChordDiagram', () => {
  it('lets long note names wrap instead of overflowing or colliding, past the 6-string demo', () => {
    const stringCount = 9;
    const notes = Array.from({ length: stringCount }, (_, i) => (i % 2 === 0 ? 'F♯m' : 'B♭'));
    const frets = Array.from({ length: stringCount }, (_, i) => (i % 3) as number | 'x' | 'o');
    const { container } = render(
      <ChordDiagram title="Wide neck" chordName="F♯m" frets={frets} notes={notes} />,
    );

    const labels = Array.from(container.querySelectorAll<HTMLElement>('.cd-note-label'));
    expect(labels).toHaveLength(stringCount);
    for (const label of labels) {
      // Wrapping is what lets a label stay inside its own flex share instead of forcing
      // its text onto one un-broken line that spills past the box and over its neighbours.
      expect(label.style.overflowWrap).toBe('break-word');
      // A `flex: 1` item's default min-width is `auto`, which floors its shrink at its
      // content's natural (unwrapped) width — exactly what defeats overflow-wrap. Without an
      // explicit override the label can never actually shrink below its longest note name.
      expect(label.style.minWidth).toBe('0px');
    }

    // The full note name is preserved verbatim, not truncated — wrapping, not clipping.
    expect(labels[0].textContent).toBe('F♯m');
    expect(labels[1].textContent).toBe('B♭');
  });

  it('still renders the short single-character demo fixture unchanged', () => {
    const { container } = render(
      <ChordDiagram
        title="G Major chord"
        chordName="G"
        frets={[3, 2, 0, 0, 0, 3]}
        fingers={[2, 1, null, null, null, 3]}
        notes={['G', 'B', 'G', 'D', 'G', 'B']}
      />,
    );
    const labels = Array.from(container.querySelectorAll<HTMLElement>('.cd-note-label'));
    expect(labels.map((l) => l.textContent)).toEqual(['G', 'B', 'G', 'D', 'G', 'B']);
  });
});
