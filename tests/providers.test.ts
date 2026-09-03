import { afterEach, vi } from 'vitest';
import { anthropicAdapter } from '../src/live/providers/anthropic';
import { openaiAdapter } from '../src/live/providers/openai';
import { geminiAdapter } from '../src/live/providers/gemini';
import { openrouterAdapter } from '../src/live/providers/openrouter';
import { grokAdapter } from '../src/live/providers/grok';
import { ADAPTERS, PROVIDERS, VISIBLE_PROVIDERS, getAdapter } from '../src/live/providers';
import { getUsageLedger, resetUsageLedgerForTest } from '../src/live/usage/ledger';
import type { LiveRequest } from '../src/live/providers/types';
import type { ModelConfig, ProviderId } from '../src/types/mavea';
import { describeLiveError } from '../src/live/generateLive';
import { speculate } from '../src/live/ghost/speculate';

// Locks the streaming substrate — the trickiest part of each adapter. We mock
// fetch with a real ReadableStream body in each provider's wire format and assert
// the adapter (a) accumulates the full raw output and (b) emits onDelta chunks.
// No network. This is what guarantees narration-first streaming actually parses.

function streamResponse(chunks: string[], contentType: string): Response {
  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(enc.encode(c));
      controller.close();
    },
  });
  return new Response(body, { status: 200, headers: { 'content-type': contentType } });
}

function mockFetchOnce(res: Response): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => res),
  );
}

const req: LiveRequest = { system: 'sys', history: [], user: 'How should I budget?' };

afterEach(() => {
  vi.unstubAllGlobals();
  resetUsageLedgerForTest();
});

// A real canvas turn (what generateLive always sends): blockTypes is non-empty, which is the
// signal that forces the emit_canvas tool schema — a non-canvas caller (mindshape, Prism,
// Ripple, SRS…) omits blockTypes and gets a free-form (or its own format-schema) call instead.
const canvasReq: LiveRequest = { ...req, blockTypes: ['insight', 'stat'] };

describe('anthropic adapter — Structured Outputs streaming', () => {
  it('accumulates text_delta and resolves a parsed object', async () => {
    mockFetchOnce(
      streamResponse(
        [
          'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"{\\"narration\\":\\"Hi\\","}}\n',
          'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"\\"title\\":\\"T\\",\\"sub\\":\\"\\",\\"blocks\\":[]}"}}\n',
        ],
        'text/event-stream',
      ),
    );
    const cfg: ModelConfig = { provider: 'anthropic', model: 'claude-haiku-4-5', apiKey: 'k' };
    const deltas: string[] = [];
    const { raw } = await anthropicAdapter.generate(canvasReq, cfg, (c) => deltas.push(c));
    expect(typeof raw).toBe('object');
    expect((raw as { narration: string }).narration).toBe('Hi');
    expect((raw as { title: string }).title).toBe('T');
    expect(deltas.length).toBe(2);
  });

  it('collects web_search citations from a citations_delta alongside the text', async () => {
    mockFetchOnce(
      streamResponse(
        [
          'data: {"type":"content_block_delta","delta":{"type":"citations_delta","citation":{"type":"web_search_result_location","url":"https://a.example/x","title":"A"}}}\n',
          'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"{\\"narration\\":\\"Hi\\",\\"title\\":\\"T\\",\\"sub\\":\\"\\",\\"blocks\\":[]}"}}\n',
        ],
        'text/event-stream',
      ),
    );
    const cfg: ModelConfig = { provider: 'anthropic', model: 'claude-sonnet-4-6', apiKey: 'k' };
    const { sources } = await anthropicAdapter.generate(
      { ...canvasReq, tools: { webSearch: true } },
      cfg,
    );
    expect(sources).toEqual([{ title: 'A', url: 'https://a.example/x' }]);
  });
});

describe('anthropic adapter — minItems relaxes for a brief ask', () => {
  it('defaults the Structured Outputs schema blocks minItems to 3', async () => {
    const fetchMock = vi.fn((_url: RequestInfo | URL, _init?: RequestInit) =>
      Promise.resolve(streamResponse([], 'text/event-stream')),
    );
    vi.stubGlobal('fetch', fetchMock);
    const cfg: ModelConfig = { provider: 'anthropic', model: 'claude-haiku-4-5', apiKey: 'k' };
    await anthropicAdapter.generate(canvasReq, cfg);
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init!.body as string);
    expect(body.output_config.format.schema.properties.blocks.minItems).toBe(3);
    expect(body.tool_choice).toBeUndefined(); // never forced — that's what blocked web_search
  });

  it('drops the schema blocks minItems to 1 for a brief ask', async () => {
    const fetchMock = vi.fn((_url: RequestInfo | URL, _init?: RequestInit) =>
      Promise.resolve(streamResponse([], 'text/event-stream')),
    );
    vi.stubGlobal('fetch', fetchMock);
    const cfg: ModelConfig = { provider: 'anthropic', model: 'claude-haiku-4-5', apiKey: 'k' };
    await anthropicAdapter.generate({ ...canvasReq, complexity: 'brief' }, cfg);
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init!.body as string);
    expect(body.output_config.format.schema.properties.blocks.minItems).toBe(1);
  });
});

describe('anthropic adapter — native web search', () => {
  it('injects web_search only when the turn requests it, versioned by model', async () => {
    const fetchMock = vi.fn((_url: RequestInfo | URL, _init?: RequestInit) =>
      Promise.resolve(streamResponse([], 'text/event-stream')),
    );
    vi.stubGlobal('fetch', fetchMock);

    const haiku: ModelConfig = { provider: 'anthropic', model: 'claude-haiku-4-5', apiKey: 'k' };
    await anthropicAdapter.generate({ ...canvasReq, tools: { webSearch: true } }, haiku);
    const haikuBody = JSON.parse(fetchMock.mock.calls[0][1]!.body as string);
    expect(haikuBody.tools).toEqual([
      { type: 'web_search_20250305', name: 'web_search', max_uses: 5 },
    ]);

    const sonnet: ModelConfig = { provider: 'anthropic', model: 'claude-sonnet-4-6', apiKey: 'k' };
    await anthropicAdapter.generate({ ...canvasReq, tools: { webSearch: true } }, sonnet);
    const sonnetBody = JSON.parse(fetchMock.mock.calls[1][1]!.body as string);
    expect(sonnetBody.tools).toEqual([
      { type: 'web_search_20260209', name: 'web_search', max_uses: 5 },
    ]);

    await anthropicAdapter.generate(canvasReq, sonnet);
    const plainBody = JSON.parse(fetchMock.mock.calls[2][1]!.body as string);
    expect(plainBody.tools).toBeUndefined();
  });

  it('declares native web search', () => {
    expect(anthropicAdapter.capabilities.nativeWebSearch).toBe(true);
  });
});

describe('anthropic adapter — non-canvas caller (format omitted, no blockTypes)', () => {
  it('does not force the emit_canvas tool and streams plain text', async () => {
    mockFetchOnce(
      streamResponse(
        [
          'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"{\\"ghosts\\":"}}\n',
          'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"[]}"}}\n',
        ],
        'text/event-stream',
      ),
    );
    const cfg: ModelConfig = { provider: 'anthropic', model: 'claude-haiku-4-5', apiKey: 'k' };
    const { raw } = await anthropicAdapter.generate(req, cfg);
    // Free-form text that happens to be valid JSON resolves as the parsed object (same as the
    // canvas path) — callers like ghost/speculate.ts accept either shape.
    expect(raw).toEqual({ ghosts: [] });
  });
});

describe('anthropic probe — readiness comes from the REAL generation endpoint', () => {
  // /v1/models can return 200 while /v1/messages 401s (Anthropic's browser detection blocks
  // only the latter) — so "Ready" must be earned by the endpoint a turn actually hits.
  const cfg: ModelConfig = { provider: 'anthropic', model: 'claude-haiku-4-5', apiKey: 'k' };

  /** Mocks fetch per-endpoint and records every call so tests can assert what was hit. */
  function mockProbeFetch(
    modelsStatus: number,
    messagesStatus: number,
  ): { url: string; init?: RequestInit }[] {
    const calls: { url: string; init?: RequestInit }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
        calls.push({ url: String(url), init });
        const status = String(url).includes('/v1/models') ? modelsStatus : messagesStatus;
        return new Response('{}', { status });
      }),
    );
    return calls;
  }

  it('is ready only when /v1/messages accepts — with a minimal, ~1-token request', async () => {
    const calls = mockProbeFetch(200, 200);
    const r = await anthropicAdapter.probe(cfg);
    expect(r.ok).toBe(true);
    expect(r.model).toBe(true);
    expect(r.statusCode).toBe(200);
    const gen = calls.find((c) => c.url.includes('/v1/messages'));
    expect(gen).toBeDefined();
    const body = JSON.parse(String(gen!.init?.body)) as { max_tokens: number; messages: unknown[] };
    expect(body.max_tokens).toBe(1); // the paid check costs ~one token, never a real turn
    expect(body.messages).toHaveLength(1);
  });

  it('reports NOT ready when models is 200 but messages 401s (the production trap)', async () => {
    mockProbeFetch(200, 401);
    const r = await anthropicAdapter.probe(cfg);
    expect(r.ok).toBe(false);
    expect(r.model).toBe(false);
    expect(r.statusCode).toBe(401); // the UI can say "Invalid API key", not just "Not ready"
  });

  it('never spends a paid messages call when the free models check already fails', async () => {
    const calls = mockProbeFetch(401, 200);
    const r = await anthropicAdapter.probe(cfg);
    expect(r.ok).toBe(false);
    expect(r.statusCode).toBe(401);
    expect(calls.some((c) => c.url.includes('/v1/messages'))).toBe(false);
  });

  it('degrades cleanly (no statusCode) when the endpoint is unreachable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      }),
    );
    const r = await anthropicAdapter.probe(cfg);
    expect(r).toEqual({ ok: false, model: false });
  });
});

