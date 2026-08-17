// The observation model: a check fetches DATA in a shape this app defines, and this app turns that
// data into a component. Previously the model was asked to regenerate a finished canvas block —
// exact component type, exact prop names, nested item shapes — which made it responsible for
// Mavéa's rendering contract, and every drift threw away a grounded search the user had paid for.
import { describe, expect, it } from 'vitest';
import {
  coerceObservation,
  observationKindFor,
  OBSERVATION_SHAPE,
} from '../src/live/dashboards/observation';
import { projectObservation } from '../src/live/dashboards/projectObservation';

describe('coerceObservation — generous about shape, strict about substance', () => {
  it('takes a metric as a number or as the string a source printed', () => {
    expect(coerceObservation('metric', { value: 225.16 })).toEqual({
      kind: 'metric',
      value: 225.16,
    });
    expect(coerceObservation('metric', { value: '$1,624.95', raw: '$1,624.95' })).toEqual({
      kind: 'metric',
      value: 1624.95,
      raw: '$1,624.95',
    });
  });

  it('returns null when a metric has no real number — never a zero standing in for absence', () => {
    expect(coerceObservation('metric', { value: 'about two hundred' })).toBeNull();
    expect(coerceObservation('metric', {})).toBeNull();
  });

  it('flattens list items a model shaped its own way, rather than discarding the fetch', () => {
    const out = coerceObservation('list', {
      items: [{ ticker: 'NVDA', companyName: 'NVIDIA', currentPrice: 225.16 }, 'TSM — 430.49'],
    });
    expect(out).toEqual({ kind: 'list', items: ['NVDA — NVIDIA — 225.16', 'TSM — 430.49'] });
  });

  it('reads a table sent as records, deriving its header from the rows', () => {
    const out = coerceObservation('table', {
      rows: [
        { Team: 'NYY', Record: '82-60' },
        { Team: 'BOS', Record: '79-63' },
      ],
    });
    expect(out).toEqual({
      kind: 'table',
      columns: ['Team', 'Record'],
      rows: [
        ['NYY', '82-60'],
        ['BOS', '79-63'],
      ],
    });
  });

  it('keeps series points only when BOTH label and number are real', () => {
    const out = coerceObservation('series', {
      points: [{ label: 'Q1', value: 10 }, { label: 'Q2' }, { value: 12 }],
    });
    expect(out).toEqual({ kind: 'series', points: [{ label: 'Q1', value: 10 }] });
  });

  it('accepts event aliases a model plausibly reaches for', () => {
    const out = coerceObservation('event', {
      events: [{ date: 'Sep 16, 2026', name: 'Pediatric Advisory Committee', status: 'upcoming' }],
    });
    expect(out).toEqual({
      kind: 'event',
      events: [{ when: 'Sep 16, 2026', title: 'Pediatric Advisory Committee', detail: 'upcoming' }],
    });
  });

  it('returns null for an empty reply of every kind — nothing found is not nothing shown', () => {
    for (const kind of ['metric', 'series', 'list', 'table', 'event'] as const) {
      expect(coerceObservation(kind, {})).toBeNull();
    }
  });

  it('publishes a flat schema for every kind, with no component vocabulary in it', () => {
    for (const shape of Object.values(OBSERVATION_SHAPE)) {
      expect(shape).not.toMatch(/props|block|col\b/);
    }
  });
});

describe('observationKindFor — only data-shaped views qualify', () => {
  it('claims the views whose content IS the data', () => {
    expect(observationKindFor('list')).toBe('list');
    expect(observationKindFor('timeline')).toBe('event');
    expect(observationKindFor('datatable')).toBe('table');
    expect(observationKindFor('chart')).toBe('series');
  });

  it('leaves prose-bearing and bespoke views on the block path', () => {
    // An insight/kpi also carries words that say what the number MEANS; no schema here holds that.
    expect(observationKindFor('insight')).toBeNull();
    expect(observationKindFor('kpi')).toBeNull();
    expect(observationKindFor('scoreboard')).toBeNull();
    expect(observationKindFor('forecast')).toBeNull();
  });
});

describe('projectObservation — the view is a local decision', () => {
  it('renders one list observation as a list AND as a timeline-shaped view, unasked', () => {
    const data = { kind: 'event' as const, events: [{ when: 'Mon', title: 'Kickoff' }] };
    expect(projectObservation('timeline', data, { title: 'T' })).toEqual({
      title: 'T',
      events: [{ time: 'Mon', title: 'Kickoff' }],
    });
    expect(projectObservation('list', data, { title: 'T' })).toEqual({
      title: 'T',
      items: ['Mon — Kickoff'],
    });
  });

  it('keeps the tile’s identity and replaces only what was fetched', () => {
    const props = projectObservation(
      'list',
      { kind: 'list', items: ['a', 'b'] },
      { title: 'My board', icon: 'chart' },
    );
    expect(props).toMatchObject({ title: 'My board', icon: 'chart', items: ['a', 'b'] });
  });

  it('writes a metric with its unit the way that unit is written', () => {
    // A currency symbol leads, everything else trails — and the source's own formatting wins when
    // it sent one, so "4.18%" is never re-derived into something subtly different.
    expect(projectObservation('insight', { kind: 'metric', value: 1625 }, {}, '$')).toMatchObject({
      stat: '$1625',
    });
    expect(projectObservation('insight', { kind: 'metric', value: 4.18 }, {}, '%')).toMatchObject({
      stat: '4.18%',
    });
    expect(
      projectObservation('insight', { kind: 'metric', value: 4.18, raw: '4.18%' }, {}),
    ).toMatchObject({ stat: '4.18%' });
  });

  it('builds a real datatable from columns and rows', () => {
    const props = projectObservation('datatable', {
      kind: 'table',
      columns: ['Team', 'Record'],
      rows: [['NYY', '82-60']],
    }) as { columns: { key: string; label: string }[]; rows: Record<string, string>[] };
    expect(props.columns).toEqual([
      { key: 'c0', label: 'Team' },
      { key: 'c1', label: 'Record' },
    ]);
    expect(props.rows).toEqual([{ c0: 'NYY', c1: '82-60' }]);
  });

  it('refuses a pairing that cannot be honest, instead of rendering a worse view', () => {
    // A table of rows is not one number, and a metric is not a timeline.
    expect(
      projectObservation('insight', { kind: 'table', columns: ['a'], rows: [['1']] }),
    ).toBeNull();
    expect(projectObservation('timeline', { kind: 'metric', value: 5 })).toBeNull();
  });
});
