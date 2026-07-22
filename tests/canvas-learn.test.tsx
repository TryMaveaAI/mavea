import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { render, screen, fireEvent } from '@testing-library/react';
import { AreaModel } from '../src/canvas/blocks/learn/AreaModel';
import { BodyMap } from '../src/canvas/blocks/learn/BodyMap';
import { BohrModel } from '../src/canvas/blocks/learn/BohrModel';
import { CellDiagram } from '../src/canvas/blocks/learn/CellDiagram';
import { ChordDiagram } from '../src/canvas/blocks/learn/ChordDiagram';
import { CrossSection } from '../src/canvas/blocks/learn/CrossSection';
import { DevelopmentMilestone } from '../src/canvas/blocks/learn/DevelopmentMilestone';
import { EquationBlock } from '../src/canvas/blocks/learn/EquationBlock';
import { FractionBar } from '../src/canvas/blocks/learn/FractionBar';
import { FreeBodyDiagram } from '../src/canvas/blocks/learn/FreeBodyDiagram';
import { FretboardMap } from '../src/canvas/blocks/learn/FretboardMap';
import { GeometryCanvas } from '../src/canvas/blocks/learn/GeometryCanvas';
import { GridMatrix } from '../src/canvas/blocks/learn/GridMatrix';
import { LetterForm } from '../src/canvas/blocks/learn/LetterForm';
import { LineSpectrum } from '../src/canvas/blocks/learn/LineSpectrum';
import { NumberLine } from '../src/canvas/blocks/learn/NumberLine';
import { ParseTree } from '../src/canvas/blocks/learn/ParseTree';
import { PhasePortrait } from '../src/canvas/blocks/learn/PhasePortrait';
import { PhyloTree } from '../src/canvas/blocks/learn/PhyloTree';
import { PianoKeys } from '../src/canvas/blocks/learn/PianoKeys';
import { PolarPlot } from '../src/canvas/blocks/learn/PolarPlot';
import { PyramidTiers } from '../src/canvas/blocks/learn/PyramidTiers';
import { Quiz } from '../src/canvas/blocks/learn/Quiz';
import { TaylorSeries } from '../src/canvas/blocks/learn/TaylorSeries';
import { TeachDiagram } from '../src/canvas/blocks/learn/TeachDiagram';
import { ToolScale } from '../src/canvas/blocks/learn/ToolScale';
import { UnitCircle } from '../src/canvas/blocks/learn/UnitCircle';
import { WaveDiagram } from '../src/canvas/blocks/learn/WaveDiagram';
import { WorkedExample } from '../src/canvas/blocks/learn/WorkedExample';
import { layoutLabels } from '../src/canvas/blocks/learn/teachDiagramLayout';
import type {
  CrossLayer,
  DevelopmentMilestoneProps,
  FBDForce,
  FretDot,
  GeoPoint,
  GeoVector,
  LetterStroke,
  MathNode,
  ParseTreeNode,
  PhyloNode,
  PianoHighlight,
  PolarCurve,
  PyramidTier,
  SpectrumLine,
} from '../src/canvas/blocks/learn/types';
import type { DiagLabel } from '../src/canvas/blocks/media/types';

// A <title> tooltip nested inside a <text> node is part of its DOM textContent too, so reading
// the actually-rendered glyphs means the node's own direct text children, not the <title>'s.
// Shared by every truncate-with-tooltip regression below. (TeachDiagram wraps its labels across
// <tspan> lines, so it keeps its own variant next to its tests.)
function visibleText(node: Element): string {
  return Array.from(node.childNodes)
    .filter((n) => n.nodeType === Node.TEXT_NODE)
    .map((n) => n.textContent)
    .join('');
}

// Regression coverage for a real bug: AreaModel's card carried the "c1" scoping class, which
// belongs to the charts1 family (it opts .card-eyebrow/.insight-summary into wrap-instead-of-
// overflow CSS scoped by `.c1 …` selectors in charts1/styles.css). Every other learn/ component
// renders a plain "card reveal" — AreaModel borrowing a sibling family's scoping class meant it
// silently rode CSS it doesn't own instead of the learn family's own containment rules.

describe('AreaModel', () => {
  it('renders the learn family\'s own card class, not a borrowed charts1 "c1" scope', () => {
    const { container } = render(<AreaModel title="Product" factorA={[20, 3]} factorB={[10, 4]} />);
    const card = container.querySelector('.card');
    expect(card).toBeTruthy();
    expect(card!.className).toBe('card reveal');
  });

  it('grows past the demo fixture (2x2) without losing a cell or breaking the grid shape', () => {
    // The demo fixture is a 2x2 binomial expansion. A caller can ask for far more terms per
    // factor (e.g. a trinomial times a 4-term polynomial) — every column/row header and body
    // cell must still render, one apiece, with no illegible collapse.
    const factorA = [10, 3, -2, 7];
    const factorB = [5, -4, 1];
    const labelsA = factorA.map((_, i) => `x${i}`);
    const labelsB = factorB.map((_, i) => `y${i}`);
    const { container } = render(
      <AreaModel
        title="Large polynomial product"
        factorA={factorA}
        factorB={factorB}
        labelsA={labelsA}
        labelsB={labelsB}
      />,
    );

    const colHeaders = container.querySelectorAll('.lr-am-col-hdr');
    const rowHeaders = container.querySelectorAll('.lr-am-row-hdr');
    const bodyCells = container.querySelectorAll('.lr-am-body-cell');
    expect(colHeaders).toHaveLength(factorA.length);
    expect(rowHeaders).toHaveLength(factorB.length);
    expect(bodyCells).toHaveLength(factorA.length * factorB.length);

    // Every rendered label is exactly one of the supplied terms — no two cells collapsed into
    // one another's text (the illegible-overlap failure mode for grids that outgrow a fixture).
    const colTexts = Array.from(colHeaders).map((n) => n.textContent);
    expect(colTexts).toEqual(labelsA);
    const rowTexts = Array.from(rowHeaders).map((n) => n.textContent);
    expect(rowTexts).toEqual(labelsB);

    // The grid stays a single CSS grid container that scrolls its own overflow rather than
    // pushing the card wider than its column — the containment the family actually relies on.
    const wrap = container.querySelector<HTMLElement>('.lr-am-wrap');
    expect(wrap).toBeTruthy();
    expect(wrap!.querySelector('.lr-am-grid')).toBeTruthy();
  });

  it('keeps a long algebraic label inside its cell text rather than duplicating/clipping siblings', () => {
    const longLabel = '(3x² - 4xy + 7)';
    const { container, getByText } = render(
      <AreaModel
        title="Long term"
        factorA={[1, 1]}
        factorB={[1]}
        labelsA={[longLabel, 'z']}
        labelsB={['w']}
      />,
    );
    // The long term renders verbatim exactly once as its own header cell, distinct from the
    // shorter sibling header — confirming cells don't bleed into or overwrite one another.
    expect(getByText(longLabel)).toBeInTheDocument();
    expect(getByText('z')).toBeInTheDocument();
    const colHeaders = container.querySelectorAll('.lr-am-col-hdr');
    expect(colHeaders).toHaveLength(2);
  });
});

// Regression coverage: region labels render as plain SVG <text> at a fixed lx/ly with no width
// constraint (viewBox is only 120 wide). A long anatomical/custom label — well within what a
// caller can legitimately pass via `label` or the built-in guide names — would run past the
// viewBox edge or collide with a neighbouring label. Every rendered label must be capped to a
// character budget, with the untruncated text preserved via a native <title> tooltip.

describe('BodyMap', () => {
  it('truncates a long region label instead of letting it overflow the viewBox', () => {
    const longLabel = 'Left gastrocnemius and soleus complex';
    const { container } = render(
      <BodyMap title="Injury" regions={[{ id: 'leftShin', label: longLabel, note: 'Strain' }]} />,
    );
    const labelNodes = Array.from(container.querySelectorAll('text.bm-label'));
    expect(labelNodes).toHaveLength(1);
    for (const node of labelNodes) {
      expect(visibleText(node).length).toBeLessThanOrEqual(14);
    }
    expect(visibleText(labelNodes[0]).endsWith('…')).toBe(true);
    // The untruncated string is still available, via a native <title> tooltip.
    const titles = Array.from(container.querySelectorAll('title')).map((t) => t.textContent);
    expect(titles).toContain(longLabel);
  });

  it('leaves a short region label untouched', () => {
    const { container } = render(
      <BodyMap title="Injury" regions={[{ id: 'leftShin', label: 'Calf' }]} />,
    );
    const labelNodes = Array.from(container.querySelectorAll('text.bm-label'));
    expect(labelNodes.map((n) => visibleText(n))).toEqual(['Calf']);
    expect(container.querySelector('title')).toBeNull();
  });

  it('truncates every always-on guide label the same way when nothing is highlighted', () => {
    // GUIDE_SEGMENTS renders ~13 labels from a fixed SEGMENT_LABEL table — all short today, but
    // the truncation guard must hold for this path too since it shares the same render loop.
    const { container } = render(<BodyMap title="Body" />);
    const labelNodes = Array.from(container.querySelectorAll('text.bm-label--muted'));
    expect(labelNodes.length).toBeGreaterThan(5);
    for (const node of labelNodes) {
      expect(visibleText(node).length).toBeLessThanOrEqual(14);
    }
  });

  it('keeps multiple long labels from colliding by capping each to the same budget', () => {
    const { container } = render(
      <BodyMap
        title="Injury"
        regions={[
          { id: 'leftShoulder', label: 'Rotator cuff impingement syndrome' },
          { id: 'rightShoulder', label: 'Acromioclavicular joint sprain' },
          { id: 'chest', label: 'Costochondral junction inflammation' },
        ]}
      />,
    );
    const labelNodes = Array.from(container.querySelectorAll('text.bm-label'));
    expect(labelNodes).toHaveLength(3);
    for (const node of labelNodes) {
      expect(visibleText(node).length).toBeLessThanOrEqual(14);
    }
  });
});

// Regression coverage for a real bug: the electron-configuration summary along the bottom of
// the right-hand gutter ("2·8·18·32·... = N e⁻") rendered as a single unconstrained <text> node,
// so a heavy atom with many shells / high per-shell counts ran wider than the gutter and clipped
// past the card's left edge. The demo fixtures (sodium, argon) never had enough shells to expose
// this — a uranium-sized configuration does.

describe('BohrModel', () => {
  const GUTTER_LEFT = 360 - 96 + 6; // W - GUTTER + 6, mirrors BohrModel's internal leader-line x

  it('wraps a long electron-configuration summary instead of overflowing the gutter', () => {
    // Uranium: 7 shells, well beyond the small demo fixtures — the joined count string alone
    // ("2·8·18·32·32·8·2") is longer than the gutter can hold on one line.
    const { container } = render(
      <BohrModel title="Uranium" protons={92} neutrons={146} shells={[2, 8, 18, 32, 32, 8, 2]} />,
    );
    const config = container.querySelector('text.boh-config');
    expect(config).toBeTruthy();
    const lines = Array.from(config!.querySelectorAll('tspan'));
    // Wrapped across more than one line — a single unconstrained line is exactly the bug.
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) {
      // Every wrapped line stays right-anchored at the same x as the shell-occupancy labels,
      // so it never drifts outside the gutter column horizontally.
      expect(Number(line.getAttribute('x'))).toBe(350);
      // No single line's estimated width should be wider than the gutter itself — the whole
      // point of wrapping is that no rendered line runs past the leader-line column.
      const text = line.textContent ?? '';
      const estWidth = text.length * (9.5 * 0.62);
      expect(estWidth).toBeLessThanOrEqual(350 - GUTTER_LEFT + 1);
    }
    // The full configuration is preserved verbatim across the wrapped lines — wrapping must
    // never silently drop electrons the way a truncation with an ellipsis would.
    const joined = lines.map((l) => l.textContent).join('');
    expect(joined).toContain('2·8·18·32·32·8·2');
    expect(joined).toContain('102 e⁻');
  });

  it('renders a short configuration on a single line, unchanged', () => {
    const { container } = render(
      <BohrModel title="Sodium" protons={11} neutrons={12} shells={[2, 8, 1]} />,
    );
    const config = container.querySelector('text.boh-config');
    expect(config).toBeTruthy();
    const lines = Array.from(config!.querySelectorAll('tspan'));
    expect(lines).toHaveLength(1);
    expect(lines[0].textContent).toBe('2·8·1 = 11 e⁻');
  });
});

