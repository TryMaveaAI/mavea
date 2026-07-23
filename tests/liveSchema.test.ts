import { RAW_CATALOG } from '../src/canvas/blocks/catalog/catalog.data';
import {
  validateLiveResponse,
  ALLOWED_BLOCK_TYPES,
  FRONTIER_BLOCK_TYPES,
  blockTypesForTier,
  liveSystemPrompt,
  hasRenderableImage,
  IMAGE_REQUIRED_TYPES,
} from '../src/engine/liveSchema';
import { ICON_KEYS } from '../src/icons/icons';
// Locks the Live validation core: the pure function that turns loose, possibly
// malformed LLM JSON into a safe, fully-typed renderable response. It is the
// defense-in-depth layer behind every provider — if it regresses, every model's
// output can render garbage. These tests pin its repair guarantees.
describe('validateLiveResponse — coercion & repair', () => {
  it('accepts a parsed object and assigns col / delay / insight ids', () => {
    const r = validateLiveResponse({
      title: 'T',
      sub: 'S',
      narration: 'N',
      blocks: [{ type: 'insight', props: { title: 'A' } }],
    });
    expect(r).not.toBeNull();
    expect(r!.title).toBe('T');
    expect(r!.narration).toBe('N');
    const b = r!.blocks[0];
    expect(b.type).toBe('insight');
    expect(b.col).toBe(4); // COL_BY_TYPE.insight
    expect(b.delay).toBe(0); // first reveal
    if (b.type === 'insight') {
      expect(b.id).toBe('live-1');
      expect(b.num).toBe('1');
    }
  });
  it('carries a per-slide note onto the block (trimmed), and caps an over-long one', () => {
    const long = 'L'.repeat(300);
    const r = validateLiveResponse({
      title: 'T',
      blocks: [
        { type: 'insight', props: { title: 'A' }, note: '  Rent eats half the budget.  ' },
        { type: 'kpi', props: { items: [{ label: 'X', value: '1' }] }, note: long },
        { type: 'list', props: { title: 'L', items: ['x', 'y'] } }, // no note
      ],
    });
    expect(r).not.toBeNull();
    expect(r!.blocks[0].note).toBe('Rent eats half the budget.');
    // capped to ≤170 chars with an ellipsis, never the raw 300.
    expect(r!.blocks[1].note!.length).toBeLessThanOrEqual(170);
    expect(r!.blocks[1].note!.endsWith('…')).toBe(true);
    // a block the model didn't annotate stays note-free (so Focus shows no caption for it).
    expect(r!.blocks[2].note).toBeUndefined();
  });
  it('neutralizes HTML in HAND-BUILT block footers (model markup never reaches a raw renderer)', () => {
    // Custom builders (chart/kpi/insight/…) extract footer via optStr and several renderers
    // print it with dangerouslySetInnerHTML — so the coerced footer must carry no tag chars.
    const r = validateLiveResponse({
      title: 'T',
      blocks: [
        {
          type: 'chart',
          props: {
            title: 'Trend',
            labels: ['Jan', 'Feb'],
            series: [{ name: 'A', data: [1, 2] }],
            footer: '<img src=x onerror="alert(1)">',
          },
        },
        {
          type: 'kpi',
          props: { title: 'K', items: [{ label: 'x', value: '1' }], footer: '<script>x</script>' },
        },
      ],
    });
    const footers = (r?.blocks ?? [])
      .map((b) => (b as { props?: { footer?: unknown } }).props?.footer)
      .filter((f): f is string => typeof f === 'string');
    expect(footers.length).toBeGreaterThan(0);
    for (const f of footers) expect(f.includes('<')).toBe(false);
  });
  it('parses a raw JSON string', () => {
    const r = validateLiveResponse(
      '{"title":"T","blocks":[{"type":"list","props":{"title":"L","items":["a","b"]}}]}',
    );
    expect(r).not.toBeNull();
    expect(r!.title).toBe('T');
    expect(r!.blocks[0].type).toBe('list');
  });
  it('extracts a JSON object embedded in code fences / prose', () => {
    const raw =
      'Sure! Here you go:\n```json\n{"title":"T","blocks":[{"type":"list","props":{"title":"L","items":["a"]}}]}\n```';
    const r = validateLiveResponse(raw);
    expect(r).not.toBeNull();
    expect(r!.title).toBe('T');
  });
  it('salvages completed blocks from a TRUNCATED JSON reply (no lone raw-text card)', () => {
    // The model hit its output cap mid-object: title + two finished blocks, then a third
    // block cut off after a number. Old behavior: whole-string JSON.parse fails → the turn
    // collapses to a single raw-text card. New behavior: recover the two complete blocks.
    const truncated =
      '{"narration":"Here you go.","title":"NJ Economy","sub":"","blocks":[' +
      '{"type":"insight","props":{"title":"NJ Median Income","stat":"$96,346"}},' +
      '{"type":"kpi","props":{"title":"Buckets","items":[{"label":"NJ","value":"$96k"}]}},' +
      '{"type":"bars","props":{"title":"Counties","bars":[{"label":"Hunterdon","value":135';
    const r = validateLiveResponse(truncated);
    expect(r).not.toBeNull();
    expect(r!.title).toBe('NJ Economy');
    expect(r!.narration).toBe('Here you go.');
    // The two COMPLETE blocks survive; the half-written third is dropped, not raw-dumped.
    expect(r!.blocks).toHaveLength(2);
    expect(r!.blocks.map((b) => b.type)).toEqual(['insight', 'kpi']);
  });
  it('accepts blocks with INLINED props (fields on the block, not nested under props)', () => {
    // Models frequently emit {type:"donut", title, rows} instead of {type:"donut", props:{…}},
    // and often MIX both shapes in one reply. Without inline tolerance every inlined block
    // coerces to {} and is dropped — which collapsed a full canvas to its one nested block.
    const r = validateLiveResponse(
      {
        title: 'NJ',
        blocks: [
          // nested (the canonical shape)
          { type: 'insight', props: { title: 'Lead', summary: 'ok' } },
          // inlined — fields directly on the block object
          {
            type: 'donut',
            title: 'Sectors',
            rows: [
              { label: 'A', pct: 60, color: 'var(--insight)' },
              { label: 'B', pct: 40, color: 'var(--presence)' },
            ],
          },
          { type: 'kpi', title: 'Stats', items: [{ label: 'Income', value: '$96k' }] },
          { type: 'bars', title: 'Jobs', bars: [{ label: 'Health', value: 5 }] },
        ],
      },
      FRONTIER_BLOCK_TYPES,
      12,
    );
    expect(r).not.toBeNull();
    expect(r!.blocks.map((b) => b.type)).toEqual(['insight', 'donut', 'kpi', 'bars']);
  });
  it('accepts a SINGLE flat kpi and synonym keys (data/name/amount) for bars', () => {
    const r = validateLiveResponse(
      {
        title: 'T',
        blocks: [
          // a lone kpi with no items[] and no title — must still render
          { type: 'kpi', props: { label: 'GDP', value: '$815B' } },
          // bars using `data` + `name`/`amount` synonyms instead of `bars`/`label`/`value`
          {
            type: 'bars',
            props: {
              title: 'Sectors',
              data: [
                { name: 'Pharma', amount: 25 },
                { name: 'Finance', amount: 20 },
              ],
            },
          },
        ],
      },
      FRONTIER_BLOCK_TYPES,
      12,
    );
    expect(r).not.toBeNull();
    expect(r!.blocks.map((b) => b.type)).toEqual(['kpi', 'bars']);
  });
  it('drops unknown block types', () => {
    const r = validateLiveResponse({
      title: 'T',
      blocks: [
        { type: 'pie', props: { title: 'nope' } }, // not a real type
        { type: 'list', props: { title: 'L', items: ['a', 'b'] } },
      ],
    });
    expect(r).not.toBeNull();
    expect(r!.blocks).toHaveLength(1);
    expect(r!.blocks[0].type).toBe('list');
    expect(ALLOWED_BLOCK_TYPES.has('pie')).toBe(false);
  });
  it('snaps a bare color name to the nearest allowed token', () => {
    const r = validateLiveResponse({
      title: 'T',
      blocks: [
        {
          type: 'chart',
          props: { title: 'c', labels: ['a'], series: [{ name: 's', color: 'green', data: [1] }] },
        },
      ],
    });
    const b = r!.blocks[0];
    if (b.type === 'chart') expect(b.props.series[0].color).toBe('var(--insight)');
    else throw new Error('expected chart');
  });
  it('clamps ring pct to 0..1 and breakdown pct to 0..100', () => {
    const ring = validateLiveResponse({
      title: 'T',
      blocks: [{ type: 'ring', props: { title: 'r', rings: [{ label: 'L', pct: 1.5 }] } }],
    });
    const rb = ring!.blocks[0];
    if (rb.type === 'ring') expect(rb.props.rings[0].pct).toBe(1);
    else throw new Error('expected ring');
    const bd = validateLiveResponse({
      title: 'T',
      blocks: [
        { type: 'breakdown', props: { title: 'b', rows: [{ name: 'n', val: '', pct: 150 }] } },
      ],
    });
    const bb = bd!.blocks[0];
    if (bb.type === 'breakdown') expect(bb.props.rows[0].pct).toBe(100);
    else throw new Error('expected breakdown');
  });
  it('drops a CSS color token that leaks into a ring display or gauge band', () => {
    // A model sometimes drops a color like "var(--warning)" where a short value belongs; it
    // must never render as the literal text "VAR(--WARNING)" — the field falls back instead.
    const ring = validateLiveResponse({
      title: 'T',
      blocks: [
        {
          type: 'ring',
          props: { title: 'r', rings: [{ label: 'L', pct: 0.4, display: 'var(--warning)' }] },
        },
      ],
    });
    const rb = ring!.blocks[0];
    if (rb.type === 'ring') expect(rb.props.rings[0].display).toBe('40%');
    else throw new Error('expected ring');
    const gauge = validateLiveResponse(
      {
        title: 'T',
        blocks: [{ type: 'gauge', props: { title: 'g', value: 7, band: 'var(--warning)' } }],
      },
      FRONTIER_BLOCK_TYPES,
    );
    const gb = gauge!.blocks[0];
    if (gb.type === 'gauge') expect(gb.props.band).toBeUndefined();
    else throw new Error('expected gauge');
    // A real value still passes through untouched.
    const ok = validateLiveResponse({
      title: 'T',
      blocks: [
        { type: 'ring', props: { title: 'r', rings: [{ label: 'L', pct: 0.4, display: 'High' }] } },
      ],
    });
    const okb = ok!.blocks[0];
    if (okb.type === 'ring') expect(okb.props.rings[0].display).toBe('High');
    else throw new Error('expected ring');
  });
  it('maps the simplified kpi items[] onto KpiGrid kpis[]', () => {
    const r = validateLiveResponse({
      title: 'T',
      blocks: [{ type: 'kpi', props: { title: 'k', items: [{ label: 'Revenue', value: '$1M' }] } }],
    });
    const b = r!.blocks[0];
    if (b.type === 'kpi') {
      expect(b.props.kpis[0]).toEqual({ val: '$1M', label: 'Revenue' });
    } else throw new Error('expected kpi');
  });
  it('caps the canvas at 6 blocks', () => {
    // Varied types (not all "insight") — the one-insight rule caps insights at 1 regardless
    // of maxBlocks, so this fixture exercises the 6-block cap on its own, unconflated with it.
    const blocks = [
      { type: 'insight', props: { title: 'A0' } },
      ...Array.from({ length: 7 }, (_, i) => ({
        type: 'list',
        props: { title: `L${i}`, items: ['a', 'b'] },
      })),
    ];
    const r = validateLiveResponse({ title: 'T', blocks });
    expect(r!.blocks.length).toBe(6);
  });
  it('gives every block a stable id (so any type can be spotlit)', () => {
    const r = validateLiveResponse({
      title: 'T',
      blocks: [
        { type: 'insight', props: { title: 'one' } },
        { type: 'list', props: { title: 'L', items: ['a', 'b'] } },
        { type: 'kpi', props: { title: 'K', items: [{ label: 'A', value: '1' }] } },
      ],
    });
    // Every block now carries a unique id — not just insights — so the spotlight tour
    // can target a chart or a list, not only the framing insight.
    expect(r!.blocks.map((b) => b.id)).toEqual(['live-1', 'live-2', 'live-3']);
    // The "Finding N" label stays insight-scoped.
    const nums = r!.blocks
      .filter((b) => b.type === 'insight')
      .map((b) => (b.type === 'insight' ? b.num : ''));
    expect(nums).toEqual(['1']);
  });
  it('enforces at most one insight: keeps the first, drops a later one', () => {
    const r = validateLiveResponse({
      title: 'T',
      blocks: [
        { type: 'insight', props: { title: 'one' } },
        { type: 'list', props: { title: 'L', items: ['a', 'b'] } },
        { type: 'insight', props: { title: 'two, mid-canvas' } },
        { type: 'kpi', props: { title: 'K', items: [{ label: 'A', value: '1' }] } },
      ],
    });
    const types = r!.blocks.map((b) => b.type);
    expect(types.filter((t) => t === 'insight').length).toBe(1);
    expect(types).toEqual(['insight', 'list', 'kpi']);
    const insight = r!.blocks.find((b) => b.type === 'insight');
    if (insight?.type === 'insight') {
      expect(insight.props.title).toBe('one'); // the FIRST insight survives
      expect(insight.num).toBe('1');
    } else throw new Error('expected an insight block to survive');
    // ids stay a contiguous, stable sequence over the SURVIVING blocks (the dropped insight
    // never consumes an id).
    expect(r!.blocks.map((b) => b.id)).toEqual(['live-1', 'live-2', 'live-3']);
  });
  it('lets a genuinely later insight through when the earlier one failed to validate', () => {
    // The first "insight" has no title, so buildInsight drops it — the LATER one is then the
    // first REAL insight and must survive, not be caught by the one-insight rule.
    const r = validateLiveResponse({
      title: 'T',
      blocks: [
        { type: 'insight', props: {} },
        { type: 'insight', props: { title: 'the real one' } },
      ],
    });
    const insight = r!.blocks.find((b) => b.type === 'insight');
    if (insight?.type === 'insight') expect(insight.props.title).toBe('the real one');
    else throw new Error('expected an insight block to survive');
  });
  it('returns null when nothing is salvageable', () => {
    expect(validateLiveResponse('hello, not json at all')).toBeNull();
    expect(validateLiveResponse({ foo: 1 })).toBeNull(); // no title, no usable block
  });
  it('falls back to a default title when blocks exist but title is missing', () => {
    const r = validateLiveResponse({
      blocks: [{ type: 'list', props: { title: 'L', items: ['a', 'b'] } }],
    });
    expect(r).not.toBeNull();
    expect(r!.title.length).toBeGreaterThan(0);
  });
  it('downgrades an unsourced NUMERIC conf:strong to inferred (honesty invariant)', () => {
    // A specific number on the card (stat) with no source is an estimate dressed as fact.
    const r = validateLiveResponse({
      title: 'T',
      blocks: [
        {
          type: 'insight',
          props: { title: 'You will save exactly this much', stat: '$1,000', conf: 'strong' },
        },
      ],
    });
    const b = r!.blocks[0];
    if (b.type === 'insight') expect(b.props.conf).toBe('inferred');
    else throw new Error('expected insight');
  });
  it('keeps a QUALITATIVE conf:strong fact as strong (a textbook fact is not a guess)', () => {
    // A definition the model reliably knows — no numeric stat/delta — must stay confident, not be
    // mislabeled "inferred". This is the bug where a teaching headline got branded a best guess.
    const r = validateLiveResponse({
      title: 'T',
      blocks: [
        {
          type: 'insight',
          props: { title: 'A linked list is a linear chain of nodes', conf: 'strong' },
        },
      ],
    });
    const b = r!.blocks[0];
    if (b.type === 'insight') expect(b.props.conf).toBe('strong');
    else throw new Error('expected insight');
  });
  it('keeps conf:strong when a backing source is present (forward-compat for grounding)', () => {
    const r = validateLiveResponse({
      title: 'T',
      blocks: [
        {
          type: 'insight',
          props: {
            title: 'Revenue up 18%',
            conf: 'strong',
            sources: [{ file: 'Q1.xlsx', loc: 'Sheet1' }],
          },
        },
      ],
    });
    const b = r!.blocks[0];
    if (b.type === 'insight') {
      expect(b.props.conf).toBe('strong');
      expect(b.props.sources?.[0]?.file).toBe('Q1.xlsx');
    } else throw new Error('expected insight');
  });
  it('keeps conf:strong on a numeric insight when the TURN itself is grounded, even with no own sources', () => {
    // The model forgot to echo a citation into props.sources, but generateLive knows this turn
    // actually ran a real search / used native grounding — that real signal must be what decides
    // the badge, not the (often-forgotten) per-block field.
    const r = validateLiveResponse(
      {
        title: 'T',
        blocks: [{ type: 'insight', props: { title: 'Population', stat: '37M', conf: 'strong' } }],
      },
      ALLOWED_BLOCK_TYPES,
      6,
      true, // grounded
    );
    const b = r!.blocks[0];
    if (b.type === 'insight') expect(b.props.conf).toBe('strong');
    else throw new Error('expected insight');
  });
});
describe('validateLiveResponse — the numeric honesty gate extends beyond the lead insight', () => {
  /** Builds ONE block of `type` and returns its coerced `conf`, given the raw props and whether
   *  this turn was grounded — the shared shape every case below exercises. */
  function confFor(
    type: string,
    props: Record<string, unknown>,
    grounded: boolean,
  ): string | undefined {
    const r = validateLiveResponse(
      { title: 'T', blocks: [{ type, props }] },
      FRONTIER_BLOCK_TYPES,
      6,
      grounded,
    );
    const b = r!.blocks[0] as { props: { conf?: string } };
    return b.props.conf;
  }
  const CHART_PROPS = {
    title: 'Growth',
    labels: ['Jan', 'Feb'],
    series: [{ name: 'S', color: 'var(--presence)', data: [1, 2] }],
  };
  const BREAKDOWN_PROPS = {
    title: 'Split',
    rows: [
      { name: 'A', val: '$60', pct: 60 },
      { name: 'B', val: '$40', pct: 40 },
    ],
  };
  const KPI_PROPS = { title: 'Stats', items: [{ label: 'Revenue', value: '$1M' }] };
  const BARS_PROPS = { title: 'Bars', bars: [{ label: 'A', value: 5 }] };
  const STACK_PROPS = { title: 'Stack', segments: [{ label: 'A', value: 5, display: '$5' }] };
  const DONUT_PROPS = { title: 'Donut', rows: [{ label: 'A', pct: 60 }] };
  const GAUGE_PROPS = { title: 'Score', value: 72 };
  const CASES: Array<[string, Record<string, unknown>]> = [
    ['chart', CHART_PROPS],
    ['breakdown', BREAKDOWN_PROPS],
    ['kpi', KPI_PROPS],
    ['bars', BARS_PROPS],
    ['stack', STACK_PROPS],
    ['donut', DONUT_PROPS],
    ['gauge', GAUGE_PROPS],
  ];
  it.each(CASES)(
    'downgrades an unsourced, ungrounded conf:strong %s to inferred',
    (type, props) => {
      expect(confFor(type, { ...props, conf: 'strong' }, false)).toBe('inferred');
    },
  );
  it.each(CASES)('keeps conf:strong on a %s when the turn IS genuinely grounded', (type, props) => {
    expect(confFor(type, { ...props, conf: 'strong' }, true)).toBe('strong');
  });
  it.each(CASES)('leaves conf:partial untouched on a %s regardless of grounding', (type, props) => {
    expect(confFor(type, { ...props, conf: 'partial' }, false)).toBe('partial');
    expect(confFor(type, { ...props, conf: 'partial' }, true)).toBe('partial');
  });
  it.each(CASES)('omits conf on a %s when the model never set one', (type, props) => {
    expect(confFor(type, props, false)).toBeUndefined();
  });
});
describe('diagramflow coercion', () => {
  // diagramflow is a 'cutting'-tier block selected per-turn, so it isn't in the static
  // base set — exercise it through an allowed set that includes it, exactly as the
  // selector would expose it.
  const allowed = new Set([...ALLOWED_BLOCK_TYPES, 'diagramflow']);
  const validGraph = {
    type: 'diagramflow',
    props: {
      title: 'Water cycle',
      layout: 'cycle',
      nodes: [
        { id: 'evap', label: 'Evaporation', kind: 'accent' },
        { id: 'cond', label: 'Condensation' },
        { id: 'precip', label: 'Precipitation', kind: 'good' },
      ],
      edges: [
        { from: 'evap', to: 'cond', label: 'rises' },
        { from: 'cond', to: 'precip' },
        { from: 'precip', to: 'evap', kind: 'muted', dashed: true },
      ],
    },
  };
  it('coerces a well-formed node/edge graph into a typed block', () => {
    const r = validateLiveResponse({ title: 'T', blocks: [validGraph] }, allowed);
    const b = r!.blocks[0];
    expect(b.type).toBe('diagramflow');
    if (b.type !== 'diagramflow') throw new Error('expected diagramflow');
    expect(b.props.nodes).toHaveLength(3);
    expect(b.props.edges).toHaveLength(3);
    expect(b.props.layout).toBe('cycle');
  });
  it('drops an edge that points at a non-existent node', () => {
    const payload = {
      title: 'T',
      blocks: [
        {
          type: 'diagramflow',
          props: {
            title: 'G',
            nodes: [
              { id: 'a', label: 'A' },
              { id: 'b', label: 'B' },
            ],
            edges: [
              { from: 'a', to: 'b' },
              { from: 'a', to: 'ghost' },
            ],
          },
        },
      ],
    };
    const r = validateLiveResponse(payload, allowed);
    const b = r!.blocks[0];
    if (b.type !== 'diagramflow') throw new Error('expected diagramflow');
    expect(b.props.edges).toHaveLength(1);
  });
  it('rejects a degenerate one-node diagram (falls back, renders nothing here)', () => {
    const payload = {
      title: 'T',
      blocks: [
        { type: 'diagramflow', props: { title: 'G', nodes: [{ id: 'a', label: 'A' }], edges: [] } },
        { type: 'insight', props: { title: 'fallback' } },
      ],
    };
    const r = validateLiveResponse(payload, allowed);
    // the lone-node diagram is dropped; the insight survives so the answer isn't empty
    expect(r!.blocks.every((b) => b.type !== 'diagramflow')).toBe(true);
    expect(r!.blocks.some((b) => b.type === 'insight')).toBe(true);
  });
  it('accepts source/target aliases and de-dupes repeated node ids', () => {
    const payload = {
      title: 'T',
      blocks: [
        {
          type: 'diagramflow',
          props: {
            title: 'G',
            nodes: [
              { id: 'a', name: 'A' }, // 'name' alias for label
              { id: 'b', label: 'B' },
              { id: 'a', label: 'A dup' }, // duplicate id — first wins
            ],
            edges: [{ source: 'a', target: 'b' }], // source/target aliases
          },
        },
      ],
    };
    const r = validateLiveResponse(payload, allowed);
    const b = r!.blocks[0];
    if (b.type !== 'diagramflow') throw new Error('expected diagramflow');
    expect(b.props.nodes).toHaveLength(2);
    expect(b.props.nodes[0].label).toBe('A');
    expect(b.props.edges).toHaveLength(1);
  });
  it('snaps an invalid node kind / edge kind to the default by dropping it', () => {
    const payload = {
      title: 'T',
      blocks: [
        {
          type: 'diagramflow',
          props: {
            title: 'G',
            nodes: [
              { id: 'a', label: 'A', kind: 'rainbow' },
              { id: 'b', label: 'B' },
            ],
            edges: [{ from: 'a', to: 'b', kind: 'sparkle' }],
          },
        },
      ],
    };
    const r = validateLiveResponse(payload, allowed);
    const b = r!.blocks[0];
    if (b.type !== 'diagramflow') throw new Error('expected diagramflow');
    expect(b.props.nodes[0].kind).toBeUndefined(); // invalid kind dropped, not crashed
    expect(b.props.edges[0].kind).toBeUndefined();
  });
  it('is dropped when its type is not in the allowed set (tier gating)', () => {
    // without diagramflow in `allowed`, the block is rejected and only the insight remains
    const r = validateLiveResponse(
      { title: 'T', blocks: [validGraph, { type: 'insight', props: { title: 'x' } }] },
      ALLOWED_BLOCK_TYPES,
    );
    expect(r!.blocks.every((b) => b.type !== 'diagramflow')).toBe(true);
  });
});
describe('composite coercion', () => {
  const allowed = new Set([...ALLOWED_BLOCK_TYPES, 'composite']);
  it('coerces a sub-grid of real child blocks, each through the normal builder', () => {
    const payload = {
      title: 'T',
      blocks: [
        {
          type: 'composite',
          props: {
            title: 'Two views side by side',
            regions: [
              {
                block: {
                  type: 'kpi',
                  props: { title: 'M', items: [{ label: 'Users', value: '1.2M' }] },
                },
                span: 5,
              },
              { block: { type: 'list', props: { title: 'Why', items: ['a', 'b'] } }, span: 7 },
            ],
          },
        },
      ],
    };
    const r = validateLiveResponse(payload, allowed);
    const b = r!.blocks[0];
    expect(b.type).toBe('composite');
    if (b.type !== 'composite') throw new Error('expected composite');
    expect(b.props.regions).toHaveLength(2);
    expect(b.props.regions[0].block.type).toBe('kpi');
    expect(b.props.regions[0].span).toBe(5);
    expect(b.props.regions[1].block.type).toBe('list');
  });
  it('drops a region whose child block is invalid, keeping the rest', () => {
    const payload = {
      title: 'T',
      blocks: [
        {
          type: 'composite',
          props: {
            title: 'G',
            regions: [
              {
                block: { type: 'kpi', props: { title: 'M', items: [{ label: 'X', value: '1' }] } },
              },
              { block: { type: 'chart', props: {} } }, // no series/labels → invalid → dropped
              { block: { type: 'list', props: { title: 'L', items: ['a', 'b'] } } },
            ],
          },
        },
      ],
    };
    const r = validateLiveResponse(payload, allowed);
    const b = r!.blocks[0];
    if (b.type !== 'composite') throw new Error('expected composite');
    expect(b.props.regions).toHaveLength(2);
    expect(b.props.regions.some((rg) => rg.block.type === 'chart')).toBe(false);
  });
  it('rejects a composite with fewer than two valid regions (falls back)', () => {
    const payload = {
      title: 'T',
      blocks: [
        {
          type: 'composite',
          props: {
            title: 'G',
            regions: [
              {
                block: { type: 'kpi', props: { title: 'M', items: [{ label: 'X', value: '1' }] } },
              },
            ],
          },
        },
        { type: 'insight', props: { title: 'fallback' } },
      ],
    };
    const r = validateLiveResponse(payload, allowed);
    expect(r!.blocks.every((b) => b.type !== 'composite')).toBe(true);
    expect(r!.blocks.some((b) => b.type === 'insight')).toBe(true);
  });
  it('never nests a composite inside a composite (one level deep only)', () => {
    const payload = {
      title: 'T',
      blocks: [
        {
          type: 'composite',
          props: {
            title: 'Outer',
            regions: [
              { block: { type: 'list', props: { title: 'L', items: ['a'] } } },
              {
                // a nested composite child must be rejected, leaving < 2 regions
                block: {
                  type: 'composite',
                  props: {
                    title: 'Inner',
                    regions: [
                      {
                        block: {
                          type: 'kpi',
                          props: { title: 'M', items: [{ label: 'X', value: '1' }] },
                        },
                      },
                      { block: { type: 'list', props: { title: 'L2', items: ['c'] } } },
                    ],
                  },
                },
              },
            ],
          },
        },
        { type: 'insight', props: { title: 'fallback' } },
      ],
    };
    const r = validateLiveResponse(payload, allowed);
    // outer has only ONE valid region after the nested composite is rejected → outer dropped
    expect(r!.blocks.every((b) => b.type !== 'composite')).toBe(true);
  });
});
describe('capability-tiered block exposure (Phase 4)', () => {
  it('small tier exposes only the base 8; frontier adds the cousins', () => {
    expect(blockTypesForTier('small').has('gauge')).toBe(false);
    expect(blockTypesForTier('small').size).toBe(8);
    for (const t of ['bars', 'stack', 'donut', 'gauge']) {
      expect(blockTypesForTier('frontier').has(t)).toBe(true);
    }
    expect(blockTypesForTier('frontier').has('insight')).toBe(true);
  });
  it('drops a frontier block (gauge) under the base set but renders it under frontier', () => {
    const payload = {
      title: 'Risk',
      blocks: [
        { type: 'insight', props: { title: 'Concentration risk is moderate', conf: 'inferred' } },
        { type: 'gauge', props: { title: 'Risk score', value: 62, max: 100, band: 'elevated' } },
      ],
    };
    // base set: gauge is unknown → dropped (only the insight survives)
    const base = validateLiveResponse(payload, ALLOWED_BLOCK_TYPES);
    expect(base!.blocks.map((b) => b.type)).toEqual(['insight']);
    // frontier set: gauge is built and rendered
    const front = validateLiveResponse(payload, FRONTIER_BLOCK_TYPES);
    expect(front!.blocks.map((b) => b.type)).toEqual(['insight', 'gauge']);
    const g = front!.blocks[1];
    if (g.type === 'gauge') {
      expect(g.props.value).toBe(62);
      expect(g.props.max).toBe(100);
    } else throw new Error('expected gauge');
  });
  it('builds bars / stack / donut from loose props under the frontier set', () => {
    const r = validateLiveResponse(
      {
        title: 'Mix',
        blocks: [
          {
            type: 'bars',
            props: {
              title: 'By team',
              bars: [
                { label: 'A', value: 12 },
                { label: 'B', value: 8, hot: true },
              ],
            },
          },
          {
            type: 'donut',
            props: {
              title: 'Split',
              rows: [
                { label: 'X', pct: 60, color: 'green' },
                { label: 'Y', pct: 40, color: 'gray' },
              ],
            },
          },
          {
            type: 'stack',
            props: {
              title: 'Total',
              total: '$10k',
              segments: [{ label: 'P', value: 6, display: '$6k', color: 'presence' }],
            },
          },
        ],
      },
      FRONTIER_BLOCK_TYPES,
    );
    expect(r!.blocks.map((b) => b.type)).toEqual(['bars', 'donut', 'stack']);
    const donut = r!.blocks[1];
    if (donut.type === 'donut')
      expect(donut.props.rows[0].color).toBe('var(--insight)'); // 'green' snapped
    else throw new Error('expected donut');
  });
  it('frontier prompt documents the cousins; small prompt does not', () => {
    const front = liveSystemPrompt('frontier');
    expect(front).toContain('gauge');
    expect(front).toContain('donut');
    const small = liveSystemPrompt('small');
    expect(small).not.toContain('"gauge"');
  });
  it('the prompt teaches filling the enrichment fields (demo-grade)', () => {
    expect(liveSystemPrompt('frontier')).toContain('FILL THE DETAILS');
  });
  // The directives that never vary belong in the CACHED prefix. They used to ride in generateLive's
  // per-turn suffix, which every provider bills at full rate on every single turn — so a fixed list
  // of icon names was re-bought hundreds of times a session. Every tier sends them, so every tier
  // carries them here.
  it('carries the always-on directives (icons, understood chips, follow-up chips) in the cached base', () => {
    for (const tier of ['frontier', 'mid', 'small'] as const) {
      const prompt = liveSystemPrompt(tier);
      expect(prompt).toContain('ICONS —');
      expect(prompt).toContain('WHAT YOU UNDERSTOOD —');
      expect(prompt).toContain('"chips"');
    }
    // The icon vocabulary must be the real one, so an invented name can't slip through.
    expect(liveSystemPrompt('frontier')).toContain(ICON_KEYS[0]);
    expect(liveSystemPrompt('frontier')).toContain(ICON_KEYS[ICON_KEYS.length - 1]);
  });
  // The cache keys on an exact prefix match, so each (tier, complexity) prompt must be stable — a
  // per-call value sneaking in here would silently turn every turn into a cache miss.
  it('is byte-stable per (tier, complexity) so the provider cache actually hits', () => {
    expect(liveSystemPrompt('frontier', 'rich')).toBe(liveSystemPrompt('frontier', 'rich'));
    expect(liveSystemPrompt('frontier', 'brief')).toBe(liveSystemPrompt('frontier', 'brief'));
    expect(liveSystemPrompt('frontier', 'brief')).not.toBe(liveSystemPrompt('frontier', 'rich'));
  });
  it('the prompt forbids claiming a side-effecting action was performed', () => {
    expect(liveSystemPrompt('frontier')).toContain('YOU CANNOT PERFORM ACTIONS');
    expect(liveSystemPrompt('small')).toContain('YOU CANNOT PERFORM ACTIONS');
  });
  // Regression: the validator read `continuity` from day one, but the prompt never asked for it —
  // so no model ever emitted the hint, the keep branch of resolveMode could never fire, and every
  // follow-up settled as a fresh topic. The prompt must request exactly what the validator accepts.
  it('every tier is asked for the continuity hint, with the exact values the validator reads', () => {
    for (const tier of ['frontier', 'mid', 'small'] as const) {
      const prompt = liveSystemPrompt(tier);
      expect(prompt).toContain('"continuity": "replace"|"augment"|"refine"');
      expect(prompt).toContain('- "continuity":');
    }
  });
  it('does not give its own conflicting narration-length spec (that lives in one place: spokenLine)', () => {
    // Regression: the base prompt used to say "a friendly sentence or two", while generateLive's
    // per-turn SPOKEN LINE directive separately said "two or three short sentences" for the same
    // rich turn — two different counts in the same system prompt. The base prompt now defers to
    // that single, complexity-scaled directive instead of stating its own count.
    const base = liveSystemPrompt('frontier');
    expect(base).not.toMatch(/sentence or two/i);
    expect(base).not.toMatch(/punchy line for a simple ask/i);
    // it defers to the per-turn directive by name — generateLive appends the actual
    // SPOKEN LINE section (see the test in live.test.ts that locks that directive).
    expect(base).toMatch(/SPOKEN LINE/);
  });
  it('gates the spotlight-tour / drawn-gesture teaching to non-brief turns', () => {
    // A 'brief' turn never wants a walkthrough tour (the base prompt itself says "omit the tour
    // for a one-glance answer"), so the ~1,400-token teaching section is dropped entirely rather
    // than sent and then told to ignore it.
    const brief = liveSystemPrompt('frontier', 'brief');
    expect(brief).not.toContain('SPOTLIGHT TOUR');
    expect(brief).not.toContain('DRAWN GESTURE');
    // no dangling forward-reference to a section that isn't there.
    expect(brief).not.toContain('Details under SPOTLIGHT TOUR');
    const rich = liveSystemPrompt('frontier', 'rich');
    expect(rich).toContain('SPOTLIGHT TOUR');
    expect(rich).toContain('DRAWN GESTURE');
    const lean = liveSystemPrompt('frontier', 'lean');
    expect(lean).toContain('SPOTLIGHT TOUR');
    // default (no complexity passed) matches the common, richer case.
    expect(liveSystemPrompt('frontier')).toContain('SPOTLIGHT TOUR');
    // small tier never gets the frontier addendum at all, tour teaching included.
    expect(liveSystemPrompt('small', 'rich')).not.toContain('SPOTLIGHT TOUR');
  });
  it('moves safety and honesty rules to the top of the prompt', () => {
    const prompt = liveSystemPrompt('frontier');
    const safety = prompt.indexOf('SAFETY FIRST');
    const realData = prompt.indexOf('USE REAL DATA ONLY');
    const noAction = prompt.indexOf('YOU CANNOT PERFORM ACTIONS');
    const form = prompt.indexOf('ANSWER IN THE FORM');
    const blockSelection = prompt.indexOf('BLOCK SELECTION');
    expect(safety).toBeGreaterThan(-1);
    expect(realData).toBeGreaterThan(-1);
    expect(noAction).toBeGreaterThan(-1);
    // all three land before the content/style guidance that used to precede them.
    expect(safety).toBeLessThan(form);
    expect(realData).toBeLessThan(form);
    expect(noAction).toBeLessThan(form);
    expect(safety).toBeLessThan(blockSelection);
    // no leftover duplicate PARAGRAPH from the old position (a later cross-reference to "USE
    // REAL DATA ONLY" by name, inside THE BLANK SPACE, is fine — only one real definition).
    expect(prompt.split('SAFETY FIRST').length - 1).toBe(1);
    expect(prompt.split('YOU CANNOT PERFORM ACTIONS').length - 1).toBe(1);
    expect(prompt.split(/USE REAL DATA ONLY —/).length - 1).toBe(1);
  });
  it('consolidates the variety directives into one VARIETY & CAPS paragraph', () => {
    const prompt = liveSystemPrompt('frontier');
    expect(prompt).toContain('VARIETY & CAPS');
    // the old, separately-restated paragraphs are gone — their substance is folded in.
    expect(prompt).not.toContain('VARIETY MANDATE');
    expect(prompt).not.toContain('BUILD A DASHBOARD');
    expect(prompt).not.toContain('HARD CAPS');
    // every enforceable number survives the merge.
    expect(prompt).toMatch(/at most ONE insight/);
    expect(prompt).toMatch(/at most ONE list/);
    expect(prompt).toMatch(/at most TWO breakdown/);
    expect(prompt).toMatch(/THIRD of all blocks/);
    // the completeness-outranks-caps escape valve survives — never sacrifice real content.
    expect(prompt).toMatch(/completeness always outranks these caps/);
  });
  it('trims the worked example while keeping real variety', () => {
    const prompt = liveSystemPrompt('frontier');
    const match = prompt.match(/"title":"Your \$5,000 monthly budget"[\s\S]*$/);
    expect(match).not.toBeNull();
    const exampleTypes = [...match![0].matchAll(/"type":"(\w+)"/g)].map((m) => m[1]);
    expect(exampleTypes.length).toBeLessThanOrEqual(6);
    expect(new Set(exampleTypes).size).toBeGreaterThanOrEqual(5); // still genuinely varied
  });
  it('states the library size as a real, computed figure, not a stale hardcoded one', () => {
    // Regression: the prompt used to hardcode "a library of ~190" while the real catalog had
    // long since grown past 400 — this locks the claim to the ACTUAL catalog size so it can
    // never drift out of date again as more components are added.
    const claim = liveSystemPrompt('frontier').match(/library of (\d+)\+/);
    expect(claim).not.toBeNull();
    const claimed = Number(claim![1]);
    expect(claimed).toBeGreaterThanOrEqual(50);
    expect(claimed).toBeLessThanOrEqual(RAW_CATALOG.length);
    // and it must be a genuinely large library — the whole point of the claim.
    expect(RAW_CATALOG.length).toBeGreaterThan(300);
  });
});
describe('validateLiveResponse — builder enrichment passthrough (renders the taught fields)', () => {
  it('keeps breakdown icon/iconColor and a row tagColor (when there is a tag)', () => {
    const r = validateLiveResponse({
      title: 'T',
      sub: '',
      narration: 'n',
      blocks: [
        {
          type: 'breakdown',
          props: {
            title: 'Split',
            icon: 'chart',
            iconColor: 'green',
            rows: [
              { name: 'Rent', val: '$1,200', pct: 48, hot: true, tag: 'spike', tagColor: 'danger' },
              // a colored tag with NO tag text is dropped (noise) — color must not appear
              { name: 'Food', val: '$400', pct: 16, tagColor: 'warning' },
            ],
          },
        },
      ],
    });
    const b = r!.blocks[0];
    if (b.type !== 'breakdown') throw new Error('expected breakdown');
    expect(b.props.icon).toBe('chart');
    expect(b.props.iconColor).toBe('var(--insight)'); // 'green' snapped
    expect(b.props.rows[0].tagColor).toBe('var(--danger)'); // snapped, has a tag
    expect(b.props.rows[1].tagColor).toBeUndefined(); // no tag → no color
  });
  it('drops a hallucinated icon (not in the registry) rather than rendering it broken', () => {
    const r = validateLiveResponse({
      title: 'T',
      sub: '',
      narration: 'n',
      blocks: [
        {
          type: 'breakdown',
          props: {
            title: 'S',
            icon: 'definitely-not-an-icon',
            rows: [{ name: 'A', val: '1', pct: 100 }],
          },
        },
      ],
    });
    const b = r!.blocks[0];
    if (b.type !== 'breakdown') throw new Error('expected breakdown');
    expect(b.props.icon).toBeUndefined();
  });
  it('carries a codeblock `code` string through verbatim — real angle brackets, no neutralization', () => {
    // `code` is the new preferred form: the model sends raw source, we highlight it client-side.
    // Tag-forming characters are REAL source here (`List<T>`, `<Button>`), so the coercer must NOT
    // swap them for guillemets the way it does for other free text — the renderer (Shiki / a React
    // text node) does its own escaping. This locks the RAW_TEXT_PROPS exception.
    const src = 'const xs: List<T> = parse(input);\nreturn xs.map((x) => x > 0);';
    // codeblock is reached via the per-turn catalog selector (generic coercer), so expose it
    // explicitly here the way the selector would.
    const allowed = new Set<string>([...FRONTIER_BLOCK_TYPES, 'codeblock']);
    const r = validateLiveResponse(
      {
        title: 'T',
        sub: '',
        narration: 'n',
        blocks: [{ type: 'codeblock', props: { title: 'Snippet', lang: 'ts', code: src } }],
      },
      allowed,
    );
    const b = r!.blocks[0];
    if (b.type !== 'codeblock') throw new Error('expected codeblock');
    expect(b.props.code).toBe(src);
    expect(b.props.code).toContain('<T>');
    expect(b.props.code).toContain('x > 0');
    expect(b.props.code).not.toContain('‹');
    expect(b.props.code).not.toContain('›');
  });
  it('coerces a photo with candidate URLs — allowlists each, drops unsafe, promotes the first', () => {
    // The model proposes a few real free-commercial photo URLs; only allowlisted https hosts
    // survive (untrusted input). The first valid becomes `src`, the rest ride as `candidates`, and
    // the renderer load-tests them so a dead/hallucinated link never shows a broken image.
    const allowed = new Set<string>([...FRONTIER_BLOCK_TYPES, 'photo']);
    const r = validateLiveResponse(
      {
        title: 'T',
        blocks: [
          {
            type: 'photo',
            props: {
              title: 'Cloud Gate, Chicago',
              candidates: [
                'https://images.unsplash.com/photo-bean.jpg', // valid
                'http://images.pexels.com/insecure.jpg', // http → dropped
                'https://evil.example.com/x.jpg', // not allowlisted → dropped
                'https://cdn.pixabay.com/photo-bean2.jpg', // valid
              ],
            },
          },
        ],
      },
      allowed,
    );
    const b = r!.blocks[0];
    if (b.type !== 'photo') throw new Error('expected photo');
    expect(b.props.src).toBe('https://images.unsplash.com/photo-bean.jpg');
    expect(b.props.candidates).toEqual(['https://cdn.pixabay.com/photo-bean2.jpg']);
  });
  it('DROPS an imagecallouts whose only image URL is invented/unsafe (no real image, no image UI)', () => {
    // imagecallouts is an image-first block: its callouts pin to a photo. An invented/unsafe URL
    // used to degrade to a bare gradient with callouts pinned to nothing — exactly the empty-image
    // UI we now refuse to show, so the whole block is dropped (IMAGE_REQUIRED_TYPES guardrail).
    const allowed = new Set<string>([...FRONTIER_BLOCK_TYPES, 'imagecallouts']);
    const r = validateLiveResponse(
      {
        title: 'T',
        blocks: [
          {
            type: 'imagecallouts',
            props: {
              title: 'Near the Riverwalk',
              image: {
                from: 'var(--presence)',
                to: 'var(--insight)',
                label: 'Chicago Riverwalk near the Loop',
                src: 'https://example.com/invented-riverwalk.jpg',
              },
              callouts: [{ x: 20, y: 30, label: 'Riverwalk stretch' }],
            },
          },
        ],
      },
      allowed,
    );
    expect(r!.blocks.some((b) => b.type === 'imagecallouts')).toBe(false);
  });
  it('keeps an allowlisted imagecallouts image.src', () => {
    const allowed = new Set<string>([...FRONTIER_BLOCK_TYPES, 'imagecallouts']);
    const r = validateLiveResponse(
      {
        title: 'T',
        blocks: [
          {
            type: 'imagecallouts',
            props: {
              title: 'UI breakdown',
              image: {
                from: 'var(--presence)',
                to: 'var(--insight)',
                src: 'https://images.unsplash.com/photo-ui.jpg',
              },
              callouts: [{ x: 20, y: 30, label: 'Header' }],
            },
          },
        ],
      },
      allowed,
    );
    const b = r!.blocks[0];
    if (b.type !== 'imagecallouts') throw new Error('expected imagecallouts');
    expect(b.props.image.src).toBe('https://images.unsplash.com/photo-ui.jpg');
  });
  it('keeps kpi per-item color and grid cols/footer', () => {
    const r = validateLiveResponse({
      title: 'T',
      sub: '',
      narration: 'n',
      blocks: [
        {
          type: 'kpi',
          props: {
            title: 'Buckets',
            cols: 3,
            footer: 'all from the close',
            items: [
              { label: 'Needs', value: '$2,500', color: 'insight' },
              { label: 'Wants', value: '$1,500' },
            ],
          },
        },
      ],
    });
    const b = r!.blocks[0];
    if (b.type !== 'kpi') throw new Error('expected kpi');
    expect(b.props.cols).toBe(3);
    expect(b.props.footer).toBe('all from the close');
    expect(b.props.kpis[0].color).toBe('var(--insight)');
    expect(b.props.kpis[1].color).toBeUndefined();
  });
});

