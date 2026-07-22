import { beforeEach, vi } from 'vitest';
import {
  validateLiveResponse,
  blockTypesForTier,
  ALLOWED_BLOCK_TYPES,
  FRONTIER_BLOCK_TYPES,
} from '../src/engine/liveSchema';
import type { LiveRequest } from '../src/live/providers/types';
import type { ModelConfig } from '../src/types/mavea';

// The Live pipeline, end to end without a network:
//  1. validateLiveResponse — the defensive coercion core (extra guarantees beyond
//     liveSchema.test.ts: it NEVER throws on garbage, and degrades to an honest null).
//  2. blockTypesForTier — the per-tier block set the validator gates on.
//  3. generateLive — the provider-agnostic turn, with the adapter MOCKED, proving a
//     good model response becomes a ConversationSpec, a thrown/garbage one degrades to
//     a fallback, and the spoken narration is preserved.

/* ------------------------------------------------------------------ *
 * 1) validateLiveResponse — robustness / honesty (complements liveSchema.test.ts)
 * ------------------------------------------------------------------ */
describe('validateLiveResponse — never throws, honest fallback', () => {
  it('returns null (not a throw) for every flavour of garbage', () => {
    const garbage: unknown[] = [
      null,
      undefined,
      42,
      true,
      'totally not json',
      '{ broken json',
      '{}',
      [],
      { blocks: 'not-an-array' },
      { blocks: [{ type: 'insight' }] }, // no props → no usable block, no title
    ];
    for (const g of garbage) {
      let result: ReturnType<typeof validateLiveResponse> | undefined;
      expect(() => {
        result = validateLiveResponse(g);
      }).not.toThrow();
      expect(result).toBeNull();
    }
  });

  it('salvages a single usable block even when surrounded by junk blocks', () => {
    const r = validateLiveResponse({
      title: 'Mixed bag',
      blocks: [
        { type: 'pie', props: { title: 'unknown type dropped' } },
        { type: 'insight', props: {} }, // empty → dropped
        { type: 'list', props: { title: 'Tips', items: ['a', 'b'] } },
        'not-an-object', // dropped
      ],
    });
    expect(r).not.toBeNull();
    expect(r!.blocks.map((b) => b.type)).toEqual(['list']);
  });

  it('bounds a runaway narration at the validator (outer 320); the ask-aware cap is applied downstream', () => {
    // The validator is the OUTER safety bound only — it stops a runaway line without
    // pre-truncating a legitimately longer rich narration. The precise lean(~140)/rich(~320)
    // cap is generateLive's job via capSpoken (see live-effort.test.ts), where the ask
    // complexity is known. So a ~600-char line is trimmed here to ≤320, not to 140.
    const long = 'word '.repeat(120).trim(); // ~600 chars
    const r = validateLiveResponse({
      title: 'T',
      narration: long,
      blocks: [{ type: 'list', props: { title: 'L', items: ['a'] } }],
    });
    expect(r).not.toBeNull();
    expect(r!.narration.length).toBeLessThanOrEqual(320);
  });

  it('gates on the supplied block set: a frontier type is dropped under the base set', () => {
    const payload = {
      title: 'Risk',
      blocks: [
        { type: 'insight', props: { title: 'A' } },
        { type: 'gauge', props: { title: 'Score', value: 60, max: 100 } },
      ],
    };
    expect(validateLiveResponse(payload, ALLOWED_BLOCK_TYPES)!.blocks.map((b) => b.type)).toEqual([
      'insight',
    ]);
    expect(validateLiveResponse(payload, FRONTIER_BLOCK_TYPES)!.blocks.map((b) => b.type)).toEqual([
      'insight',
      'gauge',
    ]);
  });
});

describe('blockTypesForTier', () => {
  it('small → the base 8; mid & frontier → the base 8 plus the five cousins', () => {
    expect(blockTypesForTier('small')).toBe(ALLOWED_BLOCK_TYPES);
    expect(blockTypesForTier('mid')).toBe(FRONTIER_BLOCK_TYPES);
    expect(blockTypesForTier('frontier')).toBe(FRONTIER_BLOCK_TYPES);
    expect(blockTypesForTier('small').size).toBe(8);
    expect(blockTypesForTier('frontier').size).toBe(13);
  });
});

/* ------------------------------------------------------------------ *
 * 2) generateLive — provider-agnostic turn with the adapter MOCKED (no network).
 *
 * We mock the provider registry so getAdapter() returns a fake whose generate()
 * resolves whatever the test sets — letting us drive the validate → spec / fallback
 * branches deterministically and assert generateLive never makes a real call.
 * ------------------------------------------------------------------ */

