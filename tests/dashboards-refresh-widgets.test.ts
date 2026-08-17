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
    expect(req.tools).toEqual({ webSearch: true, requireSearch: true });
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
describe('refreshDashboard — a data-shaped target asks for DATA, not a rendered block', () => {
  it('asks a list target for the canonical list shape, and projects the reply locally', async () => {
    generateMock.mockResolvedValue({
      raw: JSON.stringify({
        dashboards: [
          {
            id: 'd1',
            values: {},
            observations: [{ kind: 'list', items: ['NVDA — $225.16', 'TSM — $426.35'] }],
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
    // The prompt names DATA and the flat schema — never a component or a prop name.
    expect(req.user).toContain('DATA #0 [list]');
    expect(req.user).toContain('"kind":"list","items":[string]');
    expect(req.user).not.toContain('BLOCK #0');

    const props = (out.widgets.w1 as { props: { items: string[]; title: string } }).props;
    expect(props.items).toEqual(['NVDA — $225.16', 'TSM — $426.35']);
    // The tile keeps its own identity — a refresh fetches values, it does not rename the card.
    expect(props.title).toBe('Top prices');
  });

  it('salvages items that came back as invented objects carrying real data', async () => {
    generateMock.mockResolvedValue({
      raw: JSON.stringify({
        dashboards: [
          {
            id: 'd1',
            values: {},
            observations: [
              {
                kind: 'list',
                items: [
                  { ticker: 'NVDA', companyName: 'NVIDIA Corporation', currentPrice: 225.16 },
                  { ticker: 'TSM', companyName: 'Taiwan Semiconductor', currentPrice: 426.35 },
                ],
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

    expect((out.widgets.w1 as { props: { items: string[] } }).props.items).toEqual([
      'NVDA — NVIDIA Corporation — 225.16',
      'TSM — Taiwan Semiconductor — 426.35',
    ]);
  });

  it('keeps a single real item — one row can be the entire honest answer', async () => {
    generateMock.mockResolvedValue({
      raw: JSON.stringify({
        dashboards: [
          {
            id: 'd1',
            values: {},
            observations: [
              { kind: 'list', items: ['Pediatric Advisory Committee — September 16, 2026'] },
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

    expect((out.widgets.w1 as { props: { items: string[] } }).props.items).toHaveLength(1);
  });

  it('an ungrounded call still yields nothing, data path or not', async () => {
    generateMock.mockResolvedValue({
      raw: JSON.stringify({
        dashboards: [
          { id: 'd1', values: {}, observations: [{ kind: 'list', items: ['made up'] }] },
        ],
      }),
      // no sources ⇒ ungrounded ⇒ every fetched value is discarded, exactly as for blocks
    });
    const w = widget({
      block: { type: 'list', id: 'b1', col: 6, props: { title: 'T', items: [] } } as never,
      refreshQuery: 'q',
    });
    const out = await refreshDashboard(dash([w]), cfg);
    expect(out.widgets.w1).toBeUndefined();
  });

  it('declares NO blockTypes when every target is canonical — so the call is not a canvas turn', async () => {
    // Consequence, not cosmetics: a non-empty blockTypes marks the request a canvas turn, which
    // pins provider reasoning to 'low', and web search does not engage reliably below 'medium'.
    // Declaring a schema the data path never needed made a live-data check answer from training
    // memory with an empty sources array — one search billed, every value correctly discarded.
    generateMock.mockResolvedValue({ raw: '{}' });
    const w = widget({
      block: { type: 'list', id: 'b1', col: 6, props: { title: 'T', items: [] } } as never,
      refreshQuery: 'q',
    });
    await refreshDashboard(dash([w]), cfg);

    const req = generateMock.mock.calls[0][0];
    expect(req.blockTypes).toBeUndefined();
    expect(req.tools).toEqual({ webSearch: true, requireSearch: true });
  });

  it('still declares blockTypes for a mixed board, for the block-path target only', async () => {
    generateMock.mockResolvedValue({ raw: '{}' });
    const canonical = widget({
      id: 'w-list',
      block: { type: 'list', id: 'b1', col: 6, props: { title: 'T', items: [] } } as never,
      refreshQuery: 'q1',
    } as never);
    const bespoke = widget({
      id: 'w-score',
      block: { type: 'scoreboard', id: 'b2', col: 8, props: { games: [] } } as never,
      refreshQuery: 'q2',
    } as never);
    await refreshDashboard(dash([canonical, bespoke]), cfg);

    const req = generateMock.mock.calls[0][0];
    expect(req.blockTypes).toEqual(['scoreboard']);
  });

  it('reserves far fewer tokens for a data target than for a rebuilt block', async () => {
    // Providers reserve input + max_output_tokens against a per-minute quota, so this number
    // decides how many checks fit in a minute. A four-board batch once reserved ~57k of a 200k/min
    // limit, and a handful of boards then 429'd everything behind them.
    generateMock.mockResolvedValue({ raw: '{}' });
    const four = (type: string, props: object) =>
      [0, 1, 2, 3].map((i) =>
        widget({
          id: `w${i}`,
          block: { type, id: `b${i}`, col: 6, props } as never,
          refreshQuery: `q${i}`,
        } as never),
      );

    await refreshDashboard(dash(four('list', { title: 'T', items: [] })), cfg);
    const dataTokens = generateMock.mock.calls[0][0].maxTokens;

    generateMock.mockClear();
    await refreshDashboard(dash(four('scoreboard', { games: [] })), cfg);
    const blockTokens = generateMock.mock.calls[0][0].maxTokens;

    expect(dataTokens).toBeLessThan(blockTokens);
  });

  it('a target with no canonical shape still gets the block path and its prop hint', async () => {
    generateMock.mockResolvedValue({ raw: '{}' });
    const w = widget({
      block: { type: 'scoreboard', id: 'b1', col: 8, props: { games: [] } } as never,
      refreshQuery: 'yankees scores',
    });
    await refreshDashboard(dash([w]), cfg);

    const req = generateMock.mock.calls[0][0];
    expect(req.user).toContain('BLOCK #0 [scoreboard]');
    expect(req.user).toContain('expected props');
    expect(req.user).toContain('"games"');
  });
});

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
// The list block's two-item floor is a canvas COMPOSITION rule. It still applies to a standalone
// BLOCK-path tile (validateLiveResponse's standaloneTile flag), which is why that flag stays — but
// a list target no longer travels that path at all: its single row arrives as data and is projected
// here, so the floor cannot reach it. Both routes now keep one real, sourced row.
describe('refreshDashboard — a projected widget is never regenerated', () => {
  it('skips a metric card even when something gave it a refreshQuery', async () => {
    const metricCard = widget({
      id: 'w-metric',
      block: { type: 'insight', id: 'b1', col: 4, props: { title: 'Price', stat: '—' } } as never,
      metricId: 'm1',
      refreshQuery: 'current price',
    } as never);
    const out = await refreshDashboard(dash([metricCard]), cfg);
    // Nothing to regenerate ⇒ no model call at all for this board.
    expect(generateMock).not.toHaveBeenCalled();
    expect(out.widgets).toEqual({});
  });

  it('skips the board chrome, which is always projected', async () => {
    const chrome = widget({
      id: 'w-thesis',
      block: { type: 'thesis', id: 'b1', col: 12, props: {} } as never,
      refreshQuery: 'restate the thesis',
    } as never);
    await refreshDashboard(dash([chrome]), cfg);
    expect(generateMock).not.toHaveBeenCalled();
  });

  it('still regenerates a real rich widget alongside a skipped metric card', async () => {
    generateMock.mockResolvedValue({
      raw: JSON.stringify({
        dashboards: [
          {
            id: 'd1',
            values: {},
            blocks: [
              { type: 'scoreboard', props: { games: [{ as: 'NYY', hs: 'BOS', at: 3, ht: 2 }] } },
            ],
          },
        ],
      }),
      sources: [{ title: 's', url: 'https://example.com' }],
    });
    const metricCard = widget({
      id: 'w-metric',
      block: { type: 'insight', id: 'b1', col: 4, props: { title: 'Price' } } as never,
      metricId: 'm1',
      refreshQuery: 'current price',
    } as never);
    const rich = widget({
      id: 'w-list',
      block: { type: 'scoreboard', id: 'b2', col: 8, props: { games: [] } } as never,
      refreshQuery: 'biggest movers',
    } as never);

    const out = await refreshDashboard(dash([metricCard, rich]), cfg);
    // Exactly ONE block was asked for — the list — and the metric card got nothing.
    const req = generateMock.mock.calls[0][0];
    expect((req.user.match(/- BLOCK #/g) ?? []).length).toBe(1);
    expect(out.widgets['w-list']).toBeDefined();
    expect(out.widgets['w-metric']).toBeUndefined();
  });
});