describe('openai adapter — Responses API streaming', () => {
  it('accumulates response.output_text.delta and targets /v1/responses', async () => {
    const fetchMock = vi.fn(async () =>
      streamResponse(
        [
          'data: {"type":"response.output_text.delta","delta":"{\\"narration\\""}\n',
          'data: {"type":"response.output_text.delta","delta":":\\"Hi\\"}"}\n',
          'data: {"type":"response.completed","response":{"output":[],"usage":{"input_tokens":10,"output_tokens":5,"input_tokens_details":{"cached_tokens":2}}}}\n',
        ],
        'text/event-stream',
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const cfg: ModelConfig = { provider: 'openai', model: 'gpt-4.1-mini', apiKey: 'k' };
    const deltas: string[] = [];
    const { raw, usage } = await openaiAdapter.generate(req, cfg, (c) => deltas.push(c));
    expect(raw).toBe('{"narration":"Hi"}');
    expect(deltas.length).toBe(2);
    expect(usage).toEqual({ input: 10, output: 5, cachedInput: 2 });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/llm/openai/v1/responses');
    const body = JSON.parse(init.body as string) as {
      input: unknown[];
      text: unknown;
      store?: boolean;
    };
    expect(body.text).toEqual({ format: { type: 'json_object' } });
    expect(body.store).toBe(false);
    // json_object mode requires the literal word "json" in the INPUT messages (instructions
    // don't count — a real 400 without it), so every json_object turn carries a one-line
    // system nudge ahead of the user turn.
    expect(body.input).toHaveLength(2);
    expect(body.input[0]).toEqual({ role: 'system', content: 'Respond in JSON.' });
  });

  it('replays assistant history as plain input_text content, never output_text (a real 400 on the API)', async () => {
    const fetchMock = vi.fn(async () => streamResponse([], 'text/event-stream'));
    vi.stubGlobal('fetch', fetchMock);
    const cfg: ModelConfig = { provider: 'openai', model: 'gpt-4.1-mini', apiKey: 'k' };
    await openaiAdapter.generate(
      {
        ...req,
        history: [
          { role: 'user', content: 'first question' },
          { role: 'assistant', content: 'first answer' },
        ],
      },
      cfg,
    );
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(init.body as string) as {
      input: Array<{ role: string; content: unknown }>;
    };
    // `output_text` is only valid inside a verbatim ResponseOutputMessage (id/status and all)
    // echoed back from a prior response — a freshly-authored replay must stay plain/input_text
    // for EVERY role, or the Responses API rejects the whole request with a 400. (input[0] is
    // the json_object nudge line — history follows it.)
    expect(body.input[1]).toEqual({ role: 'user', content: 'first question' });
    expect(body.input[2]).toEqual({ role: 'assistant', content: 'first answer' });
    expect(JSON.stringify(body.input)).not.toContain('output_text');
  });

  it('extracts url_citation annotations from the completed message item', async () => {
    mockFetchOnce(
      streamResponse(
        [
          'data: {"type":"response.output_text.delta","delta":"{\\"narration\\":\\"Hi\\"}"}\n',
          'data: {"type":"response.completed","response":{"output":[{"type":"message","content":[{"type":"output_text","text":"{}","annotations":[{"type":"url_citation","url":"https://a.example/x","title":"A"},{"type":"url_citation","url":"https://a.example/x","title":"A dup"}]}]}]}}\n',
        ],
        'text/event-stream',
      ),
    );
    const cfg: ModelConfig = { provider: 'openai', model: 'gpt-4.1-mini', apiKey: 'k' };
    const { sources } = await openaiAdapter.generate({ ...req, tools: { webSearch: true } }, cfg);
    expect(sources).toEqual([{ title: 'A', url: 'https://a.example/x' }]); // deduped by URL
  });

  it('sends a REQUIRED `detail` field on input_image (omitting it 400s on the real API)', async () => {
    const fetchMock = vi.fn(async () => streamResponse([], 'text/event-stream'));
    vi.stubGlobal('fetch', fetchMock);
    const cfg: ModelConfig = { provider: 'openai', model: 'gpt-4.1-mini', apiKey: 'k' };
    await openaiAdapter.generate(
      {
        ...req,
        attachments: [{ name: 'x.png', mime: 'image/png', data: 'AAAA', size: 3 }],
      },
      cfg,
    );
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(init.body as string) as {
      input: Array<{ content: Array<Record<string, unknown>> }>;
    };
    const imagePart = body.input.at(-1)!.content.find((p) => p.type === 'input_image');
    expect(imagePart).toEqual({
      type: 'input_image',
      detail: 'auto',
      image_url: 'data:image/png;base64,AAAA',
    });
  });
});

describe('reasoning models — effort pinned low + budget floored (never an empty answer)', () => {
  it('Responses: a gpt-5.x turn with NO thinkingLevel still sends reasoning.effort low + floors the budget', async () => {
    const fetchMock = vi.fn(async () => streamResponse([], 'text/event-stream'));
    vi.stubGlobal('fetch', fetchMock);
    const cfg: ModelConfig = { provider: 'openai', model: 'gpt-5.4-mini', apiKey: 'k' };
    await openaiAdapter.generate({ ...req, maxTokens: 300 }, cfg); // a tiny on-demand cap
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(init.body as string) as {
      reasoning?: unknown;
      max_output_tokens: number;
      temperature?: number;
    };
    // The bug this locks: without an explicit level the API default ('medium') applied and the
    // model spent the whole budget thinking → empty answer. Now 'low' is always sent.
    expect(body.reasoning).toEqual({ effort: 'low' });
    expect(body.max_output_tokens).toBe(1500); // floored up from 300 so thinking can't starve the write
    expect(body.temperature).toBeUndefined(); // reasoning models reject a custom temperature
  });

  it('Responses: a search-metric turn (medium effort) floors the budget high enough to actually write', async () => {
    const fetchMock = vi.fn(async () => streamResponse([], 'text/event-stream'));
    vi.stubGlobal('fetch', fetchMock);
    const cfg: ModelConfig = { provider: 'openai', model: 'gpt-5.4-mini', apiKey: 'k' };
    // A dashboards refresh: search on, no blockTypes (not a canvas turn), a ~3000 caller cap. The
    // adapter lifts effort to 'medium' because search is reasoning-gated — and medium reasoning
    // routinely burns thousands of tokens BEFORE the first output token. The old flat 1500 floor
    // let the whole budget go to thinking: billed reasoning + billed search, zero answer, every
    // single check ("used its entire output budget on reasoning").
    await openaiAdapter.generate({ ...req, maxTokens: 3000, tools: { webSearch: true } }, cfg);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(init.body as string) as {
      reasoning?: unknown;
      max_output_tokens: number;
    };
    expect(body.reasoning).toEqual({ effort: 'medium' });
    expect(body.max_output_tokens).toBe(8000);
  });

  it('Responses: the grounding retry (high effort) gets the largest floor', async () => {
    const fetchMock = vi.fn(async () => streamResponse([], 'text/event-stream'));
    vi.stubGlobal('fetch', fetchMock);
    const cfg: ModelConfig = { provider: 'openai', model: 'gpt-5.4-mini', apiKey: 'k' };
    await openaiAdapter.generate(
      { ...req, maxTokens: 3000, tools: { webSearch: true }, thinkingLevel: 'high' },
      cfg,
    );
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(init.body as string) as {
      reasoning?: unknown;
      max_output_tokens: number;
    };
    expect(body.reasoning).toEqual({ effort: 'high' });
    expect(body.max_output_tokens).toBe(12000);
  });

  it('Responses: a classic model keeps its exact cap + temperature and sends no reasoning field', async () => {
    const fetchMock = vi.fn(async () => streamResponse([], 'text/event-stream'));
    vi.stubGlobal('fetch', fetchMock);
    const cfg: ModelConfig = { provider: 'openai', model: 'gpt-4.1-mini', apiKey: 'k' };
    await openaiAdapter.generate({ ...req, maxTokens: 300 }, cfg);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(init.body as string) as {
      reasoning?: unknown;
      max_output_tokens: number;
      temperature?: number;
    };
    expect(body.reasoning).toBeUndefined();
    expect(body.max_output_tokens).toBe(300);
    expect(body.temperature).toBe(0.3);
  });

  it('chat-completions: a reasoning model sends reasoning_effort low + floors max_completion_tokens', async () => {
    const fetchMock = vi.fn(async () => streamResponse(['data: [DONE]\n'], 'text/event-stream'));
    vi.stubGlobal('fetch', fetchMock);
    const cfg: ModelConfig = { provider: 'openrouter', model: 'openai/gpt-5-mini', apiKey: 'k' };
    await openrouterAdapter.generate({ ...req, maxTokens: 300 }, cfg);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(init.body as string) as {
      reasoning_effort?: string;
      max_completion_tokens?: number;
      temperature?: number;
    };
    expect(body.reasoning_effort).toBe('low');
    expect(body.max_completion_tokens).toBe(1500);
    expect(body.temperature).toBeUndefined();
  });
});

// The floor above is a reservation for hidden thinking — and a GLIMPSE does none. A caller that
// declares `minimal` thinking AND sizes its own budget (the ghost speculation off a half-spoken
// sentence, a node breakdown, a grounding resolve) was paying the 1500-token floor on a reasoning
// model: the default provider IS one, and up to three glimpses fire per listen, so the "150-token"
// ghost billed an order of magnitude more than it asked for. Asking for the `minimal` tier removes
// the hidden pass the floor protects against, which is exactly what makes dropping the floor safe.
// The two move TOGETHER — a floor removed while the model still thinks is how a small caller pays
// for reasoning and receives an empty completion.
describe('a glimpse costs what it asked for (minimal tier, no floor)', () => {
  async function responsesBody(
    model: string,
    extra: Partial<LiveRequest> = {},
  ): Promise<Record<string, unknown>> {
    const fetchMock = vi.fn(async () => streamResponse([], 'text/event-stream'));
    vi.stubGlobal('fetch', fetchMock);
    await openaiAdapter.generate({ ...req, ...extra }, { provider: 'openai', model, apiKey: 'k' });
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    return JSON.parse(init.body as string) as Record<string, unknown>;
  }

  const glimpse: Partial<LiveRequest> = { maxTokens: 150, thinkingLevel: 'minimal' };

  it('Responses: a gpt-5 glimpse asks for minimal effort and keeps its own 150-token budget', async () => {
    const body = await responsesBody('gpt-5.4-nano', glimpse);
    expect(body.reasoning).toEqual({ effort: 'minimal' });
    expect(body.max_output_tokens).toBe(150);
  });

  it('Responses: an o-series model has no minimal tier, so it keeps low effort AND the floor', async () => {
    // The value would be rejected outright there — the saving is never worth a 400.
    const body = await responsesBody('o4-mini', glimpse);
    expect(body.reasoning).toEqual({ effort: 'low' });
    expect(body.max_output_tokens).toBe(1500);
  });

  it('Responses: a real canvas turn asking for minimal thinking keeps low effort AND the floor', async () => {
    // A lean ask legitimately asks for minimal thinking (effort.ts pins it there), so blockTypes
    // is what separates the turn the reader is waiting on from a disposable glimpse. Without this
    // the cheapest, most common turn would lose the protection the floor exists for.
    const body = await responsesBody('gpt-5.4-nano', { ...glimpse, blockTypes: ['insight'] });
    expect(body.reasoning).toEqual({ effort: 'low' });
    expect(body.max_output_tokens).toBe(1500);
  });

  it('Responses: a glimpse that also wants web search stays at medium — grounding outranks it', async () => {
    // Search is reasoning-gated: at the lowest tier the tool doesn't engage and the "saving" is an
    // ungrounded answer.
    const body = await responsesBody('gpt-5.4-nano', { ...glimpse, tools: { webSearch: true } });
    expect(body.reasoning).toEqual({ effort: 'medium' });
    expect(body.max_output_tokens).toBe(8000);
  });

  it('Responses: a caller that did NOT size its own budget still gets the floor', async () => {
    // Minimal thinking alone is not the signal — both dials have to be set on purpose.
    const body = await responsesBody('gpt-5.4-nano', { thinkingLevel: 'minimal' });
    expect(body.reasoning).toEqual({ effort: 'low' });
    expect(body.max_output_tokens).toBe(1500);
  });

  it('chat-completions: the same rule, gated on the model the gateway routes to', async () => {
    const bodyFor = async (model: string): Promise<Record<string, unknown>> => {
      const fetchMock = vi.fn(async () => streamResponse(['data: [DONE]\n'], 'text/event-stream'));
      vi.stubGlobal('fetch', fetchMock);
      await openrouterAdapter.generate(
        { ...req, ...glimpse },
        { provider: 'openrouter', model, apiKey: 'k' },
      );
      const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
      vi.unstubAllGlobals();
      return JSON.parse(init.body as string) as Record<string, unknown>;
    };
    const gpt5 = await bodyFor('openai/gpt-5-mini');
    expect(gpt5.reasoning_effort).toBe('minimal');
    expect(gpt5.max_completion_tokens).toBe(150);
    // A gateway can route anywhere, and 'minimal' is not universally accepted — so anything but
    // the family that documents the tier keeps today's request exactly as it was.
    const oSeries = await bodyFor('openai/o4-mini');
    expect(oSeries.reasoning_effort).toBe('low');
    expect(oSeries.max_completion_tokens).toBe(1500);
  });

  it('the ghost glimpse itself lands on the wire as one — and still parses its cards', async () => {
    // End-to-end over the real adapter (no provider mock): speculate's request shape is what has
    // to trip the exemption, not a hand-copied approximation of it. And it must still WORK —
    // ghosts are default-on and user-visible.
    const fetchMock = vi.fn(async () =>
      streamResponse(
        [
          'data: {"type":"response.output_text.delta","delta":"{\\"ghosts\\":[{\\"kind\\":\\"forming\\",\\"title\\":\\"Bloom forecast\\"}]}"}\n',
        ],
        'text/event-stream',
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const cards = await speculate(
      'we are thinking Tokyo in',
      { provider: 'openai', model: 'gpt-5.4-nano', apiKey: 'k' },
      new AbortController().signal,
    );
    expect(cards).toEqual([{ kind: 'forming', title: 'Bloom forecast' }]);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.reasoning).toEqual({ effort: 'minimal' });
    expect(body.max_output_tokens).toBe(150);
  });
});

describe('token usage capture — the cost signal the eval reads', () => {
  it('anthropic sums input + both cache slices and takes the final output_tokens', async () => {
    mockFetchOnce(
      streamResponse(
        [
          'data: {"type":"message_start","message":{"usage":{"input_tokens":100,"cache_read_input_tokens":900,"cache_creation_input_tokens":0,"output_tokens":1}}}\n',
          'data: {"type":"content_block_delta","delta":{"text":"{\\"narration\\":\\"Hi\\"}"}}\n',
          'data: {"type":"message_delta","usage":{"output_tokens":42}}\n',
        ],
        'text/event-stream',
      ),
    );
    const cfg: ModelConfig = { provider: 'anthropic', model: 'claude-haiku-4-5', apiKey: 'k' };
    const { usage } = await anthropicAdapter.generate(req, cfg);
    // input = fresh 100 + cache_read 900 + cache_creation 0 (total input, cross-provider-consistent);
    // cachedInput = the cache_read slice; output = the cumulative message_delta count.
    expect(usage).toEqual({ input: 1000, output: 42, cachedInput: 900 });
  });

  it('chat-completions requests usage and reads the post-finish summary frame', async () => {
    const fetchMock = vi.fn(async () =>
      streamResponse(
        [
          'data: {"choices":[{"delta":{"content":"{\\"narration\\":\\"Hi\\"}"},"finish_reason":null}]}\n',
          'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n',
          'data: {"choices":[],"usage":{"prompt_tokens":120,"completion_tokens":30,"prompt_tokens_details":{"cached_tokens":50}}}\n',
          'data: [DONE]\n',
        ],
        'text/event-stream',
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const cfg: ModelConfig = { provider: 'openrouter', model: 'openai/gpt-4o-mini', apiKey: 'k' };
    const { raw, usage } = await openrouterAdapter.generate(req, cfg);
    expect(raw).toBe('{"narration":"Hi"}'); // the answer survives waiting one frame past finish
    expect(usage).toEqual({ input: 120, output: 30, cachedInput: 50 });
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(init.body as string) as { stream_options?: unknown };
    expect(body.stream_options).toEqual({ include_usage: true });
  });

  it('records every guarded provider call under its feature label', async () => {
    mockFetchOnce(
      streamResponse(
        [
          'data: {"choices":[{"delta":{"content":"ok"},"finish_reason":null}]}\n',
          'data: {"choices":[],"usage":{"prompt_tokens":120,"completion_tokens":30,"prompt_tokens_details":{"cached_tokens":50}}}\n',
          'data: [DONE]\n',
        ],
        'text/event-stream',
      ),
    );
    const cfg: ModelConfig = {
      provider: 'openrouter',
      model: 'openai/gpt-4o-mini',
      apiKey: 'k',
    };

    await getAdapter('openrouter').generate({ ...req, usageLabel: 'ripple-enrichment' }, cfg);

    expect(getUsageLedger()).toEqual([
      expect.objectContaining({
        label: 'ripple-enrichment',
        input: 120,
        cachedInput: 50,
        output: 30,
      }),
    ]);
  });
});

describe('openrouter adapter — OpenAI-compatible, attribution + correct URL', () => {
  it('streams choices[].delta.content just like OpenAI', async () => {
    mockFetchOnce(
      streamResponse(
        [
          'data: {"choices":[{"delta":{"content":"{\\"narration\\""}}]}\n',
          'data: {"choices":[{"delta":{"content":":\\"Hi\\"}"}}]}\n',
          'data: [DONE]\n',
        ],
        'text/event-stream',
      ),
    );
    const cfg: ModelConfig = {
      provider: 'openrouter',
      model: 'meta-llama/llama-3.3-70b-instruct:free',
      apiKey: 'k',
    };
    const deltas: string[] = [];
    const { raw } = await openrouterAdapter.generate(req, cfg, (c) => deltas.push(c));
    expect(raw).toBe('{"narration":"Hi"}');
    expect(deltas.length).toBe(2);
  });

  it('targets /llm/openrouter/api/v1 with Bearer + attribution headers and json mode', async () => {
    const fetchMock = vi.fn(async () => streamResponse(['data: [DONE]\n'], 'text/event-stream'));
    vi.stubGlobal('fetch', fetchMock);
    const cfg: ModelConfig = { provider: 'openrouter', model: 'openai/gpt-4o-mini', apiKey: 'k' };
    await openrouterAdapter.generate(req, cfg);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/llm/openrouter/api/v1/chat/completions');
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer k');
    expect(headers['X-Title']).toBe('Mavéa');
    expect(headers['HTTP-Referer']).toBeTruthy();
    const body = JSON.parse(init.body as string) as { model: string; response_format: unknown };
    expect(body.model).toBe('openai/gpt-4o-mini');
    expect(body.response_format).toEqual({ type: 'json_object' });
  });
});

/** One well-formed Gemini SSE frame carrying real text — the minimum a request-shape test needs
 *  now that a stream with no text at all is treated as a failed turn. */
const TEXT_FRAME = 'data: {"candidates":[{"content":{"parts":[{"text":"{}"}]}}]}\n';

/** A 200 response whose body dies the way a stalled stream does — after emitting `before` first,
 *  if given. Lets the retry rule be tested without waiting out the real first-chunk budget. */
function stallingResponse(before: string[] = []): Response {
  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of before) controller.enqueue(enc.encode(c));
    },
    pull(controller) {
      controller.error(new Error('stream stalled'));
    },
  });
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

describe('gemini retries a stall only when nothing was streamed', () => {
  const cfg: ModelConfig = { provider: 'gemini', model: 'gemini-3.1-flash-lite', apiKey: 'k' };

  it('retries once when the stream died before a single byte', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(stallingResponse())
      .mockResolvedValueOnce(streamResponse([TEXT_FRAME], 'text/event-stream'));
    vi.stubGlobal('fetch', fetchMock);
    const { raw } = await geminiAdapter.generate(req, cfg);
    expect(raw).toBe('{}');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does NOT retry once fragments have already been streamed', async () => {
    // Re-asking here would bill the turn twice AND paint the answer's opening twice — the user has
    // already seen and heard what arrived, and generateLive salvages it.
    const fetchMock = vi.fn(async () => stallingResponse([TEXT_FRAME]));
    vi.stubGlobal('fetch', fetchMock);
    const deltas: string[] = [];
    await expect(geminiAdapter.generate(req, cfg, (c) => deltas.push(c))).rejects.toThrow(
      /stream stalled/,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(deltas).toEqual(['{}']);
  });

  it('gives up after one retry rather than looping', async () => {
    const fetchMock = vi.fn(async () => stallingResponse());
    vi.stubGlobal('fetch', fetchMock);
    await expect(geminiAdapter.generate(req, cfg)).rejects.toThrow(/stream stalled/);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('gemini answers with 200 OK and nothing in it', () => {
  // Google reports a refusal in-band: HTTP 200, a well-formed stream, and a finishReason instead
  // of text. Reading only parts[].text turned every one of those into raw:'' — which the validator
  // rejected, which triggered generateLive's collapse recovery (a second billed call nobody saw),
  // which finally rendered a card reading "try asking again". That card is why people learned to
  // send the prompt twice; these tests are what keep it from coming back.
  const cfg: ModelConfig = { provider: 'gemini', model: 'gemini-3.1-flash-lite', apiKey: 'k' };

  it('names a safety block instead of returning an empty answer', async () => {
    mockFetchOnce(
      streamResponse(
        ['data: {"candidates":[{"finishReason":"SAFETY","content":{"parts":[]}}]}\n'],
        'text/event-stream',
      ),
    );
    await expect(geminiAdapter.generate(req, cfg)).rejects.toThrow(/content-blocked — SAFETY/);
  });

  it('names a prompt-level block from promptFeedback', async () => {
    mockFetchOnce(
      streamResponse(
        ['data: {"promptFeedback":{"blockReason":"OTHER"},"candidates":[]}\n'],
        'text/event-stream',
      ),
    );
    await expect(geminiAdapter.generate(req, cfg)).rejects.toThrow(/content-blocked — OTHER/);
  });

  it('calls out a budget spent entirely on thinking, which the user can actually fix', async () => {
    mockFetchOnce(
      streamResponse(
        ['data: {"candidates":[{"finishReason":"MAX_TOKENS","content":{"parts":[]}}]}\n'],
        'text/event-stream',
      ),
    );
    await expect(geminiAdapter.generate(req, cfg)).rejects.toThrow(/thinking-budget/);
  });

  it('still salvages a MAX_TOKENS stop that DID produce text (the cut-short path)', async () => {
    mockFetchOnce(
      streamResponse(
        [
          'data: {"candidates":[{"finishReason":"MAX_TOKENS","content":{"parts":[{"text":"{\\"a\\":1"}]}}]}\n',
        ],
        'text/event-stream',
      ),
    );
    const { raw } = await geminiAdapter.generate(req, cfg);
    expect(raw).toBe('{"a":1');
  });

  it('retries a transient 503 rather than failing the turn on it', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('{}', { status: 503 }))
      .mockResolvedValueOnce(streamResponse([TEXT_FRAME], 'text/event-stream'));
    vi.stubGlobal('fetch', fetchMock);
    const { raw } = await geminiAdapter.generate(req, cfg);
    expect(raw).toBe('{}');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('surfaces a non-transient status without retrying', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 400 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(geminiAdapter.generate(req, cfg)).rejects.toThrow(/gemini 400/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('gemini adapter — candidates parts streaming', () => {
  it('accumulates candidates[0].content.parts[].text', async () => {
    mockFetchOnce(
      streamResponse(
        [
          'data: {"candidates":[{"content":{"parts":[{"text":"{\\"narration\\":"}]}}]}\n',
          'data: {"candidates":[{"content":{"parts":[{"text":"\\"Hi\\"}"}]}}]}\n',
        ],
        'text/event-stream',
      ),
    );
    const cfg: ModelConfig = { provider: 'gemini', model: 'gemini-3.1-flash-lite', apiKey: 'k' };
    const deltas: string[] = [];
    const { raw } = await geminiAdapter.generate(req, cfg, (c) => deltas.push(c));
    expect(raw).toBe('{"narration":"Hi"}');
    expect(deltas.length).toBe(2);
  });

  it('omits thinkingConfig + tools by default (Flash-Lite minimal stands, no search billed)', async () => {
    // A frame with real text: an empty stream is now a failure in its own right (see the
    // empty-response tests below), and this one is only about what we SEND.
    const fetchMock = vi.fn(async () => streamResponse([TEXT_FRAME], 'text/event-stream'));
    vi.stubGlobal('fetch', fetchMock);
    const cfg: ModelConfig = { provider: 'gemini', model: 'gemini-3.1-flash-lite', apiKey: 'k' };
    await geminiAdapter.generate(req, cfg);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(init.body as string) as {
      generationConfig: Record<string, unknown>;
      tools?: unknown;
    };
    expect(body.generationConfig.thinkingConfig).toBeUndefined();
    expect(body.tools).toBeUndefined();
    // JSON mode is always on (parseable output)…
    expect(body.generationConfig.responseMimeType).toBe('application/json');
    // …but NOT a rigid responseSchema: it forces every block's open `props` to `{}` (empty
    // cards). The prompt + the validation core own the shape instead.
    expect(body.generationConfig.responseSchema).toBeUndefined();
  });

  it('sends thinkingLevel (uppercased) and native tools when the turn asks for them', async () => {
    const fetchMock = vi.fn(async () => streamResponse([TEXT_FRAME], 'text/event-stream'));
    vi.stubGlobal('fetch', fetchMock);
    const cfg: ModelConfig = { provider: 'gemini', model: 'gemini-3.1-flash-lite', apiKey: 'k' };
    await geminiAdapter.generate(
      { ...req, thinkingLevel: 'low', tools: { webSearch: true, urlContext: true } },
      cfg,
    );
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(init.body as string) as {
      generationConfig: { thinkingConfig?: { thinkingLevel: string } };
      tools?: Array<Record<string, unknown>>;
    };
    expect(body.generationConfig.thinkingConfig).toEqual({ thinkingLevel: 'LOW' });
    expect(body.tools).toEqual([{ google_search: {} }, { url_context: {} }]);
  });

  it('parses groundingMetadata into deduped sources (real-time citations)', async () => {
    mockFetchOnce(
      streamResponse(
        [
          'data: {"candidates":[{"content":{"parts":[{"text":"{\\"narration\\":\\"Hi\\"}"}]},"groundingMetadata":{"groundingChunks":[{"web":{"uri":"https://a.example/x","title":"A"}},{"web":{"uri":"https://b.example/y","title":"B"}}]}}]}\n',
          'data: {"candidates":[{"groundingMetadata":{"groundingChunks":[{"web":{"uri":"https://a.example/x","title":"A dup"}}]}}]}\n',
        ],
        'text/event-stream',
      ),
    );
    const cfg: ModelConfig = { provider: 'gemini', model: 'gemini-3.1-flash-lite', apiKey: 'k' };
    const { raw, sources } = await geminiAdapter.generate(
      { ...req, tools: { webSearch: true } },
      cfg,
    );
    expect(raw).toBe('{"narration":"Hi"}');
    // Two unique URLs, the duplicate folded out, titles preserved.
    expect(sources).toEqual([
      { title: 'A', url: 'https://a.example/x' },
      { title: 'B', url: 'https://b.example/y' },
    ]);
  });

  it('declares native web search so generateLive skips app-side retrieve-then-read', () => {
    expect(geminiAdapter.capabilities.nativeWebSearch).toBe(true);
  });
});

describe('grok adapter — xAI, Responses API', () => {
  it('streams response.output_text.delta like OpenAI and targets the /llm/grok proxy', async () => {
    const fetchMock = vi.fn(async () =>
      streamResponse(
        [
          'data: {"type":"response.output_text.delta","delta":"{\\"narration\\""}\n',
          'data: {"type":"response.output_text.delta","delta":":\\"Hi\\"}"}\n',
        ],
        'text/event-stream',
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const cfg: ModelConfig = { provider: 'grok', model: 'grok-4.5', apiKey: 'k' };
    const deltas: string[] = [];
    const { raw } = await grokAdapter.generate(req, cfg, (c) => deltas.push(c));
    expect(raw).toBe('{"narration":"Hi"}');
    expect(deltas.length).toBe(2);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/llm/grok/v1/responses');
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer k');
    const body = JSON.parse(init.body as string) as {
      model: string;
      text: unknown;
      store?: boolean;
    };
    expect(body.store).toBeUndefined();
    expect(body.model).toBe('grok-4.5');
    expect(body.text).toEqual({ format: { type: 'json_object' } });
  });

  it('is a vision model and declares native web search via its own Responses API tool', async () => {
    expect(grokAdapter.capabilities.vision).toBe(true);
    expect(grokAdapter.capabilities.nativeWebSearch).toBe(true);

    const fetchMock = vi.fn(async () => streamResponse([], 'text/event-stream'));
    vi.stubGlobal('fetch', fetchMock);
    const cfg: ModelConfig = { provider: 'grok', model: 'grok-4.5', apiKey: 'k' };
    await grokAdapter.generate({ ...req, tools: { webSearch: true } }, cfg);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(init.body as string) as { tools?: Array<Record<string, unknown>> };
    expect(body.tools).toEqual([{ type: 'web_search' }]);
  });
});

describe('openai Responses API — reasoning-model params (gpt-5.x / o-series)', () => {
  /** Capture the request body the adapter sends for a given model + request. */
  async function bodyFor(
    model: string,
    extra: Partial<LiveRequest> = {},
  ): Promise<Record<string, unknown>> {
    const fetchMock = vi.fn(async () => streamResponse([], 'text/event-stream'));
    vi.stubGlobal('fetch', fetchMock);
    const cfg: ModelConfig = { provider: 'openai', model, apiKey: 'k' };
    await openaiAdapter.generate({ ...req, maxTokens: 900, temperature: 0.1, ...extra }, cfg);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    return JSON.parse(init.body as string) as Record<string, unknown>;
  }

  it('a GPT-5 model gets nested reasoning.effort, NO temperature, and its budget cleared past the floor', async () => {
    const body = await bodyFor('gpt-5.4-mini', { thinkingLevel: 'low' });
    expect(body.max_output_tokens).toBe(1500); // 900 floored up so thinking can't starve the answer
    expect(body.reasoning).toEqual({ effort: 'low' });
    expect(body.temperature).toBeUndefined(); // reasoning models reject a custom temperature
  });

  it('an o-series model is treated as a reasoning model, and its effort is pinned to low', async () => {
    const body = await bodyFor('o4-mini', { thinkingLevel: 'medium' });
    expect(body.max_output_tokens).toBe(1500); // floored from 900 (thinking is metered from this budget) // 900 + 1000 of low-effort thinking headroom
    // Not 'medium'. Above 'low' these models spend the whole output budget reasoning about a large
    // canvas prompt and return an empty answer — see the pinning comment in the adapter.
    expect(body.reasoning).toEqual({ effort: 'low' });
    expect(body.temperature).toBeUndefined();
  });

  it('lifts a non-canvas web-search turn to medium effort so search actually engages', async () => {
    // Web search is reasoning-gated — it doesn't engage reliably below 'medium'. A search turn that
    // isn't a big canvas turn (a dashboard refresh, an on-demand grounded metric) is small, so it's
    // safe to lift from the pinned 'low'; this is the fix for dashboards coming back "couldn't verify".
    const body = await bodyFor('gpt-5.4-nano', {
      thinkingLevel: 'minimal',
      tools: { webSearch: true },
    });
    expect(body.reasoning).toEqual({ effort: 'medium' });
  });

  it('escalates a web-search turn to high effort when the caller asks (the grounding retry)', async () => {
    const body = await bodyFor('gpt-5.4-nano', {
      thinkingLevel: 'high',
      tools: { webSearch: true },
    });
    expect(body.reasoning).toEqual({ effort: 'high' });
  });

  it('keeps a CANVAS turn pinned to low even with web search (medium would run the reasoning away)', async () => {
    const body = await bodyFor('gpt-5.4-nano', {
      thinkingLevel: 'high',
      tools: { webSearch: true },
      blockTypes: ['insight', 'chart'],
    });
    expect(body.reasoning).toEqual({ effort: 'low' });
  });

  it('a classic 4.x model keeps temperature (no reasoning params)', async () => {
    const body = await bodyFor('gpt-4.1-mini', { thinkingLevel: 'low' });
    expect(body.max_output_tokens).toBe(900);
    expect(body.temperature).toBe(0.1);
    expect(body.reasoning).toBeUndefined();
  });

  it('injects the native web_search tool only when the turn requests fresh data', async () => {
    const withSearch = await bodyFor('gpt-5.4-mini', { tools: { webSearch: true } });
    expect(withSearch.tools).toEqual([{ type: 'web_search' }]);
    const plain = await bodyFor('gpt-5.4-mini');
    expect(plain.tools).toBeUndefined();
  });

  it('a plain (non-search) turn keeps loose json_object mode, unchanged', async () => {
    const body = await bodyFor('gpt-5.4-mini', { blockTypes: ['insight', 'stat'] });
    expect(body.text).toEqual({ format: { type: 'json_object' } });
  });

  it('a search turn on a canvas ask switches to non-strict json_schema — OpenAI\'s API rejects json_object + web_search outright ("Web Search cannot be used with JSON mode", confirmed live)', async () => {
    const body = await bodyFor('gpt-5.4-mini', {
      blockTypes: ['insight', 'stat'],
      tools: { webSearch: true },
    });
    const text = body.text as { format: Record<string, unknown> };
    expect(text.format.type).toBe('json_schema');
    expect(text.format.strict).toBe(false); // strict would force the open `props` field to `{}`
    expect(text.format.schema).toBeTruthy();
    // The JSON nudge rides a json_schema (search) turn too, not just json_object — so a canvas ask
    // keeps the SAME input prefix whether or not it searched, preserving the automatic prefix cache.
    expect((body.input as unknown[])[0]).toEqual({ role: 'system', content: 'Respond in JSON.' });
  });

  it('a search turn with no schema (non-canvas caller) drops to plain text rather than json_object', async () => {
    const body = await bodyFor('gpt-5.4-mini', { tools: { webSearch: true } }); // no blockTypes
    expect(body.text).toEqual({ format: { type: 'text' } });
    // A plain-text caller must NOT be told to "Respond in JSON" — the nudge is JSON-modes only.
    expect(JSON.stringify(body.input)).not.toContain('Respond in JSON');
  });

  it('declares native web search', () => {
    expect(openaiAdapter.capabilities.nativeWebSearch).toBe(true);
  });
});

describe('openrouter — native web search server tool', () => {
  it('injects openrouter:web_search only when the turn requests fresh data', async () => {
    const fetchMock = vi.fn(async () => streamResponse(['data: [DONE]\n'], 'text/event-stream'));
    vi.stubGlobal('fetch', fetchMock);
    const cfg: ModelConfig = {
      provider: 'openrouter',
      model: 'google/gemini-3.1-flash-lite',
      apiKey: 'k',
    };

    await openrouterAdapter.generate({ ...req, tools: { webSearch: true } }, cfg);
    const withSearch = JSON.parse(
      (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string,
    ) as { tools?: Array<Record<string, unknown>> };
    expect(withSearch.tools).toEqual([
      {
        type: 'openrouter:web_search',
        parameters: { engine: 'auto', max_results: 5, search_context_size: 'medium' },
      },
    ]);

    // A plain turn carries no search tool (no needless web-search billing).
    await openrouterAdapter.generate(req, cfg);
    const plain = JSON.parse(
      (fetchMock.mock.calls[1] as unknown as [string, RequestInit])[1].body as string,
    ) as { tools?: unknown };
    expect(plain.tools).toBeUndefined();
  });

  it('declares native web search capability', () => {
    expect(openrouterAdapter.capabilities.nativeWebSearch).toBe(true);
  });
});

describe('openai-compatible — reasoning tokens stream apart from answer content', () => {
  it('tags delta.reasoning via meta and never folds it into the answer JSON', async () => {
    mockFetchOnce(
      streamResponse(
        [
          'data: {"choices":[{"delta":{"reasoning":"weighing the options"}}]}\n',
          'data: {"choices":[{"delta":{"content":"{\\"narration\\""}}]}\n',
          'data: {"choices":[{"delta":{"content":":\\"Hi\\"}"}}]}\n',
          'data: [DONE]\n',
        ],
        'text/event-stream',
      ),
    );
    const cfg: ModelConfig = { provider: 'openrouter', model: 'openrouter/owl-alpha', apiKey: 'k' };
    const content: string[] = [];
    const reasoning: string[] = [];
    const { raw } = await openrouterAdapter.generate(req, cfg, (chunk, meta) => {
      (meta?.reasoning ? reasoning : content).push(chunk);
    });
    // The reasoning trace drives the "Thinking…" cue but must NOT corrupt the parsed answer.
    expect(raw).toBe('{"narration":"Hi"}');
    expect(reasoning).toEqual(['weighing the options']);
    expect(content.length).toBe(2);
  });
});

describe('openai Responses API — an HTTP-200 body carrying an in-band error is NOT a silent empty answer', () => {
  it('rejects instead of resolving with empty raw, and classifies as auth (invalid key)', async () => {
    mockFetchOnce(
      streamResponse(
        [
          'data: {"type":"response.failed","response":{"error":{"message":"Incorrect API key provided","type":"invalid_request_error","code":"invalid_api_key"}}}\n',
        ],
        'text/event-stream',
      ),
    );
    const cfg: ModelConfig = { provider: 'openai', model: 'gpt-4.1-mini', apiKey: 'bad-key' };
    // The same failure the transport rejects with is what the turn actually surfaces to the
    // user — confirm it reads as an honest auth failure, not a generic "couldn't answer".
    try {
      await openaiAdapter.generate(req, cfg);
      expect.unreachable();
    } catch (err) {
      expect(describeLiveError(err, 'openai').kind).toBe('auth');
    }
  });

  it('classifies an in-band quota error as quota, not a masked generic failure', async () => {
    mockFetchOnce(
      streamResponse(
        [
          'data: {"type":"response.failed","response":{"error":{"message":"You exceeded your current quota, please check your plan","code":"insufficient_quota"}}}\n',
        ],
        'text/event-stream',
      ),
    );
    const cfg: ModelConfig = { provider: 'openai', model: 'gpt-4.1-mini', apiKey: 'k' };
    try {
      await openaiAdapter.generate(req, cfg);
      expect.unreachable();
    } catch (err) {
      expect(describeLiveError(err, 'openai').kind).toBe('quota');
    }
  });

  it('also catches a bare top-level `error` frame (no `type` field)', async () => {
    mockFetchOnce(
      streamResponse(
        ['data: {"error":{"message":"rate limited","code":429}}\n'],
        'text/event-stream',
      ),
    );
    const cfg: ModelConfig = { provider: 'openai', model: 'gpt-4.1-mini', apiKey: 'k' };
    await expect(openaiAdapter.generate(req, cfg)).rejects.toThrow(/429/);
  });

  it('a real error frame stops the read — nothing accumulates AFTER it', async () => {
    mockFetchOnce(
      streamResponse(
        [
          'data: {"type":"response.output_text.delta","delta":"partial"}\n',
          'data: {"type":"response.failed","response":{"error":{"message":"rate limited","code":429}}}\n',
          'data: {"type":"response.output_text.delta","delta":"more"}\n',
        ],
        'text/event-stream',
      ),
    );
    const cfg: ModelConfig = { provider: 'openai', model: 'gpt-4.1-mini', apiKey: 'k' };
    const deltas: string[] = [];
    await expect(openaiAdapter.generate(req, cfg, (c) => deltas.push(c))).rejects.toThrow(/429/);
    expect(deltas).toEqual(['partial']); // content already streamed before the failure stays; "more" never fires
  });
});

describe('openai-compatible probe — gateway model leniency', () => {
  /** Mock GET /v1/models with the given catalog ids. */
  function mockModels(ids: string[]): void {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ data: ids.map((id) => ({ id })) }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
      ),
    );
  }

  it('OpenRouter trusts a typed model that is NOT in /v1/models (stealth/alpha ids)', async () => {
    // owl-alpha is absent from the catalog listing — but the user typed it on purpose.
    mockModels(['google/gemini-3.1-flash-lite', 'perplexity/sonar']);
    const r = await openrouterAdapter.probe({
      provider: 'openrouter',
      model: 'openrouter/owl-alpha',
      apiKey: 'k',
    });
    expect(r.ok).toBe(true);
    expect(r.model).toBe(true); // trusted, not wrongly flagged "not found"
  });

  it('OpenAI still flags an unlisted model as not found (its listing is authoritative)', async () => {
    mockModels(['gpt-5.4-mini', 'gpt-5.4']);
    const r = await openaiAdapter.probe({
      provider: 'openai',
      model: 'gpt-does-not-exist',
      apiKey: 'k',
    });
    expect(r.ok).toBe(true);
    expect(r.model).toBe(false);
  });
});

describe('probe — a non-OK models response reports its statusCode, not just "not ready"', () => {
  // The Connect step reads `statusCode` to tell "Invalid API key" (401) apart from the generic,
  // alarming "Not reachable." (undefined) — a real HTTP response came back, it just wasn't 2xx.
  // Only the anthropic adapter captured this historically; openai/gemini/grok/openrouter silently
  // dropped it, so any of their real errors (bad key, wrong permissions) misread as "unreachable".
  function mockStatus(status: number): void {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status })),
    );
  }

  it('openai', async () => {
    mockStatus(401);
    const r = await openaiAdapter.probe({ provider: 'openai', model: 'gpt-5.4', apiKey: 'bad' });
    expect(r.ok).toBe(false);
    expect(r.statusCode).toBe(401);
  });

  it('gemini', async () => {
    mockStatus(403);
    const r = await geminiAdapter.probe({
      provider: 'gemini',
      model: 'gemini-3.1-flash-lite',
      apiKey: 'bad',
    });
    expect(r.ok).toBe(false);
    expect(r.statusCode).toBe(403);
  });

  it('grok', async () => {
    mockStatus(401);
    const r = await grokAdapter.probe({ provider: 'grok', model: 'grok-4', apiKey: 'bad' });
    expect(r.ok).toBe(false);
    expect(r.statusCode).toBe(401);
  });

  it('grok remaps its nonstandard 400 "invalid-argument" bad-key response to 401', async () => {
    // Confirmed against a live api.x.ai 400: unlike every other provider here, xAI answers an
    // incorrect key with 400 + {code:"invalid-argument"}, not 401 — left unmapped, the Connect
    // step's statusCode switch falls through to a generic "Error 400." instead of "Invalid API key."
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              code: 'invalid-argument',
              error:
                'Incorrect API key provided. You can obtain an API key from https://console.x.ai.',
            }),
            { status: 400 },
          ),
      ),
    );
    const r = await grokAdapter.probe({ provider: 'grok', model: 'grok-4', apiKey: 'bad' });
    expect(r.ok).toBe(false);
    expect(r.statusCode).toBe(401);
  });

  it('grok leaves an unrelated 400 (not the invalid-key shape) as-is', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () => new Response(JSON.stringify({ code: 'some-other-error' }), { status: 400 }),
      ),
    );
    const r = await grokAdapter.probe({ provider: 'grok', model: 'grok-4', apiKey: 'bad' });
    expect(r.ok).toBe(false);
    expect(r.statusCode).toBe(400);
  });

  it('openrouter', async () => {
    mockStatus(401);
    const r = await openrouterAdapter.probe({
      provider: 'openrouter',
      model: 'openai/gpt-5.4',
      apiKey: 'bad',
    });
    expect(r.ok).toBe(false);
    expect(r.statusCode).toBe(401);
  });

  it('a genuine network failure still degrades to no statusCode (truly unreachable)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      }),
    );
    const r = await openaiAdapter.probe({ provider: 'openai', model: 'gpt-5.4', apiKey: 'k' });
    expect(r).toEqual({ ok: false, model: false });
  });
});