// A controllable stand-in for a ProviderAdapter. The mock factory reads these at call
// time (hoisted vi.mock can't close over outer `let`s directly, so we funnel through a
// module-level object the factory references lazily).
const fake = {
  raw: '' as string | object,
  /** A per-call response sequence: when set, call N returns rawByCall[N-1] (falling back to `raw`).
   *  Lets a test drive the collapse → recovery re-ask path with a different first vs second answer. */
  rawByCall: null as (string | object)[] | null,
  shouldThrow: false,
  /** Throw only on the FIRST generate() call, then succeed — exercises the 429 grounded retry. */
  throwFirstCall: false,
  /** The Error message to throw when shouldThrow/throwFirstCall (adapters throw e.g. 'anthropic 401'). */
  throwMessage: 'network down',
  calls: 0,
  onDeltaSeen: '' as string,
  /** Toggle to exercise the native-grounding branch (Gemini-style). */
  nativeWebSearch: false,
  /** Sources the mock "grounding" returns, surfaced as citations. */
  sources: undefined as { title: string; url: string }[] | undefined,
  /** The last request the adapter received, so tests can assert tools/thinking/history. */
  lastReq: null as LiveRequest | null,
};

vi.mock('../src/live/providers', () => ({
  getAdapter: () => ({
    id: 'openrouter',
    capabilities: {
      constrainedDecoding: false,
      streaming: true,
      vision: false,
      contextWindow: 8192,
      strengthTier: 'mid' as const,
      get nativeWebSearch() {
        return fake.nativeWebSearch;
      },
    },
    probe: async () => ({ ok: true, model: true }),
    generate: async (
      req: LiveRequest,
      _cfg: ModelConfig,
      onDelta?: (c: string) => void,
    ): Promise<{ raw: string | object; sources?: { title: string; url: string }[] }> => {
      fake.calls += 1;
      fake.lastReq = req;
      if (fake.shouldThrow || (fake.throwFirstCall && fake.calls === 1))
        throw new Error(fake.throwMessage);
      const raw = fake.rawByCall ? (fake.rawByCall[fake.calls - 1] ?? fake.raw) : fake.raw;
      const text = typeof raw === 'string' ? raw : JSON.stringify(raw);
      if (onDelta) {
        fake.onDeltaSeen = text;
        onDelta(text);
      }
      return fake.sources ? { raw, sources: fake.sources } : { raw };
    },
  }),
}));

// Import generateLive AFTER the mock is registered (vi.mock is hoisted, so this is safe).
import { generateLive, describeLiveError } from '../src/live/generateLive';

const cfg: ModelConfig = { provider: 'openrouter', model: 'meta-llama/llama-3.3-8b', apiKey: 'k' };

beforeEach(() => {
  fake.raw = '';
  fake.rawByCall = null;
  fake.shouldThrow = false;
  fake.throwFirstCall = false;
  fake.throwMessage = 'network down';
  fake.calls = 0;
  fake.onDeltaSeen = '';
  fake.nativeWebSearch = false;
  fake.sources = undefined;
  fake.lastReq = null;
});

/** A minimal valid model response, for tests that care about routing, not content. */
const OK_RESPONSE = JSON.stringify({
  title: 'T',
  sub: 's',
  narration: 'A short spoken line.',
  blocks: [{ type: 'insight', props: { title: 'Point', conf: 'inferred' } }],
});

