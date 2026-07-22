import { beforeEach, describe, expect, it, vi } from 'vitest';

const generateMock = vi.fn();
vi.mock('../src/live/providers/index', () => ({
  getAdapter: () => ({ generate: generateMock }),
}));

import {
  buildDashboard,
  coerceDraft,
  currentTopicStart,
  extractDashboard,
  foldDraftIntoDashboard,
  groundedDraft,
} from '../src/live/dashboards/extract';
import { addDashboard, clearDashboards, getDashboard } from '../src/live/dashboards/store';
import type { ChatMessage } from '../src/live/providers/types';
import type { TurnFrame } from '../src/live/history';
import type { DashboardDraft } from '../src/live/dashboards/types';
import type { ModelConfig } from '../src/types/mavea';

// Extraction: the pure coerce core keeps the model honest (verbatim quotes, no fabricated
// thresholds, valid comparators), buildDashboard turns a reviewed draft into a persistable
// dashboard whose reasoning is set once, and groundedDraft is the offline fallback.

const GOOD = {
  title: 'Investment Thesis',
  thesis: { text: 'rates fall through Q3, tech wins' },
  metrics: [
    {
      label: '10Y yield',
      query: 'US 10 year yield',
      unit: '%',
      sourceQuote: { text: 'the 10-year' },
      userSupplied: false,
    },
    {
      label: 'My mileage',
      query: '',
      sourceQuote: { text: 'my weekly mileage' },
      userSupplied: true,
    },
  ],
  tripwires: [
    {
      label: '10Y above 4.5%',
      comparator: 'gt',
      threshold: 4.5,
      unit: '%',
      metricLabel: '10Y yield',
      sourceQuote: { text: 'reconsider if the 10-year crosses 4.5%' },
    },
    {
      label: 'bad',
      comparator: 'nonsense',
      threshold: 1,
      metricLabel: '10Y yield',
      sourceQuote: { text: 'x' },
    },
    {
      label: 'no-thresh',
      comparator: 'gt',
      threshold: 'high',
      metricLabel: '10Y yield',
      sourceQuote: { text: 'x' },
    },
    {
      label: 'orphan',
      comparator: 'gt',
      threshold: 1,
      metricLabel: 'Nonexistent',
      sourceQuote: { text: 'x' },
    },
  ],
  widgets: [{ metricLabel: '10Y yield', blockType: 'insight', span: 2 }],
};