describe('provider registry — every provider is wired + carries picker metadata', () => {
  it('has an adapter for every registry entry, and grok is registered', () => {
    expect(ADAPTERS.grok).toBe(grokAdapter);
    for (const p of PROVIDERS) {
      expect(ADAPTERS[p.id]).toBeDefined();
    }
  });

  it('every provider declares a grounding mode and a coherent model menu', () => {
    const validSearch = new Set(['native', 'app', 'local']);
    for (const p of PROVIDERS) {
      expect(validSearch.has(p.search)).toBe(true);
      // A non-empty default must lead the suggested picks (the menu marks it and lists it
      // first). Gateways (OpenRouter) intentionally ship an EMPTY default and an EMPTY menu —
      // the user supplies their own model — and carry a modelPlaceholder hint instead.
      if (p.defaultModel) {
        expect(p.suggestedModels.length).toBeGreaterThan(0);
        expect(p.suggestedModels[0]).toBe(p.defaultModel);
      } else expect((p.modelPlaceholder ?? '').length).toBeGreaterThan(0);
    }
  });

  it('every visible provider is a real registry entry (no orphans in the picker)', () => {
    for (const p of VISIBLE_PROVIDERS) expect(PROVIDERS).toContain(p);
  });

  it('OpenRouter leaves the default and menu empty so the user brings their own', () => {
    const or = PROVIDERS.find((p) => p.id === 'openrouter')!;
    expect(or.defaultModel).toBe('');
    expect(or.modelPlaceholder).toBeTruthy();
    expect(or.suggestedModels).toEqual([]);
  });

  it('every provider now has server-side search wired', () => {
    const native = PROVIDERS.filter((p) => p.search === 'native').map((p) => p.id);
    expect(new Set(native)).toEqual(
      new Set<ProviderId>(['gemini', 'openrouter', 'anthropic', 'openai', 'grok']),
    );
    // The native registry flag agrees with the adapter capability.
    for (const p of PROVIDERS) {
      const cap = !!ADAPTERS[p.id].capabilities.nativeWebSearch;
      expect(cap).toBe(p.search === 'native');
    }
  });
});

