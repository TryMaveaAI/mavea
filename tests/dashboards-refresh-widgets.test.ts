// dashboards-refresh-widgets.test.ts — the RICH-content half of refreshDashboard's combined call:
// a widget pinned with a refreshQuery gets its whole block regenerated via search, never just a
// number. Mocks the provider adapter so this is deterministic and offline; locks the honesty
// properties that matter — never fabricate a value when the call fails or returns nothing, and
// never accept a block whose type doesn't match what was asked for (a mismatched type is worse
// than leaving the stale one in place).
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Dashboard, Widget } from '../src/live/dashboards/types';
import type { ModelConfig } from '../src/types/mavea';

const generateMock = vi.fn();
vi.mock('../src/live/providers/index', () => ({
  getAdapter: () => ({ generate: generateMock }),
}));

import { refreshDashboard } from '../src/live/dashboards/refresh';

const cfg: ModelConfig = { provider: 'openai', model: 'gpt-5.4-mini', apiKey: 'k' };

const widget = (over: Partial<Widget> = {}): Widget => ({
  id: 'w1',
  block: {
    type: 'insight',
    id: 'b1',
    col: 4,
    props: { title: 'Old scores', stat: '0-0' },
  } as never,
  span: 1,
  fromSource: 'talk',
  refreshQuery: "today's world cup scores",
  ...over,
});

const dash = (widgets: Widget[]): Dashboard =>
  ({
    id: 'd1',
    metrics: [],
    widgets,
  }) as unknown as Dashboard;

beforeEach(() => {
  generateMock.mockReset();
});