describe('coerceDraft', () => {
  it('keeps a valid draft and drops every malformed tripwire', () => {
    const d = coerceDraft(GOOD, 1000)!;
    expect(d.title).toBe('Investment Thesis');
    expect(d.thesis.text).toBe('rates fall through Q3, tech wins');
    expect(d.metrics).toHaveLength(2);
    // only the one well-formed tripwire survives (bad comparator / NaN threshold / orphan dropped)
    expect(d.tripwires).toHaveLength(1);
    expect(d.tripwires[0].comparator).toBe('gt');
  });
  it('a user-supplied metric keeps no query; a query-less non-user metric is dropped', () => {
    const d = coerceDraft(GOOD, 1000)!;
    expect(d.metrics.find((m) => m.label === 'My mileage')!.query).toBe('');
    const noSource = coerceDraft(
      { thesis: { text: 't' }, metrics: [{ label: 'x', query: '', userSupplied: false }] },
      0,
    )!;
    expect(noSource.metrics).toHaveLength(0);
  });
  it('returns null without a verbatim thesis', () => {
    expect(coerceDraft({ metrics: [] }, 0)).toBeNull();
    expect(coerceDraft({ thesis: { text: '' } }, 0)).toBeNull();
  });

  it('does not regress GOOD: a user-supplied metric with zero thesis overlap still survives', () => {
    // "My mileage" shares not one meaningful word with the "rates fall … tech wins" thesis — the
    // coherence filter must never touch a userSupplied metric, so both of GOOD's metrics survive.
    const d = coerceDraft(GOOD, 1000)!;
    expect(d.metrics.map((m) => m.label)).toEqual(['10Y yield', 'My mileage']);
  });

  it('drops an off-topic, non-userSupplied metric and tripwire; keeps a userSupplied one regardless', () => {
    const raw = {
      thesis: { text: 'AI chip demand is driving the market rally' },
      metrics: [
        {
          label: 'Nvidia revenue growth',
          query: 'Nvidia quarterly revenue growth',
          sourceQuote: { text: 'chip demand keeps climbing' },
          userSupplied: false,
        },
        {
          // Real number, real query, but bled in from an unrelated line of the same transcript —
          // nothing here shares a word with the thesis or the other metric.
          label: 'Local weather',
          query: 'Denver weather forecast',
          sourceQuote: { text: 'it is sunny outside today' },
          userSupplied: false,
        },
        {
          label: 'My savings rate',
          query: '',
          sourceQuote: { text: 'a completely unrelated aside about my own savings' },
          userSupplied: true,
        },
      ],
      tripwires: [
        {
          label: 'Weather turns cold',
          comparator: 'gt',
          threshold: 1,
          metricLabel: 'Nvidia revenue growth',
          sourceQuote: { text: 'if it starts snowing heavily this winter' },
        },
      ],
    };
    const d = coerceDraft(raw, 0)!;
    expect(d.metrics.map((m) => m.label)).toEqual(['Nvidia revenue growth', 'My savings rate']);
    expect(d.tripwires).toHaveLength(0); // its own words share nothing with the thesis or metric
  });

  it('drops TWO off-topic metrics that only validate EACH OTHER, not the thesis', () => {
    // Neither "Tokyo temperature" nor "Tokyo humidity" shares a word with the AAPL thesis, but they
    // share "tokyo" WITH EACH OTHER — the exact mutual-validation loophole a pairwise "does this
    // overlap any other item" check would fall for.
    const raw = {
      thesis: { text: 'AAPL keeps rising on strong iPhone demand' },
      metrics: [
        {
          label: 'AAPL price',
          query: 'AAPL stock price',
          sourceQuote: { text: 'the iPhone demand story is intact' },
          userSupplied: false,
        },
        {
          label: 'Tokyo temperature',
          query: 'Tokyo temperature today',
          sourceQuote: { text: 'it was mentioned Tokyo is unusually warm this week' },
          userSupplied: false,
        },
        {
          label: 'Tokyo humidity',
          query: 'Tokyo humidity today',
          sourceQuote: { text: 'Tokyo humidity was also brought up in passing' },
          userSupplied: false,
        },
      ],
      tripwires: [],
    };
    const d = coerceDraft(raw, 0)!;
    expect(d.metrics.map((m) => m.label)).toEqual(['AAPL price']);
  });
});

describe('currentTopicStart', () => {
  const frame = (mode: TurnFrame['mode']): TurnFrame =>
    ({
      question: 'q',
      narration: '',
      mode,
      tour: [],
      at: 0,
      spec: { blocks: [] },
    }) as unknown as TurnFrame;

  it('returns the last replace frame — the start of the CURRENT thread', () => {
    const frames = [frame('replace'), frame('augment'), frame('replace'), frame('refine')];
    expect(currentTopicStart(frames)).toBe(2);
  });
  it('returns 0 when the whole session is one continuous thread', () => {
    expect(currentTopicStart([frame('replace'), frame('augment'), frame('refine')])).toBe(0);
  });
  it('returns 0 with no frames at all', () => {
    expect(currentTopicStart([])).toBe(0);
  });
});

describe('extractDashboard (history window)', () => {
  const cfg: ModelConfig = { provider: 'openai', model: 'gpt-5.4-mini', apiKey: 'k' };
  const msg = (role: ChatMessage['role'], content: string): ChatMessage => ({ role, content });
  const frame = (mode: TurnFrame['mode'], question: string): TurnFrame =>
    ({
      question,
      narration: '',
      mode,
      tour: [],
      at: 0,
      spec: { blocks: [] },
    }) as unknown as TurnFrame;

  beforeEach(() => {
    generateMock.mockReset();
    generateMock.mockResolvedValue({ raw: JSON.stringify({ thesis: { text: 'x' } }) });
  });

  it('sends only the messages from the current topic onward, in the normal 1-frame-per-turn-pair case', async () => {
    const frames = [
      frame('replace', 'tell me about topic A'),
      frame('augment', 'more on topic A'),
      frame('replace', 'now switching to topic B'),
    ];
    const history: ChatMessage[] = [
      msg('user', 'tell me about topic A'),
      msg('assistant', 'A said'),
      msg('user', 'more on topic A'),
      msg('assistant', 'more A said'),
      msg('user', 'now switching to topic B'),
      msg('assistant', 'B said'),
    ];
    await extractDashboard(history, frames, cfg);
    const sent = generateMock.mock.calls[0][0].history as ChatMessage[];
    // Only the last (topic B) turn — the topic-A pair before the final replace is left out.
    expect(sent).toEqual([msg('user', 'now switching to topic B'), msg('assistant', 'B said')]);
  });

  it('still caps the narrowed window at the last 12 messages', async () => {
    const frames = Array.from({ length: 8 }, (_, i) => frame('augment', `q${i}`));
    frames[0] = frame('replace', 'q0'); // one long thread, 8 turns = 16 messages
    const history: ChatMessage[] = frames.flatMap((f, i) => [
      msg('user', f.question),
      msg('assistant', `a${i}`),
    ]);
    await extractDashboard(history, frames, cfg);
    const sent = generateMock.mock.calls[0][0].history as ChatMessage[];
    expect(sent).toHaveLength(12);
    expect(sent).toEqual(history.slice(-12)); // whole thread is current, so only the cap trims it
  });

  it('falls back to slice(-12) when history/frames are not a clean 2:1 pairing', async () => {
    // e.g. a saved Library canvas: one synthetic frame over a one-line history.
    const frames = [frame('replace', 'q')];
    const history: ChatMessage[] = [
      msg('user', 'q1'),
      msg('assistant', 'a1'),
      msg('user', 'q2'),
      msg('assistant', 'a2'),
      msg('user', 'q3'),
    ];
    await extractDashboard(history, frames, cfg);
    const sent = generateMock.mock.calls[0][0].history as ChatMessage[];
    expect(sent).toEqual(history.slice(-12));
  });
});