// ── Prompt caching: the stable prefix must actually stay stable ────────────────────────────────
// Providers cache on the request's LEADING tokens, so anything that varies turn-to-turn poisons
// everything behind it. Live exposes a fixed base, a session-stable extension, and the dynamic
// turn tail. The first two stay ahead of replayed history; only the changing tail leads the user.
describe('prompt-cache prefix split', () => {
  const BASE = 'STABLE BASE PROMPT — the part that never changes.';
  const SESSION = 'SESSION STABLE — core menu and enabled capabilities.';
  const STABLE_PREFIX = `${BASE}\n\n${SESSION}`;
  const PER_TURN = 'THIS TURN — the component menu and hero picks.';
  const splitReq: LiveRequest = {
    system: `${STABLE_PREFIX}\n\n${PER_TURN}`,
    systemBase: BASE,
    systemStable: STABLE_PREFIX,
    history: [{ role: 'user', content: 'earlier question' }],
    user: 'How should I budget?',
  };

  function bodyOf(fetchMock: ReturnType<typeof vi.fn>): Record<string, unknown> {
    return JSON.parse(fetchMock.mock.calls[0][1]!.body as string) as Record<string, unknown>;
  }

  it('OpenAI (Responses) sends only the stable base as instructions and folds the delta into the user turn', async () => {
    const fetchMock = vi.fn(async () => streamResponse([], 'text/event-stream'));
    vi.stubGlobal('fetch', fetchMock);
    await openaiAdapter.generate(splitReq, { provider: 'openai', model: 'gpt-5.4-mini' });

    const body = bodyOf(fetchMock);
    expect(body.instructions).toBe(STABLE_PREFIX);
    const input = body.input as { role: string; content: unknown }[];
    const userTurn = input[input.length - 1];
    const parts = userTurn.content as { type: string; text: string }[];
    expect(parts[0].text).toBe(PER_TURN);
    expect(parts.some((p) => p.text === 'How should I budget?')).toBe(true);
  });

  it('Anthropic marks base, session extension, and history as three 1h cache breakpoints', async () => {
    const fetchMock = vi.fn(async () => streamResponse([], 'text/event-stream'));
    vi.stubGlobal('fetch', fetchMock);
    await anthropicAdapter.generate(splitReq, {
      provider: 'anthropic',
      model: 'claude-haiku-4-5',
      apiKey: 'k',
    });

    const body = bodyOf(fetchMock);
    const system = body.system as { text: string; cache_control?: unknown }[];
    expect(system).toHaveLength(2);
    expect(system[0].text).toBe(BASE);
    expect(system[0].cache_control).toEqual({ type: 'ephemeral', ttl: '1h' });
    expect(system[1].text).toBe(SESSION);
    expect(system[1].cache_control).toEqual({ type: 'ephemeral', ttl: '1h' });
    const messages = body.messages as { role: string; content: unknown }[];
    // Last history message carries the third breakpoint…
    const lastHistory = messages[messages.length - 2].content as {
      text: string;
      cache_control?: unknown;
    }[];
    expect(lastHistory[0].text).toBe('earlier question');
    expect(lastHistory[0].cache_control).toEqual({ type: 'ephemeral', ttl: '1h' });
    // …and the user turn leads with the per-turn delta, ahead of the user's own words.
    const userParts = messages[messages.length - 1].content as { text?: string }[];
    expect(userParts[0].text).toBe(PER_TURN);
    expect(userParts.some((p) => p.text === 'How should I budget?')).toBe(true);
  });

  it('Anthropic leaves a caller without systemBase exactly as it was (plain ephemeral, untouched messages)', async () => {
    const fetchMock = vi.fn(async () => streamResponse([], 'text/event-stream'));
    vi.stubGlobal('fetch', fetchMock);
    await anthropicAdapter.generate(
      { system: 'whole prompt', history: [{ role: 'user', content: 'earlier' }], user: 'hi' },
      { provider: 'anthropic', model: 'claude-haiku-4-5', apiKey: 'k' },
    );
    const body = bodyOf(fetchMock);
    const system = body.system as { text: string; cache_control?: unknown }[];
    expect(system).toEqual([
      { type: 'text', text: 'whole prompt', cache_control: { type: 'ephemeral' } },
    ]);
    const messages = body.messages as { role: string; content: unknown }[];
    expect(messages[0]).toEqual({ role: 'user', content: 'earlier' });
    expect(messages[1]).toEqual({ role: 'user', content: 'hi' });
  });

  it('OpenRouter sends the base as a cache-marked system block, delta folded into the user turn', async () => {
    const fetchMock = vi.fn(async () => streamResponse([], 'text/event-stream'));
    vi.stubGlobal('fetch', fetchMock);
    await openrouterAdapter.generate(splitReq, { provider: 'openrouter', model: 'anthropic/x' });

    const body = bodyOf(fetchMock);
    const messages = body.messages as { role: string; content: unknown }[];
    const system = messages[0].content as { text: string; cache_control?: unknown }[];
    expect(system[0].text).toBe(STABLE_PREFIX);
    // Anthropic-routed models cache NOTHING without this explicit breakpoint.
    expect(system[0].cache_control).toEqual({ type: 'ephemeral' });
    expect(String(JSON.stringify(messages[messages.length - 1].content))).toContain(PER_TURN);
  });

  // A caller that doesn't split (Prism, mindshape, dashboards…) must keep working untouched.
  it('leaves a caller without systemBase exactly as it was', async () => {
    const fetchMock = vi.fn(async () => streamResponse([], 'text/event-stream'));
    vi.stubGlobal('fetch', fetchMock);
    await openaiAdapter.generate(
      { system: 'whole prompt', history: [], user: 'hi' },
      { provider: 'openai', model: 'gpt-5.4-mini' },
    );
    expect(bodyOf(fetchMock).instructions).toBe('whole prompt');
  });
});