describe('generateLive — mocked adapter, no network', () => {
  it('turns a valid model response into a renderable ConversationSpec', async () => {
    fake.raw = JSON.stringify({
      title: 'Your $5,000, allocated',
      sub: 'A balanced split.',
      narration: 'Here is a simple split — half to needs, a third to wants, the rest to savings.',
      blocks: [
        {
          type: 'insight',
          props: { title: 'The 50/30/20 rule keeps it simple', conf: 'inferred' },
        },
        {
          type: 'breakdown',
          props: {
            title: 'Where each dollar goes',
            rows: [
              { name: 'Needs', val: '$2,500', pct: 50 },
              { name: 'Wants', val: '$1,500', pct: 30 },
              { name: 'Savings', val: '$1,000', pct: 20 },
            ],
          },
        },
        {
          type: 'list',
          props: { title: 'Quick wins', items: ['Automate savings', 'Track bills'] },
        },
      ],
    });

    const { spec, narration } = await generateLive('How should I budget $5,000?', [], cfg);

    // narration is preserved verbatim and surfaced both ways the caller needs it.
    expect(narration).toBe(
      'Here is a simple split — half to needs, a third to wants, the rest to savings.',
    );
    expect(spec.opener).toBe(narration);

    // the loose JSON became a real, typed, canvas-ready spec.
    expect(spec.id).toBe('live');
    expect(spec.title).toBe('Your $5,000, allocated');
    expect(spec.blocks.map((b) => b.type)).toEqual(['insight', 'breakdown', 'list']);

    // a clean answer needs no self-correction → exactly ONE model call.
    expect(fake.calls).toBe(1);
  });

  it('never leaks raw JSON to the UI when the response truncates mid-object', async () => {
    // Image-#16 case: a long answer cut off mid-JSON. Parse fails; the user must NOT see
    // braces — salvage the (complete) narration, show/speak that, and the card text stays
    // human prose, never a JSON envelope.
    fake.raw =
      '{ "narration": "Here is the proof your trip is balanced.", "title": "Your Trip", "sub": "A';
    const { spec, narration } = await generateLive('prove it', [], cfg);
    const summary = (spec.blocks[0] as { props: { summary?: string } }).props.summary ?? '';
    expect(narration).toBe('Here is the proof your trip is balanced.');
    expect(summary).toBe('Here is the proof your trip is balanced.');
    expect(summary).not.toContain('{');
    expect(summary).not.toContain('"narration"');
  });

  it('shows a clean message (not braces) when even the narration is unrecoverable', async () => {
    fake.raw = '{"blocks":[{"type":"insight","props":{'; // truncated, no narration to salvage
    const { spec } = await generateLive('q', [], cfg);
    const summary = (spec.blocks[0] as { props: { summary?: string } }).props.summary ?? '';
    expect(summary).not.toContain('{');
    expect(summary.length).toBeGreaterThan(0);
  });

  it('keeps frontier-cousin blocks the prompt advertises (donut/gauge), even if the selector did not draw them', async () => {
    // REGRESSION: the system prompt tells a capable model to "use bars/stack/donut/gauge
    // liberally", but those types are only in the random hero menu — so the validator gate
    // used to reject every one and collapse the canvas to its lone always-allowed insight.
    // The gate must include the tier's STANDARD set so a prompt-advertised block survives.
    fake.raw = JSON.stringify({
      title: 'Sectors',
      narration: 'Here is the split.',
      blocks: [
        { type: 'insight', props: { title: 'Lead' } },
        {
          type: 'donut',
          props: {
            title: 'Mix',
            rows: [
              { label: 'A', pct: 60, color: 'var(--insight)' },
              { label: 'B', pct: 40, color: 'var(--presence)' },
            ],
          },
        },
        { type: 'gauge', props: { title: 'Score', value: 72, max: 100 } },
        // and an inlined-props block, the other half of the same bug
        { type: 'bars', title: 'Jobs', bars: [{ label: 'Health', value: 5 }] },
      ],
    });
    const { spec } = await generateLive('tell me about the economy', [], cfg);
    expect(spec.blocks.map((b) => b.type)).toEqual(['insight', 'donut', 'gauge', 'bars']);
  });

  it('adds the code-audit accuracy guard for code review asks', async () => {
    fake.raw = OK_RESPONSE;
    await generateLive("what's wrong with this Kahn topological sort implementation?", [], cfg);
    expect(fake.lastReq!.system).toContain('CODE AUDIT ACCURACY');
    expect(fake.lastReq!.system).toContain('PROVEN DEFECTS');
    expect(fake.lastReq!.system).toContain('CONTRACT CAVEATS');
    expect(fake.lastReq!.system).toContain('disconnected components are NOT the same');
    expect(fake.lastReq!.system).toContain('omitted sink/isolated vertices');
  });

  it('adds the code-audit accuracy guard for vague asks about a selected code block', async () => {
    fake.raw = OK_RESPONSE;
    await generateLive('what is wrong here?', [], cfg, undefined, {
      selectedBlocks: [
        {
          id: 'code-1',
          type: 'codeblock',
          props: {
            title: 'Kahn snippet',
            lang: 'python',
            code: 'queue = [u for u in graph if in_degree[u] == 0]\nu = queue.pop(0)',
          },
        } as never,
      ],
    });
    expect(fake.lastReq!.system).toContain('CODE AUDIT ACCURACY');
  });

  it('streams the raw output through onDelta so the caller can speak narration-first', async () => {
    fake.raw = JSON.stringify({
      title: 'T',
      narration: 'Spoken first.',
      blocks: [{ type: 'list', props: { title: 'L', items: ['a'] } }],
    });
    const deltas: string[] = [];
    const { narration } = await generateLive('q', [], cfg, (c) => deltas.push(c));
    expect(deltas.length).toBeGreaterThan(0);
    expect(deltas.join('')).toContain('Spoken first.');
    expect(narration).toBe('Spoken first.');
  });

  it('accepts an already-parsed object from a constrained-decoding adapter', async () => {
    fake.raw = {
      title: 'Parsed object',
      narration: 'No string parse needed.',
      blocks: [{ type: 'insight', props: { title: 'Direct object path works' } }],
    };
    const { spec, narration } = await generateLive('q', [], cfg);
    expect(spec.title).toBe('Parsed object');
    expect(narration).toBe('No string parse needed.');
    expect(spec.blocks[0].type).toBe('insight');
  });

  it('surfaces a provider failure as a typed ERROR, never as answer content (never re-throws)', async () => {
    fake.shouldThrow = true;
    let result: Awaited<ReturnType<typeof generateLive>> | undefined;
    await expect(
      (async () => {
        result = await generateLive('q', [], cfg);
      })(),
    ).resolves.toBeUndefined();
    // The failure is typed so the surface can render an honest error state with recovery.
    expect(result!.error).toMatchObject({ kind: 'network' });
    expect(result!.error!.message).toContain('OpenRouter'); // names the provider it could not reach
    // The stub spec is unambiguous: no blocks, no confidence badge, an honest title.
    expect(result!.spec.blocks).toHaveLength(0);
    expect(result!.spec.title).toBe("Couldn't answer");
    expect(result!.spec.title).not.toContain('what I can say');
    // no fabricated narration; the opener carries the plain-language cause.
    expect(result!.narration).toBe('');
    expect(result!.spec.opener.length).toBeGreaterThan(0);
  });

  it('maps a 401 during generation to a plain-language key error', async () => {
    fake.shouldThrow = true;
    fake.throwMessage = 'anthropic 401'; // exactly what the adapters throw on HTTP failure
    const { spec, error } = await generateLive('q', [], cfg);
    expect(error).toMatchObject({ kind: 'auth', status: 401 });
    expect(error!.message).toContain('API key was rejected');
    // never dressed up as an insight/finding with an "Inferred" badge
    expect(spec.blocks.some((b) => b.type === 'insight')).toBe(false);
    expect(JSON.stringify(spec)).not.toContain('inferred');
  });

  it('maps a plain 429 during generation to a rate-limit error', async () => {
    fake.shouldThrow = true;
    fake.throwMessage = 'openai 429';
    const { error } = await generateLive('q', [], cfg);
    expect(error).toMatchObject({ kind: 'quota', status: 429 });
    // Plain 429 without RESOURCE_EXHAUSTED body = per-minute rate limit, not quota exhaustion.
    expect(error!.message).toContain('rate-limiting');
  });

  it('degrades to a fallback when the model returns unsalvageable garbage', async () => {
    fake.raw = 'I am sorry, I cannot help with that.'; // no JSON at all
    const { spec, narration } = await generateLive('q', [], cfg);
    expect(narration).toBe('');
    expect(spec.id).toBe('live');
    expect(spec.blocks).toHaveLength(1);
    expect(spec.blocks[0].type).toBe('insight');
  });

  it('runs ONE call for a clean answer and does not chase a phantom repair', async () => {
    fake.raw = JSON.stringify({
      title: 'Clean',
      narration: 'All good.',
      blocks: [
        { type: 'insight', props: { title: 'A finding', conf: 'inferred' } },
        {
          type: 'breakdown',
          props: {
            title: 'Split',
            rows: [
              { name: 'A', val: '$60', pct: 60 },
              { name: 'B', val: '$40', pct: 40 },
            ],
          },
        },
        { type: 'list', props: { title: 'Next steps', items: ['Do this', 'Then that'] } },
      ],
    });
    await generateLive('q', [], cfg);
    expect(fake.calls).toBe(1);
  });
});

