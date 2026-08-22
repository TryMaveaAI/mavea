import { describe, expect, it } from 'vitest';
import {
  applyFixtureVariant,
  coerceFixtureVariant,
  readFixtureVariant,
} from '../src/gallery/fixtureVariants';
import type { ComponentFacts } from '../src/canvas/blocks/catalog/facts';

const FACTS: ComponentFacts = {
  type: 'contactcard',
  family: 'everyday',
  archetype: 'list',
  dataShapes: ['list'],
  tier: 'base',
  wowWeight: 0.5,
  interactive: false,
  coercer: 'generic',
  colDefault: 6,
  requires: ['title', 'items'],
};

describe('gallery fixture variants', () => {
  const base = {
    title: 'Travel checklist',
    subtitle: 'Weekend bag',
    items: [
      {
        label: 'Passport',
        name: 'Identity document',
        caption: 'Primary',
        note: 'Bring the newest one.',
      },
      { label: 'Charger', name: 'Power adapter', caption: 'Backup', note: 'USB-C for the laptop.' },
    ],
    footer: 'Packed the night before.',
  };

  it('keeps the base fixture untouched', () => {
    expect(applyFixtureVariant(base, FACTS, 'base')).toEqual(base);
  });

  it('stretches prose and repeatable lists in verbose mode', () => {
    const verbose = applyFixtureVariant(base, FACTS, 'verbose') as typeof base;
    expect(verbose.subtitle.length).toBeGreaterThan(base.subtitle.length);
    expect(verbose.items.length).toBeGreaterThan(base.items.length);
    expect(String(verbose.items[0].note)).toContain('edge cases');
    expect(verbose.items[0].label).toBe(base.items[0].label);
    expect(verbose.items[0].name).toBe(base.items[0].name);
    expect(verbose.items[0].caption).toBe(base.items[0].caption);
    expect(new Set(verbose.items.map((item) => item.label)).size).toBe(verbose.items.length);
    expect(new Set(verbose.items.map((item) => item.name)).size).toBe(verbose.items.length);
    expect(base.items).toHaveLength(2);
  });

  it('gives synthetic primitive repeats stable, unique identities', () => {
    const verbose = applyFixtureVariant(
      { title: 'Stress identities', options: ['Low', 'Some'], steps: ['One', 'Two'] },
      FACTS,
      'verbose',
    ) as { options: string[]; steps: string[] };

    expect(new Set(verbose.options).size).toBe(verbose.options.length);
    expect(new Set(verbose.steps).size).toBe(verbose.steps.length);
    expect(verbose.options.slice(0, 2)).toEqual(['Low', 'Some']);
    expect(verbose.steps.slice(0, 2)).toEqual(['One', 'Two']);
  });

  it('preserves numeric magnitudes and does not synthesize points at existing positions', () => {
    const verbose = applyFixtureVariant(
      {
        title: 'Measured series',
        facets: [
          { label: 'Quality', value: 4 },
          { label: 'Speed', value: 3 },
        ],
        events: [
          { at: 10, label: 'Open' },
          { at: 20, label: 'Close' },
        ],
      },
      FACTS,
      'verbose',
    ) as {
      facets: Array<{ value: number }>;
      events: Array<{ at: number }>;
    };

    expect(verbose.facets.map((facet) => facet.value)).toEqual([4, 3, 4, 3]);
    expect(verbose.events.map((event) => event.at)).toEqual([10, 20]);
  });

  it('does not duplicate numeric item identities', () => {
    const verbose = applyFixtureVariant(
      {
        title: 'Walkthrough',
        steps: [
          { step: 1, detail: 'Start here.' },
          { step: 2, detail: 'Finish here.' },
        ],
      },
      FACTS,
      'verbose',
    ) as { steps: Array<{ step: number; detail: string }> };

    expect(verbose.steps.map((step) => step.step)).toEqual([1, 2]);
    expect(verbose.steps[0].detail).toContain('edge cases');
  });

  it('preserves catalog-declared renderer vocabularies', () => {
    const verbose = applyFixtureVariant(
      {
        title: 'Evidence review',
        claims: [
          {
            claim: 'The release gate passed.',
            verdict: 'true',
            detail: 'Confirmed by the build log.',
          },
        ],
      },
      { ...FACTS, type: 'factcheck' },
      'verbose',
    ) as { claims: Array<{ verdict: string; detail: string }> };

    expect(verbose.claims[0].verdict).toBe('true');
    expect(verbose.claims[0].detail).toContain('edge cases');
  });

  it('does not repeat arrays whose immutable enum is also the item identity', () => {
    const verbose = applyFixtureVariant(
      {
        title: 'Agenda',
        items: [
          { time: '9:00 AM', title: 'Opening', detail: 'Set the context.' },
          { time: '14:30', title: 'Close', detail: 'Name the owner.' },
        ],
      },
      { ...FACTS, type: 'agenda' },
      'verbose',
    ) as { items: Array<{ time: string; detail: string }> };

    expect(verbose.items).toHaveLength(2);
    expect(verbose.items.map((item) => item.time)).toEqual(['9:00 AM', '14:30']);
    expect(verbose.items[0].detail).toContain('edge cases');
  });

  it('drops optional top-level fields in minimal mode but keeps required ones', () => {
    const minimal = applyFixtureVariant(base, FACTS, 'minimal') as Record<string, unknown>;
    expect(Object.keys(minimal).sort()).toEqual(['items', 'title']);
  });

  it('coerces unknown variants back to base', () => {
    expect(coerceFixtureVariant('verbose')).toBe('verbose');
    expect(coerceFixtureVariant('chaos')).toBe('base');
    expect(readFixtureVariant('#/gallery?variant=minimal')).toBe('minimal');
    expect(readFixtureVariant('#/gallery')).toBe('base');
  });
});
