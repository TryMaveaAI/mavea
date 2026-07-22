import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { render, fireEvent } from '@testing-library/react';
import { ArtAnalysis } from '../src/canvas/blocks/media/ArtAnalysis';
import { Carousel } from '../src/canvas/blocks/media/Carousel';
import { CutList } from '../src/canvas/blocks/media/CutList';
import { Diagram } from '../src/canvas/blocks/media/Diagram';
import { DimensionDrawing } from '../src/canvas/blocks/media/DimensionDrawing';
import { ExplodedView } from '../src/canvas/blocks/media/ExplodedView';
import { FloorPlan } from '../src/canvas/blocks/media/FloorPlan';
import { Lightbox } from '../src/canvas/blocks/media/Lightbox';
import { OrbitDiagram } from '../src/canvas/blocks/media/OrbitDiagram';
import { PatternPiece } from '../src/canvas/blocks/media/PatternPiece';
import { SkyChart } from '../src/canvas/blocks/media/SkyChart';
import { SpaceFit } from '../src/canvas/blocks/media/SpaceFit';
import { SportsPitch } from '../src/canvas/blocks/media/SportsPitch';
import type {
  ArtRegion,
  CarouselSlide,
  CutPart,
  DiagLabel,
  DimensionLine,
  ExplodedPart,
  FloorRoom,
  LightboxItem,
  OrbitBody,
  PatternPart,
  PitchPosition,
  SkyPlanet,
  SkyStar,
  SpaceItem,
} from '../src/canvas/blocks/media/types';

// A <title> tooltip nested inside a <text> node is part of its DOM textContent too, so reading
// the actually-rendered glyphs means the node's own direct text children, not the <title>'s.
// Shared by every SVG-label truncation suite below (ArtAnalysis, CutList, FloorPlan,
// OrbitDiagram, PatternPiece, SpaceFit, SportsPitch).
function visibleText(node: Element): string {
  return Array.from(node.childNodes)
    .filter((n) => n.nodeType === Node.TEXT_NODE)
    .map((n) => n.textContent)
    .join('');
}

// jsdom doesn't apply external stylesheets (vitest.config.ts sets css: false), so CSS-clamped
// overflow can't be measured via layout — the CSS-level suites (Carousel, Lightbox) read the
// declared rule straight out of the family stylesheet instead.
const css = readFileSync(join(__dirname, '../src/canvas/blocks/media/styles.css'), 'utf8');

function rule(className: string): string {
  const escaped = className.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = css.match(new RegExp(`\\.${escaped}\\s*\\{([^}]*)\\}`));
  expect(m, `expected a .${className} rule in media/styles.css`).toBeTruthy();
  return m![1];
}