describe('generateLive — output budget scales with a named item count (completeness over cost)', () => {
  it('gives a plain rich ask the ordinary token budget', async () => {
    fake.raw = OK_RESPONSE;
    await generateLive('tell me about the history of jazz', [], cfg);
    const plainBudget = fake.lastReq!.maxTokens!;
    expect(plainBudget).toBeGreaterThan(0);

    // A comprehensive, explicitly-counted ask needs MORE room for the one dense block that
    // will carry it — never less, and never clipped back down by a fixed ceiling.
    fake.raw = OK_RESPONSE;
    await generateLive('give me a comprehensive breakdown of jazz history with 15 steps', [], cfg);
    expect(fake.lastReq!.maxTokens!).toBeGreaterThan(plainBudget);
  });

  it('does not inflate the budget for an ordinary ask naming no count', async () => {
    fake.raw = OK_RESPONSE;
    await generateLive('tell me about the history of ballet', [], cfg);
    const a = fake.lastReq!.maxTokens!;
    fake.raw = OK_RESPONSE;
    await generateLive('tell me about the history of jazz', [], cfg);
    const b = fake.lastReq!.maxTokens!;
    expect(a).toBe(b); // same complexity, no named count → identical budget
  });
});

describe('generateLive — narration length is specified exactly ONE way per turn', () => {
  it('gives a rich ask the "two or three sentences" spec and no conflicting count', async () => {
    fake.raw = OK_RESPONSE;
    await generateLive('tell me about the history of jazz', [], cfg);
    const system = fake.lastReq!.system;
    expect(system).toContain('SPOKEN LINE');
    expect(system).toMatch(/two or three short sentences/);
    // the base prompt's own narration bullet no longer states a competing count.
    expect(system).not.toMatch(/sentence or two/i);
    expect(system).not.toMatch(/punchy line for a simple ask/i);
  });

  it('gives a lean/trivial ask the "one sentence" spec, not the rich one', async () => {
    fake.raw = OK_RESPONSE;
    await generateLive('what is 12*9', [], cfg);
    const system = fake.lastReq!.system;
    expect(system).toMatch(/ONE short sentence/);
    expect(system).not.toMatch(/two or three short sentences/);
  });
});

describe('generateLive — bend/track/tour directives are gated to plausible turns', () => {
  it('offers BENDABLE NUMBER on a budget/calculation ask', async () => {
    fake.raw = OK_RESPONSE;
    await generateLive('how should I budget my $5000 monthly income', [], cfg);
    expect(fake.lastReq!.system).toContain('BENDABLE NUMBER');
  });

  it('omits BENDABLE NUMBER on an ask with nothing to do with a number', async () => {
    fake.raw = OK_RESPONSE;
    await generateLive('tell me about the history of jazz', [], cfg);
    expect(fake.lastReq!.system).not.toContain('BENDABLE NUMBER');
  });

  it('offers TRACKABLE on an ongoing-metric ask', async () => {
    fake.raw = OK_RESPONSE;
    await generateLive('help me track my weekly revenue growth', [], cfg);
    expect(fake.lastReq!.system).toContain('TRACKABLE');
  });

  it('omits TRACKABLE on an ask with nothing to do with an ongoing metric', async () => {
    fake.raw = OK_RESPONSE;
    await generateLive('tell me about the history of jazz', [], cfg);
    expect(fake.lastReq!.system).not.toContain('TRACKABLE');
  });

  it('omits the spotlight-tour teaching on a brief ask, keeps it on a rich one', async () => {
    fake.raw = OK_RESPONSE;
    await generateLive('briefly explain how photosynthesis works', [], cfg);
    expect(fake.lastReq!.system).not.toContain('SPOTLIGHT TOUR');

    fake.raw = OK_RESPONSE;
    await generateLive('explain how photosynthesis works', [], cfg);
    expect(fake.lastReq!.system).toContain('SPOTLIGHT TOUR');
  });
});

