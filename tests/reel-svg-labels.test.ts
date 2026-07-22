// SVG node/center labels have no DOM flow to wrap them and no bounding box FitScale can measure, so
// overflow is invisible until it silently clips against the padded viewBox. svgLabel.ts makes that
// clip unreachable in practice with precomputed char-width math (no getComputedTextLength — untestable
// in jsdom, timing-dependent on font load). This suite checks the math holds for every legal length up
// to each field's real coercion ceiling, then renders the three affected finishes with worst-case
// labels (modeled on reel-fit.test.ts's OVER fixture + reel-token-guard.test.ts's render loop).
import { describe, it, expect, afterEach } from 'vitest';
import { createElement } from 'react';
import { cleanup, render } from '@testing-library/react';
import {
  estWidth,
  splitTwoLines,
  middleEllipsis,
  fitLabel,
  centeredLabelWidth,
  edgeLabelWidth,
  LABEL_SIZE_LADDER,
  GLYPH_WIDTH_RATIO,
} from '../src/clip/reel/templates/svgLabel';
import { ConstellationSlide } from '../src/clip/reel/templates/finishes/constellation';
import { KnowledgeGraphSlide } from '../src/clip/reel/templates/conceptSlides';
import { GraphPlotSlide } from '../src/clip/reel/templates/finishes/graphPlot';
import { coerceSlots } from '../src/clip/reel/templates/registry';
import { CHAR_BUDGET } from '../src/clip/reel/reelScript';

afterEach(cleanup);

const ctx = { topic: 'Topic', question: 'Question?' };

describe('estWidth', () => {
  it('is character count × size × the measured glyph ratio', () => {
    expect(estWidth('abcd', 10)).toBeCloseTo(4 * 10 * GLYPH_WIDTH_RATIO, 5);
    expect(estWidth('', 12)).toBe(0);
  });
});

describe('splitTwoLines', () => {
  it('leaves labels at or under the threshold on one line', () => {
    expect(splitTwoLines('short')).toEqual(['short']);
    expect(splitTwoLines('exactlyten')).toEqual(['exactlyten']); // 10 chars, the threshold itself
  });

  it('splits at the whitespace nearest the midpoint, dropping the space', () => {
    expect(splitTwoLines('quantum mechanics')).toEqual(['quantum', 'mechanics']);
  });

  it('picks whichever of several spaces sits closest to the midpoint', () => {
    const text = 'a bb ccccccccccccc'; // spaces at 1 and 4; midpoint ~9.5 favors neither literally,
    const lines = splitTwoLines(text); // but the break must still land on a real space, not mid-word
    expect(lines.join(' ')).toBe(text);
    expect(text[text.indexOf(lines[0]) + lines[0].length]).toBe(' ');
  });

  it('falls back to a hard midpoint cut when there is no whitespace at all', () => {
    // Rare on purpose: clampToken (reelScript.ts) already caps any unbroken run at ~24 chars before
    // it can reach here — this is the belt-and-suspenders path for that guard's own ceiling.
    const run = 'x'.repeat(20);
    expect(splitTwoLines(run)).toEqual(['x'.repeat(10), 'x'.repeat(10)]);
  });
});

describe('middleEllipsis', () => {
  it('leaves text at or under the budget untouched', () => {
    expect(middleEllipsis('short', 10)).toBe('short');
  });

  it('collapses the middle to exactly maxChars, keeping head and tail', () => {
    const out = middleEllipsis('a'.repeat(40), 12);
    expect(out.length).toBe(12);
    expect(out).toContain('…');
    expect(out.startsWith('a')).toBe(true);
    expect(out.endsWith('a')).toBe(true);
  });
});

describe('centeredLabelWidth / edgeLabelWidth', () => {
  it('centered width is the doubled shorter clearance to either edge, less the margin', () => {
    expect(centeredLabelWidth(150, -46, 346)).toBe(2 * 196 - 12);
    expect(centeredLabelWidth(34, -46, 346)).toBe(2 * 80 - 12);
  });

  it('edge width is one-sided, toward whichever edge the anchor grows into', () => {
    expect(edgeLabelWidth(170, 0, 200, 'end')).toBe(170 - 6);
    expect(edgeLabelWidth(36, 0, 200, 'start')).toBe(200 - 36 - 6);
  });
});

