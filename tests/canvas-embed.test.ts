import { describe, it, expect } from 'vitest';
import { RAW_CATALOG } from '../src/canvas/blocks/catalog/catalog.data';
import { createMeta } from '../src/canvas/blocks/catalog/meta';
import { EXTENDED_REGISTRY } from '../src/canvas/blocks';
import { embedClass, isEmbeddable, computeFitScale, bridgeVars } from '../src/canvas/embed';
import type { FigurePalette } from '../src/canvas/embed';

describe('embedClass — the one embeddability rule', () => {
  it('never embeds an interactive control unless it explicitly opts in', () => {
    // The default for an interactive block is 'none' (a form/picker/nav has no static affordance).
    // A deliberate per-type override (e.g. a map, which is a meaningful static figure) may opt in;
    // this guards against ACCIDENTAL interactive embeds, not the rare intentional one.
    for (const meta of RAW_CATALOG) {
      if (meta.interactive && !meta.embed) expect(embedClass(meta)).toBe('none');
    }
  });

  it('lets a map opt into the figure path despite being interactive', () => {
    const geomap = RAW_CATALOG.find((m) => m.type === 'geomap');
    expect(geomap && embedClass(geomap)).toBe('fluid');
  });

  it('keeps core blocks on their designed archetype (never a figure)', () => {
    for (const meta of RAW_CATALOG) {
      if (meta.family === 'core') expect(embedClass(meta)).toBe('none');
    }
  });

  it('only ever marks blocks the bare renderer can actually render', () => {
    // Every embeddable type must exist in the extended registry, or renderBlockBare returns null
    // and the figure would be blank. This is the contract that keeps the classifier honest.
    const unrenderable = RAW_CATALOG.filter(
      (m) => isEmbeddable(m) && typeof EXTENDED_REGISTRY[m.type] !== 'function',
    ).map((m) => m.type);
    expect(unrenderable, 'embeddable types missing from EXTENDED_REGISTRY').toEqual([]);
  });

  it('actually finds embeddable blocks (the family map matches the catalog)', () => {
    const embeddable = RAW_CATALOG.filter(isEmbeddable);
    // A family-name typo would zero this out; the rich families alone are dozens of blocks.
    expect(embeddable.length).toBeGreaterThan(40);
    const families = new Set(embeddable.map((m) => m.family));
    expect(families).toContain('charts1');
    expect(families).toContain('charts2');
    expect(families).toContain('diagrams');
  });

  it('applies family defaults and per-type overrides', () => {
    expect(embedClass(createMeta('sankey', { family: 'charts1', dataShapes: ['flow'] }))).toBe(
      'fluid',
    );
    expect(embedClass(createMeta('codewalk', { family: 'code', dataShapes: ['code'] }))).toBe(
      'flow',
    );
    // override forces a flow chart out of the fluid family default
    expect(
      embedClass(
        createMeta('gantt', { family: 'charts2', dataShapes: ['sequence'], embed: 'flow' }),
      ),
    ).toBe('flow');
    // override opts a block out entirely
    expect(embedClass(createMeta('treemap', { family: 'charts1', embed: 'none' }))).toBe('none');
    // an unknown family is never embedded by accident
    expect(embedClass(createMeta('whatever', { family: 'mystery' }))).toBe('none');
  });
});

describe('computeFitScale — the no-overflow guarantee', () => {
  it('never enlarges a figure that already fits', () => {
    expect(computeFitScale(100, 200)).toBe(1);
    expect(computeFitScale(200, 200)).toBe(1);
  });

  it('shrinks a too-tall figure to fit the frame exactly', () => {
    expect(computeFitScale(200, 100)).toBeCloseTo(0.5);
  });

  it('keeps shrinking with NO floor, so an extreme figure still fits (never overflows)', () => {
    // The load-bearing case: a very tall block (a long code listing) must scale all the way down so
    // naturalH * scale <= frameH. A floor here would let the figure overflow its frame.
    for (const [h, f] of [
      [1000, 100],
      [5000, 120],
      [20000, 80],
    ] as const) {
      const s = computeFitScale(h, f);
      expect(h * s).toBeLessThanOrEqual(f + 0.001); // fits the frame, always
    }
  });

  it('stays at 1 when unmeasured (jsdom: zero height)', () => {
    expect(computeFitScale(0, 100)).toBe(1);
    expect(computeFitScale(100, 0)).toBe(1);
  });

  it('is always within (0, 1] for any input', () => {
    for (const [h, f] of [
      [10, 10],
      [10, 1000],
      [1000, 10],
      [543, 211],
      [1, 1],
    ] as const) {
      const s = computeFitScale(h, f);
      expect(s).toBeGreaterThan(0);
      expect(s).toBeLessThanOrEqual(1);
    }
  });
});

describe('bridgeVars — skin palette → canvas tokens', () => {
  const light: FigurePalette = {
    dark: false,
    paper: '#ffffff',
    ink: '#161c2b',
    muted: '#4d5a70',
    faint: '#a7afbe',
    accent: '#1c6e8c',
    tint: '#e8f0f4',
    rule: '#d8dee6',
    ruleStrong: '#161c2b',
    track: '#eef2f6',
    font: 'Tiempos, serif',
    mono: 'JetBrains Mono, monospace',
  };

  it('is deterministic for a given palette', () => {
    expect(bridgeVars(light)).toEqual(bridgeVars(light));
  });

  it('maps the brand identity onto the canvas tokens', () => {
    const v = bridgeVars(light);
    expect(v['--text-primary']).toBe(light.ink);
    expect(v['--presence']).toBe(light.accent);
    expect(v['--surface-default']).toBe(light.paper);
    expect(v['--font']).toBe(light.font);
    expect(v['--mono']).toBe(light.mono);
  });

  it('emits every token a chart/diagram reads', () => {
    const v = bridgeVars(light);
    for (const key of [
      '--text-secondary',
      '--text-faint',
      '--insight',
      '--warning',
      '--danger',
      '--grid-line',
      '--track',
      '--line',
      '--surface-elevated',
      '--accent-ink',
    ]) {
      expect(v[key], `missing ${key}`).toBeTruthy();
    }
  });

  it('builds surfaces from ink-tinted paper, never washed-out glass', () => {
    const v = bridgeVars(light);
    // The known trap: reusing the app's translucent --surface-glass renders near-invisible on light
    // paper. The bridge mixes ink into paper instead — a visible faint panel.
    expect(v['--surface-glass']).toContain('color-mix');
    expect(v['--surface-glass']).toContain(light.paper);
    expect(v['--surface-glass']).not.toContain('rgba(255, 255, 255');
  });

  it('keeps a dark skin legible (light ink on dark paper)', () => {
    const dark: FigurePalette = { ...light, dark: true, paper: '#0c0c0c', ink: '#f3f3f3' };
    expect(bridgeVars(dark)['--text-primary']).toBe('#f3f3f3');
    expect(bridgeVars(dark)['--surface-default']).toBe('#0c0c0c');
  });
});