/* A full, valid canvas the recovery re-ask can return. */
const FULL_CANVAS = JSON.stringify({
  title: 'Linked Lists & Graphs',
  narration: 'Two core structures every interview leans on.',
  blocks: [
    { type: 'insight', props: { title: 'A linked list is a chain of nodes' } },
    { type: 'list', props: { title: 'Operations', items: ['insert', 'delete', 'traverse'] } },
    { type: 'kpi', props: { title: 'Costs', items: [{ label: 'Insert', value: 'O(1)' }] } },
    {
      type: 'compare',
      props: {
        options: [{ name: 'List' }, { name: 'Graph' }],
        criteria: [{ label: 'Shape', cells: [{ v: 'linear' }, { v: 'network' }] }],
      },
    },
  ],
});

describe('generateLive — collapse recovery + continuation topic pin (the reported bugs)', () => {
  it('recovers a COLLAPSED first pass (0 blocks) with one re-ask instead of the lone fallback card', async () => {
    // First pass: narration but no title and no blocks → validateLiveResponse returns null → the
    // old behavior was the single "Here's what I can say / Inferred" card. Now we re-ask once.
    fake.rawByCall = [
      JSON.stringify({ narration: 'Linked lists are linear chains of nodes.', blocks: [] }),
      FULL_CANVAS,
    ];
    const { spec } = await generateLive(
      'teach me linked lists and graphs for a FAANG interview quickly',
      [],
      cfg,
    );
    expect(fake.calls).toBe(2); // initial + ONE recovery, never three
    expect(spec.title).toBe('Linked Lists & Graphs'); // the recovered canvas, NOT the fallback
    expect(spec.title).not.toBe('Here’s what I can say');
    expect(spec.blocks.length).toBeGreaterThanOrEqual(3);
  });

  it('falls back honestly — with NO "Inferred" badge — only when recovery also fails', async () => {
    fake.rawByCall = [
      JSON.stringify({ narration: 'A short spoken answer.', blocks: [] }),
      JSON.stringify({ narration: 'A short spoken answer.', blocks: [] }),
    ];
    const { spec, narration } = await generateLive('teach me graphs', [], cfg);
    expect(fake.calls).toBe(2);
    expect(spec.title).toBe('Here’s what I can say');
    expect(narration).toBe('A short spoken answer.'); // salvaged + spoken, not the generic apology
    const b = spec.blocks[0];
    // The degraded card is not a graded finding — it carries no confidence badge.
    expect((b.props as { conf?: string }).conf).toBeUndefined();
  });

  it('pins a topic-less "more in depth" to the current thread (no drift to an older topic)', async () => {
    fake.raw = FULL_CANVAS;
    const history = [
      { role: 'user' as const, content: 'teach me linked lists and graphs' },
      { role: 'assistant' as const, content: 'Linked Lists & Graphs' },
    ];
    await generateLive('more in depth', history, cfg, undefined, {
      priorTopic: 'Linked Lists & Graphs',
    });
    expect(fake.lastReq!.system).toContain('STAY ON THE CURRENT TOPIC');
    expect(fake.lastReq!.system).toContain('Linked Lists & Graphs');
  });

  it('pins a topic-less "go deeper" to selected UI blocks before older chat history', async () => {
    fake.raw = FULL_CANVAS;
    const history = [
      { role: 'user' as const, content: 'what are the flaws in this topological sort?' },
      { role: 'assistant' as const, content: 'Topological Sort: Scheduling Mechanics' },
    ];
    await generateLive('Go deeper', history, cfg, undefined, {
      priorTopic: 'BFS vs DFS Traversal',
      selectedBlocks: [
        {
          id: 'bfs-dfs-code',
          type: 'codeblock',
          props: {
            title: 'BFS vs DFS Traversal',
            lang: 'python',
            code: 'queue = collections.deque([start])\ndef dfs(node, visited): pass',
          },
        } as never,
      ],
    });
    expect(fake.lastReq!.system).toContain('STAY ON THE CURRENT TOPIC');
    expect(fake.lastReq!.system).toContain('The subject is: BFS vs DFS Traversal');
    expect(fake.lastReq!.system).not.toContain('The subject is: what are the flaws');
  });

  it('uses the visible prior answer title before older history for bare continuation asks', async () => {
    fake.raw = FULL_CANVAS;
    const history = [
      { role: 'user' as const, content: 'what are the flaws in this topological sort?' },
      { role: 'assistant' as const, content: 'Topological Sort: Scheduling Mechanics' },
    ];
    await generateLive('go deeper', history, cfg, undefined, {
      priorTopic: 'BFS vs DFS Traversal',
    });
    expect(fake.lastReq!.system).toContain('The subject is: BFS vs DFS Traversal');
    expect(fake.lastReq!.system).not.toContain('The subject is: what are the flaws');
  });

  it('falls back to chat history when the visible prior title is generic', async () => {
    fake.raw = FULL_CANVAS;
    const history = [
      { role: 'user' as const, content: 'teach me linked lists and graphs' },
      { role: 'assistant' as const, content: 'Here’s what I can say' },
    ];
    await generateLive('go deeper', history, cfg, undefined, {
      priorTopic: 'Here’s what I can say',
    });
    expect(fake.lastReq!.system).toContain('The subject is: teach me linked lists and graphs');
  });

  it('does NOT pin the topic when the follow-up names its own subject', async () => {
    fake.raw = FULL_CANVAS;
    const history = [
      { role: 'user' as const, content: 'teach me linked lists and graphs' },
      { role: 'assistant' as const, content: 'Linked Lists & Graphs' },
    ];
    await generateLive('go deeper on graphs', history, cfg);
    expect(fake.lastReq!.system).not.toContain('STAY ON THE CURRENT TOPIC');
  });

  it('shapes the FIRST answer into a teaching arc for a learning ask (no "more in depth" needed)', async () => {
    fake.raw = FULL_CANVAS;
    await generateLive('teach me how recursion works', [], cfg);
    expect(fake.lastReq!.system).toContain('TEACH IT AS A SHAPED LESSON');
    // The five arc beats, and the check beat's reuse of the existing facet tag.
    expect(fake.lastReq!.system).toContain('HOOK');
    expect(fake.lastReq!.system).toContain('BUILD THE MECHANISM');
    expect(fake.lastReq!.system).toContain('teachdiagram');
    expect(fake.lastReq!.system).toContain('captionSpoken');
    expect(fake.lastReq!.system).toContain('WORKED EXAMPLE');
    expect(fake.lastReq!.system).toContain('facet":"check"');
    // The teaching kit is pinned into the offered types this turn (the mocked adapter's tier
    // is 'mid', so the kit is not withheld).
    for (const t of ['teachdiagram', 'workedexample', 'quiz', 'flashcard']) {
      expect(fake.lastReq!.blockTypes).toContain(t);
    }
  });

  it('does not shape a plain rich (non-teaching) ask into the teaching arc', async () => {
    fake.raw = FULL_CANVAS;
    await generateLive('tell me about the history of jazz', [], cfg);
    expect(fake.lastReq!.system).not.toContain('TEACH IT AS A SHAPED LESSON');
  });

  it('does not shape a brief-classified teaching ask into the teaching arc', async () => {
    fake.raw = FULL_CANVAS;
    // An explicit brevity cue on a teaching ask classifies as 'brief', not 'rich', so
    // isTeaching (which requires complexity === 'rich') is false — a one-liner, not an arc.
    await generateLive('teach me recursion in one line', [], cfg);
    expect(fake.lastReq!.system).not.toContain('TEACH IT AS A SHAPED LESSON');
    expect(fake.lastReq!.system).not.toContain('TEACH IT IN FULL');
  });
});