// Regression coverage: region labels were drawn at a hardcoded x+2.5/y+6.5 offset with no
// maximum-width constraint, so a longer label (or a smaller/closely-packed region box) rendered
// far wider than its box and overflowed into the neighbouring region. Every rendered label must
// fit inside its own region box at .art-region-lbl's font-size.
describe('ArtAnalysis', () => {
  it('truncates a region label that is longer than its box instead of letting it overflow', () => {
    const regions: ArtRegion[] = [
      // A small box paired with a long label — exactly the case the demo fixture never exercises.
      { x: 10, y: 10, w: 12, h: 10, label: 'The Weeping Figure in the Lower-Left Foreground' },
      { x: 60, y: 60, w: 10, h: 10, label: 'Ok' },
    ];
    const { container } = render(<ArtAnalysis title="Composition" regions={regions} />);

    const labels = Array.from(container.querySelectorAll('text.art-region-lbl'));
    expect(labels).toHaveLength(2);

    const boxes = Array.from(container.querySelectorAll('rect.art-region-box'));
    expect(boxes).toHaveLength(2);

    // Every rendered label's visible glyph count must fit within its own box width (in viewBox
    // units, at ~2.6px average glyph advance for the 4.4px bold face) — no fixed/unbounded text.
    labels.forEach((node, i) => {
      const boxW = Number(boxes[i].getAttribute('width'));
      const maxChars = Math.max(3, Math.floor((boxW - 5) / 2.6));
      expect(visibleText(node).length).toBeLessThanOrEqual(maxChars);
    });

    // The long label was actually shortened (with an ellipsis)...
    expect(visibleText(labels[0]).endsWith('…')).toBe(true);
    // ...but the untruncated text survives as a native <title> tooltip, so nothing is lost.
    const titles = Array.from(container.querySelectorAll('title')).map((t) => t.textContent);
    expect(titles).toContain('The Weeping Figure in the Lower-Left Foreground');
  });

  it('leaves a short region label untouched', () => {
    const regions: ArtRegion[] = [{ x: 20, y: 20, w: 30, h: 20, label: 'Subject' }];
    const { container } = render(<ArtAnalysis title="Composition" regions={regions} />);
    const label = container.querySelector('text.art-region-lbl');
    expect(label?.textContent).toBe('Subject');
    expect(container.querySelector('title')).toBeNull();
  });
});

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
describe('Carousel label overflow', () => {
  function slides(n: number): CarouselSlide[] {
    const longLabel =
      'A very long slide headline that keeps going well past what any short demo fixture would use for a caption';
    return Array.from({ length: n }, (_, i) => ({
      label: i === 0 ? longLabel : `Slide ${i + 1}`,
      from: 'var(--presence)',
      to: 'var(--insight)',
    }));
  }

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

// Regression coverage: a part label was rendered as plain, unbounded SVG text sized only from the
// sheet width (never the rect's own width), so a long part name (or the same name packed into a
// small shelf-packed rect) rendered wider than its rectangle and bled past its edges — the exact
// bug class already fixed for FloorPlan/SportsPitch in this same family.
describe('CutList', () => {
  it('truncates a long part label instead of letting it overflow its rectangle', () => {
    const parts: CutPart[] = [
      // 26 chars, well past what fits at the default font-size in a 60-unit-wide rect.
      { label: 'Cabinet Side Panel Assembly', w: 60, h: 40, qty: 1, x: 0, y: 0 },
    ];
    const { container } = render(
      <CutList title="Sheet Layout" stock={{ w: 240, h: 120 }} parts={parts} />,
    );

    const labels = Array.from(container.querySelectorAll('text.cut-piece-lbl'));
    expect(labels).toHaveLength(1);

    const rects = Array.from(container.querySelectorAll('svg rect')).filter(
      (r) => r.getAttribute('width') === '60',
    );
    expect(rects.length).toBeGreaterThan(0);

    const rendered = visibleText(labels[0]);
    expect(rendered.length).toBeLessThan('Cabinet Side Panel Assembly'.length);
    expect(rendered.endsWith('…')).toBe(true);

    // The untruncated label survives as a native <title> tooltip — nothing silently lost.
    const titles = Array.from(container.querySelectorAll('title')).map((t) => t.textContent);
    expect(titles).toContain('Cabinet Side Panel Assembly');

    // The visible glyph count must fit the rect's own width at the label's own font-size —
    // no fixed-length cutoff and no unbounded text.
    const boxW = Number(rects[0].getAttribute('width'));
    const fontSize = parseFloat((labels[0] as SVGTextElement).style.fontSize) || 10;
    const maxChars = Math.max(3, Math.floor((boxW - fontSize * 0.5) / (fontSize * 0.6)));
    expect(rendered.length).toBeLessThanOrEqual(maxChars);
  });

  it('truncates a long label even when shelf-packed into a small rectangle', () => {
    // No explicit x/y — many qty-1 parts with long names shelf-pack into whatever space remains,
    // which can be much narrower than the sheet itself.
    const parts: CutPart[] = Array.from({ length: 8 }, (_, i) => ({
      label: `Structural Support Bracket ${i + 1}`,
      w: 25,
      h: 25,
      qty: 1,
    }));
    const { container } = render(
      <CutList title="Sheet Layout" stock={{ w: 200, h: 100 }} parts={parts} />,
    );

    const labels = Array.from(container.querySelectorAll('text.cut-piece-lbl'));
    expect(labels.length).toBeGreaterThan(0);

    labels.forEach((label) => {
      const rendered = visibleText(label);
      // Every visible label must be materially shorter than its full source name — none is
      // allowed to render at full, unbounded length in a 25-unit-wide packed rectangle.
      const full = parts.find((p) => p.label.startsWith(rendered.replace('…', '')))?.label ?? '';
      if (full) expect(rendered.length).toBeLessThanOrEqual(full.length);
    });

    // At least one truncated label leaves an ellipsis and a recoverable tooltip.
    const truncated = labels.filter((l) => visibleText(l).endsWith('…'));
    expect(truncated.length).toBeGreaterThan(0);
    const titles = Array.from(container.querySelectorAll('title')).map((t) => t.textContent);
    expect(titles.some((t) => t?.startsWith('Structural Support Bracket'))).toBe(true);
  });

  it('leaves a short label in a large rectangle untouched', () => {
    const parts: CutPart[] = [{ label: 'Shelf', w: 60, h: 40, qty: 1, x: 0, y: 0 }];
    const { container } = render(
      <CutList title="Sheet Layout" stock={{ w: 240, h: 120 }} parts={parts} />,
    );
    const label = container.querySelector('text.cut-piece-lbl');
    expect(label?.textContent).toBe('Shelf');
    expect(container.querySelector('title')).toBeNull();
  });
});

// Regression coverage: the viewBox is grown to fit every label's estimated text width so a
// callout can never clip against the card's overflow:hidden — but the estimate used a flat
// 1.9-per-glyph multiplier tuned for a short one-word tag, which underestimates a longer,
// sentence-like label. A longer label now gets a wider per-glyph estimate.
describe('Diagram', () => {
  function svgOf(container: HTMLElement) {
    return container.querySelector('svg.med-diag-svg') as SVGSVGElement;
  }

  it('grows the viewBox further for a long label than the old flat estimate would', () => {
    const longText = 'x'.repeat(25); // > 20 chars, hits the widened per-glyph tier
    const labels: DiagLabel[] = [{ x: 50, y: 50, text: longText, side: 'right' }];
    const { container } = render(<Diagram title="Fig" shapes={[]} labels={labels} />);
    const vb = svgOf(container).getAttribute('viewBox')!.split(' ').map(Number);
    const [, , vbW] = vb;
    // Old flat-1.9 estimate would have produced x1 = 50 + 7 + 25*1.9 + 1 = 105.5; the new
    // length-tiered estimate (2.1/char past 20 chars) must exceed that.
    expect(vbW).toBeGreaterThan(105.5);
  });

  it('keeps a short label at the original, tighter estimate', () => {
    // x=90 pushes the estimated extent past the default 100-wide figure box, so the viewBox
    // reflects the label estimate itself rather than being floored at the default width.
    const labels: DiagLabel[] = [{ x: 90, y: 50, text: 'short', side: 'right' }];
    const { container } = render(<Diagram title="Fig" shapes={[]} labels={labels} />);
    const vb = svgOf(container).getAttribute('viewBox')!.split(' ').map(Number);
    const [, , vbW] = vb;
    // 90 + 7 + 5*1.9 + 1 = 107.5
    expect(vbW).toBeCloseTo(107.5, 1);
  });

  it('renders with no labels at all', () => {
    const { container } = render(<Diagram title="Fig" shapes={[]} labels={[]} />);
    expect(svgOf(container)).toBeTruthy();
  });
});

// Regression coverage: dimension label text had no width constraint and was positioned with a
// fixed growth direction (centred for horizontal spans, growing right for vertical spans), so
// a longer callout near the viewBox edge ran past the boundary. The demo only ever used short
// numeric labels like "60"; a real custom callout can be much longer.
describe('DimensionDrawing', () => {
  const outline = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 60 },
    { x: 0, y: 60 },
  ];

  it('flips a long vertical dimension label to grow left when it would overflow the right edge', () => {
    const dimensions: DimensionLine[] = [
      { from: [100, 0], to: [100, 60], label: 'Overall part height measurement' },
    ];
    const { container } = render(<DimensionDrawing outline={outline} dimensions={dimensions} />);
    const text = container.querySelector('text.dim-text');
    expect(text).toBeTruthy();
    expect(text!.getAttribute('text-anchor')).toBe('end');
  });

  it('leaves a short label at its default position', () => {
    const dimensions: DimensionLine[] = [{ from: [0, 0], to: [100, 0], label: '60' }];
    const { container } = render(<DimensionDrawing outline={outline} dimensions={dimensions} />);
    const text = container.querySelector('text.dim-text');
    expect(text).toBeTruthy();
    expect(text!.textContent).toBe('60');
    expect(text!.getAttribute('text-anchor')).toBe('middle');
  });

  it('clamps a long horizontal dimension label to stay within the viewBox width', () => {
    const dimensions: DimensionLine[] = [
      { from: [0, 0], to: [100, 0], label: 'A very long custom dimension callout string' },
    ];
    const { container } = render(<DimensionDrawing outline={outline} dimensions={dimensions} />);
    const text = container.querySelector('text.dim-text');
    expect(text).toBeTruthy();
    const x = Number(text!.getAttribute('x'));
    const halfW = (text!.textContent!.length * 3) / 2;
    expect(x - halfW).toBeGreaterThanOrEqual(0);
    expect(x + halfW).toBeLessThanOrEqual(200); // VB_W
  });
});