// The OpenRouter adapter is shared by everything that ISN'T a Live turn — Prism, Ripple, dashboards,
// mindshape, SRS — and none of those pass a systemBase. Their prompts are a few dozen tokens, far
// below any provider's minimum cacheable prefix, so marking them would change the wire shape of
// every one of those calls for no benefit. They must keep sending the plain string they always have.
describe('OpenRouter cache breakpoint stays scoped to the split (canvas) turn', () => {
  it('leaves a non-Live caller (no systemBase) with a plain-string system message', async () => {
    const fetchMock = vi.fn((_url: RequestInfo | URL, _init?: RequestInit) =>
      Promise.resolve(streamResponse([], 'text/event-stream')),
    );
    vi.stubGlobal('fetch', fetchMock);
    await openrouterAdapter.generate(
      { system: 'Extract the claims.', history: [], user: 'here is the doc' },
      { provider: 'openrouter', model: 'anthropic/claude-haiku-4-5' },
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1]!.body as string) as {
      messages: { role: string; content: unknown }[];
    };
    expect(body.messages[0]).toEqual({ role: 'system', content: 'Extract the claims.' });
  });
});

// A reasoning model (gpt-5.x, o-series, Grok) spends its thinking tokens out of the SAME
// max_output_tokens budget, and if it runs out mid-thought the run ends `incomplete` having written
// nothing at all — not a truncated answer, an empty one. A canvas turn hands the model a very large
// instruction prompt, and at 'medium' the reasoning ran away: on "plan a 3-day trip to Chicago" it
// burned the whole budget and produced zero blocks, twice over once recovery re-asked, taking ~72s
// to hand back the honest-fallback card. Raising the ceiling did not rescue it (~18k tokens → 119s,
// still empty). At 'low' the same ask streams in ~6s and lands a full canvas in ~20s.
describe('reasoning effort is pinned to low on reasoning models', () => {
  const canvasReq: LiveRequest = {
    system: 'sys',
    history: [],
    user: 'Plan a 3 day trip to Chicago',
    blockTypes: ['insight', 'stat'],
    maxTokens: 4000,
  };

  function bodyOf(fetchMock: ReturnType<typeof vi.fn>): Record<string, unknown> {
    return JSON.parse(fetchMock.mock.calls[0][1]!.body as string) as Record<string, unknown>;
  }

  it('lowers medium/high — above low, the model thinks until the budget is gone and writes nothing', async () => {
    for (const level of ['medium', 'high'] as const) {
      const fetchMock = vi.fn((_u: RequestInfo | URL, _i?: RequestInit) =>
        Promise.resolve(streamResponse([], 'text/event-stream')),
      );
      vi.stubGlobal('fetch', fetchMock);
      await openaiAdapter.generate(
        { ...canvasReq, thinkingLevel: level },
        { provider: 'openai', model: 'gpt-5.4-mini' },
      );
      expect((bodyOf(fetchMock).reasoning as { effort: string }).effort).toBe('low');
      vi.unstubAllGlobals();
    }
  });

  it('still raises minimal to low, so search reliably engages', async () => {
    const fetchMock = vi.fn((_u: RequestInfo | URL, _i?: RequestInit) =>
      Promise.resolve(streamResponse([], 'text/event-stream')),
    );
    vi.stubGlobal('fetch', fetchMock);
    await openaiAdapter.generate(
      { ...canvasReq, thinkingLevel: 'minimal' },
      { provider: 'openai', model: 'gpt-5.4-mini' },
    );
    expect((bodyOf(fetchMock).reasoning as { effort: string }).effort).toBe('low');
  });

  it('leaves a classic (non-reasoning) model on temperature, untouched', async () => {
    const fetchMock = vi.fn((_u: RequestInfo | URL, _i?: RequestInit) =>
      Promise.resolve(streamResponse([], 'text/event-stream')),
    );
    vi.stubGlobal('fetch', fetchMock);
    await openaiAdapter.generate(
      { ...canvasReq, thinkingLevel: 'medium', temperature: 0.3 },
      { provider: 'openai', model: 'gpt-4.1' },
    );
    const body = bodyOf(fetchMock);
    expect(body.reasoning).toBeUndefined();
    expect(body.temperature).toBe(0.3);
  });
});