describe('refreshDashboard — widget grounding (no metrics in play)', () => {
  it('no-ops for free when nothing is pinned with a refreshQuery', async () => {
    const out = await refreshDashboard(dash([widget({ refreshQuery: undefined })]), cfg);
    expect(out.widgets).toEqual({});
    expect(generateMock).not.toHaveBeenCalled();
  });

  it('replaces a widget block with the fresh, search-grounded answer', async () => {
    generateMock.mockResolvedValue({
      raw: JSON.stringify({
        narration: 'n',
        title: 't',
        sub: 's',
        blocks: [{ type: 'insight', props: { title: 'Live scores', stat: '1-2' } }],
      }),
    });

    const out = await refreshDashboard(dash([widget()]), cfg);
    expect(out.widgets.w1).toBeDefined();
    expect(out.widgets.w1.type).toBe('insight');
    expect((out.widgets.w1 as { props: { stat: string } }).props.stat).toBe('1-2');

    // The call actually asked for search + the SAME block type back, not a free-form ask.
    const req = generateMock.mock.calls[0][0];
    expect(req.tools).toEqual({ webSearch: true });
    expect(req.blockTypes).toEqual(['insight']);
    expect(req.user).toContain("today's world cup scores");
  });

  it('never accepts a block whose type doesn’t match what was asked for', async () => {
    generateMock.mockResolvedValue({
      raw: JSON.stringify({
        narration: 'n',
        title: 't',
        sub: 's',
        // Asked for 'insight' back, model returned 'kpi' instead — must be dropped, not swapped in.
        blocks: [{ type: 'kpi', props: { title: 'Wrong shape', kpis: [] } }],
      }),
    });
    const out = await refreshDashboard(dash([widget()]), cfg);
    expect(out.widgets).toEqual({});
  });

  it('degrades to {} (never throws, never fabricates) when the call fails', async () => {
    generateMock.mockRejectedValue(new Error('network down'));
    const out = await refreshDashboard(dash([widget()]), cfg);
    expect(out.widgets).toEqual({});
    expect(out.values).toEqual({});
  });

  it('degrades to {} when the response is unparseable JSON', async () => {
    generateMock.mockResolvedValue({ raw: 'not json at all' });
    const out = await refreshDashboard(dash([widget()]), cfg);
    expect(out.widgets).toEqual({});
  });

  it('passes a genuine grounded=true into validateLiveResponse when sources come back native', async () => {
    generateMock.mockResolvedValue({
      raw: JSON.stringify({
        narration: 'n',
        title: 't',
        sub: 's',
        blocks: [{ type: 'insight', props: { title: 'Live scores', stat: '1-2', conf: 'strong' } }],
      }),
      sources: [{ title: 'ESPN', url: 'https://example.com/espn' }],
    });
    const out = await refreshDashboard(dash([widget()]), cfg);
    // A numeric 'strong' claim with no sources of its own only survives when the turn is actually
    // grounded — proving the real (not hardcoded-false) signal reached validateLiveResponse.
    expect((out.widgets.w1 as { props: { conf?: string } }).props.conf).toBe('strong');
  });

  it('passes a genuine grounded=true from the self-reported inline "sources" fallback too', async () => {
    generateMock.mockResolvedValue({
      raw: JSON.stringify({
        narration: 'n',
        title: 't',
        sub: 's',
        blocks: [{ type: 'insight', props: { title: 'Live scores', stat: '1-2', conf: 'strong' } }],
        sources: [{ title: 'ESPN', url: 'https://example.com/espn' }],
      }),
    });
    const out = await refreshDashboard(dash([widget()]), cfg);
    expect((out.widgets.w1 as { props: { conf?: string } }).props.conf).toBe('strong');
  });

  it('downgrades an unsourced numeric "strong" claim to "inferred" when the call is ungrounded', async () => {
    generateMock.mockResolvedValue({
      raw: JSON.stringify({
        narration: 'n',
        title: 't',
        sub: 's',
        blocks: [{ type: 'insight', props: { title: 'Live scores', stat: '1-2', conf: 'strong' } }],
      }),
    });
    const out = await refreshDashboard(dash([widget()]), cfg);
    expect((out.widgets.w1 as { props: { conf?: string } }).props.conf).toBe('inferred');
  });

  it('batches every refreshable widget into ONE call, not one per widget', async () => {
    generateMock.mockResolvedValue({
      raw: JSON.stringify({
        narration: 'n',
        title: 't',
        sub: 's',
        blocks: [
          { type: 'insight', props: { title: 'A', stat: '1' } },
          { type: 'insight', props: { title: 'B', stat: '2' } },
        ],
        // Grounded on the first try — this test is about BATCHING (N widgets, one call), not
        // refreshDashboards' separate ungrounded-retry behavior, which would otherwise add a
        // second call here and break the "exactly one" assertion below.
        sources: [{ title: 'source', url: 'https://example.com' }],
      }),
    });
    const w2 = widget({
      id: 'w2',
      block: { type: 'insight', id: 'b2', col: 4, props: { title: 'Old', stat: '0' } } as never,
      refreshQuery: 'latest headlines',
    });
    const out = await refreshDashboard(dash([widget(), w2]), cfg);
    expect(generateMock).toHaveBeenCalledTimes(1);
    expect(Object.keys(out.widgets).sort()).toEqual(['w1', 'w2']);
  });
});

describe('refreshDashboard — combined metrics + widgets in one call', () => {
  it('asks for both VALUE and BLOCK items in a single request', async () => {
    generateMock.mockResolvedValue({
      raw: JSON.stringify({
        values: { 'AAPL price': 312.5 },
        blocks: [{ type: 'insight', props: { title: 'Live scores', stat: '1-2' } }],
      }),
      sources: [{ title: 'Yahoo Finance', url: 'https://example.com/aapl' }],
    });
    const d = {
      id: 'd1',
      metrics: [
        {
          id: 'm1',
          label: 'AAPL price',
          query: 'current AAPL price',
          sourceQuote: { text: 'x', saidAt: 0 },
          lastValue: null,
          origin: 'empty',
        },
      ],
      widgets: [widget()],
    } as unknown as Dashboard;

    const out = await refreshDashboard(d, cfg);
    expect(generateMock).toHaveBeenCalledTimes(1);
    expect(out.values.m1).toEqual({ value: 312.5, raw: '312.5' });
    expect(out.widgets.w1).toBeDefined();

    const req = generateMock.mock.calls[0][0];
    expect(req.user).toContain('AAPL price');
    expect(req.user).toContain("today's world cup scores");
  });

  it('no-ops entirely when there is neither a metric nor a widget to refresh', async () => {
    const d = { id: 'd1', metrics: [], widgets: [] } as unknown as Dashboard;
    const out = await refreshDashboard(d, cfg);
    expect(out).toEqual({ values: {}, widgets: {}, ok: true });
    expect(generateMock).not.toHaveBeenCalled();
  });
});