describe('describeLiveError — plain-language mapping of provider failures', () => {
  it('401 → key rejected, pointed at settings', () => {
    const e = describeLiveError(new Error('anthropic 401'), 'anthropic');
    expect(e).toMatchObject({ kind: 'auth', status: 401 });
    expect(e.message).toBe('Your API key was rejected — check it in settings.');
  });

  it('429 / "insufficient quota" → the provider account is out of quota', () => {
    expect(describeLiveError(new Error('openai 429'), 'openai')).toMatchObject({
      kind: 'quota',
      status: 429,
    });
    // OpenAI's insufficient_quota often arrives as text without a clean status
    const e = describeLiveError(new Error('insufficient_quota: billing limit'), 'openai');
    expect(e.kind).toBe('quota');
    expect(e.message).toContain('out of quota');
  });

  it('no HTTP status (network / timeout) → "Couldn\'t reach <provider>" by name', () => {
    const e = describeLiveError(new Error('Failed to fetch'), 'anthropic');
    expect(e.kind).toBe('network');
    expect(e.status).toBeUndefined();
    expect(e.message).toContain("Couldn't reach Anthropic");
  });

  it('names Grok properly (not the raw lowercase provider id) — a real gap from the Responses API migration', () => {
    const e = describeLiveError(new Error('Failed to fetch'), 'grok');
    expect(e.message).toContain("Couldn't reach Grok");
    expect(e.message).not.toContain('grok');
  });

  it('404 → model-name guidance; other statuses stay honest with the code', () => {
    expect(describeLiveError(new Error('gemini 404'), 'gemini').message).toContain('Model not');
    const e = describeLiveError(new Error('anthropic 529'), 'anthropic');
    expect(e).toMatchObject({ kind: 'http', status: 529 });
    expect(e.message).toContain('529');
  });
});