// An HTTP failure used to be thrown as bare "<provider> <status>", so the provider's own words —
// the only thing that separates a transient 429 ("wait a moment") from a spent balance ("your plan
// is out") — never reached describeLiveError. Anthropic and the OpenAI-compatible gateways both
// dropped the body; a user whose credit had genuinely run out was told to wait and retry, forever.
describe('an HTTP error carries the provider’s reason, not just its status', () => {
  /** Mock a failed fetch with a real provider error body. */
  function mockError(status: number, body: unknown): void {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify(body), {
            status,
            headers: { 'content-type': 'application/json' },
          }),
      ),
    );
  }

  it('Anthropic: a rate-limit 429 stays a rate limit', async () => {
    mockError(429, {
      type: 'error',
      error: { type: 'rate_limit_error', message: 'Number of requests has exceeded your limit' },
    });
    const cfg: ModelConfig = { provider: 'anthropic', model: 'claude-sonnet-4-5', apiKey: 'k' };
    try {
      await anthropicAdapter.generate(req, cfg);
      expect.unreachable();
    } catch (err) {
      const e = describeLiveError(err, 'anthropic');
      expect(e.kind).toBe('quota'); // the LiveError bucket for both, distinguished by the message
      expect(e.message).toMatch(/rate-limiting you/i);
      expect(e.message).not.toMatch(/out of credit/i);
    }
  });

  it('Anthropic: a 429 whose body says the quota is spent is NOT sold as "wait a moment"', async () => {
    mockError(429, {
      type: 'error',
      error: { type: 'rate_limit_error', message: 'RESOURCE_EXHAUSTED: monthly limit reached' },
    });
    const cfg: ModelConfig = { provider: 'anthropic', model: 'claude-sonnet-4-5', apiKey: 'k' };
    try {
      await anthropicAdapter.generate(req, cfg);
      expect.unreachable();
    } catch (err) {
      const e = describeLiveError(err, 'anthropic');
      expect(e.kind).toBe('quota');
      expect(e.message).toMatch(/daily quota is full/i);
      expect(e.message).not.toMatch(/too many requests per minute/i);
    }
  });

  it('Anthropic: a spent balance (billed as a 400) reads as credit, not "check the model name"', async () => {
    mockError(400, {
      type: 'error',
      error: {
        type: 'invalid_request_error',
        message: 'Your credit balance is too low to access the Claude API',
      },
    });
    const cfg: ModelConfig = { provider: 'anthropic', model: 'claude-sonnet-4-5', apiKey: 'k' };
    try {
      await anthropicAdapter.generate(req, cfg);
      expect.unreachable();
    } catch (err) {
      const e = describeLiveError(err, 'anthropic');
      expect(e.kind).toBe('quota');
      expect(e.message).toMatch(/out of quota or credit/i);
      expect(e.message).not.toMatch(/model name/i);
    }
  });

  it('OpenRouter: an out-of-credit 429 reads as credit, not a per-minute rate limit', async () => {
    mockError(429, {
      error: { code: 'insufficient_quota', message: 'You exceeded your current quota' },
    });
    const cfg: ModelConfig = {
      provider: 'openrouter',
      model: 'anthropic/claude-sonnet-4-5',
      apiKey: 'k',
    };
    try {
      await openrouterAdapter.generate(req, cfg);
      expect.unreachable();
    } catch (err) {
      const e = describeLiveError(err, 'openrouter');
      expect(e.kind).toBe('quota');
      expect(e.message).toMatch(/daily quota is full/i);
    }
  });

  it('never leaks the whole body: the reason is trimmed, and a non-JSON error still classifies', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response('<html><body>502 Bad Gateway</body></html>'.repeat(200), {
            status: 502,
            headers: { 'content-type': 'text/html' },
          }),
      ),
    );
    const cfg: ModelConfig = { provider: 'anthropic', model: 'claude-sonnet-4-5', apiKey: 'k' };
    try {
      await anthropicAdapter.generate(req, cfg);
      expect.unreachable();
    } catch (err) {
      const msg = (err as Error).message;
      expect(msg).toMatch(/^anthropic 502/);
      expect(msg.length).toBeLessThan(200); // trimmed — never the whole page
      expect(describeLiveError(err, 'anthropic').status).toBe(502);
    }
  });
});