// Regression coverage for a real bug: organelle labels are plain SVG <text> drawn at fixed,
// hand-tuned anchor coordinates on a fixed 320×230 canvas with no width check — a model-authored
// `label` override longer than the preset names ("Nucleus", "Golgi apparatus") ran past the
// gutter/card edge instead of staying inside the diagram.

describe('CellDiagram', () => {
  it('truncates a label override longer than the demo fixture instead of letting it overflow', () => {
    const longLabel = 'Rough Endoplasmic Reticulum With Attached Ribosomes';
    const { container } = render(
      <CellDiagram title="Cell" cellType="animal" parts={[{ key: 'golgi', label: longLabel }]} />,
    );
    const labelNodes = Array.from(container.querySelectorAll('text.cel-label'));
    expect(labelNodes).toHaveLength(1);
    // The visible glyphs must stay short enough to fit the gutter at the label's font-size —
    // the untruncated 52-char override rendered far past the card edge before the fix.
    expect(visibleText(labelNodes[0]).length).toBeLessThanOrEqual(20);
    expect(visibleText(labelNodes[0]).endsWith('…')).toBe(true);
    // The full text is preserved, via a native <title> tooltip.
    const titles = Array.from(container.querySelectorAll('title')).map((t) => t.textContent);
    expect(titles).toContain(longLabel);
  });

  it('leaves a short label untouched', () => {
    const { container } = render(
      <CellDiagram title="Cell" cellType="animal" parts={[{ key: 'nucleus' }]} />,
    );
    const labelNodes = Array.from(container.querySelectorAll('text.cel-label'));
    expect(labelNodes.map(visibleText)).toEqual(['Nucleus']);
    expect(container.querySelector('title')).toBeNull();
  });

  it('renders every resolvable organelle for a cell type without label collisions or an empty diagram', () => {
    // The full animal-eligible set (all 'both' + 'animal'-only glyphs) — the largest count the
    // preset library can ever resolve to, since GLYPHS is a fixed catalog and duplicates are
    // deduped. Every anchor is hand-placed by the component, so at full occupancy no two labels
    // should land on the same point.
    const allAnimalKeys = [
      'nucleus',
      'nucleolus',
      'mitochondria',
      'er',
      'golgi',
      'ribosomes',
      'vacuole',
      'lysosome',
      'centrosome',
      'cytoplasm',
      'membrane',
    ];
    const { container } = render(
      <CellDiagram title="Cell" cellType="animal" parts={allAnimalKeys.map((key) => ({ key }))} />,
    );
    const labelNodes = Array.from(container.querySelectorAll('text.cel-label'));
    // 'cytoplasm' and 'membrane' are label-only entries that still get a leader + label, so
    // every requested key produces exactly one label.
    expect(labelNodes).toHaveLength(allAnimalKeys.length);
    const positions = labelNodes.map((n) => `${n.getAttribute('x')},${n.getAttribute('y')}`);
    expect(new Set(positions).size).toBe(positions.length);
  });

  it('stays within the fixed diagram viewBox regardless of label length', () => {
    const { container } = render(
      <CellDiagram
        title="Cell"
        cellType="plant"
        parts={[
          { key: 'chloroplast', label: 'Chloroplasts Performing Photosynthesis Constantly' },
          { key: 'vacuole', label: 'The Large Central Storage Vacuole' },
        ]}
      />,
    );
    const svg = container.querySelector('svg.cel-svg');
    expect(svg).toBeTruthy();
    // The viewBox is the fixed 320×230 canvas plus its gutters — unchanged by label content,
    // since truncation (not rescaling) is what keeps long labels inside it.
    expect(svg?.getAttribute('viewBox')).toBe('-42 0 372 230');
  });
});

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

// Regression coverage for two real bugs: concentric ring labels used a fixed 18-unit vertical
// step per ring, which ran labels off the bottom of the 240-unit viewBox once there were 8+
// layers; and horizontal band labels had no width constraint, so a layer name longer than the
// demo fixture's ("Crust", "Epidermis") ran past the 320-unit viewBox's right edge.

/** Shared by both CrossSection orientation suites below. */
function layers(n: number, longNames = false): CrossLayer[] {
  return Array.from({ length: n }, (_, i) => ({
    name: longNames ? `Sedimentary Layer Formation Type ${i + 1}` : `Layer ${i + 1}`,
    thickness: 10 + i,
  }));
}

describe('CrossSection — concentric orientation', () => {
  it('spreads ring labels within the viewBox instead of a fixed step that runs off the bottom', () => {
    const { container } = render(
      <CrossSection title="Planet interior" orientation="concentric" layers={layers(9)} />,
    );
    const svg = container.querySelector('svg.lr-xs-svg--ring')!;
    const viewBox = svg.getAttribute('viewBox')!.split(' ').map(Number);
    const vbHeight = viewBox[3];

    const labels = Array.from(container.querySelectorAll('text.lr-xs-ring-lbl'));
    expect(labels).toHaveLength(9);
    // Every label's y must land inside the viewBox — the old fixed 18-unit-per-ring step put
    // the last of 9 labels at y = 10 + 8*18 = 154 off a 240 box's usable band, but a denser
    // fixture (12+) exposed it running past the edge entirely.
    for (const label of labels) {
      const y = Number(label.getAttribute('y'));
      expect(y).toBeGreaterThan(0);
      expect(y).toBeLessThanOrEqual(vbHeight);
    }
    // No two adjacent labels may collide (share the same y): with dynamic spacing the step
    // shrinks but never collapses to zero.
    const ys = labels.map((l) => Number(l.getAttribute('y')));
    const uniqueYs = new Set(ys);
    expect(uniqueYs.size).toBe(ys.length);
  });

  it('truncates a long ring label instead of letting it overflow, preserving the full name via title', () => {
    const { container } = render(
      <CrossSection
        title="Planet interior"
        orientation="concentric"
        layers={[{ name: 'Upper Mantle Transition Zone', thickness: 10 }]}
      />,
    );
    const label = container.querySelector('text.lr-xs-ring-lbl')!;
    expect(visibleText(label).length).toBeLessThanOrEqual(16);
    expect(visibleText(label).endsWith('…')).toBe(true);
    expect(label.querySelector('title')?.textContent).toBe('Upper Mantle Transition Zone');
  });
});

describe('CrossSection — horizontal orientation', () => {
  it('truncates a band label longer than the available width instead of overflowing the viewBox', () => {
    const { container } = render(
      <CrossSection title="Earth's crust" orientation="horizontal" layers={layers(3, true)} />,
    );
    const svg = container.querySelector('svg.lr-xs-svg')!;
    const viewBox = svg.getAttribute('viewBox')!.split(' ').map(Number);
    const vbWidth = viewBox[2];

    const names = Array.from(container.querySelectorAll('text.lr-xs-band-name'));
    expect(names).toHaveLength(3);
    for (const name of names) {
      const x = Number(name.getAttribute('x'));
      // Rough width estimate: bold 12px SVG text averages ~7.5px/char. The visible (truncated)
      // text plus its x-origin must stay inside the viewBox — the untruncated 40+ char names in
      // this fixture would have run roughly 300px past a 320-unit viewBox before the fix.
      const estWidth = visibleText(name).length * 7.5;
      expect(x + estWidth).toBeLessThanOrEqual(vbWidth);
      // Full text preserved via native tooltip.
      expect(name.querySelector('title')?.textContent).toMatch(/^Sedimentary Layer Formation/);
    }
  });

  it('leaves a short band label untouched with no tooltip', () => {
    const { container } = render(
      <CrossSection title="Earth's crust" orientation="horizontal" layers={layers(2)} />,
    );
    const names = Array.from(container.querySelectorAll('text.lr-xs-band-name'));
    expect(names.map((n) => visibleText(n))).toEqual(['Layer 1', 'Layer 2']);
    expect(container.querySelector('.lr-xs-band-name title')).toBeNull();
  });
});

// Regression coverage for a real bug: .dm-label had no overflow-wrap, so a milestone label
// longer than the short demo fixture ("Walks independently") rendered as one unbroken run and
// overflowed past the card's edge instead of wrapping inside it, matching a class of bug already
// fixed elsewhere in the family (.lr-wx-label, .lr-qz-opttext, .bm-legend-name).

describe('DevelopmentMilestone', () => {
  function props(labels: string[]): DevelopmentMilestoneProps {
    return {
      title: 'Development Milestones',
      ageLabel: '18 months',
      domains: [
        {
          domain: 'language',
          milestones: labels.map((label, i) => ({
            label,
            achieved: i % 2 === 0,
            note: i === 0 ? 'observed at last checkup' : undefined,
          })),
        },
      ],
    };
  }

  it('keeps the full, untruncated label text in the DOM for a name far longer than the demo fixture', () => {
    const longLabel =
      'Uses two-to-three word combinations spontaneously in everyday conversational speech without prompting';
    const { container } = render(
      <DevelopmentMilestone {...props(['Short label', longLabel, 'Another one'])} />,
    );
    const labels = Array.from(container.querySelectorAll<HTMLSpanElement>('.dm-label'));
    expect(labels).toHaveLength(3);
    // No component-side clipping/truncation exists for this block — the long string must survive
    // verbatim; illegibility is prevented by CSS wrap, not by dropping text.
    expect(labels[1]?.textContent).toBe(longLabel);
  });

  it('renders every milestone row without collapsing or dropping items at a count well past the demo', () => {
    const n = 10;
    const labels = Array.from(
      { length: n },
      (_, i) => `Milestone number ${i + 1} with a fairly long descriptive name that keeps going`,
    );
    const { container } = render(<DevelopmentMilestone {...props(labels)} />);
    const rows = Array.from(container.querySelectorAll('.dm-milestone'));
    const rendered = Array.from(container.querySelectorAll<HTMLSpanElement>('.dm-label'));
    expect(rows).toHaveLength(n);
    expect(rendered.map((el) => el.textContent)).toEqual(labels);
  });

  it('constrains .dm-label to wrap inside its card instead of forcing the row wider', () => {
    // jsdom has no layout engine (vitest config runs with css: false), so assert the CSS
    // contract directly: the label must be allowed to break anywhere, and its flex-column
    // ancestor must not hold it to its content's natural (unwrapped) width.
    const css = readFileSync(join(__dirname, '..', 'src/canvas/blocks/learn/styles.css'), 'utf8');
    const labelRule = css.match(/\.dm-label\s*\{[^}]*\}/)?.[0] ?? '';
    expect(labelRule).toMatch(/overflow-wrap:\s*anywhere/);

    const textRule = css.match(/\.dm-text\s*\{[^}]*\}/)?.[0] ?? '';
    expect(textRule).toMatch(/min-width:\s*0/);
  });
});