describe('generateLive — search mode, thinking, and grounding (user-chosen, cost-aware)', () => {
  // A freshness-needing ask so the search gate opens; a model that grounds natively.
  const freshAsk = 'what is the latest news on the mars mission';

  it("'off' never searches, even for a fresh-info ask", async () => {
    fake.raw = OK_RESPONSE;
    let searched = false;
    await generateLive(freshAsk, [], cfg, undefined, {
      caps: { searchMode: 'off' },
      onActivity: (a) => {
        if (a === 'searching') searched = true;
      },
    });
    expect(searched).toBe(false);
  });

  it("'realtime' on a native-search provider enables tools + surfaces real grounding sources", async () => {
    fake.raw = OK_RESPONSE;
    fake.nativeWebSearch = true;
    fake.sources = [{ title: 'NASA', url: 'https://nasa.gov/mars' }];
    const { spec } = await generateLive(freshAsk, [], cfg, undefined, {
      caps: { searchMode: 'realtime' },
      repair: false, // skip repair pass so lastReq reflects the main call, not the repair
    });
    // The native search tool was requested…
    expect(fake.lastReq?.tools?.webSearch).toBe(true);
    // …and the model's real citations are surfaced under the canvas.
    expect(spec.sources).toEqual([{ title: 'NASA', url: 'https://nasa.gov/mars' }]);
    // …and the lead insight is marked provable, so the surface offers "Prove it" → sources.
    const lead = spec.blocks.find((b) => b.type === 'insight');
    expect(lead && 'prove' in lead ? lead.prove : false).toBe(true);
  });

  it("recovers a grounded turn's citations from the model's inline sources when the adapter returns none", async () => {
    // Gemini returns EMPTY groundingMetadata when google_search runs with JSON output, so the
    // adapter yields NO sources even though the answer IS grounded. We ask the model to list the
    // URLs it used inline, then merge them — so a grounded answer still shows real citations.
    fake.nativeWebSearch = true;
    fake.sources = undefined; // adapter-side grounding came back empty (the Gemini behaviour)
    fake.raw = JSON.stringify({
      title: 'Mars latest',
      sub: 's',
      narration: 'A short line.',
      blocks: [{ type: 'insight', props: { title: 'Point', conf: 'inferred' } }],
      sources: [{ title: 'Reuters', url: 'https://reuters.com/mars' }],
    });
    const { spec } = await generateLive(freshAsk, [], cfg, undefined, {
      caps: { searchMode: 'realtime' },
      repair: false,
    });
    // The model was instructed to cite inline…
    expect(fake.lastReq?.system).toContain('CITE YOUR SOURCES');
    // …and its inline citations are surfaced + the lead insight is marked provable.
    expect(spec.sources).toEqual([{ title: 'Reuters', url: 'https://reuters.com/mars' }]);
    const lead2 = spec.blocks.find((b) => b.type === 'insight');
    expect(lead2 && 'prove' in lead2 ? lead2.prove : false).toBe(true);
  });

  it('does NOT trust model-listed sources on an UNGROUNDED turn (no fabricated citations)', async () => {
    // Without native grounding this turn, a "sources" array in the model JSON could be invented,
    // so it must never become a citation — the merge is gated to genuinely grounded turns.
    fake.nativeWebSearch = false;
    fake.raw = JSON.stringify({
      title: 'T',
      sub: 's',
      narration: 'A line.',
      blocks: [{ type: 'insight', props: { title: 'P', conf: 'inferred' } }],
      sources: [{ title: 'Made up', url: 'https://example.com/fake' }],
    });
    const { spec } = await generateLive('tell me about jazz', [], cfg, undefined, {
      repair: false,
    });
    expect(spec.sources).toBeUndefined();
  });

  it('does NOT mark a block provable when the turn had no grounding sources', async () => {
    fake.raw = OK_RESPONSE; // no fake.sources → ungrounded
    const { spec } = await generateLive('tell me about jazz', [], cfg);
    const lead = spec.blocks.find((b) => b.type === 'insight');
    expect(lead && 'prove' in lead ? lead.prove : false).toBeFalsy();
  });

  it("'realtime' on a provider WITHOUT native search does NOT set tools (falls back gracefully)", async () => {
    fake.raw = OK_RESPONSE;
    fake.nativeWebSearch = false; // this provider can't ground itself
    await generateLive(freshAsk, [], cfg, undefined, { caps: { searchMode: 'realtime' } });
    expect(fake.lastReq?.tools).toBeUndefined();
  });

  it('does not search for an ordinary (non-fresh) ask, so most turns cost nothing extra', async () => {
    fake.raw = OK_RESPONSE;
    fake.nativeWebSearch = true;
    await generateLive('explain how compound interest works', [], cfg, undefined, {
      caps: { searchMode: 'realtime' },
    });
    expect(fake.lastReq?.tools).toBeUndefined();
  });

  it('tells the model the current TIME, not just the date (needed to judge upcoming vs live vs finished)', async () => {
    fake.raw = OK_RESPONSE;
    await generateLive('tell me about jazz', [], cfg);
    expect(fake.lastReq?.system).toContain('CURRENT DATE AND TIME');
    expect(fake.lastReq?.system).toMatch(/Right now it is \d{1,2}:\d{2}/);
  });

  it('on a genuinely live ask with a live path, tells the model to trust live status over a schedule', async () => {
    fake.raw = OK_RESPONSE;
    fake.nativeWebSearch = true;
    await generateLive('what is the score of the game right now', [], cfg, undefined, {
      caps: { searchMode: 'realtime' },
    });
    expect(fake.lastReq?.system).toContain('LIVE STATUS, NOT JUST A SCHEDULE');
  });

  it('forbids stating a specific live score/status without a real source behind it (no confident invention)', async () => {
    fake.raw = OK_RESPONSE;
    fake.nativeWebSearch = true;
    await generateLive('what is the score of the game right now', [], cfg, undefined, {
      caps: { searchMode: 'realtime' },
    });
    expect(fake.lastReq?.system).toContain('NO SOURCE, NO NUMBER');
  });

  it('omits the live-status nudge for an ordinary fresh (non-volatile) ask', async () => {
    fake.raw = OK_RESPONSE;
    fake.nativeWebSearch = true;
    // Fresh (population changes over time) but settled/encyclopedic, not sub-daily volatile.
    await generateLive('what is the population of Tokyo', [], cfg, undefined, {
      caps: { searchMode: 'realtime' },
    });
    expect(fake.lastReq?.system).not.toContain('LIVE STATUS, NOT JUST A SCHEDULE');
  });

  it('omits the live-status nudge when there is no live path (search off or no native support)', async () => {
    fake.raw = OK_RESPONSE;
    fake.nativeWebSearch = false;
    await generateLive('what is the score of the game right now', [], cfg, undefined, {
      caps: { searchMode: 'realtime' },
    });
    expect(fake.lastReq?.system).not.toContain('LIVE STATUS, NOT JUST A SCHEDULE');
  });

  it('still requires citing sources on a live ask that trips needsLiveData without tripping needsFreshInfo', async () => {
    // "at the moment" (needsLiveData) carries no needsFreshInfo trigger word (no "now"/"today"/
    // "score"/who's/what's/etc) — without OR'ing needsLiveData into mayGround's gate, this ask
    // would get the strict "NO SOURCE, NO NUMBER" honesty rule with no matching instruction to
    // actually emit a "sources" array, or a name for it.
    fake.raw = OK_RESPONSE;
    fake.nativeWebSearch = true;
    await generateLive('is he winning at the moment', [], cfg, undefined, {
      caps: { searchMode: 'realtime' },
    });
    expect(fake.lastReq?.system).toContain('LIVE STATUS, NOT JUST A SCHEDULE');
    expect(fake.lastReq?.system).toContain('CITE YOUR SOURCES');
  });

  it('enables url_context when the message has a link and the provider can read URLs', async () => {
    fake.raw = OK_RESPONSE;
    fake.nativeWebSearch = true;
    await generateLive('summarize https://example.com/post', [], cfg, undefined, {
      caps: { searchMode: 'realtime' },
      repair: false, // skip repair pass so lastReq reflects the main call, not the repair
    });
    expect(fake.lastReq?.tools?.urlContext).toBe(true);
  });

  it('passes a thinkingLevel (minimal for an ordinary ask, higher for a hard one)', async () => {
    fake.raw = OK_RESPONSE;
    await generateLive('tell me about jazz', [], cfg);
    expect(fake.lastReq?.thinkingLevel).toBe('minimal');
    await generateLive('derive the quadratic formula step by step', [], cfg, undefined, {
      caps: { quality: 'balanced' },
    });
    // hard ask (low) + balanced (+1) → medium
    expect(fake.lastReq?.thinkingLevel).toBe('medium');
  });

  it('recovers a grounded turn from a 429 by retrying ungrounded, clearing the activity indicator exactly once', async () => {
    // Free-tier keys throttle Google Search grounding separately from generation, so the FIRST
    // (grounded) call can 429 while a plain retry succeeds. For a volatile ask we skip Wikipedia
    // (an encyclopedia can't answer a live question) and just retry without tools. The activity
    // indicator must end cleared — and, since the finally is the single clear point, it's set to
    // null exactly ONCE per turn (no redundant per-branch clears).
    fake.nativeWebSearch = true;
    fake.throwFirstCall = true;
    fake.throwMessage = 'gemini 429';
    fake.raw = OK_RESPONSE;
    const activity: (string | null)[] = [];
    const { spec, error } = await generateLive(freshAsk, [], cfg, undefined, {
      caps: { searchMode: 'realtime' },
      repair: false,
      onActivity: (a) => activity.push(a),
    });
    // The turn recovered into a real answer, not an error state.
    expect(error).toBeUndefined();
    expect(spec.id).toBe('live');
    // First call grounded (429), second call the ungrounded retry — exactly two model calls.
    expect(fake.calls).toBe(2);
    expect(fake.lastReq?.tools).toBeUndefined();
    // The indicator is left cleared, and cleared just once (the lone finally, no per-branch dups).
    expect(activity.at(-1)).toBeNull();
    expect(activity.filter((a) => a === null)).toHaveLength(1);
  });

  it('compacts a long history before sending (cheap for hour-long chats)', async () => {
    fake.raw = OK_RESPONSE;
    const longHistory = Array.from({ length: 40 }, (_, i) => ({
      role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
      content: `m${i}`,
    }));
    await generateLive('next question', longHistory, cfg);
    // Far fewer than 40 messages get resent (recap + last few turns), not the whole transcript.
    expect(fake.lastReq!.history.length).toBeLessThan(longHistory.length);
  });
});