describe('a failure the user can act on, not a wrong one', () => {
  // Each of these used to land on a message that pointed somewhere else entirely — at the model
  // name, or at the network — and sent the reader off fixing something that wasn't broken.
  it('reads an in-band block as a refusal, not as an unreachable provider', () => {
    const e = describeLiveError(new Error('gemini content-blocked — SAFETY'), 'gemini');
    expect(e.kind).toBe('http');
    expect(e.message).toMatch(/safety/i);
    expect(e.message).not.toMatch(/connection/i);
  });

  it('tells the user their thinking budget ate the answer, and what to change', () => {
    const e = describeLiveError(new Error('gemini thinking-budget'), 'gemini');
    expect(e.message).toMatch(/Quality/);
  });

  it('reads an empty answer as an empty answer', () => {
    const e = describeLiveError(new Error('gemini empty-response'), 'gemini');
    expect(e.kind).toBe('http');
    expect(e.message).toMatch(/empty/i);
  });

  it('calls a rejected key a rejected key, even when Google bills it as a 400', () => {
    const e = describeLiveError(
      new Error('gemini 400 — INVALID_ARGUMENT: API key not valid. Please pass a valid API key.'),
      'gemini',
    );
    expect(e.kind).toBe('auth');
    // The old mapping sent people hunting for a typo in a model name that was perfectly fine.
    expect(e.message).not.toMatch(/model name/i);
  });

  it('still blames the model name for an ordinary 400', () => {
    const e = describeLiveError(new Error('gemini 400 — INVALID_ARGUMENT: bad field'), 'gemini');
    expect(e.kind).toBe('http');
    expect(e.message).toMatch(/model name/i);
  });
});