// Regression coverage for a real bug: the numbered balloon radius was a fixed 6.4 while the
// vertical spacing between parts (`step`) shrinks as part count grows — past ~12 parts, `step`
// dropped below the fixed balloon diameter and neighboring balloons started overlapping.
describe('ExplodedView', () => {
  const VB_H = 150;
  const TOP = 14;
  const BOTTOM = VB_H - 14;

  function parts(n: number): ExplodedPart[] {
    return Array.from({ length: n }, (_, i) => ({ n: i + 1, name: `Part ${i + 1}` }));
  }

  it.each([2, 6, 12, 20])('keeps %i balloons from overlapping regardless of part count', (n) => {
    const { container } = render(<ExplodedView title="Assembly" parts={parts(n)} />);
    const balloons = Array.from(container.querySelectorAll<SVGCircleElement>('.exp-balloon'));
    expect(balloons).toHaveLength(n);

    const step = n > 1 ? (BOTTOM - TOP) / (n - 1) : 0;
    const centers = balloons.map((b) => Number(b.getAttribute('cy')));
    const radii = balloons.map((b) => Number(b.getAttribute('r')));

    for (let i = 1; i < balloons.length; i++) {
      // Consecutive balloons share the same x column, so no-overlap along the shared axis
      // requires their combined radii to fit within the vertical gap between their centers.
      const gap = Math.abs(centers[i] - centers[i - 1]);
      expect(gap).toBeGreaterThanOrEqual(radii[i] + radii[i - 1] - 1e-6);
    }

    // The radius must actually shrink to make room once step drops below the old fixed 6.4,
    // and never collapse below a legible floor.
    for (const r of radii) {
      expect(r).toBeGreaterThanOrEqual(3.2);
      expect(r).toBeLessThanOrEqual(6.4);
      if (step > 0 && step < 12.8) {
        expect(r).toBeLessThan(6.4);
      }
    }
  });

  it('never lets a balloon extend past the fixed SVG viewport', () => {
    const { container } = render(<ExplodedView title="Assembly" parts={parts(24)} />);
    const svg = container.querySelector('svg.exp-svg')!;
    const viewBox = svg.getAttribute('viewBox')!.split(' ').map(Number);
    const [, , vbW, vbH] = viewBox;

    const balloons = Array.from(container.querySelectorAll<SVGCircleElement>('.exp-balloon'));
    for (const b of balloons) {
      const cx = Number(b.getAttribute('cx'));
      const cy = Number(b.getAttribute('cy'));
      const r = Number(b.getAttribute('r'));
      expect(cx - r).toBeGreaterThanOrEqual(0);
      expect(cx + r).toBeLessThanOrEqual(vbW);
      expect(cy - r).toBeGreaterThanOrEqual(0);
      expect(cy + r).toBeLessThanOrEqual(vbH);
    }
  });
});

