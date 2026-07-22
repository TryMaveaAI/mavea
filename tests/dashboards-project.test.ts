import { describe, expect, it } from 'vitest';
import { alignmentPct, projectWidgetBlock } from '../src/live/dashboards/project';
import type { Block } from '../src/data/conversation';
import type { Dashboard, Tripwire, Widget } from '../src/live/dashboards/types';

// Projection: the four bespoke widgets derive their props from the dashboard's live state (a single
// source of truth), and data widgets pass through untouched.

const tw = (state: Tripwire['state'], label = 'guard'): Tripwire => ({
  id: 't-' + label,
  label,
  metricId: 'm',
  comparator: 'gt',
  threshold: 1,
  sourceQuote: { text: 'x', saidAt: 0 },
  state,
});

const widget = (block: Block): Widget => ({ id: 'w', block, span: 1, fromSource: 'c1' });

const dash = (over: Partial<Dashboard>): Dashboard =>
  ({
    thesis: { text: 'rates fall, tech wins', saidAt: 0 },
    tripwires: [],
    metrics: [],
    sources: [
      {
        kind: 'ORIGIN',
        conversationId: 'c1',
        title: 'Jan 14 · Live',
        contributed: 'made it',
        at: 0,
      },
    ],
    widgets: [],
    ...over,
  }) as Dashboard;

describe('alignmentPct', () => {
  it('null when nothing is assessable', () => {
    expect(alignmentPct(dash({ tripwires: [] }))).toBeNull();
    expect(alignmentPct(dash({ tripwires: [tw('AWAITING')] }))).toBeNull();
  });
  it('weights CLEAR=1, WATCHING=0.75, TRIGGERED=0', () => {
    expect(alignmentPct(dash({ tripwires: [tw('CLEAR'), tw('TRIGGERED')] }))).toBe(50);
    expect(alignmentPct(dash({ tripwires: [tw('WATCHING')] }))).toBe(75);
  });
});

describe('projectWidgetBlock', () => {
  it('thesis projects verbatim reasoning + ORIGIN date + the guarding tripwire', () => {
    const d = dash({ tripwires: [tw('WATCHING', '10Y above 4.5%')] });
    const b = projectWidgetBlock(
      d,
      widget({ type: 'thesis', col: 8, id: 'wt', props: {} } as unknown as Block),
    );
    const p = (b as unknown as { props: Record<string, unknown> }).props;
    expect(p.reasoning).toBe('rates fall, tech wins');
    expect(p.asOf).toBe('Jan 14 · Live');
    expect(p.reconsiderIf).toBe('10Y above 4.5%');
    expect(p.tripwireState).toBe('watching');
  });

  it('alignmentgauge projects the computed %', () => {
    const d = dash({ tripwires: [tw('CLEAR'), tw('TRIGGERED')] });
    const b = projectWidgetBlock(
      d,
      widget({
        type: 'alignmentgauge',
        col: 4,
        id: 'wg',
        props: { pct: null },
      } as unknown as Block),
    );
    expect((b as unknown as { props: { pct: number } }).props.pct).toBe(50);
  });

  it('standingalerts projects all tripwires with lowercased states', () => {
    const d = dash({ tripwires: [tw('WATCHING', 'a'), tw('TRIGGERED', 'b')] });
    const b = projectWidgetBlock(
      d,
      widget({
        type: 'standingalerts',
        col: 4,
        id: 'wa',
        props: { alerts: [] },
      } as unknown as Block),
    );
    const alerts = (b as unknown as { props: { alerts: { label: string; state: string }[] } }).props
      .alerts;
    expect(alerts.map((a) => a.state)).toEqual(['watching', 'triggered']);
  });

  it('sourceslineage projects sources with lowercased kinds', () => {
    const d = dash({
      sources: [
        { kind: 'ORIGIN', conversationId: 'c1', title: 'A', contributed: '', at: 0 },
        { kind: 'LINKED', conversationId: 'c2', title: 'B', contributed: '', at: 0 },
      ],
    });
    const b = projectWidgetBlock(
      d,
      widget({ type: 'sourceslineage', col: 8, id: 'ws', props: { rows: [] } } as unknown as Block),
    );
    const rows = (b as unknown as { props: { rows: { kind: string }[] } }).props.rows;
    expect(rows.map((r) => r.kind)).toEqual(['origin', 'linked']);
  });

  it('passes a data widget (insight) through unchanged when it has no metricId', () => {
    const d = dash({});
    const block = {
      type: 'insight',
      col: 4,
      id: 'wm',
      num: '1',
      props: { title: 'X' },
    } as unknown as Block;
    expect(projectWidgetBlock(d, widget(block))).toBe(block);
  });

  it('projects a metric-linked card’s value from its MetricSpec (honest "—" until a value lands)', () => {
    const block = {
      type: 'insight',
      col: 4,
      id: 'wm',
      num: '1',
      props: { title: 'Yield', stat: '—' },
    } as unknown as Block;
    const w = { id: 'w', block, span: 1 as const, fromSource: 'c1', metricId: 'm10y' };
    // empty metric → "—"
    const empty = dash({
      metrics: [
        {
          id: 'm10y',
          label: 'Yield',
          query: 'q',
          sourceQuote: { text: 'x', saidAt: 0 },
          lastValue: null,
          origin: 'empty',
        },
      ],
    });
    expect(
      (projectWidgetBlock(empty, w) as unknown as { props: { stat: string } }).props.stat,
    ).toBe('—');
    // fetched value → the raw token
    const filled = dash({
      metrics: [
        {
          id: 'm10y',
          label: 'Yield',
          query: 'q',
          sourceQuote: { text: 'x', saidAt: 0 },
          lastValue: 4.18,
          lastRaw: '4.18%',
          origin: 'search',
        },
      ],
    });
    expect(
      (projectWidgetBlock(filled, w) as unknown as { props: { stat: string } }).props.stat,
    ).toBe('4.18%');
  });

  it('re-derives the metric-linked card’s conf every render instead of freezing it at build time', () => {
    const block = {
      type: 'insight',
      col: 4,
      id: 'wm',
      num: '1',
      props: { title: 'Yield', stat: '—', conf: 'inferred' },
    } as unknown as Block;
    const w = { id: 'w', block, span: 1 as const, fromSource: 'c1', metricId: 'm10y' };
    // Built as 'inferred' (extract.ts's pre-fetch placeholder) — still 'inferred' while the
    // metric has no real value yet, even on a fresh projection.
    const empty = dash({
      metrics: [
        {
          id: 'm10y',
          label: 'Yield',
          query: 'q',
          sourceQuote: { text: 'x', saidAt: 0 },
          lastValue: null,
          origin: 'empty',
        },
      ],
    });
    expect(
      (projectWidgetBlock(empty, w) as unknown as { props: { conf: string } }).props.conf,
    ).toBe('inferred');
    // The SAME widget (its stored props.conf is still the stale 'inferred') projects 'strong' the
    // moment its metric has a real value — proving this is computed fresh, not read off the block.
    const filled = dash({
      metrics: [
        {
          id: 'm10y',
          label: 'Yield',
          query: 'q',
          sourceQuote: { text: 'x', saidAt: 0 },
          lastValue: 4.18,
          lastRaw: '4.18%',
          origin: 'search',
        },
      ],
    });
    expect(
      (projectWidgetBlock(filled, w) as unknown as { props: { conf: string } }).props.conf,
    ).toBe('strong');
  });
});