describe('EquationBlock', () => {
  // The quadratic formula as an AST: x = (−b ± √(b²−4ac)) / 2a
  const quadratic: MathNode = {
    t: 'row',
    items: [
      { t: 'ident', v: 'x' },
      { t: 'op', v: '=' },
      {
        t: 'frac',
        num: {
          t: 'row',
          items: [
            { t: 'op', v: '−' },
            { t: 'ident', v: 'b' },
            { t: 'op', v: '±' },
            { t: 'sqrt', arg: { t: 'row', items: [{ t: 'ident', v: 'b' }] } },
          ],
        },
        den: {
          t: 'row',
          items: [
            { t: 'num', v: '2' },
            { t: 'ident', v: 'a' },
          ],
        },
      },
    ],
  };

  it('renders native MathML for the equation', () => {
    const { container } = render(<EquationBlock title="Quadratic formula" math={quadratic} />);
    // Real MathML elements are emitted (not an image, not LaTeX text). jsdom exposes them as
    // generic Elements, so assert by tag presence rather than toBeInTheDocument.
    expect(container.getElementsByTagName('math')).toHaveLength(1);
    expect(container.getElementsByTagName('mfrac').length).toBeGreaterThan(0);
    expect(container.getElementsByTagName('msqrt').length).toBeGreaterThan(0);
  });
  it('shows the equation number and caption', () => {
    render(
      <EquationBlock title="Eq" math={{ t: 'num', v: '1' }} number="(3)" caption="the unit" />,
    );
    expect(screen.getByText('(3)')).toBeInTheDocument();
    expect(screen.getByText('the unit')).toBeInTheDocument();
  });
  it('routes an explicit LaTeX `tex` prop through the KaTeX path', () => {
    const { container } = render(
      <EquationBlock title="Eigen" tex="A\mathbf{v} = \lambda\mathbf{v}" />,
    );
    // KaTeX is fetched from a CDN (absent in jsdom), so the component shows the raw-LaTeX
    // fallback — the deterministic contract: it took the tex path, not the MathNode renderer.
    const tex = container.querySelector('.lr-tex');
    expect(tex).toBeTruthy();
    expect(tex?.textContent).toContain('mathbf');
    expect(container.getElementsByTagName('mfrac')).toHaveLength(0);
  });
  it('treats a backslash-bearing `math` string as LaTeX', () => {
    const { container } = render(<EquationBlock title="Frac" math={'\\frac{a}{b}'} />);
    expect(container.querySelector('.lr-tex')).toBeTruthy();
  });
  it('still renders a plain (non-LaTeX) `math` string as MathML', () => {
    const { container } = render(<EquationBlock title="Var" math={'x'} />);
    expect(container.getElementsByTagName('math')).toHaveLength(1);
    expect(container.querySelector('.lr-tex')).toBeNull();
  });
});

// Regression coverage for a real bug: the fraction label and decimal readout had no width
// constraint, so a caller-supplied label longer than the demo fixture's ("½", "¾", "⅔") or a
// large denominator overflowed the row and bled past the card edge instead of truncating.

describe('FractionBar', () => {
  const CONTAINER_WIDTH = 260; // narrower than a long label's natural rendered width

  function renderConstrained(node: React.ReactElement) {
    return render(<div style={{ width: CONTAINER_WIDTH }}>{node}</div>);
  }

  it('constrains a long custom label to the row width instead of overflowing', () => {
    const longLabel = 'Probability of drawing a red marble from the bag on the first try';
    const { container } = renderConstrained(
      <FractionBar
        title="Long label"
        fractions={[{ numerator: 1, denominator: 8, label: longLabel }]}
      />,
    );
    const fraction = container.querySelector<HTMLElement>('.lr-fb-fraction');
    expect(fraction).toBeTruthy();
    expect(fraction!.textContent).toBe(longLabel);
    // The full text is preserved in the DOM (for a11y / copy), but the rendered box must be
    // capped and clipped rather than left to grow past its row.
    expect(fraction!.style.maxWidth).toBe('100%');
    expect(fraction!.style.overflow).toBe('hidden');
    expect(fraction!.style.textOverflow).toBe('ellipsis');
  });

  it('constrains a large denominator so the decimal readout does not overflow', () => {
    const { container } = renderConstrained(
      <FractionBar title="Large denominator" fractions={[{ numerator: 37, denominator: 97 }]} />,
    );
    const decimal = container.querySelector<HTMLElement>('.lr-fb-decimal');
    expect(decimal).toBeTruthy();
    expect(decimal!.style.maxWidth).toBe('100%');
    expect(decimal!.style.overflow).toBe('hidden');
    expect(decimal!.style.textOverflow).toBe('ellipsis');
  });

  it('scales past the demo fixture (3 rows) without any row losing its width cap', () => {
    const fractions = Array.from({ length: 10 }, (_, i) => ({
      numerator: i + 1,
      denominator: 97,
      label: `Extremely long descriptive row label number ${i + 1} for stress testing`,
    }));
    const { container } = renderConstrained(
      <FractionBar title="Many long rows" fractions={fractions} />,
    );
    const rows = container.querySelectorAll('.lr-fb-row');
    expect(rows).toHaveLength(10);
    const fractionSpans = container.querySelectorAll<HTMLElement>('.lr-fb-fraction');
    const decimalSpans = container.querySelectorAll<HTMLElement>('.lr-fb-decimal');
    expect(fractionSpans).toHaveLength(10);
    expect(decimalSpans).toHaveLength(10);
    for (const span of [...fractionSpans, ...decimalSpans]) {
      expect(span.style.maxWidth).toBe('100%');
      expect(span.style.overflow).toBe('hidden');
      expect(span.style.textOverflow).toBe('ellipsis');
    }
  });
});

// Regression coverage for a real bug: force labels are placed at a fixed offset beyond the
// arrowhead with no wrap and no width check. A model-authored label longer than the demo
// fixture's ("Weight", "Normal") — or several forces packed around the same small object —
// used to run past the SVG viewBox edge and collide with neighbouring labels/arrows.

describe('FreeBodyDiagram', () => {
  it('truncates a long force label instead of letting it overflow the diagram', () => {
    const forces: FBDForce[] = [
      { label: 'Applied horizontal friction force', angle: 0, magnitude: 12 },
    ];
    const { container } = render(<FreeBodyDiagram title="Block on a ramp" forces={forces} />);
    const labelNodes = Array.from(container.querySelectorAll('text.fbd-lbl'));
    expect(labelNodes).toHaveLength(1);
    // No rendered label's visible glyphs may run longer than the character budget the
    // component truncates to — an unbounded string is what caused the overflow.
    for (const node of labelNodes) {
      expect(visibleText(node).length).toBeLessThanOrEqual(14);
    }
    expect(visibleText(labelNodes[0]).endsWith('…')).toBe(true);
    // The untruncated string is still available, via a native <title> tooltip — nothing is
    // silently lost, it's just not painted wider than the diagram.
    const titles = Array.from(container.querySelectorAll('title')).map((t) => t.textContent);
    expect(titles).toContain('Applied horizontal friction force');
  });

  it('leaves a short force label untouched', () => {
    const forces: FBDForce[] = [
      { label: 'Weight', angle: 270, magnitude: 10 },
      { label: 'Normal', angle: 90, magnitude: 10 },
    ];
    const { container } = render(<FreeBodyDiagram title="Block at rest" forces={forces} />);
    const labelNodes = Array.from(container.querySelectorAll('text.fbd-lbl'));
    expect(labelNodes).toHaveLength(2);
    expect(labelNodes.map((n) => visibleText(n))).toEqual(['Weight', 'Normal']);
    expect(container.querySelector('title')).toBeNull();
  });

  it('renders many forces around the same object with no label exceeding the char budget', () => {
    // More forces than any demo fixture uses — every one still needs a legible, bounded label.
    const forces: FBDForce[] = [
      { label: 'Gravitational pull downward', angle: 270, magnitude: 10 },
      { label: 'Normal reaction from surface', angle: 90, magnitude: 10 },
      { label: 'Applied push to the right', angle: 0, magnitude: 8 },
      { label: 'Kinetic friction opposing motion', angle: 180, magnitude: 3 },
      { label: 'Air resistance drag force', angle: 200, magnitude: 2 },
      { label: 'Tension', angle: 45, magnitude: 6 },
    ];
    const { container } = render(<FreeBodyDiagram title="Crowded object" forces={forces} />);
    const labelNodes = Array.from(container.querySelectorAll('text.fbd-lbl'));
    expect(labelNodes).toHaveLength(forces.length);
    for (const node of labelNodes) {
      expect(visibleText(node).length).toBeLessThanOrEqual(14);
    }
    // The SVG itself stays fixed-size (overflow containment lives at the viewBox/CSS level);
    // labels must fit within it rather than growing it.
    const svg = container.querySelector('svg.fbd-svg');
    expect(svg).toBeTruthy();
    expect(svg?.getAttribute('viewBox')).toBe('0 0 420 340');
  });
});

// Regression coverage for a real bug: the dot label sits inside a small fretted-note circle
// (r=5-6 SVG units) painted at a fixed 6.5px font-size — fine for the demo fixture's 1-2 char
// interval shorthand ("R", "b3", "5", "b7") but a longer note/interval label ("bVII", "maj7")
// overflowed that circle at the same size. The fix scales the font down as the label grows.

describe('FretboardMap', () => {
  const SHORT_LABELS: FretDot[] = [
    { string: 6, fret: 5, label: 'R', role: 'root' },
    { string: 5, fret: 5, label: '4', role: 'other' },
    { string: 5, fret: 7, label: '5', role: 'fifth' },
  ];

  const LONG_LABELS: FretDot[] = [
    { string: 6, fret: 5, label: 'bVII', role: 'root' },
    { string: 5, fret: 5, label: 'maj7', role: 'other' },
    { string: 5, fret: 7, label: 'sus4', role: 'fifth' },
  ];

  function labelFontSizes(container: HTMLElement) {
    return Array.from(container.querySelectorAll<SVGTextElement>('text.fbm-dot-lbl')).map((t) =>
      Number((t.style.fontSize || '').replace('px', '')),
    );
  }

  it("keeps the demo fixture's short (1-2 char) labels at full size", () => {
    const { container } = render(
      <FretboardMap title="Shape" dots={SHORT_LABELS} scaleName="Test shape" />,
    );
    const sizes = labelFontSizes(container);
    expect(sizes).toHaveLength(SHORT_LABELS.length);
    for (const size of sizes) {
      expect(size).toBeCloseTo(6.5);
    }
  });

  it('shrinks labels longer than 2 characters so they still fit inside the dot circle', () => {
    const { container } = render(
      <FretboardMap title="Shape" dots={LONG_LABELS} scaleName="Test shape" />,
    );
    const dots = Array.from(container.querySelectorAll<SVGCircleElement>('circle.fbm-dot'));
    const sizes = labelFontSizes(container);
    expect(sizes).toHaveLength(LONG_LABELS.length);

    for (let i = 0; i < LONG_LABELS.length; i++) {
      const label = LONG_LABELS[i].label!;
      const fontSize = sizes[i];
      const r = Number(dots[i].getAttribute('r'));
      // Strictly smaller than the short-label baseline — this is the regression the bug allowed:
      // every label painted at the same 6.5px regardless of length.
      expect(fontSize).toBeLessThan(6.5);
      // A conservative average-glyph-width estimate (monospace-ish upper bound for bold text)
      // must fit within the dot's diameter, so the label never bleeds past its own circle.
      const estWidth = label.length * fontSize * 0.62;
      expect(estWidth).toBeLessThanOrEqual(r * 2);
    }
  });

  it('shrinks a 3-char label less than a 4+ char label', () => {
    const dots: FretDot[] = [
      { string: 6, fret: 5, label: 'b13', role: 'other' },
      { string: 5, fret: 5, label: 'maj7', role: 'other' },
    ];
    const { container } = render(<FretboardMap title="Shape" dots={dots} />);
    const [threeChar, fourChar] = labelFontSizes(container);
    expect(threeChar).toBeGreaterThan(fourChar);
    expect(threeChar).toBeLessThan(6.5);
  });
});

// Regression coverage for two real bugs: point labels used a fixed 3px pixel offset that
// assumed short single-character labels ("A", "B") — long labels or a cluster of 10+ points
// overlapped illegibly. Vector labels used a fixed 10px perpendicular offset from the midpoint,
// which collided once vectors clustered or a label was wider than the vector was long.

