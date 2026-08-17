// world-dates.test.tsx — a node's own date: the only route onto the time axis for a cause with no
// history of its own. Before it existed, a world reached the timeline only through a parsed numeric
// series, so a wholly qualitative web — most of them — put every card in the held-aside band while
// the "Over time" chip stayed live and inviting.
//
// The rule the gate applies: a date must READ as a time, or the timeline would shelve a node the
// gate had just promised was placeable — and it must SAY whether anything backs it. A date is not a
// measurement, but on the timeline the node's POSITION is the claim, so an unbacked one is a claim
// wearing no receipt exactly like an unbacked number is.
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { worldToMorph } from '../src/canvas/spatial/morph/adapters';
import { WORLD_SEED } from '../src/live/world/seed';
import { parseWorldTime, type WorldSpec } from '../src/live/world/types';
import { coerceWorldSpec } from '../src/live/world/validate';
import { WorldOverlay } from '../src/live/world/WorldOverlay';

afterEach(cleanup);

const raw = (date: unknown): unknown => ({
  title: 'Why did the parcel arrive late?',
  outcomeId: 'late',
  nodes: [
    { id: 'depot', label: 'Held at the depot', role: 'root', depth: 0, tier: 'T0', date },
    { id: 'late', label: 'Arrived late', role: 'outcome', depth: 1, tier: 'T0' },
  ],
  edges: [{ from: 'depot', to: 'late', sign: 1, tier: 'T0' }],
});

const dateOf = (payload: unknown) => coerceWorldSpec(payload, '')?.nodes[0].date;

describe('parseWorldTime', () => {
  it('reads the vocabulary a source actually writes, and refuses prose', () => {
    expect(parseWorldTime('2008')).toBe(Date.UTC(2008, 0, 1));
    expect(parseWorldTime('2008-03')).toBe(Date.UTC(2008, 2, 1));
    expect(parseWorldTime('2026-02-10')).toBe(Date.UTC(2026, 1, 10));
    expect(parseWorldTime('2008-13')).toBeNull(); // a month that does not exist
    expect(parseWorldTime('sometime last spring')).toBeNull();
    expect(parseWorldTime('')).toBeNull();
  });
});

describe('coerceWorldSpec — a node date', () => {
  it('keeps a parseable date nothing backs, and marks it as backed by nothing', () => {
    expect(dateOf(raw('2008'))).toEqual({ t: '2008', tier: 'T0' });
    expect(dateOf(raw({ t: '2008-03', until: '2009-05' }))).toEqual({
      t: '2008-03',
      until: '2009-05',
      tier: 'T0',
    });
  });

  it("takes the node's own receipt as the date's, when that sentence states the date", () => {
    // How a real source reads: one sentence names the cause AND when it happened, so the node's
    // quote is the date's quote. The model is asked for `date` as a bare string (explode's schema
    // note), so in practice this is the only route a date has to evidence at all.
    const corpus = 'Lehman filed for bankruptcy in 2008-09, and the interbank market froze.';
    const spec = coerceWorldSpec(
      {
        title: 'Why did lending freeze?',
        outcomeId: 'freeze',
        nodes: [
          {
            id: 'lehman',
            label: 'Lehman failed',
            role: 'root',
            depth: 0,
            tier: 'T2',
            date: '2008-09',
            quote: 'Lehman filed for bankruptcy in 2008-09',
          },
          { id: 'freeze', label: 'Lending froze', role: 'outcome', depth: 1, tier: 'T0' },
        ],
        edges: [{ from: 'lehman', to: 'freeze', sign: 1, tier: 'T0' }],
      },
      corpus,
    )!;
    expect(spec.nodes[0].date).toMatchObject({ t: '2008-09', tier: 'T2' });
    expect(spec.nodes[0].date?.receipt?.quote).toContain('2008-09');
  });

  it('refuses a receipt that grounds but never says the date it is being used to prove', () => {
    // The failure this closes: a real sentence beside a year no source ever attached to the node,
    // and the timeline places it there anyway. The date still stands — it is just no longer dressed
    // as something a source said.
    const corpus = 'Lehman filed for bankruptcy, and the interbank market froze.';
    const spec = coerceWorldSpec(
      {
        title: 'Why did lending freeze?',
        outcomeId: 'freeze',
        nodes: [
          {
            id: 'lehman',
            label: 'Lehman failed',
            role: 'root',
            depth: 0,
            tier: 'T2',
            date: '2006',
            quote: 'Lehman filed for bankruptcy',
          },
          { id: 'freeze', label: 'Lending froze', role: 'outcome', depth: 1, tier: 'T0' },
        ],
        edges: [{ from: 'lehman', to: 'freeze', sign: 1, tier: 'T0' }],
      },
      corpus,
    )!;
    expect(spec.nodes[0].date).toEqual({ t: '2006', tier: 'T0' });
    expect(spec.nodes[0].tier).toBe('T2'); // the CAUSE is still grounded; only its date is not
  });

  it('drops a date that is prose, and a period that does not run forwards', () => {
    expect(dateOf(raw('the spring of that year'))).toBeUndefined();
    expect(dateOf(raw({ t: 'whenever' }))).toBeUndefined();
    expect(dateOf(raw({ t: '2009', until: '2008' }))).toEqual({ t: '2009', tier: 'T0' });
    expect(dateOf(raw({ t: '2009', until: 'later' }))).toEqual({ t: '2009', tier: 'T0' });
    expect(dateOf(raw(42))).toBeUndefined();
  });

  it('caps the label before parsing it, so a runaway string cannot become a date', () => {
    expect(dateOf(raw(`2008${' '.repeat(60)}`))).toEqual({ t: '2008', tier: 'T0' });
    expect(dateOf(raw('2008-03-01T00:00:00.000000000000Z'))).toBeUndefined();
  });
});