describe('requiring the search tool, not merely offering it', () => {
  it('sends tool_choice for a turn that is worthless ungrounded', async () => {
    const fetchMock = vi.fn(async () => streamResponse([], 'text/event-stream'));
    vi.stubGlobal('fetch', fetchMock);
    const cfg: ModelConfig = { provider: 'openai', model: 'gpt-5.4-mini', apiKey: 'k' };
    await openaiAdapter.generate({ ...req, tools: { webSearch: true, requireSearch: true } }, cfg);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(init.body as string) as { tool_choice?: unknown; tools?: unknown[] };
    // Attaching the tool leaves the choice to the model (tool_choice defaults to auto), and a
    // small model routinely declines — answering a live-price question from training memory with
    // zero citations, which the dashboards gate then correctly discards after billing for it.
    expect(body.tools).toHaveLength(1);
    expect(body.tool_choice).toEqual({ type: 'web_search' });
  });

  it('never sends the force to a provider that has not documented one (Grok)', async () => {
    // Same shared adapter, different provider: xAI's Responses API mirrors OpenAI's design but has
    // never documented tool_choice:{type:'web_search'}, and an undocumented force value that 400s
    // would kill every Grok dashboard check — strictly worse than a model occasionally declining
    // to search. Grok keeps the prompt-level insistence and the grounding gate.
    const fetchMock = vi.fn(async () => streamResponse([], 'text/event-stream'));
    vi.stubGlobal('fetch', fetchMock);
    const cfg: ModelConfig = { provider: 'grok', model: 'grok-4', apiKey: 'k' };
    await grokAdapter.generate({ ...req, tools: { webSearch: true, requireSearch: true } }, cfg);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(init.body as string) as { tool_choice?: unknown; tools?: unknown[] };
    expect(body.tools).toHaveLength(1); // the tool is still offered…
    expect(body.tool_choice).toBeUndefined(); // …but never forced
  });

  it('leaves an ordinary search turn free to decide for itself', async () => {
    const fetchMock = vi.fn(async () => streamResponse([], 'text/event-stream'));
    vi.stubGlobal('fetch', fetchMock);
    const cfg: ModelConfig = { provider: 'openai', model: 'gpt-5.4-mini', apiKey: 'k' };
    await openaiAdapter.generate({ ...req, tools: { webSearch: true } }, cfg);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(init.body as string) as { tool_choice?: unknown };
    // Forcing a search on a question that needs none would spend a call to learn nothing.
    expect(body.tool_choice).toBeUndefined();
  });
});

describe('gemini adapter — a model with no MINIMAL thinking tier', () => {
  // Gemini 3's Flash line split on this. 3.5/3.6-flash and the flash-lites accept
  // `thinkingLevel: MINIMAL`; 3.7-flash, 3.8-flash and 3.1-pro-preview accept only low/medium/high
  // and answer MINIMAL with `400 INVALID_ARGUMENT: Thinking level MINIMAL is not supported for
  // this model`. Nothing user-facing selects `minimal` — `effort.ts` picks it for every ask that
  // is not a hard problem, and a dozen call sites hardcode it — so on those models EVERY call
  // failed and the whole surface was dead. Learned, not listed: the model field is free text and
  // a hand-kept set of ids would rot into the same outage the day the next Flash ships.
  const REFUSAL = JSON.stringify({
    error: {
      code: 400,
      status: 'INVALID_ARGUMENT',
      message:
        'Thinking level MINIMAL is not supported for this model. Please retry with other thinking level.',
    },
  });

  function refuseThenStream() {
    let call = 0;
    return vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => {
      call += 1;
      if (call === 1) {
        return new Response(REFUSAL, {
          status: 400,
          headers: { 'content-type': 'application/json' },
        });
      }
      return streamResponse(
        ['data: {"candidates":[{"content":{"parts":[{"text":"{\\"ok\\":1}"}]}}]}\n\n'],
        'text/event-stream',
      );
    });
  }

  it('re-asks at low instead of failing the turn', async () => {
    const fetchMock = refuseThenStream();
    vi.stubGlobal('fetch', fetchMock);
    const cfg: ModelConfig = { provider: 'gemini', model: 'gemini-3.8-flash', apiKey: 'k' };
    const out = await geminiAdapter.generate({ ...canvasReq, thinkingLevel: 'minimal' }, cfg);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const first = JSON.parse(fetchMock.mock.calls[0][1]!.body as string);
    const second = JSON.parse(fetchMock.mock.calls[1][1]!.body as string);
    expect(first.generationConfig.thinkingConfig).toEqual({ thinkingLevel: 'MINIMAL' });
    expect(second.generationConfig.thinkingConfig).toEqual({ thinkingLevel: 'LOW' });
    // Only the thinking level differs — the retry must not quietly re-shape the ask.
    expect({ ...second, generationConfig: null }).toEqual({ ...first, generationConfig: null });
    expect(out.raw).toContain('"ok"');
  });

  it('remembers, so the next call opens at low with no wasted round trip', async () => {
    const fetchMock = refuseThenStream();
    vi.stubGlobal('fetch', fetchMock);
    // Its OWN model id: what the adapter learns is module state that outlives one test, which is
    // the whole point of the feature and would otherwise let this test pass on the last one's work.
    const cfg: ModelConfig = { provider: 'gemini', model: 'gemini-3.7-flash', apiKey: 'k' };
    await geminiAdapter.generate({ ...canvasReq, thinkingLevel: 'minimal' }, cfg);

    const again = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
      streamResponse(
        ['data: {"candidates":[{"content":{"parts":[{"text":"{\\"ok\\":1}"}]}}]}\n\n'],
        'text/event-stream',
      ),
    );
    vi.stubGlobal('fetch', again);
    await geminiAdapter.generate({ ...canvasReq, thinkingLevel: 'minimal' }, cfg);
    expect(again).toHaveBeenCalledTimes(1);
    const body = JSON.parse(again.mock.calls[0][1]!.body as string);
    expect(body.generationConfig.thinkingConfig).toEqual({ thinkingLevel: 'LOW' });
  });

  it('leaves a model that does support MINIMAL alone', async () => {
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
      streamResponse(
        ['data: {"candidates":[{"content":{"parts":[{"text":"{\\"ok\\":1}"}]}}]}\n\n'],
        'text/event-stream',
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const cfg: ModelConfig = { provider: 'gemini', model: 'gemini-3.1-flash-lite', apiKey: 'k' };
    await geminiAdapter.generate({ ...canvasReq, thinkingLevel: 'minimal' }, cfg);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchMock.mock.calls[0][1]!.body as string);
    expect(body.generationConfig.thinkingConfig).toEqual({ thinkingLevel: 'MINIMAL' });
  });

  it('still fails loudly on an invalid argument that is not about thinking', async () => {
    const fetchMock = vi.fn(
      async (_url: RequestInfo | URL, _init?: RequestInit) =>
        new Response(
          JSON.stringify({
            error: { code: 400, status: 'INVALID_ARGUMENT', message: 'Unknown field foo' },
          }),
          { status: 400, headers: { 'content-type': 'application/json' } },
        ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const cfg: ModelConfig = { provider: 'gemini', model: 'gemini-3.6-flash', apiKey: 'k' };
    await expect(
      geminiAdapter.generate({ ...canvasReq, thinkingLevel: 'minimal' }, cfg),
    ).rejects.toThrow(/Unknown field foo/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
