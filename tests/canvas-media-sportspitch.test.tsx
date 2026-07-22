import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { SportsPitch } from '../src/canvas/blocks/media/SportsPitch';
import type { PitchPosition } from '../src/canvas/blocks/media/types';

// Regression coverage for two real bugs: (1) a position code longer than the "GK"/"PG"-length
// demo fixture (e.g. "CDM") rendered at the same fixed font-size as a 2-char code and overran the
// r=3.5 marker disc; (2) a realistic player name rendered as plain, unclipped SVG text with no
// width bound and bled past the marker into neighboring players. A <title> tooltip nested inside
// a <text> node is part of its DOM textContent too, so reading the actually-rendered glyphs means
// the node's own direct text children, not the <title>'s (mirrors EtymTree's helper).
function visibleText(node: Element): string {
  return Array.from(node.childNodes)
    .filter((n) => n.nodeType === Node.TEXT_NODE)
    .map((n) => n.textContent)
    .join('');
}

const LONG_NAME_POSITIONS: PitchPosition[] = [
  { label: 'CDM', x: 50, y: 32, name: 'Konstantinos Papadopoulos-Michailidis' },
  { label: 'GK', x: 10, y: 32, name: 'Al' },
];

describe('SportsPitch', () => {
  it('shrinks a 3+ character position code so it still fits the marker disc', () => {
    const { container } = render(
      <SportsPitch title="Formation" sport="soccer" positions={LONG_NAME_POSITIONS} />,
    );
    const labelNodes = Array.from(container.querySelectorAll('svg text')).filter((n) =>
      ['CDM', 'GK'].includes(visibleText(n)),
    );
    const cdm = labelNodes.find((n) => visibleText(n) === 'CDM');
    const gk = labelNodes.find((n) => visibleText(n) === 'GK');
    expect(cdm).toBeTruthy();
    expect(gk).toBeTruthy();
    const cdmSize = Number(cdm!.getAttribute('font-size'));
    const gkSize = Number(gk!.getAttribute('font-size'));
    // The 3-char code must render smaller than the 2-char code, and small enough to plausibly
    // fit inside the r=3.5 (7-wide) disc — the old fixed 2.8 size did neither.
    expect(cdmSize).toBeLessThan(gkSize);
    expect(cdmSize * 3).toBeLessThan(7);
  });

  it('truncates a long player name instead of letting it overflow past the marker', () => {
    const { container } = render(
      <SportsPitch title="Formation" sport="soccer" positions={LONG_NAME_POSITIONS} />,
    );
    const nameNodes = Array.from(container.querySelectorAll('svg text')).filter((n) =>
      visibleText(n).includes('Konstantinos'),
    );
    expect(nameNodes).toHaveLength(1);
    const rendered = visibleText(nameNodes[0]);
    // Visible glyphs must be far shorter than the full name and end in an ellipsis.
    expect(rendered.length).toBeLessThan('Konstantinos Papadopoulos-Michailidis'.length);
    expect(rendered.endsWith('…')).toBe(true);
    // The untruncated string is still present, via a native <title> tooltip — never silently lost.
    const titles = Array.from(container.querySelectorAll('title')).map((t) => t.textContent);
    expect(titles).toContain('Konstantinos Papadopoulos-Michailidis');
  });

  it('leaves a short code and name untouched', () => {
    const { container } = render(
      <SportsPitch
        title="Formation"
        sport="soccer"
        positions={[{ label: 'GK', x: 10, y: 32, name: 'Al' }]}
      />,
    );
    const textNodes = Array.from(container.querySelectorAll('svg text'));
    expect(textNodes.map((n) => visibleText(n))).toEqual(expect.arrayContaining(['GK', 'Al']));
    expect(container.querySelector('title')).toBeNull();
  });
});
