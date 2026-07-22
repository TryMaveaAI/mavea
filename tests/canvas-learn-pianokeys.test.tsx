import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { PianoKeys } from '../src/canvas/blocks/learn/PianoKeys';
import type { PianoHighlight } from '../src/canvas/blocks/learn/types';

// A <title> tooltip nested inside a <text> node is part of its DOM textContent too, so reading
// the actually-rendered glyphs means the node's own direct text children, not the <title>'s.
function visibleText(node: Element): string {
  return Array.from(node.childNodes)
    .filter((n) => n.nodeType === Node.TEXT_NODE)
    .map((n) => n.textContent)
    .join('');
}

// Regression coverage for a real bug: key labels are plain SVG text painted at a fixed 6px
// font-size, centred on a fixed-width key rect (16 SVG units for a white key, 10 for a black
// one) with no wrap or clip. A model-authored role string longer than the short "root"/"5th"
// demo fixture — or several adjacent highlighted keys each carrying one — rendered wider than
// its key and bled into its neighbours. Every rendered label must be capped to fit.

describe('PianoKeys', () => {
  it('truncates a long role string instead of letting it overflow the key', () => {
    const highlight: PianoHighlight[] = [
      { note: 'C4', role: 'suspended fourth' },
      { note: 'E4', role: '3rd' },
    ];
    const { container } = render(
      <PianoKeys highlight={highlight} chordName="Csus4" startNote="C3" octaves={2} />,
    );
    const labels = Array.from(container.querySelectorAll('text.pk-key-lbl'));
    expect(labels.length).toBeGreaterThan(0);
    for (const node of labels) {
      // Matches the fix's KEY_LABEL_MAX_CHARS budget: never paint more than 6 visible glyphs.
      expect(visibleText(node).length).toBeLessThanOrEqual(6);
    }
    const longLabel = labels.find((n) => visibleText(n).endsWith('…'));
    expect(longLabel).toBeTruthy();
    // The untruncated string is still present, via a native <title> tooltip — nothing lost.
    const titles = Array.from(container.querySelectorAll('title')).map((t) => t.textContent);
    expect(titles).toContain('suspended fourth');
  });

  it('leaves a short role/label untouched', () => {
    const highlight: PianoHighlight[] = [
      { note: 'C4', role: 'root' },
      { note: 'E4', role: '3rd' },
      { note: 'G4', role: '5th' },
    ];
    const { container } = render(
      <PianoKeys highlight={highlight} chordName="C major" startNote="C3" octaves={2} />,
    );
    const labels = Array.from(container.querySelectorAll('text.pk-key-lbl'));
    expect(labels.map((n) => visibleText(n)).sort()).toEqual(['3rd', '5th', 'root'].sort());
    expect(container.querySelector('title')).toBeNull();
  });

  it('keeps every highlighted key label within its own key width when many adjacent keys are lit', () => {
    // Four full octaves, every semitone highlighted with a role long enough to have overflowed
    // pre-fix — the dense, adjacent-highlight case the 2-note demo fixture never exercised.
    const highlight: PianoHighlight[] = [];
    const roles = ['root', 'flat second', 'second', 'flat third', 'third', 'fourth'];
    for (let octave = 3; octave <= 6; octave++) {
      for (let i = 0; i < roles.length; i++) {
        const letters = ['C', 'C#', 'D', 'D#', 'E', 'F'];
        highlight.push({ note: `${letters[i]}${octave}`, role: roles[i] });
      }
    }
    const { container } = render(<PianoKeys highlight={highlight} startNote="C3" octaves={4} />);
    const labels = Array.from(container.querySelectorAll('text.pk-key-lbl'));
    expect(labels.length).toBeGreaterThan(10);
    for (const node of labels) {
      expect(visibleText(node).length).toBeLessThanOrEqual(6);
    }
    // The board's own viewBox is the fixed container this component guarantees content stays
    // inside — confirm it never grew unbounded picking up the dense highlight set.
    const svg = container.querySelector('svg.pk-svg');
    expect(svg).toBeTruthy();
    const viewBox = svg!.getAttribute('viewBox');
    expect(viewBox).toBe('0 0 456 86');
  });
});