// Regression coverage: room names were only truncated when `room.w < 20`, with a fixed 10-char
// cutoff regardless of the room's actual width. A moderately long name (>15 chars) in a
// medium-width room (20-40 units, well past the old gate) rendered at full length, wider than
// the room rect, and visually bled past its walls — the exact bug class already fixed for
// TamSam/Treemap-adjacent SVG labels (ArtAnalysis, ConfusionMatrix, EtymTree): budget the
// truncation from the box's own width, not a single hardcoded cutoff.
describe('FloorPlan', () => {
  it('truncates a moderately long room name in a medium-width room instead of overflowing it', () => {
    const rooms: FloorRoom[] = [
      // 21 chars, w=30 — clears the old "w < 20" gate untouched, which was the bug: at
      // fontSize 3 a 21-char name is far wider than a 30-unit-wide room.
      { name: 'Primary Bedroom Suite', x: 5, y: 5, w: 30, h: 25 },
      // Short name, medium room — must render untouched.
      { name: 'Office', x: 40, y: 5, w: 30, h: 25 },
    ];
    const { container } = render(<FloorPlan title="Floor Plan" rooms={rooms} />);

    const labels = Array.from(container.querySelectorAll('text.fp-room-name'));
    expect(labels).toHaveLength(2);

    const boxes = Array.from(container.querySelectorAll('rect.fp-room-rect'));
    expect(boxes).toHaveLength(2);

    // Every rendered label's visible glyph count must fit within its own room's width (in
    // viewBox units, at the label's own font-size) — no fixed-length/unbounded text.
    labels.forEach((node, i) => {
      const boxW = Number(boxes[i].getAttribute('width'));
      const fontSize = Number(node.getAttribute('font-size'));
      const maxChars = Math.max(3, Math.floor((boxW - 2) / (fontSize * 0.62)));
      expect(visibleText(node).length).toBeLessThanOrEqual(maxChars);
    });

    // The long name was actually shortened (with an ellipsis)...
    expect(visibleText(labels[0]).endsWith('…')).toBe(true);
    // ...but the untruncated text survives as a native <title> tooltip, so nothing is lost.
    const titles = Array.from(container.querySelectorAll('title')).map((t) => t.textContent);
    expect(titles).toContain('Primary Bedroom Suite');

    // The short name in the same size room renders untouched, with no tooltip.
    expect(visibleText(labels[1])).toBe('Office');
  });

  it('leaves a short name in a narrow room untouched', () => {
    const rooms: FloorRoom[] = [{ name: 'Den', x: 5, y: 5, w: 15, h: 15 }];
    const { container } = render(<FloorPlan title="Floor Plan" rooms={rooms} />);
    const label = container.querySelector('text.fp-room-name');
    expect(label?.textContent).toBe('Den');
    expect(container.querySelector('title')).toBeNull();
  });

  it('still truncates a long name in a genuinely narrow room, as before', () => {
    const rooms: FloorRoom[] = [{ name: 'Walk-In Closet Storage', x: 5, y: 5, w: 12, h: 30 }];
    const { container } = render(<FloorPlan title="Floor Plan" rooms={rooms} />);
    const label = container.querySelector('text.fp-room-name');
    expect(visibleText(label!).length).toBeLessThan('Walk-In Closet Storage'.length);
    expect(visibleText(label!).endsWith('…')).toBe(true);
  });
});

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
describe('Lightbox label overflow', () => {
  function items(n: number): LightboxItem[] {
    const longLabel =
      'A very long exhibit title that keeps going well past what any short demo fixture would use for a caption';
    return Array.from({ length: n }, (_, i) => ({
      label: i === 0 ? longLabel : `Item ${i + 1}`,
      from: 'var(--presence)',
      to: 'var(--insight)',
    }));
  }

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

// Regression coverage for a real bug: a body label's anchor point was pushed outward from its
// body by a fixed 4 SVG-unit offset that has no notion of text width, so a name longer than the
// "Mercury"/"Venus"-length demo fixture (~7 chars) — or a system with more bodies than the demo's
// 8-planet fixture, forcing rings closer together — rendered wide enough to overflow into a
// neighboring body's space.
describe('OrbitDiagram', () => {
  function labelNodes(container: HTMLElement) {
    return Array.from(container.querySelectorAll('text.orb-body-lbl'));
  }

  it('truncates a long body name instead of letting its label overflow toward a neighbor', () => {
    const bodies: OrbitBody[] = [
      { name: 'Trappist-1e', orbitRadius: 0.4, distance: '0.4 AU' },
      { name: 'Kepler-452b', orbitRadius: 1.0, distance: '1.0 AU' },
    ];
    const { container } = render(<OrbitDiagram title="Exoplanets" center="Star" bodies={bodies} />);
    const labels = labelNodes(container);
    expect(labels).toHaveLength(2);
    for (const node of labels) {
      const rendered = visibleText(node);
      // Visible glyphs must be short enough that neighboring labels at the ring spacing used
      // here can't collide — the old unbounded fixed-offset label had no such ceiling.
      expect(rendered.length).toBeLessThanOrEqual(9);
    }
    expect(visibleText(labels[0])).toBe('Trappist…');
    expect(visibleText(labels[1])).toBe('Kepler-4…');
    // The untruncated names are still present, via native <title> tooltips — never silently lost.
    const titles = Array.from(container.querySelectorAll('title')).map((t) => t.textContent);
    expect(titles).toContain('Trappist-1e');
    expect(titles).toContain('Kepler-452b');
  });

  it('leaves short body names untouched', () => {
    const bodies: OrbitBody[] = [
      { name: 'Mercury', orbitRadius: 0.39, distance: '0.39 AU' },
      { name: 'Venus', orbitRadius: 0.72, distance: '0.72 AU' },
    ];
    const { container } = render(
      <OrbitDiagram title="Inner planets" center="Sun" bodies={bodies} />,
    );
    const labels = labelNodes(container).map((n) => visibleText(n));
    expect(labels).toEqual(['Mercury', 'Venus']);
    expect(container.querySelector('title')).toBeNull();
  });

  it('keeps every label within the diagram frame even with more bodies than the demo fixture', () => {
    // 12 bodies — beyond the 8-entry ANGLES cycle and the 8-planet demo fixture — packed onto
    // rings that get proportionally closer together as count grows.
    const bodies: OrbitBody[] = Array.from({ length: 12 }, (_, i) => ({
      name: `Planetesimal-${i}`,
      orbitRadius: 0.3 + i * 0.25,
      distance: `${(0.3 + i * 0.25).toFixed(2)} AU`,
    }));
    const { container } = render(
      <OrbitDiagram title="Crowded system" center="Star" bodies={bodies} />,
    );
    const labels = labelNodes(container);
    expect(labels).toHaveLength(12);
    for (const node of labels) {
      expect(visibleText(node).length).toBeLessThanOrEqual(9);
    }
    // Every label anchor must stay inside the 0..200 viewBox — no coordinate escapes the frame.
    for (const node of labels) {
      const x = Number(node.getAttribute('x'));
      const y = Number(node.getAttribute('y'));
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(200);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(200);
    }
  });
});

// Regression coverage: a piece label was rendered as plain, unbounded SVG text centered on the
// piece with no width constraint, so a long piece name in a narrow piece rendered wider than its
// rectangle and bled past its edges — the exact bug class already fixed for CutList/FloorPlan in
// this same family.
describe('PatternPiece', () => {
  it('truncates a long piece label instead of letting it overflow its rectangle', () => {
    const pieces: PatternPart[] = [
      // 24 chars, well past what fits at the default font-size in a narrow 14-unit-wide piece.
      { label: 'Left Front Bodice Lining', w: 14, h: 30, x: 0, y: 0, qty: 1 },
    ];
    const { container } = render(
      <PatternPiece title="Layout" fabric={{ w: 100, h: 60 }} pieces={pieces} />,
    );

    const labels = Array.from(container.querySelectorAll('text.pat-piece-lbl'));
    expect(labels).toHaveLength(1);

    const label = labels[0];
    const tspan = label.querySelector('tspan');
    expect(tspan).toBeTruthy();

    const rendered = visibleText(tspan!);
    expect(rendered.length).toBeLessThan('Left Front Bodice Lining'.length);
    expect(rendered.endsWith('…')).toBe(true);

    // The untruncated label survives as a native <title> tooltip — nothing silently lost.
    const titles = Array.from(container.querySelectorAll('title')).map((t) => t.textContent);
    expect(titles).toContain('Left Front Bodice Lining');

    // The visible glyph count must fit the piece's own width at the label's own font-size —
    // no unbounded text.
    const rect = Array.from(container.querySelectorAll('svg rect')).find(
      (r) => r.getAttribute('width') === '14',
    );
    expect(rect).toBeTruthy();
    const boxW = Number(rect!.getAttribute('width'));
    const fontSize = parseFloat((label as SVGTextElement).style.fontSize) || 10;
    const maxChars = Math.max(3, Math.floor((boxW - fontSize) / (fontSize * 0.6)));
    expect(rendered.length).toBeLessThanOrEqual(maxChars);
  });

  it('truncates long labels across many narrow pieces without illegible overlap, and stays within the card', () => {
    // A dense layout: many small pieces, each with a long, distinct name — the kind of input a
    // fixed-length (or absent) cutoff would let overflow past several piece edges at once.
    const pieces: PatternPart[] = Array.from({ length: 8 }, (_, i) => ({
      label: `Structural Panel Component ${i + 1}`,
      w: 10,
      h: 10,
      x: (i % 4) * 12,
      y: Math.floor(i / 4) * 12,
      qty: 1,
    }));
    const { container } = render(
      <PatternPiece title="Layout" fabric={{ w: 60, h: 30 }} pieces={pieces} />,
    );

    const labels = Array.from(container.querySelectorAll('text.pat-piece-lbl'));
    expect(labels.length).toBeGreaterThan(0);

    labels.forEach((label) => {
      const tspan = label.querySelector('tspan');
      const rendered = visibleText(tspan!);
      const full = pieces.find((p) => p.label.startsWith(rendered.replace('…', '')))?.label ?? '';
      if (full) expect(rendered.length).toBeLessThanOrEqual(full.length);
    });

    // At least one truncated label leaves an ellipsis and a recoverable tooltip — never silent
    // data loss, only a visual shortening.
    const truncated = labels.filter((l) => visibleText(l.querySelector('tspan')!).endsWith('…'));
    expect(truncated.length).toBeGreaterThan(0);
    const titles = Array.from(container.querySelectorAll('title')).map((t) => t.textContent);
    expect(titles.some((t) => t?.startsWith('Structural Panel Component'))).toBe(true);

    // No <text> node's rendered glyph run exceeds what its own piece width can hold — the
    // overflow-past-the-card bug would show up here as a mismatch between glyph budget and rect
    // width for at least one piece.
    const rects = Array.from(container.querySelectorAll('svg rect')).filter(
      (r) => r.getAttribute('width') === '10',
    );
    expect(rects.length).toBeGreaterThan(0);
  });

  it('leaves a short label in a large piece untouched', () => {
    const pieces: PatternPart[] = [{ label: 'Sleeve', w: 40, h: 30, x: 0, y: 0, qty: 1 }];
    const { container } = render(
      <PatternPiece title="Layout" fabric={{ w: 100, h: 60 }} pieces={pieces} />,
    );
    const label = container.querySelector('text.pat-piece-lbl');
    const tspan = label?.querySelector('tspan');
    expect(visibleText(tspan!)).toBe('Sleeve');
    expect(container.querySelector('title')).toBeNull();
  });
});

// Regression coverage for a real bug: star/planet labels sit beside their dot with a fixed
// pixel offset ("x + 3.2" / "x + 4"), always growing rightward. That only clears the 200×200
// viewBox for the demo fixture's short names ("Sirius", "Mars") — a longer name on a dot near
// the right edge runs the label past x=200, off the visible dome. Longer names must flip to
// end-anchored so the label grows left, into the space that's actually free.
describe('SkyChart', () => {
  const VIEWBOX_MAX = 200;
  // Rough px-per-character at the block's label font-size, generous enough to catch real overflow
  // without being brittle to sub-pixel font metrics (jsdom doesn't measure text at all).
  const CHAR_W = 3.4;

  function estimatedRight(el: Element): number {
    const x = Number(el.getAttribute('x'));
    const anchor = el.getAttribute('text-anchor') || 'start';
    const len = (el.textContent || '').length * CHAR_W;
    return anchor === 'end' ? x : x + len;
  }

  function estimatedLeft(el: Element): number {
    const x = Number(el.getAttribute('x'));
    const anchor = el.getAttribute('text-anchor') || 'start';
    const len = (el.textContent || '').length * CHAR_W;
    return anchor === 'end' ? x - len : x;
  }

  it('flips a near-edge star label to end-anchored instead of running it off the viewBox', () => {
    // x near 1 → hugging the east edge of the dome, where px(x) lands close to 200.
    const stars: SkyStar[] = [{ x: 0.98, y: 0.5, mag: -1, name: 'Alpha Centauri Proxima' }];
    const { container } = render(<SkyChart title="Sky" stars={stars} />);
    const label = container.querySelector('text.sky-star-lbl');
    expect(label).toBeTruthy();
    expect(label!.getAttribute('text-anchor')).toBe('end');
    expect(estimatedRight(label!)).toBeLessThanOrEqual(VIEWBOX_MAX);
  });

  it('keeps a near-edge planet label end-anchored and within the viewBox too', () => {
    const planets: SkyPlanet[] = [{ x: 0.97, y: 0.4, name: 'A Very Long Exoplanet Designation' }];
    const stars: SkyStar[] = [{ x: 0.2, y: 0.2, mag: 4 }];
    const { container } = render(<SkyChart title="Sky" stars={stars} planets={planets} />);
    const label = container.querySelector('text.sky-planet-lbl');
    expect(label).toBeTruthy();
    expect(label!.getAttribute('text-anchor')).toBe('end');
    expect(estimatedRight(label!)).toBeLessThanOrEqual(VIEWBOX_MAX);
  });

  it('still start-anchors a west-side label and keeps it left of x=0', () => {
    const stars: SkyStar[] = [{ x: 0.02, y: 0.5, mag: -1, name: 'Sirius' }];
    const { container } = render(<SkyChart title="Sky" stars={stars} />);
    const label = container.querySelector('text.sky-star-lbl');
    expect(label).toBeTruthy();
    expect(label!.getAttribute('text-anchor')).toBe('start');
    expect(estimatedLeft(label!)).toBeGreaterThanOrEqual(0);
  });

  it('anchors every label sensibly across a full ring of long names, none bleeding past either edge', () => {
    // A ring of stars all the way around the dome, each carrying a long name — stresses every
    // quadrant at once, not just the single edge case above.
    const n = 12;
    const stars: SkyStar[] = Array.from({ length: n }, (_, i) => {
      const t = (i / n) * 2 * Math.PI;
      return {
        x: 0.5 + 0.46 * Math.cos(t),
        y: 0.5 + 0.46 * Math.sin(t),
        mag: 1,
        name: `Designation Beta ${i}`,
      };
    });
    const { container } = render(<SkyChart title="Sky" stars={stars} />);
    const labels = Array.from(container.querySelectorAll('text.sky-star-lbl'));
    expect(labels.length).toBeGreaterThan(0);
    for (const label of labels) {
      expect(estimatedRight(label)).toBeLessThanOrEqual(VIEWBOX_MAX);
      expect(estimatedLeft(label)).toBeGreaterThanOrEqual(0);
    }
  });
});

// Regression coverage: the item label's font-size shrinks by a character-count heuristic
// (label.length * 0.52), not real SVG text metrics — a label that's merely "long enough" can
// still render wider than the item's own footprint (it.w * 0.84) once the heuristic's assumed
// glyph width undershoots the real one. Same bug class already fixed for FloorPlan/EtymTree/
// TamSam/Treemap: budget a hard truncation from the box's own width at the chosen font-size.
describe('SpaceFit', () => {
  it('truncates a long item label instead of letting it overflow the footprint', () => {
    const items: SpaceItem[] = [
      // Long label on a modest footprint — wide enough to clear the "hide label" gate
      // (min(w,d) > max(W,D)*0.12) but not wide enough to hold this label at its shrunk size.
      { label: 'Reclining Sectional Sofa With Chaise', w: 6, d: 3, x: 2, y: 2 },
      // Short label — must render untouched.
      { label: 'Rug', w: 4, d: 4, x: 12, y: 2 },
    ];
    const { container } = render(
      <SpaceFit title="Living Room" room={{ w: 20, d: 12, unit: 'ft' }} items={items} />,
    );

    const labels = Array.from(container.querySelectorAll('text.spf-item-lbl'));
    expect(labels).toHaveLength(2);

    // Every rendered label's visible glyph count must fit within its own item's width (in
    // viewBox units, at the label's own font-size) — no unbounded text past the footprint.
    labels.forEach((node, i) => {
      const boxW = items[i].w * 0.84;
      const fontSize = parseFloat((node as HTMLElement).style.fontSize);
      const maxChars = Math.max(2, Math.floor(boxW / (fontSize * 0.56)));
      expect(visibleText(node).length).toBeLessThanOrEqual(maxChars);
    });

    // The long label was actually shortened (with an ellipsis)...
    expect(visibleText(labels[0]).endsWith('…')).toBe(true);
    // ...but the untruncated text survives as a native <title> tooltip, so nothing is lost.
    const titles = Array.from(container.querySelectorAll('title')).map((t) => t.textContent);
    expect(titles).toContain('Reclining Sectional Sofa With Chaise');

    // The short label renders untouched, with no tooltip attached to it.
    expect(visibleText(labels[1])).toBe('Rug');
  });

  it('leaves a short label on a roomy footprint untouched', () => {
    const items: SpaceItem[] = [{ label: 'Desk', w: 10, d: 6, x: 2, y: 2 }];
    const { container } = render(<SpaceFit title="Office" room={{ w: 20, d: 12 }} items={items} />);
    const label = container.querySelector('text.spf-item-lbl');
    expect(label?.textContent).toBe('Desk');
    expect(container.querySelector('title')).toBeNull();
  });

  it('does not render clipped/overlapping text past the SVG viewBox for a crowded room', () => {
    // Several long-labeled items packed into a modest room — the exact shape that would
    // previously spill labels past their rects and into their neighbours.
    const items: SpaceItem[] = [
      { label: 'King Size Bed Frame', w: 5, d: 5, x: 1, y: 1 },
      { label: 'Walk-In Wardrobe Unit', w: 4, d: 3, x: 7, y: 1 },
      { label: 'Bedside Reading Nook', w: 3, d: 3, x: 1, y: 7 },
    ];
    const { container } = render(
      <SpaceFit title="Bedroom" room={{ w: 14, d: 10, unit: 'ft' }} items={items} />,
    );
    const svg = container.querySelector('svg.spf-svg')!;
    const vbW = Number(svg.getAttribute('viewBox')!.split(' ')[2]);

    const labels = Array.from(container.querySelectorAll('text.spf-item-lbl'));
    labels.forEach((node, i) => {
      const boxW = items[i].w * 0.84;
      const fontSize = parseFloat((node as HTMLElement).style.fontSize);
      const maxChars = Math.max(2, Math.floor(boxW / (fontSize * 0.56)));
      expect(visibleText(node).length).toBeLessThanOrEqual(maxChars);
      // Sanity: nothing renders anywhere near wider than the whole figure.
      expect(fontSize * visibleText(node).length).toBeLessThan(vbW);
    });
  });
});

// Regression coverage for two real bugs: (1) a position code longer than the "GK"/"PG"-length
// demo fixture (e.g. "CDM") rendered at the same fixed font-size as a 2-char code and overran the
// r=3.5 marker disc; (2) a realistic player name rendered as plain, unclipped SVG text with no
// width bound and bled past the marker into neighboring players.
describe('SportsPitch', () => {
  const LONG_NAME_POSITIONS: PitchPosition[] = [
    { label: 'CDM', x: 50, y: 32, name: 'Konstantinos Papadopoulos-Michailidis' },
    { label: 'GK', x: 10, y: 32, name: 'Al' },
  ];

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