// A never-filled board's "current content" is an empty skeleton, which teaches a model nothing
// about item shape — so it invents field names ({ticker, companyName, currentPrice} on a list),
// and the validator then rejects the very data the search just paid for. The board read "no new
// data" forever while every check grounded. Two defenses, both pinned here: the prompt teaches
// each BLOCK's exact shape, and the list coercer salvages an alien-but-real item.
describe('refreshDashboard — the prompt teaches each block its shape', () => {
  it('a list target is taught plain-string items, and a taught reply lands', async () => {
    generateMock.mockResolvedValue({
      raw: JSON.stringify({
        dashboards: [
          {
            id: 'd1',
            values: {},
            blocks: [
              {
                type: 'list',
                props: { title: 'Top prices', items: ['NVDA — $225.16', 'TSM — $426.35'] },
              },
            ],
          },
        ],
      }),
      sources: [{ title: 's', url: 'https://example.com' }],
    });

    const w = widget({
      block: { type: 'list', id: 'b1', col: 6, props: { title: 'Top prices', items: [] } } as never,
      refreshQuery: 'top semiconductor stock prices',
    });
    const out = await refreshDashboard(dash([w]), cfg);

    const req = generateMock.mock.calls[0][0];
    expect(req.user).toContain('expected props');
    expect(req.user).toContain('"items": string[]');
    expect((out.widgets.w1 as { props: { items: string[] } }).props.items).toHaveLength(2);
  });

  it('a generic-coerced target (scoreboard) is taught from its structural reference', async () => {
    generateMock.mockResolvedValue({ raw: '{}' });
    const w = widget({
      block: { type: 'scoreboard', id: 'b1', col: 8, props: { games: [] } } as never,
      refreshQuery: 'yankees scores',
    });
    await refreshDashboard(dash([w]), cfg);

    const req = generateMock.mock.calls[0][0];
    expect(req.user).toContain('expected props');
    expect(req.user).toContain('"games"');
  });

  it('salvages a list whose items came back as invented objects carrying real data', async () => {
    generateMock.mockResolvedValue({
      raw: JSON.stringify({
        dashboards: [
          {
            id: 'd1',
            values: {},
            blocks: [
              {
                type: 'list',
                props: {
                  title: 'Top semiconductor prices',
                  items: [
                    { ticker: 'NVDA', companyName: 'NVIDIA Corporation', currentPrice: 225.16 },
                    { ticker: 'TSM', companyName: 'Taiwan Semiconductor', currentPrice: 426.35 },
                  ],
                },
              },
            ],
          },
        ],
      }),
      sources: [{ title: 's', url: 'https://example.com' }],
    });

    const w = widget({
      block: { type: 'list', id: 'b1', col: 6, props: { title: 'Top prices', items: [] } } as never,
      refreshQuery: 'top semiconductor stock prices',
    });
    const out = await refreshDashboard(dash([w]), cfg);

    const items = (out.widgets.w1 as { props: { items: string[] } }).props.items;
    expect(items).toEqual([
      'NVDA — NVIDIA Corporation — 225.16',
      'TSM — Taiwan Semiconductor — 426.35',
    ]);
  });
});