describe('fitLabel keeps every legal label inside the shape it actually renders into', () => {
  // The real geometry each finish computes for its tightest label position — constellation.tsx's
  // amplitude-116 ring, conceptSlides.tsx's radius-108 ring (both share its -46..346 viewBox), and
  // graphPlot.tsx's 0..200 viewBox. cx - amplitude / cx - radius is the true worst-case x any node can
  // ever land on, not a guess: it's the geometric extreme the file's own cos() math is bounded by.
  const SHAPES: { name: string; ceiling: number; availableWidth: number }[] = [
    {
      name: 'constellation node (leftmost star, cx=150 - 116)',
      ceiling: CHAR_BUDGET.conceptmap.node,
      availableWidth: centeredLabelWidth(34, -46, 346),
    },
    {
      name: 'center label (constellation + knowledge-graph share this viewBox)',
      ceiling: CHAR_BUDGET.conceptmap.center,
      availableWidth: centeredLabelWidth(150, -46, 346),
    },
    {
      name: 'knowledge-graph node (leftmost, cx=150 - 108)',
      ceiling: CHAR_BUDGET.conceptmap.node,
      availableWidth: centeredLabelWidth(42, -46, 346),
    },
    {
      name: "graph-plot vector, anchor 'end' at x=170",
      // registry.tsx's diagram coercer clamps vector labels to 8 chars inline (S(..., 8, 'v')) — no
      // named CHAR_BUDGET entry, since diagram.label is a different field (the kicker, budget 24).
      ceiling: 8,
      availableWidth: edgeLabelWidth(170, 0, 200, 'end'),
    },
    {
      name: "graph-plot vector, anchor 'start' at x=36",
      ceiling: 8,
      availableWidth: edgeLabelWidth(36, 0, 200, 'start'),
    },
  ];

  const SOURCE = 'wavelength interference diffraction resonance amplitude spectrum';

  for (const shape of SHAPES) {
    it(`${shape.name}: every length 1..${shape.ceiling} paints inside ${shape.availableWidth.toFixed(0)}`, () => {
      for (let len = 1; len <= shape.ceiling; len += 1) {
        const text = SOURCE.slice(0, len);
        const { lines, size } = fitLabel(text, shape.availableWidth);
        for (const line of lines) {
          expect(
            estWidth(line, size),
            `${shape.name} len ${len}: "${line}" at ${size}px overflows ${shape.availableWidth}`,
          ).toBeLessThanOrEqual(shape.availableWidth);
        }
      }
    });
  }
});

describe('fitLabel degrades gracefully under real pressure', () => {
  it('stays at the top ladder size when there is plenty of room', () => {
    const { size } = fitLabel('wavelength interference', 400);
    expect(size).toBe(LABEL_SIZE_LADDER[0]);
  });

  it('steps down the ladder as available width tightens', () => {
    const { size, lines } = fitLabel('wavelength interference', 75);
    expect(size).toBe(LABEL_SIZE_LADDER[1]); // too tight for the top size, roomy enough for the next
    for (const line of lines) expect(estWidth(line, size)).toBeLessThanOrEqual(75);
  });

  it('falls back to middleEllipsis when even the floor ladder size cannot fit', () => {
    const { size, lines } = fitLabel('wavelengthinterference', 20);
    expect(size).toBe(LABEL_SIZE_LADDER[LABEL_SIZE_LADDER.length - 1]);
    expect(lines.some((l) => l.includes('…'))).toBe(true);
    for (const line of lines) expect(estWidth(line, size)).toBeLessThanOrEqual(20);
  });
});

describe('the three affected finishes render worst-case labels without throwing', () => {
  // Past every real ceiling (conceptmap.node=18, conceptmap.center=16), the shape coerceSlots actually
  // hands a finish once clampText/clampToken have run — the LONGEST_RAW pattern from reel-fit.test.ts.
  const conceptmapRaw = {
    center: 'wavelength interference diffraction resonance',
    nodes: Array.from({ length: 5 }, (_, i) => ({
      label: `node ${i} wavelength interference diffraction resonance`,
    })),
  };
  const diagramRaw = {
    label: 'Diagram',
    vectors: [{ label: 'wavelength interference' }, { label: 'x' }],
  };

  it('ConstellationSlide', () => {
    const slots = coerceSlots('conceptmap', conceptmapRaw, ctx);
    expect(() => render(createElement(ConstellationSlide, { slots }))).not.toThrow();
  });

  it('KnowledgeGraphSlide', () => {
    const slots = coerceSlots('conceptmap', conceptmapRaw, ctx);
    expect(() => render(createElement(KnowledgeGraphSlide, { slots }))).not.toThrow();
  });

  it('GraphPlotSlide', () => {
    const slots = coerceSlots('diagram', diagramRaw, ctx);
    expect(() => render(createElement(GraphPlotSlide, { slots }))).not.toThrow();
  });
});