// The guardrail behind "if we don't have images that actually render, never show that UI": an
// image-first block with no allowlisted image URL is dropped in buildBlock rather than painting a
// bare gradient placeholder. hasRenderableImage is the predicate; tested directly so the check is
// isolated from the catalog-dependent coercion that runs afterward.
describe('hasRenderableImage — the "real image or drop the block" guardrail', () => {
  const good = 'https://images.pexels.com/photos/1279/food.jpg';
  const unsplash = 'https://images.unsplash.com/photo-1?ixid=abc';

  it('covers exactly the image-first block types (photo is gated separately)', () => {
    expect([...IMAGE_REQUIRED_TYPES].sort()).toEqual([
      'beforeafter',
      'carousel',
      'imagecallouts',
      'mediacard',
      'moodboard',
    ]);
  });

  it('is false when a carousel has only gradient slides, true once one carries a real image', () => {
    expect(
      hasRenderableImage('carousel', {
        slides: [
          { label: 'Carbohydrates', from: 'presence', to: 'insight' },
          { label: 'Fats', from: 'warning', to: 'presence' },
        ],
      }),
    ).toBe(false);
    expect(
      hasRenderableImage('carousel', {
        slides: [{ label: 'Carbohydrates', src: good }, { label: 'Fats' }],
      }),
    ).toBe(true);
    // A bundled same-origin /demo-assets image counts too — the same gate the renderers use, so a
    // block the gallery/demos can actually paint isn't dropped.
    expect(
      hasRenderableImage('carousel', { slides: [{ src: '/demo-assets/images/sete-cidades.jpg' }] }),
    ).toBe(true);
  });

  it('rejects placeholder / off-allowlist URLs (data:, http:, unknown host)', () => {
    expect(
      hasRenderableImage('carousel', { slides: [{ src: 'data:image/png;base64,AAAA' }] }),
    ).toBe(false);
    expect(hasRenderableImage('mediacard', { cover: { src: 'http://evil.example/x.jpg' } })).toBe(
      false,
    );
  });

  it('reads the correct image slot per block type', () => {
    expect(hasRenderableImage('beforeafter', { before: { src: unsplash }, after: {} })).toBe(true);
    expect(hasRenderableImage('beforeafter', { before: {}, after: {} })).toBe(false);
    expect(hasRenderableImage('imagecallouts', { image: { src: unsplash } })).toBe(true);
    expect(hasRenderableImage('mediacard', { cover: { src: unsplash } })).toBe(true);
    expect(hasRenderableImage('moodboard', { tiles: [{}, { src: unsplash }] })).toBe(true);
  });
});