// Coverage is the point: a paid product can't teach some topics and shrug at others. Every type
// the validator will actually accept has a shape hint; the only untaught types are the four
// demo-fixture-only renderers the validator itself refuses from a model (custom coercer, no
// builder), which therefore can never appear in a Live answer, never be pinned, and never become
// a refresh target. A new type joining this list is a regression, not a footnote.
describe('blockShapeHint — every reachable type is taught', () => {
  it('teaches all catalog types except the demo-only renderers', async () => {
    const { blockShapeHint } = await import('../src/engine/liveSchema');
    const { CATALOG_FACTS } = await import('../src/canvas/blocks/catalog/facts');
    const untaught = CATALOG_FACTS.map((f) => f.type).filter((t) => blockShapeHint(t) === null);
    expect(untaught.sort()).toEqual(['heat', 'preview', 'schema', 'videoembed']);
  });
});

// buildComposite strips 'composite' from the allowed set it hands its children, so validating a
// composite refresh against {composite} alone left the children an EMPTY allowed set — every
// child died, the region list came back under the floor, and a pinned composite card could never
// refresh at all.
describe('refreshDashboard — a composite widget can actually refresh', () => {
  it('re-fills a composite using its existing children as the allowed composition', async () => {
    generateMock.mockResolvedValue({
      raw: JSON.stringify({
        dashboards: [
          {
            id: 'd1',
            values: {},
            blocks: [
              {
                type: 'composite',
                props: {
                  title: 'Market snapshot',
                  regions: [
                    {
                      block: {
                        type: 'kpi',
                        props: { title: 'Prices', items: [{ label: 'NVDA', value: '$225.30' }] },
                      },
                    },
                    {
                      block: {
                        type: 'list',
                        props: { title: 'Movers', items: ['NVDA up', 'INTC down'] },
                      },
                    },
                  ],
                },
              },
            ],
          },
        ],
      }),
      sources: [{ title: 's', url: 'https://example.com' }],
    });

    const w = widget({
      block: {
        type: 'composite',
        id: 'b1',
        col: 12,
        props: {
          title: 'Market snapshot',
          regions: [
            { block: { type: 'kpi', id: 'c1', col: 6, props: { title: 'Prices', items: [] } } },
            { block: { type: 'list', id: 'c2', col: 6, props: { title: 'Movers', items: [] } } },
          ],
        },
      } as never,
      refreshQuery: 'semiconductor market snapshot',
    });
    const out = await refreshDashboard(dash([w]), cfg);

    expect(out.widgets.w1).toBeDefined();
    expect(out.widgets.w1.type).toBe('composite');
    const regions = (out.widgets.w1 as { props: { regions: Array<{ block: { type: string } }> } })
      .props.regions;
    expect(regions.map((r) => r.block.type)).toEqual(['kpi', 'list']);
  });
});

// The list's two-item floor is a canvas COMPOSITION rule — beside other cards, one bullet reads
// thin. A dashboard tile stands alone, and its one item can be the entire honest answer: an FDA
// calendar whose next section currently holds a single upcoming meeting, fetched and sourced.
// Dropping it read as "checked — no new data" while the model had returned exactly the data.
describe('refreshDashboard — a single-item list is a complete refresh for a standalone tile', () => {
  it('accepts the one real item instead of discarding the grounded fetch', async () => {
    generateMock.mockResolvedValue({
      raw: JSON.stringify({
        dashboards: [
          {
            id: 'd1',
            values: {},
            blocks: [
              {
                type: 'list',
                props: {
                  title: 'Upcoming FDA advisory committee meetings',
                  items: ['Pediatric Advisory Committee — September 16, 2026 — upcoming'],
                },
              },
            ],
          },
        ],
      }),
      sources: [{ title: 'FDA', url: 'https://www.fda.gov/advisory-committees' }],
    });

    const w = widget({
      block: {
        type: 'list',
        id: 'b1',
        col: 6,
        props: { title: 'FDA calendar', items: [] },
      } as never,
      refreshQuery: 'FDA advisory committee calendar',
    });
    const out = await refreshDashboard(dash([w]), cfg);

    const items = (out.widgets.w1 as { props: { items: string[] } }).props.items;
    expect(items).toEqual(['Pediatric Advisory Committee — September 16, 2026 — upcoming']);
  });
});