describe('buildDashboard', () => {
  it('builds widgets + resolves tripwire metric ids; reasoning set once, values empty', () => {
    const draft = coerceDraft(GOOD, 1000)!;
    const dash = buildDashboard(draft, {
      conversationId: 'c1',
      conversationTitle: 'Markets chat',
      now: 5000,
    });
    expect(dash.thesis.text).toBe('rates fall through Q3, tech wins');
    expect(dash.metrics.every((m) => m.lastValue === null && m.origin === 'empty')).toBe(true);
    // user-supplied metric becomes a Blank (blankKey set, no query)
    expect(dash.metrics.find((m) => m.label === 'My mileage')!.blankKey).toBeTruthy();
    // the tripwire points at the real metric id
    const tw = dash.tripwires[0];
    expect(dash.metrics.some((m) => m.id === tw.metricId)).toBe(true);
    expect(tw.state).toBe('AWAITING');
    // widget set: thesis + gauge + one metric card each + alerts + sources
    const types = dash.widgets.map((w) => w.block.type);
    expect(types).toContain('thesis');
    expect(types).toContain('alignmentgauge');
    expect(types).toContain('standingalerts');
    expect(types).toContain('sourceslineage');
    expect(dash.sources[0].kind).toBe('ORIGIN');
    // Manual is the default cadence — nextDataAt parks forever; the durable "first check"
    // one-shot (armed because "10Y yield" is a real search-tracked metric) is what guarantees an
    // immediate fetch instead, surviving a keyless/reloaded creation the way a bare nextDataAt: now
    // never could.
    expect(dash.cadence).toEqual({ data: 'manual', ai: 'manual' });
    expect(dash.nextDataAt).toBe(Number.MAX_SAFE_INTEGER);
    expect(dash.oneShotAt).toBe(5000);
    expect(dash.oneShotLabel).toBe('first check');
    expect(dash.lastRefreshedAt).toBeNull();
  });

  it('a chrome-only draft with no search-tracked metric gets no first-check one-shot', () => {
    const draft: DashboardDraft = {
      title: 'T',
      thesis: { text: 'x', saidAt: 0 },
      metrics: [
        {
          label: 'My number',
          query: '',
          sourceQuote: { text: 'x', saidAt: 0 },
          userSupplied: true,
        },
      ],
      tripwires: [],
      suggestedWidgets: [],
    };
    const dash = buildDashboard(draft, { conversationId: 'c1', conversationTitle: 'x', now: 5000 });
    expect(dash.oneShotAt).toBeUndefined();
  });

  it('an explicit cadence override lands on the built dashboard', () => {
    const draft = coerceDraft(GOOD, 1000)!;
    const dash = buildDashboard(draft, {
      conversationId: 'c1',
      conversationTitle: 'Markets chat',
      now: 5000,
      cadence: { data: 'hourly', ai: 'on-change' },
    });
    expect(dash.cadence).toEqual({ data: 'hourly', ai: 'on-change' });
    expect(dash.nextDataAt).toBe(5000 + 60 * 60_000);
  });
  it('omits standing-alerts when there are no tripwires', () => {
    const draft: DashboardDraft = {
      title: 'T',
      thesis: { text: 'x', saidAt: 0 },
      metrics: [],
      tripwires: [],
      suggestedWidgets: [],
    };
    const dash = buildDashboard(draft, { conversationId: 'c', conversationTitle: 'C' });
    expect(dash.widgets.map((w) => w.block.type)).not.toContain('standingalerts');
  });
});