describe('GeometryCanvas point labels', () => {
  /** Axis-aligned box a <text> node's visible glyphs occupy, from its own attributes (no DOM
      text metrics in jsdom) — mirrors the same per-char estimate the component itself uses. */
  function textBox(el: SVGTextElement) {
    const x = Number(el.getAttribute('x'));
    const y = Number(el.getAttribute('y'));
    const fontSize = 9; // .lr-gc-pt-lbl / .lr-gc-vec-lbl font-size
    const charW = fontSize * 0.62;
    const w = (el.textContent ?? '').length * charW;
    const h = fontSize * 1.15;
    const anchor = el.getAttribute('text-anchor') ?? 'start';
    const left = anchor === 'end' ? x - w : anchor === 'middle' ? x - w / 2 : x;
    return { left, right: left + w, top: y - h / 2, bottom: y + h / 2 };
  }

  function overlaps(a: ReturnType<typeof textBox>, b: ReturnType<typeof textBox>) {
    return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  }

  function manyPoints(n: number, longLabels: boolean): GeoPoint[] {
    // Cram points close together (a tight cluster within a couple of data units) so the demo
    // fixture's generous spacing can't hide the bug — this is the "10+ points" failure case.
    return Array.from({ length: n }, (_, i) => ({
      x: (i % 5) * 0.6,
      y: Math.floor(i / 5) * 0.6,
      label: longLabels ? `Vertex ${i} (measured)` : String.fromCharCode(65 + (i % 26)),
    }));
  }

  it('spaces out labels for a dense cluster of points with no overlap', () => {
    const points = manyPoints(12, false);
    const { container } = render(<GeometryCanvas title="Cluster" points={points} />);
    const labels = Array.from(container.querySelectorAll<SVGTextElement>('text.lr-gc-pt-lbl'));
    expect(labels).toHaveLength(12);
    const boxes = labels.map(textBox);
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        expect(overlaps(boxes[i], boxes[j])).toBe(false);
      }
    }
  });

  it('gives long labels enough clearance from their own point (not the old fixed 3px)', () => {
    const points = manyPoints(6, true);
    const { container } = render(<GeometryCanvas title="Long labels" points={points} />);
    const labels = Array.from(container.querySelectorAll<SVGTextElement>('text.lr-gc-pt-lbl'));
    expect(labels).toHaveLength(6);
    const boxes = labels.map(textBox);
    // No two long labels may collide even though they sit on a tight grid.
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        expect(overlaps(boxes[i], boxes[j])).toBe(false);
      }
    }
  });

  it('stays within the fixed SVG viewBox regardless of label count', () => {
    const points = manyPoints(20, true);
    const { container } = render(<GeometryCanvas title="Many" points={points} />);
    // The card-eyebrow icon is also an <svg> — select the plot itself, not the icon.
    const svg = container.querySelector('svg.lr-gc-svg')!;
    const [, , vbW, vbH] = (svg.getAttribute('viewBox') ?? '0 0 320 256').split(' ').map(Number);
    const labels = Array.from(container.querySelectorAll<SVGTextElement>('text.lr-gc-pt-lbl'));
    expect(labels.length).toBeGreaterThan(0);
    // The clipPath only bounds the plotted geometry, not point labels (they intentionally sit
    // just outside dots near the plot edge) — but they must still land within the drawable
    // frame, not fly off into arbitrary territory the card can't show.
    for (const box of labels.map(textBox)) {
      expect(box.left).toBeGreaterThan(-40);
      expect(box.right).toBeLessThan(vbW + 40);
      expect(box.top).toBeGreaterThan(-40);
      expect(box.bottom).toBeLessThan(vbH + 40);
    }
  });
});

describe('GeometryCanvas vector labels', () => {
  it('clears each label off its own short shaft on a cluster of radiating vectors', () => {
    // Six short vectors radiating from nearly the same origin with longer-than-single-char
    // labels — the old fixed 10px push couldn't clear a wide label off a short shaft, so the
    // label's box straddled its own line (and, once several radiate from one point, each
    // other). Each label's box must clear its own vector's midpoint by at least half its width.
    const vectors: GeoVector[] = Array.from({ length: 6 }, (_, i) => {
      const angle = (i / 6) * Math.PI * 2;
      return {
        x: 0,
        y: 0,
        dx: Math.cos(angle) * 0.8,
        dy: Math.sin(angle) * 0.8,
        label: `Force ${i}`,
      };
    });
    const { container } = render(<GeometryCanvas title="Forces" vectors={vectors} />);
    const labels = Array.from(container.querySelectorAll<SVGTextElement>('text.lr-gc-vec-lbl'));
    const lines = Array.from(container.querySelectorAll<SVGLineElement>('line.lr-gc-vec'));
    expect(labels).toHaveLength(6);
    expect(lines).toHaveLength(6);
    for (let i = 0; i < labels.length; i++) {
      const x = Number(labels[i].getAttribute('x'));
      const y = Number(labels[i].getAttribute('y'));
      const w = (labels[i].textContent ?? '').length * (9 * 0.62);
      const x1 = Number(lines[i].getAttribute('x1'));
      const y1 = Number(lines[i].getAttribute('y1'));
      const x2 = Number(lines[i].getAttribute('x2'));
      const y2 = Number(lines[i].getAttribute('y2'));
      const midX = (x1 + x2) / 2;
      const midY = (y1 + y2) / 2;
      const distFromMid = Math.hypot(x - midX, y - midY);
      expect(distFromMid).toBeGreaterThan(w / 2);
    }
  });

  it('scales the perpendicular offset past the old fixed 10px for a long label', () => {
    // Same short vector, geometrically identical to what the old fixed-10px placement handled —
    // only the label length changes, so any offset growth is attributable to the fix.
    const vectors: GeoVector[] = [{ x: 0, y: 0, dx: 0.15, dy: 0.05, label: 'Displacement vector' }];
    const { container } = render(<GeometryCanvas title="Short vector" vectors={vectors} />);
    const label = container.querySelector<SVGTextElement>('text.lr-gc-vec-lbl');
    expect(label).toBeTruthy();
    const x = Number(label!.getAttribute('x'));
    const y = Number(label!.getAttribute('y'));
    const line = container.querySelector<SVGLineElement>('line.lr-gc-vec')!;
    const x1 = Number(line.getAttribute('x1'));
    const y1 = Number(line.getAttribute('y1'));
    const x2 = Number(line.getAttribute('x2'));
    const y2 = Number(line.getAttribute('y2'));
    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;
    const perpOffset = Math.hypot(x - midX, y - midY);
    // The old code placed every vector label exactly 10px from the midpoint regardless of
    // label length; a label this long must now push out well beyond that fixed distance.
    expect(perpOffset).toBeGreaterThan(15);
  });

  it('does not grow the offset for a short label on a normal-length vector (no regression)', () => {
    const vectors: GeoVector[] = [{ x: 0, y: 0, dx: 2, dy: 1, label: 'v' }];
    const { container } = render(<GeometryCanvas title="Normal vector" vectors={vectors} />);
    const label = container.querySelector<SVGTextElement>('text.lr-gc-vec-lbl');
    const line = container.querySelector<SVGLineElement>('line.lr-gc-vec')!;
    const x1 = Number(line.getAttribute('x1'));
    const y1 = Number(line.getAttribute('y1'));
    const x2 = Number(line.getAttribute('x2'));
    const y2 = Number(line.getAttribute('y2'));
    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;
    const x = Number(label!.getAttribute('x'));
    const y = Number(label!.getAttribute('y'));
    const perpOffset = Math.hypot(x - midX, y - midY);
    // Stays near the historical 10px floor — a one-character label shouldn't trigger the
    // width-driven growth that long labels need.
    expect(perpOffset).toBeGreaterThanOrEqual(10);
    expect(perpOffset).toBeLessThan(13);
  });
});

describe('GridMatrix', () => {
  it('renders every cell of a labelled grid', () => {
    render(
      <GridMatrix
        title="Multiplication"
        rowHeaders={['1', '2']}
        colHeaders={['×', 'a', 'b']}
        cells={[
          ['r1', '1a', '1b'],
          ['r2', '2a', '2b'],
        ]}
      />,
    );
    expect(screen.getByText('1a')).toBeInTheDocument();
    expect(screen.getByText('2b')).toBeInTheDocument();
  });
  it('emits no React key warning when mapping rows (each row is a keyed Fragment)', () => {
    // A keyless `<>` returned from cells.map triggers "unique key" warnings on every
    // grid render. Spy on console.error and assert the grid renders cleanly.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <GridMatrix
        title="Truth table"
        variant="truth"
        rowHeaders={['p∧q', 'p∨q', 'p→q']}
        colHeaders={['', 'TT', 'TF', 'FT', 'FF']}
        cells={[
          ['', 'T', 'F', 'F', 'F'],
          ['', 'T', 'T', 'T', 'F'],
          ['', 'T', 'F', 'T', 'T'],
        ]}
      />,
    );
    const keyWarning = spy.mock.calls.some((args) =>
      args.some((a) => typeof a === 'string' && a.includes('unique "key"')),
    );
    spy.mockRestore();
    expect(keyWarning).toBe(false);
  });
});

// Regression coverage for a real bug: the stroke-order index circles fan out across a
// fixed-width band with a hardcoded radius, so they packed tighter as stroke count grew and
// started to overlap illegibly well beyond the ~2-4 stroke demo fixture (letters with more
// complex formation — e.g. a decorative capital, or a CJK-style stroke count — send many more).

describe('LetterForm', () => {
  function strokes(n: number): LetterStroke[] {
    return Array.from({ length: n }, (_, i) => ({
      order: i + 1,
      hint: `Stroke ${i + 1}`,
    }));
  }

  function indexCircles(container: HTMLElement) {
    return Array.from(container.querySelectorAll<SVGCircleElement>('circle.lr-lf-index')).map(
      (c) => ({
        cx: Number(c.getAttribute('cx')),
        cy: Number(c.getAttribute('cy')),
        r: Number(c.getAttribute('r')),
      }),
    );
  }

  it.each([2, 4, 8, 14, 20])(
    'fans %i stroke-order indices without any circle overlapping its neighbor',
    (n) => {
      const { container } = render(
        <LetterForm title="Formation" letter="a" strokes={strokes(n)} />,
      );
      const circles = indexCircles(container);
      expect(circles).toHaveLength(n);

      // Sorted left-to-right (they're already authored in fan order, but don't assume it).
      circles.sort((a, b) => a.cx - b.cx);
      for (let i = 1; i < circles.length; i++) {
        const dx = circles[i].cx - circles[i - 1].cx;
        // Two circles don't overlap iff the distance between centers is at least the sum of
        // their radii. A fixed radius that ignored stroke count violated this once the fan
        // packed circles closer together than 2×r.
        expect(dx).toBeGreaterThanOrEqual(circles[i].r + circles[i - 1].r);
      }
    },
  );

  it('keeps a single stroke at the full-size radius (no shrinking needed)', () => {
    const { container } = render(<LetterForm title="Formation" letter="l" strokes={strokes(1)} />);
    const circles = indexCircles(container);
    expect(circles).toHaveLength(1);
    expect(circles[0].r).toBeGreaterThanOrEqual(8);
  });

  it('keeps circles positive-sized and non-overlapping even at an extreme stroke count', () => {
    // Well beyond anything a real letter needs, but the invariant that matters is "never
    // overlap" — a radius floor must never be allowed to win over that and collide circles.
    const { container } = render(<LetterForm title="Formation" letter="m" strokes={strokes(40)} />);
    const circles = indexCircles(container).sort((a, b) => a.cx - b.cx);
    expect(circles).toHaveLength(40);
    for (const c of circles) {
      expect(c.r).toBeGreaterThan(0);
    }
    for (let i = 1; i < circles.length; i++) {
      const dx = circles[i].cx - circles[i - 1].cx;
      expect(dx).toBeGreaterThanOrEqual(circles[i].r + circles[i - 1].r);
    }
  });
});

// Regression coverage for a real bug: spectral line labels were placed with a single fixed
// y-offset above the strip and no collision detection, so a dense series (many lines close
// together in wavelength — well beyond the sparse demo fixture) printed overlapping, illegible
// text. Labels close enough to collide must alternate onto a further-back row instead.