describe('worldToMorph — where a node sits in time', () => {
  const spec = (): WorldSpec => ({
    title: 'Why did the lunchtime queue build up?',
    outcomeId: 'queue',
    provenance: {},
    nodes: [
      {
        id: 'queue',
        label: 'Shoppers waiting',
        role: 'outcome',
        depth: 0,
        tier: 'T0',
        date: { t: '2026-11-12' },
        series: {
          tier: 'T3',
          points: [
            { t: '2003', value: 1 },
            { t: '2009', value: 2 },
          ],
        },
      },
      { id: 'tills', label: 'Tills staffed', role: 'root', depth: 0, tier: 'T0' },
    ],
    edges: [],
  });

  it('prefers the node’s own date over the span of its history', () => {
    const [queue] = worldToMorph(spec()).nodes;
    expect(queue.date).toEqual({ start: Date.UTC(2026, 10, 12) });
  });

  it('falls back to the series span when the node has no date of its own', () => {
    const withoutDate = spec();
    delete withoutDate.nodes[0].date;
    const [queue] = worldToMorph(withoutDate).nodes;
    expect(queue.date).toEqual({ start: Date.UTC(2003, 0, 1), end: Date.UTC(2009, 0, 1) });
  });

  it('leaves a node with neither undated, so the timeline shelves it rather than inventing a time', () => {
    expect(worldToMorph(spec()).nodes[1].date).toBeUndefined();
  });
});

describe('WorldOverlay — the "Over time" chip', () => {
  const timeless: WorldSpec = {
    title: 'Why was every order late on Friday?',
    outcomeId: 'late',
    provenance: {},
    nodes: [
      { id: 'fryers', label: 'Two fryers were down', role: 'root', depth: 0, tier: 'T0' },
      { id: 'late', label: 'Every ticket left late', role: 'outcome', depth: 1, tier: 'T0' },
    ],
    edges: [{ from: 'fryers', to: 'late', sign: 1, tier: 'T0', provisional: true }],
  };

  it('is offered on a world that carries dates', () => {
    render(<WorldOverlay spec={WORLD_SEED} />);
    expect(screen.getByRole('button', { name: 'Over time' })).toBeEnabled();
  });

  it('is absent on a world where nothing is dated', () => {
    // Not dimmed — absent. A chip whose whole content would be the held-aside band promises
    // something to see and delivers a wall of excuses; the views that remain are the real offer.
    render(<WorldOverlay spec={timeless} />);
    expect(screen.queryByRole('button', { name: 'Over time' })).toBeNull();
    // This world carries no series either, so the chart is honestly unofferable too — both
    // time-based views withhold themselves for the same reason. Graph always remains: every world
    // has causal structure, so the reader is never left with no view at all.
    expect(screen.queryByRole('button', { name: 'As a chart' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Graph' })).toBeEnabled();
  });

  it('will not open on a timeline it would not offer, even when a follow-up asks for one', () => {
    render(<WorldOverlay spec={timeless} view="timeline" />);
    expect(screen.queryByRole('button', { name: 'Over time' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Graph' }).getAttribute('aria-pressed')).toBe('true');
  });
});