describe('groundedDraft (offline fallback)', () => {
  const frame = (title: string, blocks: unknown[]): TurnFrame =>
    ({
      question: 'q',
      narration: '',
      mode: 'replace',
      tour: [],
      at: 0,
      spec: { title, blocks },
    }) as unknown as TurnFrame;

  it('uses the last user line as the thesis and on-canvas stats as user-supplied metrics', () => {
    const history: ChatMessage[] = [
      { role: 'user', content: 'I want to track my marathon training' },
      { role: 'assistant', content: 'ok' },
    ];
    const frames = [
      frame('Training', [
        { type: 'insight', id: 'a', num: '1', props: { title: 'Weekly mileage' } },
        { type: 'list', props: { title: 'tips' } },
      ]),
    ];
    const d = groundedDraft(history, frames, 0);
    expect(d.thesis.text).toBe('I want to track my marathon training');
    expect(d.metrics).toHaveLength(1);
    expect(d.metrics[0].label).toBe('Weekly mileage');
    expect(d.metrics[0].userSupplied).toBe(true);
    expect(d.tripwires).toHaveLength(0); // never fabricated offline
  });
});

describe('foldDraftIntoDashboard', () => {
  beforeEach(() => {
    localStorage.clear();
    clearDashboards();
  });

  it('appends a later conversation’s new metrics/alerts + an ADDED source, without dropping the thesis', () => {
    const base = buildDashboard(coerceDraft(GOOD, 1000)!, {
      conversationId: 'c1',
      conversationTitle: 'Markets chat',
    });
    addDashboard(base);
    const thesisBefore = base.thesis.text;
    const metricCountBefore = base.metrics.length;

    // A later conversation about the dollar — one new metric + one new alert.
    const draft = coerceDraft(
      {
        thesis: { text: 'the dollar is now a headwind' },
        metrics: [
          {
            label: 'Dollar index (DXY)',
            query: 'DXY dollar index',
            sourceQuote: { text: 'the dollar' },
            userSupplied: false,
          },
        ],
        tripwires: [
          {
            label: 'DXY above 106',
            comparator: 'gt',
            threshold: 106,
            metricLabel: 'Dollar index (DXY)',
            // Names the dollar/index it watches (not just the bare threshold) so the coherence
            // filter — which checks a tripwire's quote against its thesis + metric label — sees
            // this is plainly about the same metric, same as a real transcript would read.
            sourceQuote: { text: 'if the dollar index gets above 106 it hurts tech' },
          },
        ],
      },
      2000,
    )!;
    const added = foldDraftIntoDashboard(base, draft, 'Feb 3 chat', 2000);

    const after = getDashboard(base.id)!;
    expect(added).toBe(2); // 1 metric + 1 alert
    expect(after.thesis.text).toBe(thesisBefore); // reasoning untouched
    expect(after.metrics.length).toBe(metricCountBefore + 1);
    expect(after.metrics.some((m) => m.label === 'Dollar index (DXY)')).toBe(true);
    expect(after.sources.at(-1)).toMatchObject({ kind: 'ADDED', title: 'Feb 3 chat' });
    // the new alert resolved onto the new metric
    const tw = after.tripwires.find((t) => t.label === 'DXY above 106')!;
    expect(after.metrics.some((m) => m.id === tw.metricId)).toBe(true);
  });

  it('does not duplicate a metric already tracked', () => {
    const base = buildDashboard(coerceDraft(GOOD, 1000)!, {
      conversationId: 'c1',
      conversationTitle: 'Markets chat',
    });
    addDashboard(base);
    const before = base.metrics.length;
    // GOOD already has "10Y yield" — folding the same draft adds nothing new.
    const added = foldDraftIntoDashboard(base, coerceDraft(GOOD, 3000)!, 'dup chat', 3000);
    const after = getDashboard(base.id)!;
    expect(added).toBe(0);
    expect(after.metrics.length).toBe(before);
    expect(after.sources.at(-1)).toMatchObject({
      kind: 'ADDED',
      contributed: 'Linked this conversation.',
    });
  });
});