describe('LineSpectrum', () => {
  const VIEWBOX_W = 340; // must track LineSpectrum.tsx's internal W

  /** Approximate rendered half-width of a centred SVG text label at the .ls-label font-size,
   *  matching the component's own LABEL_CHAR_W estimate. */
  function halfWidth(text: string): number {
    return (text.length * 5.2) / 2;
  }

  function readLabels(container: HTMLElement) {
    return Array.from(container.querySelectorAll<SVGTextElement>('text.ls-label')).map((t) => ({
      x: Number(t.getAttribute('x')),
      y: Number(t.getAttribute('y')),
      text: t.textContent ?? '',
    }));
  }

  /** A dense run of full "###.# nm" labels spread evenly across the visible range — the
   *  labels are wide enough, and packed close enough, that a single unstaggered row can't
   *  fit them without overlap (verified against the component's own width estimate). */
  function denseFixture(n = 20): SpectrumLine[] {
    return Array.from({ length: n }, (_, i) => {
      const wavelength = 400 + i * (300 / (n - 1));
      return { wavelength, label: `${wavelength.toFixed(1)} nm` };
    });
  }

  it('alternates rows for closely spaced labels instead of overlapping them', () => {
    // 20 wide labels spread across the full visible range — well beyond the 3-line demo
    // fixture — collide with their neighbours at a single fixed y if rows weren't staggered.
    const lines = denseFixture();
    const { container } = render(<LineSpectrum title="Dense series" lines={lines} />);

    const labels = readLabels(container);
    expect(labels).toHaveLength(lines.length);

    // Group by y (row) and confirm no two labels sharing a row have overlapping text boxes.
    const rows = new Map<number, { x: number; text: string }[]>();
    for (const l of labels) {
      const row = rows.get(l.y) ?? [];
      row.push({ x: l.x, text: l.text });
      rows.set(l.y, row);
    }
    // 20 "###.# nm" labels can't all fit a single row without collision — the fix must have
    // used more than one row.
    expect(rows.size).toBeGreaterThan(1);

    for (const row of rows.values()) {
      const sorted = [...row].sort((a, b) => a.x - b.x);
      for (let i = 1; i < sorted.length; i++) {
        const prevRight = sorted[i - 1].x + halfWidth(sorted[i - 1].text);
        const curLeft = sorted[i].x - halfWidth(sorted[i].text);
        expect(curLeft).toBeGreaterThanOrEqual(prevRight);
      }
    }
  });

  it('keeps every label within the chart viewBox width', () => {
    const lines = denseFixture();
    const { container } = render(<LineSpectrum title="Dense series" lines={lines} />);
    const labels = readLabels(container);
    for (const l of labels) {
      expect(l.x - halfWidth(l.text)).toBeGreaterThanOrEqual(0);
      expect(l.x + halfWidth(l.text)).toBeLessThanOrEqual(VIEWBOX_W);
    }
  });

  it('grows the viewBox height to fit stacked label rows without clipping', () => {
    const sparse: SpectrumLine[] = [
      { wavelength: 434, label: 'Hγ' },
      { wavelength: 486, label: 'Hβ' },
      { wavelength: 656, label: 'Hα' },
    ];
    const dense = denseFixture();

    const { container: sparseContainer } = render(
      <LineSpectrum title="Balmer series" lines={sparse} />,
    );
    const { container: denseContainer } = render(
      <LineSpectrum title="Dense series" lines={dense} />,
    );

    const sparseSvg = sparseContainer.querySelector('svg.ls-svg')!;
    const denseSvg = denseContainer.querySelector('svg.ls-svg')!;
    const sparseH = Number(sparseSvg.getAttribute('viewBox')!.split(' ')[3]);
    const denseH = Number(denseSvg.getAttribute('viewBox')!.split(' ')[3]);

    // The dense case needed extra label rows, so its viewBox must be taller — a fixed height
    // would have let the second row's text clip past the top edge of the card.
    expect(denseH).toBeGreaterThan(sparseH);

    // And every label — including the stacked-back ones — still sits at or below the top edge.
    for (const svg of [sparseSvg, denseSvg]) {
      for (const t of Array.from(svg.querySelectorAll<SVGTextElement>('text.ls-label'))) {
        expect(Number(t.getAttribute('y'))).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('renders a sparse, well-separated series on a single row (no regression for the common case)', () => {
    const lines: SpectrumLine[] = [
      { wavelength: 434, label: 'Hγ' },
      { wavelength: 486, label: 'Hβ' },
      { wavelength: 656, label: 'Hα' },
    ];
    const { container } = render(<LineSpectrum title="Balmer series" lines={lines} />);
    const labels = readLabels(container);
    expect(labels).toHaveLength(3);
    const ys = new Set(labels.map((l) => l.y));
    expect(ys.size).toBe(1);
  });
});

// Regression coverage for a real bug: point and interval labels were drawn at a single fixed
// y-offset above the axis with no wrapping or collision handling, so densely packed points (or
// long interval labels sharing the same x-neighbourhood) rendered illegibly on top of each
// other. Densely packed/long labels now stack onto alternating rows instead of colliding, and
// the SVG viewBox grows to fit whatever row count that produced.

describe('NumberLine', () => {
  // Mirrors the component's own LABEL_CHAR_W (px per glyph at the 9.5px label font) so the test's
  // overlap check reasons in the same units the collision-avoidance pass does.
  const LABEL_CHAR_W = 5.4;

  /** A label's centre x from its `text-anchor="middle"` x attribute, and its approximate rendered
   *  half-width in pixels — enough to detect two same-row labels whose boxes truly overlap. */
  function box(node: SVGTextElement): { cx: number; y: number; halfWidth: number } {
    const cx = Number(node.getAttribute('x'));
    const y = Number(node.getAttribute('y'));
    const halfWidth = ((node.textContent?.length ?? 0) * LABEL_CHAR_W) / 2;
    return { cx, y, halfWidth };
  }

  function overlaps(a: ReturnType<typeof box>, b: ReturnType<typeof box>): boolean {
    if (a.y !== b.y) return false; // different rows never collide
    const aLeft = a.cx - a.halfWidth;
    const aRight = a.cx + a.halfWidth;
    const bLeft = b.cx - b.halfWidth;
    const bRight = b.cx + b.halfWidth;
    return aLeft < bRight && bLeft < aRight;
  }

  it('renders nice ticks across the range with formatted labels', () => {
    render(<NumberLine title="Integers" min={-10} max={10} />);
    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText('-10')).toBeInTheDocument();
  });
  it('plots labelled points', () => {
    render(<NumberLine title="Pt" min={0} max={5} points={[{ value: 3, label: 'here' }]} />);
    expect(screen.getByText('here')).toBeInTheDocument();
  });

  it('staggers densely packed point labels instead of overlapping them', () => {
    // Eight labelled points packed tightly into a 0-10 range with longer labels than the
    // two-point demo fixture uses — at a single fixed y, neighbouring labels' text boxes would
    // overlap illegibly.
    const points = Array.from({ length: 8 }, (_, i) => ({
      value: i * 1.2,
      label: `Point ${i}`,
    }));
    const { container } = render(
      <NumberLine title="Dense points" min={0} max={10} points={points} />,
    );
    const labels = Array.from(container.querySelectorAll<SVGTextElement>('.lr-nl-plbl')).map(box);
    expect(labels).toHaveLength(8);
    for (let i = 0; i < labels.length; i++) {
      for (let j = i + 1; j < labels.length; j++) {
        expect(overlaps(labels[i], labels[j])).toBe(false);
      }
    }
    // Collisions were resolved by stacking onto more than one row, not by coincidence.
    const rowYs = new Set(labels.map((l) => l.y));
    expect(rowYs.size).toBeGreaterThan(1);
  });

  it('staggers long interval labels that would otherwise overlap neighbouring points', () => {
    const { container } = render(
      <NumberLine
        title="Long interval label"
        min={0}
        max={100}
        points={[{ value: 62, label: 'Current standing' }]}
        intervals={[{ from: 55, to: 75, label: 'Passing range for this assessment' }]}
      />,
    );
    const ivLabels = Array.from(container.querySelectorAll<SVGTextElement>('.lr-nl-ivlbl')).map(
      box,
    );
    const ptLabels = Array.from(container.querySelectorAll<SVGTextElement>('.lr-nl-plbl')).map(box);
    expect(ivLabels).toHaveLength(1);
    expect(ptLabels).toHaveLength(1);
    expect(overlaps(ivLabels[0], ptLabels[0])).toBe(false);
  });

  it('grows the viewBox to fit stacked label rows instead of clipping them', () => {
    const points = Array.from({ length: 6 }, (_, i) => ({
      value: i * 1.2,
      label: `Value ${i}`,
    }));
    const { container } = render(
      <NumberLine title="Tall stack" min={0} max={10} points={points} />,
    );
    const svg = container.querySelector('svg.lr-nl-svg')!;
    const viewBox = svg.getAttribute('viewBox')!.split(' ').map(Number);
    const [, , , vbHeight] = viewBox;
    const labels = Array.from(container.querySelectorAll<SVGTextElement>('.lr-nl-plbl'));
    // Every label's y must fall inside the viewBox — nothing stacked above row 0 renders
    // outside the box the surrounding card actually reserves.
    for (const label of labels) {
      const y = Number(label.getAttribute('y'));
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(vbHeight);
    }
    // With this many densely packed labels the box must have grown past the unlabelled base
    // height (92) to make room for the extra row(s).
    expect(vbHeight).toBeGreaterThan(92);
  });

  it('renders a single point/interval with no stacking needed', () => {
    const { container } = render(
      <NumberLine title="Simple" min={0} max={10} points={[{ value: 5, label: 'x' }]} />,
    );
    const label = container.querySelector<SVGTextElement>('.lr-nl-plbl')!;
    expect(label.getAttribute('y')).toBe('42'); // AXIS_Y(54) - 12, row 0
    const svg = container.querySelector('svg.lr-nl-svg')!;
    expect(svg.getAttribute('viewBox')).toBe('0 0 320 92');
  });
});

// Regression coverage for a real bug: every leaf word, POS tag, and phrase label is centred on a
// fixed 62px-wide (LEAF_GAP) slot with no width check — the demo fixture's short words ("the",
// "fox") and short tags ("N", "V", "NP") fit, but a model-authored long word
// ("Congratulations") or a multi-word phrase label ("Prepositional Phrase") runs well past its
// slot and bleeds into the neighbouring leaf.

describe('ParseTree', () => {
  it('truncates a long leaf word and POS tag instead of letting them overflow their slot', () => {
    const root: ParseTreeNode = {
      label: 'S',
      children: [
        { label: 'INTERJ', word: 'Congratulations' },
        { label: 'ADVERBIAL-PHRASE-MODIFIER', word: 'wholeheartedly' },
      ],
    };
    const { container } = render(<ParseTree title="Parse" root={root} />);

    const wordNodes = Array.from(container.querySelectorAll('text.prs-word'));
    const posNodes = Array.from(container.querySelectorAll('text.prs-pos'));
    expect(wordNodes).toHaveLength(2);
    expect(posNodes).toHaveLength(2);

    // Every rendered label's visible glyphs must fit inside the 62px leaf slot at its font-size —
    // none may be long enough to bleed into a neighbouring leaf.
    for (const node of [...wordNodes, ...posNodes]) {
      expect(visibleText(node).length).toBeLessThanOrEqual(10);
    }
    expect(visibleText(wordNodes[0]).endsWith('…')).toBe(true);
    expect(visibleText(posNodes[1]).endsWith('…')).toBe(true);

    // The untruncated strings are still available, via native <title> tooltips.
    const titles = Array.from(container.querySelectorAll('title')).map((t) => t.textContent);
    expect(titles).toContain('Congratulations');
    expect(titles).toContain('ADVERBIAL-PHRASE-MODIFIER');
  });

  it('truncates a long phrase (internal node) label', () => {
    const root: ParseTreeNode = {
      label: 'PREPOSITIONAL-PHRASE-MODIFIER',
      children: [
        { label: 'P', word: 'under' },
        { label: 'N', word: 'bridge' },
      ],
    };
    const { container } = render(<ParseTree title="Parse" root={root} />);

    const phraseNode = container.querySelector('text.prs-phrase');
    expect(phraseNode).toBeTruthy();
    expect(visibleText(phraseNode!).length).toBeLessThanOrEqual(10);
    expect(visibleText(phraseNode!).endsWith('…')).toBe(true);
    const title = phraseNode!.querySelector('title');
    expect(title?.textContent).toBe('PREPOSITIONAL-PHRASE-MODIFIER');
  });

  it('leaves short words, tags, and phrase labels untouched', () => {
    const root: ParseTreeNode = {
      label: 'S',
      children: [
        {
          label: 'NP',
          children: [
            { label: 'Det', word: 'The' },
            { label: 'N', word: 'fox' },
          ],
        },
        { label: 'VP', children: [{ label: 'V', word: 'jumps' }] },
      ],
    };
    const { container } = render(<ParseTree title="Parse" root={root} />);

    const wordNodes = Array.from(container.querySelectorAll('text.prs-word'));
    expect(wordNodes.map((n) => n.textContent)).toEqual(['The', 'fox', 'jumps']);
    const phraseNodes = Array.from(container.querySelectorAll('text.prs-phrase'));
    expect(phraseNodes.map((n) => n.textContent)).toEqual(['S', 'NP', 'VP']);
    expect(container.querySelector('title')).toBeNull();
  });
});

// Regression coverage for two real bugs: equilibrium type labels ("SN"/"Sa"/"C"/…) were drawn at
// a single fixed offset (px+6, py-5) from their marker, so any system whose equilibria cluster
// closer together than that offset — a saddle flanked by two nearby centers is a textbook case —
// rendered overlapping, illegible label text. Separately, the nullcline legend text sat at
// hardcoded pixel offsets from the card's right edge with no width containment, so a label wider
// than the "ẋ=0"/"ẏ=0" demo fixture could bleed past the card boundary.

describe('PhasePortrait', () => {
  const W = 320;
  const PAD_RIGHT = 16;

  // dx/dt = 6y, dy/dt = -40x(x² - 0.09) has three equilibria on y=0 at x = -0.3, 0, 0.3 — a saddle
  // (x=0) flanked by two centers (x=±0.3). At the component's fixed viewBox they land ~8.8px apart
  // on the SAME horizontal line, which is exactly the configuration the old fixed offset (always
  // px+6, py-5) could not separate: all three labels would start at the same y and overlap in x.
  const CLUSTERED_SYSTEM = {
    fx: '6*y',
    gy: '-40*x*(x^2 - 0.09)',
    xDomain: [-4, 4] as [number, number],
    yDomain: [-4, 4] as [number, number],
  };

  function equilibriumMarkers(container: HTMLElement) {
    // Each equilibrium's <g> holds its marker (circle or ×) followed by its label <text>.
    const groups = Array.from(container.querySelectorAll('svg > g')).filter((g) =>
      g.querySelector('text'),
    );
    return groups
      .map((g) => {
        const text = g.querySelector('text');
        const marker = g.querySelector('circle') ?? g.querySelector('line');
        return {
          label: text?.textContent ?? '',
          lx: Number(text?.getAttribute('x')),
          ly: Number(text?.getAttribute('y')),
          markerX: marker ? Number(marker.getAttribute('cx') ?? marker.getAttribute('x1')) : NaN,
        };
      })
      .filter((m) => m.label.length > 0 && !m.label.includes('='));
  }

  it('finds multiple distinct equilibria in the clustered demo system', () => {
    const { container } = render(<PhasePortrait title="Clustered" {...CLUSTERED_SYSTEM} />);
    const markers = equilibriumMarkers(container);
    // The exact count depends on the numeric grid search; the clustered fixture is built to
    // yield at least 2 distinct (unmerged) equilibria close enough to collide under the old
    // fixed-offset placement.
    expect(markers.length).toBeGreaterThanOrEqual(2);
  });

  it('separates equilibrium labels instead of stacking them when equilibria cluster', () => {
    const { container } = render(<PhasePortrait title="Clustered" {...CLUSTERED_SYSTEM} />);
    const markers = equilibriumMarkers(container);
    expect(markers.length).toBeGreaterThanOrEqual(2);

    // No two label anchors may land within illegible distance of each other — the old code
    // placed every label at (markerX+6, markerY-5), so any two markers within ~11px produced
    // labels stacked directly on top of one another.
    for (let i = 0; i < markers.length; i++) {
      for (let j = i + 1; j < markers.length; j++) {
        const dist = Math.hypot(markers[i].lx - markers[j].lx, markers[i].ly - markers[j].ly);
        expect(dist).toBeGreaterThanOrEqual(11);
      }
    }
  });

  it('keeps a single, well-separated label for an isolated equilibrium (no regression)', () => {
    // A single unstable spiral at the origin, steep enough that only one grid cell qualifies as
    // "near zero" — the demo-fixture shape with only one equilibrium, where collision avoidance
    // must be a no-op and the label still renders at its default offset.
    const { container } = render(<PhasePortrait title="Spiral" fx="-x - 3*y" gy="3*x - y" />);
    const markers = equilibriumMarkers(container);
    expect(markers).toHaveLength(1);
    expect(markers[0].lx).toBe(markers[0].markerX + 6);
  });

  it('constrains the nullcline legend text to the strip inside the card boundary', () => {
    const { container } = render(<PhasePortrait title="Legend" {...CLUSTERED_SYSTEM} />);
    const legendTexts = Array.from(container.querySelectorAll('svg > g > text')).filter((t) =>
      t.textContent?.includes('='),
    );
    expect(legendTexts.length).toBe(2);
    for (const t of legendTexts) {
      const x = Number(t.getAttribute('x'));
      // Visible text (excluding the <title> tooltip, which carries the untruncated string but
      // isn't rendered) must be short enough that even a generous per-character width estimate
      // keeps it inside the card's right edge.
      const visible = Array.from(t.childNodes)
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent)
        .join('');
      expect(visible.length).toBeLessThanOrEqual(6);
      const estimatedWidth = visible.length * 5; // conservative px/char at fontSize 7
      expect(x + estimatedWidth).toBeLessThanOrEqual(W - PAD_RIGHT);
    }
  });

  it('omits the legend entirely when nullclines are turned off (no stray overflow risk)', () => {
    const { container } = render(
      <PhasePortrait title="No nullclines" {...CLUSTERED_SYSTEM} showNullclines={false} />,
    );
    const legendTexts = Array.from(container.querySelectorAll('svg text')).filter((t) =>
      t.textContent?.includes('='),
    );
    expect(legendTexts).toHaveLength(0);
  });
});

// Regression coverage for a real bug: the right-hand label gutter reserved for taxon names
// (labelPx) is capped at 150px regardless of how long the actual names are, but the tip <text>
// rendering the name was never clamped to that budget — the demo fixture's short names
// ("Orangutan", "Chimpanzee") fit, but a real phylogenetic tree's full binomial + subspecies
// names ("Panthera tigris tigris", "Tyrannosaurus rex osborni") ran well past their reserved
// gutter (capped once the longest name exceeds ~27 characters) and bled silently into the clade
// brackets / the card's right edge.

describe('PhyloTree', () => {
  const W = 360; // must track PhyloTree.tsx's internal viewBox width

  function longNameTree(): PhyloNode {
    return {
      children: [
        { name: 'Tyrannosaurus rex osborni maximus' },
        {
          children: [
            { name: 'Velociraptor mongoliensis parvus' },
            { name: 'Deinonychus antirrhopus ostromi' },
          ],
        },
      ],
    };
  }

  it('truncates long taxon names instead of letting them overflow the label gutter', () => {
    const { container } = render(<PhyloTree title="Theropod relations" root={longNameTree()} />);

    const tipLabels = Array.from(container.querySelectorAll('text.phy-tip-lbl'));
    expect(tipLabels).toHaveLength(3);

    // Every rendered tip label's visible glyphs must be short enough to fit the reserved 150px
    // gutter at the class's 10px font-size — none may be long enough to bleed past the card edge.
    for (const node of tipLabels) {
      expect(visibleText(node).length).toBeLessThanOrEqual(27);
    }
    expect(tipLabels.every((n) => visibleText(n).endsWith('…'))).toBe(true);

    // The untruncated names are still available, via native <title> tooltips.
    const titles = Array.from(container.querySelectorAll('text.phy-tip-lbl title')).map(
      (t) => t.textContent,
    );
    expect(titles).toContain('Tyrannosaurus rex osborni maximus');
    expect(titles).toContain('Velociraptor mongoliensis parvus');
    expect(titles).toContain('Deinonychus antirrhopus ostromi');
  });

  it('never lays a tip label past the SVG viewBox, even for a very long name', () => {
    const root: PhyloNode = {
      children: [{ name: 'Supercalifragilisticexpialidocious species name' }, { name: 'Short' }],
    };
    const { container } = render(<PhyloTree title="Extreme name" root={root} />);
    const svg = container.querySelector('svg.phy-svg');
    expect(svg).toBeTruthy();
    expect(svg!.getAttribute('viewBox')!.startsWith(`0 0 ${W} `)).toBe(true);

    const tipLabels = Array.from(container.querySelectorAll('text.phy-tip-lbl'));
    expect(tipLabels).toHaveLength(2);
    // The reserved gutter is capped at 150px regardless of name length, so every tip label's x
    // origin must sit within the reserved gutter (never past the viewBox edge), and its rendered
    // char count must fit the same 150px-cap ceiling the fix derives it from.
    for (const node of tipLabels) {
      const x = Number(node.getAttribute('x'));
      expect(x).toBeLessThan(W);
      expect(visibleText(node).length).toBeLessThanOrEqual(27);
    }
    const longTip = tipLabels.find((n) => visibleText(n).endsWith('…'));
    expect(longTip).toBeTruthy();
    expect(longTip!.querySelector('title')?.textContent).toBe(
      'Supercalifragilisticexpialidocious species name',
    );
  });

  it('leaves short taxon names (the demo-fixture shape) untouched', () => {
    const root: PhyloNode = {
      children: [
        { name: 'Orangutan' },
        {
          children: [
            { name: 'Gorilla' },
            { children: [{ name: 'Human' }, { name: 'Chimpanzee' }] },
          ],
        },
      ],
    };
    const { container } = render(<PhyloTree title="Great apes" root={root} />);
    const tipLabels = Array.from(container.querySelectorAll('text.phy-tip-lbl'));
    expect(tipLabels.map((n) => n.textContent)).toEqual([
      'Orangutan',
      'Gorilla',
      'Human',
      'Chimpanzee',
    ]);
    expect(container.querySelector('text.phy-tip-lbl title')).toBeNull();
  });
});

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

// Regression coverage for a real bug: curve labels were drawn as raw SVG <text> pinned to each
// curve's LAST plotted point (t = tMax). The demo fixtures only ever use a single curve, so this
// never showed — but any multi-curve plot shares one domain by construction (that's the whole
// point of overlaying curves), which means every curve terminates at the same angle and its
// label lands on or near the same ray from centre. With 2+ labelled curves over a shared domain,
// several labels rendered fully stacked on the exact same coordinate — illegible. The fix moves
// labels into an HTML legend below the plot (mirroring VectorField's `.vfl-legend`/`.vfl-leg`),
// which can never collide regardless of curve count, domain, or label length.

describe('PolarPlot', () => {
  function roseCurves(n: number): PolarCurve[] {
    // Distinct-looking curves that nonetheless all close over the same [0, 2π] domain — the exact
    // shape that made every label but the first collapse onto one point.
    const fns = ['2 + cos(t)', '1 + sin(t)', 'cos(2*t)', '1', '3*sin(3*t)', '1.5 + cos(4*t)'];
    return Array.from({ length: n }, (_, i) => ({
      fn: fns[i % fns.length],
      label: `Curve ${i + 1} of the overlay set`,
      color: 'var(--presence)',
    }));
  }

  it.each([2, 4, 6])(
    'gives %i overlaid curves distinct, non-overlapping labels instead of stacking them',
    (n) => {
      const { container } = render(
        <PolarPlot title="Overlay" curves={roseCurves(n)} domain={[0, 2 * Math.PI]} />,
      );

      // No inline SVG text may carry a curve label — that's the collision-prone approach.
      const svgTexts = Array.from(container.querySelectorAll('svg text')).map((t) => t.textContent);
      for (const label of roseCurves(n).map((c) => c.label)) {
        expect(svgTexts).not.toContain(label);
      }

      // Every curve gets exactly one legend row, each at a distinct DOM node (so it can never
      // literally render as the same overlapping element), and every label reads intact.
      const legendItems = Array.from(container.querySelectorAll('.vfl-leg'));
      expect(legendItems).toHaveLength(n);
      const legendTexts = legendItems.map((el) => el.textContent);
      expect(new Set(legendTexts).size).toBe(n);
      roseCurves(n).forEach((c, i) => {
        expect(legendTexts[i]).toBe(c.label);
      });
    },
  );

  it('keeps a long label fully readable via wrap instead of letting it run past the card', () => {
    const longLabel =
      'A very long descriptive curve label that is far wider than the 300px plot viewBox';
    const { container } = render(
      <PolarPlot
        title="Long label"
        curves={[{ fn: '2 + cos(t)', label: longLabel, color: 'var(--presence)' }]}
      />,
    );
    const legend = container.querySelector('.vfl-legend');
    expect(legend).toBeTruthy();
    // flex-wrap on the legend container, not nowrap, is what keeps a long label from being
    // clipped or bleeding out — assert the wrapping class is present rather than a computed
    // style (jsdom doesn't apply the stylesheet), and that the full text survives untruncated.
    expect(container.querySelector('.vfl-leg')?.textContent).toBe(longLabel);
  });

  it('renders no legend at all when no curve carries a label', () => {
    const { container } = render(
      <PolarPlot title="Unlabelled" curves={[{ fn: 'cos(3*t)' }, { fn: '1 + sin(t)' }]} />,
    );
    expect(container.querySelector('.vfl-legend')).toBeNull();
    expect(container.querySelectorAll('polyline')).toHaveLength(2);
  });

  it('still plots every curve polyline when several share a domain', () => {
    const { container } = render(
      <PolarPlot title="Overlay" curves={roseCurves(5)} domain={[0, 2 * Math.PI]} />,
    );
    const polylines = Array.from(container.querySelectorAll('polyline'));
    expect(polylines).toHaveLength(5);
    for (const p of polylines) {
      expect(p.getAttribute('points')?.length).toBeGreaterThan(0);
    }
  });
});

// Regression coverage for a real bug: tier labels are drawn at a fixed x/y with no width
// constraint, so a label longer than the authored demo overflows its own trapezoid — worst on
// the narrow top tiers, where the band's inner width can be a fraction of the label's natural
// rendered width. Every tier's <text> must stay within its own band's width budget.

describe('PyramidTiers', () => {
  function tiersOfCount(n: number): PyramidTier[] {
    // Long labels throughout, including the narrow top tiers where the trapezoid is tightest —
    // the authored demo fixtures elsewhere in the codebase use short single-word labels, which
    // never exercised this path.
    const long = [
      'Self-actualisation and transcendence',
      'Esteem, recognition, and status needs',
      'Love, belonging, and social connection',
      'Safety, security, and stability needs',
      'Physiological survival requirements',
      'Extra tier six with a long label',
      'Extra tier seven with a long label',
      'Extra tier eight with a long label',
    ];
    return Array.from({ length: n }, (_, i) => ({
      label: long[i] ?? `Tier ${i + 1} with a fairly long descriptive label`,
      value: `${(100 / (i + 1)).toFixed(0)}%`,
    }));
  }

  it.each([3, 5, 8])(
    'never lets a tier label render wider than its own trapezoid band (n=%i)',
    (n) => {
      const { container } = render(<PyramidTiers title="Hierarchy" tiers={tiersOfCount(n)} />);
      const polygons = Array.from(container.querySelectorAll<SVGPolygonElement>('svg polygon'));
      const labels = Array.from(container.querySelectorAll<SVGTextElement>('text.py-tier-label'));
      expect(polygons).toHaveLength(n);
      expect(labels).toHaveLength(n);

      labels.forEach((text, i) => {
        // Recover the trapezoid's narrowest (top) edge width from its own polygon points —
        // points are "bL,bY bR,bY tR,tY tL,tY", so the top edge is the last two vertices.
        const pts = polygons[i]!.getAttribute('points')!
          .trim()
          .split(/\s+/)
          .map((p) => p.split(',').map(Number));
        const [, , topRight, topLeft] = pts;
        const topEdgeWidth = Math.abs(topRight![0]! - topLeft![0]!);

        const textLengthAttr = text.getAttribute('textLength');
        if (textLengthAttr) {
          // A label the fix identified as too long for its band must be clamped to no wider
          // than that band's own narrowest edge — never left to spill past it.
          expect(Number(textLengthAttr)).toBeLessThanOrEqual(topEdgeWidth + 0.5);
          expect(text.getAttribute('lengthAdjust')).toBe('spacingAndGlyphs');
        }
      });

      // The narrowest tier (top of the pyramid, rendered first in SVG order) is where a long
      // label most needs help — for these long fixtures at n>=5 it must actually engage
      // either the clamp or the smaller font step, not render untouched at full size.
      if (n >= 5) {
        const narrowestLabel = labels[0]!;
        const shrunk = narrowestLabel.style.fontSize !== '';
        const clamped = narrowestLabel.hasAttribute('textLength');
        expect(shrunk || clamped).toBe(true);
      }
    },
  );

  it('leaves short labels that comfortably fit their band completely unclamped', () => {
    const { container } = render(
      <PyramidTiers
        title="Simple"
        tiers={[{ label: 'Base' }, { label: 'Mid' }, { label: 'Top' }]}
      />,
    );
    const labels = Array.from(container.querySelectorAll<SVGTextElement>('text.py-tier-label'));
    expect(labels).toHaveLength(3);
    for (const text of labels) {
      expect(text.hasAttribute('textLength')).toBe(false);
      expect(text.style.fontSize).toBe('');
    }
  });
});

describe('Quiz', () => {
  const opts = [{ text: 'Three', correct: true }, { text: 'Four' }];
  it('reveals correctness only after answering', () => {
    render(
      <Quiz title="Q" question="What is 1 + 2?" options={opts} explanation="Basic addition." />,
    );
    expect(screen.queryByText('Correct')).toBeNull();
    fireEvent.click(screen.getByText('Three'));
    expect(screen.getByText('Correct')).toBeInTheDocument();
    expect(screen.getByText('Basic addition.')).toBeInTheDocument();
  });
  it('marks a wrong answer and reveals the right one', () => {
    render(<Quiz title="Q" question="What is 1 + 2?" options={opts} />);
    fireEvent.click(screen.getByText('Four'));
    expect(screen.getByText('Not quite')).toBeInTheDocument();
  });
});

// Regression coverage for a real bug: the formula row (built from the function label plus a
// repeated "(x−center)^n/n!" term per shown power) had no wrapping CSS, so a large center value
// or a high shown-term count produced a long monospace string that overflowed the fixed-width
// card on narrow screens instead of wrapping onto multiple lines.

describe('TaylorSeries', () => {
  it('wraps a long formula string instead of overflowing the card', () => {
    // A large multi-digit center ("(x−123456)") repeated across several shown terms produces a
    // formula string far longer than the demo fixture's default center=0, single-digit case.
    const { container } = render(
      <TaylorSeries title="Long expansion" fn="cos" center={123456} showTerms={3} />,
    );
    const formula = container.querySelector('p');
    expect(formula).toBeTruthy();
    expect(formula!.textContent!.length).toBeGreaterThan(30);

    // The formula paragraph must declare wrapping so long monospace text breaks onto new
    // lines rather than growing wider than its container — the actual bug.
    const style = formula!.getAttribute('style') || '';
    expect(style).toMatch(/overflow-wrap:\s*anywhere/);
    expect(style).toMatch(/word-break:\s*break-word/);
  });

  it('keeps a short default formula centered and untouched', () => {
    const { container } = render(<TaylorSeries title="sin x" fn="sin" showTerms={2} />);
    const formula = container.querySelector('p');
    expect(formula!.textContent).toContain('sin x');
    const style = formula!.getAttribute('style') || '';
    expect(style).toMatch(/overflow-wrap:\s*anywhere/);
  });
});

// Regression coverage for real bugs from the screenshots: a callout label positioned with a fixed
// offset in a viewBox only 100 units wide ran far past the stage edge, and two callouts at nearby
// X overlapped because de-collision only worked on the Y axis. layoutLabels wraps, caps, keeps every
// box inside the frame, and stacks any that genuinely overlap in both axes.

describe('TeachDiagram', () => {
  // Label glyphs render as one or more <tspan> lines inside the <text> node (long labels wrap), and a
  // <title> tooltip may also sit inside — so the actually-drawn copy is the joined <tspan> text.
  function visibleText(node: Element): string {
    const tspans = node.querySelectorAll('tspan');
    if (tspans.length)
      return Array.from(tspans)
        .map((t) => t.textContent)
        .join('');
    return Array.from(node.childNodes)
      .filter((n) => n.nodeType === Node.TEXT_NODE)
      .map((n) => n.textContent)
      .join('');
  }

  it('caps and wraps a long callout label instead of letting it overflow the stage', () => {
    const longLabel: DiagLabel = {
      x: 50,
      y: 30,
      text: 'Electromagnetic induction across the coil windings',
      side: 'right',
    };
    const { container } = render(
      <TeachDiagram
        title="Circuit"
        steps={[{ caption: 'Step one', add: [], labels: [longLabel] }]}
      />,
    );
    const labelNodes = Array.from(container.querySelectorAll('text.lr-td-lbl'));
    expect(labelNodes).toHaveLength(1);
    // The visible glyphs stay within the hard character cap so the label fits the 100-unit viewBox.
    expect(visibleText(labelNodes[0]).length).toBeLessThanOrEqual(26);
    expect(visibleText(labelNodes[0]).endsWith('…')).toBe(true);
    // The untruncated string is still present, via a native <title> tooltip.
    const titles = Array.from(container.querySelectorAll('title')).map((t) => t.textContent);
    expect(titles).toContain('Electromagnetic induction across the coil windings');
  });

  it('leaves a short callout label untouched', () => {
    const shortLabel: DiagLabel = { x: 40, y: 20, text: 'Nucleus', side: 'left' };
    const { container } = render(
      <TeachDiagram
        title="Cell"
        steps={[{ caption: 'Step one', add: [], labels: [shortLabel] }]}
      />,
    );
    const labelNodes = Array.from(container.querySelectorAll('text.lr-td-lbl'));
    expect(labelNodes.map((n) => visibleText(n))).toEqual(['Nucleus']);
    expect(container.querySelector('title')).toBeNull();
  });

  it('stacks two same-side callouts at the same height so their text does not overlap', () => {
    // The "Submit Request" / "Refund Processed" collision from the screenshots.
    const labels: DiagLabel[] = [
      { x: 50, y: 40, text: 'Submit Request', side: 'right' },
      { x: 50, y: 40, text: 'Refund Processed', side: 'right' },
    ];
    const placed = layoutLabels(labels, 62.5);
    expect(Math.abs(placed[0].ty - placed[1].ty)).toBeGreaterThanOrEqual(4.6);
  });

  it('leaves no two callouts overlapping in a crowded figure (the address-space case)', () => {
    // The exact bug: two "… (its VM)" top labels and two long bottom labels ("Separate processes…",
    // "Threads within a process…") crowded together. Whether resolved by wrapping (so they fit
    // side-by-side) or by stacking, NO two label boxes may overlap in both axes once placed.
    const CHAR_W = 3.4 * 0.52;
    const LINE_H = 3.4 * 1.2;
    const box = (p: { tx: number; ty: number; anchor: string; lines: string[] }) => {
      const w = Math.max(1, ...p.lines.map((l) => l.length)) * CHAR_W;
      const h = p.lines.length * LINE_H;
      const x0 = p.anchor === 'start' ? p.tx : p.anchor === 'end' ? p.tx - w : p.tx - w / 2;
      return { x0, x1: x0 + w, y0: p.ty - h / 2, y1: p.ty + h / 2 };
    };
    const labels: DiagLabel[] = [
      { x: 25, y: 20, text: 'Process A (its VM)', side: 'top' },
      { x: 80, y: 20, text: 'Process B (its VM)', side: 'top' },
      { x: 25, y: 60, text: 'Separate processes = separate VMs', side: 'bottom' },
      { x: 58, y: 60, text: 'Threads within a process share VM', side: 'bottom' },
    ];
    const boxes = layoutLabels(labels, 62.5).map(box);
    for (let a = 0; a < boxes.length; a++) {
      for (let b = a + 1; b < boxes.length; b++) {
        const A = boxes[a];
        const B = boxes[b];
        // Overlap on BOTH axes (with a hair of tolerance for float rounding) is the collision.
        const overlap =
          A.x1 - 0.1 > B.x0 && B.x1 - 0.1 > A.x0 && A.y1 - 0.1 > B.y0 && B.y1 - 0.1 > A.y0;
        expect(overlap).toBe(false);
      }
    }
  });

  it('keeps every callout box inside the frame', () => {
    // A label hard against each edge must be nudged inward, never left bleeding off the card.
    const labels: DiagLabel[] = [
      { x: 2, y: 2, text: 'Top left corner label', side: 'left' },
      { x: 98, y: 60, text: 'Bottom right corner label', side: 'right' },
    ];
    const placed = layoutLabels(labels, 62.5);
    for (const p of placed) {
      expect(p.tx).toBeGreaterThanOrEqual(0);
      expect(p.tx).toBeLessThanOrEqual(100);
      expect(p.ty).toBeGreaterThanOrEqual(0);
      expect(p.ty).toBeLessThanOrEqual(62.5);
    }
  });

  it('leaves callouts on opposite sides at the same height untouched', () => {
    const labels: DiagLabel[] = [
      { x: 30, y: 40, text: 'Left', side: 'left' },
      { x: 70, y: 40, text: 'Right', side: 'right' },
    ];
    const placed = layoutLabels(labels, 62.5);
    expect(placed[0].ty).toBeCloseTo(40);
    expect(placed[1].ty).toBeCloseTo(40);
  });

  it('re-centres a figure the model drew off in one corner (content-fit)', () => {
    const { container } = render(
      <TeachDiagram
        title="Flow"
        baseShapes={[
          { kind: 'circle', cx: 65, cy: 20, r: 3 },
          { kind: 'circle', cx: 75, cy: 45, r: 3 },
          { kind: 'line', x1: 65, y1: 20, x2: 75, y2: 45 },
        ]}
        steps={[{ caption: 'x', add: [] }]}
      />,
    );
    const g = container.querySelector('svg.lr-td-svg > g[transform]');
    expect(g).not.toBeNull();
    // A right-heavy figure gets a negative x translation (shifted left toward centre).
    expect(g!.getAttribute('transform')).toMatch(/translate\(-\d/);
  });

  it('shrinks a figure the model drew larger than the frame so it does not bleed off the card', () => {
    // The address-space boxes spanned nearly the whole width and ran off the bottom/right. computeFit
    // used to floor the scale at 1 (enlarge-only), so an oversized drawing was never pulled in.
    const { container } = render(
      <TeachDiagram
        title="Address space"
        baseShapes={[
          { kind: 'rect', x: 5, y: 5, w: 90, h: 70 },
          { kind: 'rect', x: 5, y: 80, w: 42, h: 18 },
          { kind: 'rect', x: 52, y: 80, w: 43, h: 18 },
        ]}
        steps={[{ caption: 'x', add: [] }]}
      />,
    );
    const g = container.querySelector('svg.lr-td-svg > g[transform]');
    expect(g).not.toBeNull();
    const scale = Number(g!.getAttribute('transform')?.match(/scale\(([\d.]+)\)/)?.[1]);
    expect(scale).toBeLessThan(1);
  });
});

// Regression coverage for a real bug: the protractor's viewBox height was a bare 150, only 22px
// below the semicircle's flat baseline (cy = 128) — comfortable for today's fixed geometry, but
// with zero real margin for any bottom content (a tick label's descender, a future below-axis
// caption). Assert every rendered coordinate — across the full value/max domain, not just the
// demo fixture — stays safely inside the viewBox instead of nudging past its bottom edge.

describe('ToolScale protractor', () => {
  function svgNumbers(container: HTMLElement, selector: string) {
    const svg = container.querySelector<SVGSVGElement>(selector)!;
    const [, , , vbH] = (svg.getAttribute('viewBox') ?? '0 0 0 0').split(' ').map(Number);
    const ys: number[] = [];
    svg.querySelectorAll('[y1]').forEach((el) => {
      ys.push(Number(el.getAttribute('y1')), Number(el.getAttribute('y2')));
    });
    svg.querySelectorAll('text').forEach((el) => ys.push(Number(el.getAttribute('y'))));
    svg.querySelectorAll('circle').forEach((el) => {
      ys.push(Number(el.getAttribute('cy')) + Number(el.getAttribute('r')));
    });
    return { vbH, maxY: Math.max(...ys) };
  }

  it.each([0, 45, 90, 135, 180])(
    'keeps every drawn coordinate inside the viewBox at value=%i',
    (value) => {
      const { container } = render(
        <ToolScale title="Angle" instrument="protractor" value={value} max={180} unit="°" />,
      );
      const { vbH, maxY } = svgNumbers(container, 'svg.lr-ts-svg');
      // Real legroom below the deepest coordinate — not a viewBox sized flush against today's
      // content, which is exactly what let a bare-150 viewBox reclip the instant any bottom
      // content (a tick label descender, a future below-axis caption) nudged a few px lower.
      expect(vbH - maxY).toBeGreaterThanOrEqual(20);
    },
  );

  it('still fits when max is unusually large or the value overshoots it', () => {
    for (const [value, max] of [
      [45, 360],
      [400, 180],
      [-20, 180],
    ] as const) {
      const { container } = render(
        <ToolScale title="Angle" instrument="protractor" value={value} max={max} unit="°" />,
      );
      const { vbH, maxY } = svgNumbers(container, 'svg.lr-ts-svg');
      expect(vbH - maxY).toBeGreaterThanOrEqual(20);
    }
  });
});

// Regression coverage for a real bug: the coordinate label's fixed 8px offset from the terminal
// point didn't scale with the label's own length, so surd-form strings like "(−√2/2, −√2/2)" —
// which the SVG renders wider than a short "(1, 0)" — pushed the label's rendered edge clean
// past the 0–240 viewBox. Because the SVG paints with overflow: visible, that overflow wasn't
// clipped — it bled outside the card frame at exactly the angles a lesson would actually use.

describe('UnitCircle', () => {
  const VB = 240;

  function coordLabel(container: HTMLElement) {
    const nodes = Array.from(container.querySelectorAll('text.lr-uc-coord'));
    expect(nodes).toHaveLength(1);
    return nodes[0] as SVGTextElement;
  }

  // Same glyph-width estimate the component uses internally, kept independent here so the test
  // doesn't just re-assert the implementation's own arithmetic back at it.
  const CHAR_W = 6.4;

  function assertWithinViewBox(node: SVGTextElement) {
    const x = Number(node.getAttribute('x'));
    const anchor = node.getAttribute('text-anchor');
    const width = (node.textContent ?? '').length * CHAR_W;
    const left = anchor === 'end' ? x - width : x;
    const right = anchor === 'end' ? x : x + width;
    expect(left).toBeGreaterThanOrEqual(-0.5); // small float slack
    expect(right).toBeLessThanOrEqual(VB + 0.5);
  }

  // These are exactly the angles whose coordinate label is long (surd form on both axes),
  // and which sit far enough around the rim that the old fixed offset ran the label past the
  // viewBox edge in one direction or the other.
  it.each([45, 135, 210, 225, 315])(
    'keeps the long surd-form coordinate label at %i° inside the viewBox',
    (angleDeg) => {
      const { container } = render(<UnitCircle title="Unit Circle" angleDeg={angleDeg} />);
      const node = coordLabel(container);
      expect(node.textContent?.length).toBeGreaterThan('(1, 0)'.length);
      assertWithinViewBox(node);
    },
  );

  it('keeps the short axis-aligned coordinate label inside the viewBox too', () => {
    const { container } = render(<UnitCircle title="Unit Circle" angleDeg={0} />);
    assertWithinViewBox(coordLabel(container));
  });

  it('stays inside the viewBox across a dense sweep of angles, not just the special ones', () => {
    for (let deg = 0; deg < 360; deg += 15) {
      const { container, unmount } = render(<UnitCircle title="Unit Circle" angleDeg={deg} />);
      assertWithinViewBox(coordLabel(container));
      unmount();
    }
  });
});

// Regression coverage for a real bug: per-wave legend labels were rendered right-anchored at a
// fixed x position (the plot's right edge) with no cap on the source string's length. The demo
// fixture's short labels ("440 Hz") never exposed it, but a longer label — e.g. a descriptive
// name a model might supply — ran leftward past the plot's left padding and off the card.

describe('WaveDiagram', () => {
  it('truncates a long per-wave legend label instead of letting it overflow the plot', () => {
    const longLabel = 'Fundamental frequency of the driven oscillator (440 Hz reference)';
    const { container } = render(
      <WaveDiagram title="Waves" waves={[{ amplitude: 1, wavelength: 2, label: longLabel }]} />,
    );
    const labelNode = container.querySelector('.wv-curve-lbl');
    expect(labelNode).toBeTruthy();
    const text = labelNode!.textContent ?? '';
    // Well short of the full string, and ends with the truncation ellipsis.
    expect(text.length).toBeLessThan(longLabel.length);
    expect(text.endsWith('…')).toBe(true);
  });

  it('leaves a short legend label untouched', () => {
    const { container } = render(
      <WaveDiagram title="Waves" waves={[{ amplitude: 1, wavelength: 2, label: '440 Hz' }]} />,
    );
    const labelNode = container.querySelector('.wv-curve-lbl');
    expect(labelNode?.textContent).toBe('440 Hz');
  });

  it('caps every wave label so its right-anchored end never runs past the plot padding', () => {
    // Two waves, both with labels long enough that the old unbounded render would push their
    // start position well left of the axis — every rendered label must stay within budget.
    const { container } = render(
      <WaveDiagram
        title="Waves"
        waves={[
          { amplitude: 1, wavelength: 2, label: 'A very long descriptive label for wave one' },
          {
            amplitude: 0.6,
            wavelength: 3,
            phase: 1,
            label: 'An equally verbose label for wave two here',
          },
        ]}
      />,
    );
    const labels = Array.from(container.querySelectorAll('.wv-curve-lbl'));
    expect(labels).toHaveLength(2);
    for (const node of labels) {
      // 20-char budget (incl. the ellipsis) at the class's ~9.5px font comfortably clears the
      // plot's left padding before reaching the fixed right-anchor x used for every label.
      expect((node.textContent ?? '').length).toBeLessThanOrEqual(20);
    }
  });
});

describe('WorkedExample', () => {
  const steps = [{ label: 'Start', why: 'given' }, { label: 'Isolate x' }, { label: 'Final step' }];
  it('reveals steps one at a time in progressive mode', () => {
    render(<WorkedExample title="Solve it" steps={steps} progressive />);
    expect(screen.getByText('Start')).toBeInTheDocument();
    expect(screen.queryByText('Isolate x')).toBeNull(); // not yet revealed
    fireEvent.click(screen.getByText(/Next step/));
    expect(screen.getByText('Isolate x')).toBeInTheDocument();
  });
  it('shows all steps at once when not progressive', () => {
    render(<WorkedExample title="Solve it" steps={steps} progressive={false} />);
    expect(screen.getByText('Final step')).toBeInTheDocument();
    expect(screen.getByText('Isolate x')).toBeInTheDocument();
  });
});
