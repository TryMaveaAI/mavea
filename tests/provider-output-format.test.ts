import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ANTHROPIC_OPTIONAL_LIMIT,
  anthropicOutputFormat,
} from '../src/live/providers/anthropicFormat';
import { WORLD_FORMAT } from '../src/live/world/explode';
import { liveJsonSchema } from '../src/live/providers/schema';
import { anthropicAdapter } from '../src/live/providers/anthropic';
import { openaiAdapter } from '../src/live/providers/openai';
import { openrouterAdapter } from '../src/live/providers/openrouter';
import type { LiveRequest } from '../src/live/providers/types';
import type { ModelConfig } from '../src/types/mavea';

// A schema is an accuracy aid, never the answer's only guarantee: validateLiveResponse reads
// whatever comes back. These lock the two ways that stays true — a schema a provider cannot
// express is never sent, and a provider that refuses the one we did send gets re-asked without it
// rather than losing the turn. Every case below failed every ask on a real key before this.

function streamResponse(chunks: string[]): Response {
  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(enc.encode(c));
      controller.close();
    },
  });
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

const refusal = (message: string): Response =>
  new Response(JSON.stringify({ error: { message } }), {
    status: 400,
    headers: { 'content-type': 'application/json' },
  });

/** Every response in order; the last one repeats if the adapter asks again. */
function mockFetchSequence(responses: Response[]): ReturnType<typeof vi.fn> {
  let i = 0;
  const fetchMock = vi.fn(async () => responses[Math.min(i++, responses.length - 1)]);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const bodyOf = (fetchMock: ReturnType<typeof vi.fn>, call: number): Record<string, unknown> =>
  JSON.parse((fetchMock.mock.calls[call] as unknown as [string, RequestInit])[1].body as string);

const req: LiveRequest = { system: 'sys', history: [], user: 'How does osmosis work?' };
/** A canvas-shaped ask: the split base is what every adapter marks for caching. */
const cachedReq: LiveRequest = {
  ...req,
  system: 'stable base prompt\n\nper-turn directives',
  systemBase: 'stable base prompt',
  promptCacheKey: 'session-1',
};
const canvasReq: LiveRequest = { ...req, blockTypes: ['insight', 'chart'] };

afterEach(() => vi.unstubAllGlobals());

describe('anthropicOutputFormat', () => {
  it('cannot express the canvas schema, because a block props bag has to stay open', () => {
    expect(anthropicOutputFormat(liveJsonSchema(['insight', 'chart']))).toBeNull();
    expect(anthropicOutputFormat(liveJsonSchema(['insight'], 'brief'))).toBeNull();
  });

  // The API refuses a schema with more optional properties than it will compile, and it says so
  // with a 400 — which the adapter learns from, but only after the request has failed once. The
  // living world's schema is over that limit, so it must go out unconstrained the FIRST time; on a
  // Claude key every world otherwise paid a failed round-trip before it started.
  it('cannot express a schema over the optional-property limit — the living world included', () => {
    const withOptionals = (n: number): object => ({
      type: 'object',
      properties: {
        id: { type: 'string' },
        ...Object.fromEntries(
          Array.from({ length: n }, (_, i) => [`f${i}`, { type: 'string' }] as const),
        ),
      },
      required: ['id'],
    });
    expect(anthropicOutputFormat(withOptionals(ANTHROPIC_OPTIONAL_LIMIT))).not.toBeNull();
    expect(anthropicOutputFormat(withOptionals(ANTHROPIC_OPTIONAL_LIMIT + 1))).toBeNull();
    // Counted through array items too — the world's optionals live on its node item.
    const nested = {
      type: 'object',
      properties: { nodes: { type: 'array', items: withOptionals(ANTHROPIC_OPTIONAL_LIMIT + 1) } },
      required: ['nodes'],
    };
    expect(anthropicOutputFormat(nested)).toBeNull();
    expect(anthropicOutputFormat(WORLD_FORMAT)).toBeNull();
  });

  it('seals every object and keeps only the array floor the API understands', () => {
    const source = {
      type: 'object',
      properties: {
        center: { type: 'string' },
        nodes: {
          type: 'array',
          minItems: 2,
          maxItems: 12,
          items: {
            type: 'object',
            properties: { id: { type: 'string' }, weight: { type: 'number' } },
            required: ['id'],
          },
        },
        provenance: { type: 'object', properties: { illustrative: { type: 'boolean' } } },
      },
      required: ['center', 'nodes'],
    };
    const rendered = anthropicOutputFormat(source) as Record<string, unknown>;
    const props = rendered.properties as Record<string, Record<string, unknown>>;
    expect(rendered.additionalProperties).toBe(false);
    expect(props.provenance.additionalProperties).toBe(false);
    expect((props.nodes.items as Record<string, unknown>).additionalProperties).toBe(false);
    // minItems is understood only as 0 or 1; maxItems and a partial `required` survive intact.
    expect(props.nodes.minItems).toBe(1);
    expect(props.nodes.maxItems).toBe(12);
    expect(rendered.required).toEqual(['center', 'nodes']);
    // Callers hold module-level schema constants — rendering must not touch them.
    expect(source.properties.nodes.minItems).toBe(2);
    expect(
      (source.properties.provenance as Record<string, unknown>).additionalProperties,
    ).toBeUndefined();
  });

  it('gives up on a node with no type rather than sending one the API refuses', () => {
    expect(anthropicOutputFormat({ properties: { a: { type: 'string' } } })).toBeNull();
    expect(
      anthropicOutputFormat({
        type: 'object',
        properties: { a: { enum: ['x'] } },
      }),
    ).toBeNull();
  });
});

describe('anthropic adapter — what actually goes on the wire', () => {
  const ok = ['data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"{}"}}\n'];

  it('sends no output_config for a canvas turn', async () => {
    const fetchMock = mockFetchSequence([streamResponse(ok)]);
    const cfg: ModelConfig = { provider: 'anthropic', model: 'claude-haiku-4-5', apiKey: 'k' };
    await anthropicAdapter.generate(canvasReq, cfg);
    expect(bodyOf(fetchMock, 0).output_config).toBeUndefined();
  });

  it('sends a caller format sealed into the dialect the API takes', async () => {
    const fetchMock = mockFetchSequence([streamResponse(ok)]);
    const cfg: ModelConfig = { provider: 'anthropic', model: 'claude-haiku-4-5', apiKey: 'k' };
    await anthropicAdapter.generate(
      {
        ...req,
        format: { type: 'object', properties: { found: { type: 'boolean' } }, required: ['found'] },
      },
      cfg,
    );
    const sent = bodyOf(fetchMock, 0).output_config as {
      format: { type: string; schema: Record<string, unknown> };
    };
    expect(sent.format.type).toBe('json_schema');
    expect(sent.format.schema.additionalProperties).toBe(false);
  });

  it('re-asks without the schema when a model refuses it', async () => {
    const fetchMock = mockFetchSequence([
      refusal('output_config.format.schema: additionalProperties must be false'),
      streamResponse(ok),
    ]);
    const cfg: ModelConfig = { provider: 'anthropic', model: 'claude-test-strict', apiKey: 'k' };
    const format = { type: 'object', properties: { found: { type: 'boolean' } } };
    await anthropicAdapter.generate({ ...req, format }, cfg);
    expect(fetchMock.mock.calls.length).toBe(2);
    expect(bodyOf(fetchMock, 1).output_config).toBeUndefined();
  });
});

describe('an OpenAI-compatible model that will not take JSON mode', () => {
  it('re-asks without response_format (gateway/chat-completions)', async () => {
    const fetchMock = mockFetchSequence([
      refusal("'response_format' of type 'json_object' is not supported by this model"),
      streamResponse(['data: {"choices":[{"delta":{"content":"{}"}}]}\n', 'data: [DONE]\n']),
    ]);
    const cfg: ModelConfig = { provider: 'openrouter', model: 'vendor/no-json', apiKey: 'k' };
    await openrouterAdapter.generate(req, cfg);
    expect(fetchMock.mock.calls.length).toBe(2);
    expect(bodyOf(fetchMock, 0).response_format).toBeDefined();
    expect(bodyOf(fetchMock, 1).response_format).toBeUndefined();
  });

  it('re-asks without text.format (responses API)', async () => {
    const fetchMock = mockFetchSequence([
      refusal("Invalid value for 'text.format': json_object is not supported"),
      streamResponse(['data: {"type":"response.output_text.delta","delta":"{}"}\n']),
    ]);
    const cfg: ModelConfig = { provider: 'openai', model: 'gpt-test-no-format', apiKey: 'k' };
    await openaiAdapter.generate(req, cfg);
    expect(fetchMock.mock.calls.length).toBe(2);
    expect(bodyOf(fetchMock, 0).text).toBeDefined();
    expect(bodyOf(fetchMock, 1).text).toBeUndefined();
  });
});

// Caching decides what a turn COSTS, never what it says — so a model that will not take the
// breakpoint fields is asked again without them instead of the reader losing the answer.
describe('a model that will not take the cache fields', () => {
  const ok = ['data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"{}"}}\n'];
  const cacheOf = (body: Record<string, unknown>): Record<string, unknown> | undefined =>
    (body.system as Array<{ cache_control?: Record<string, unknown> }>)[0]?.cache_control;

  it('steps the Claude breakpoint down to the default TTL, then off', async () => {
    const fetchMock = mockFetchSequence([
      refusal("cache_control: 'ttl' of '1h' is not supported by this model"),
      refusal('cache_control is not supported by this model'),
      streamResponse(ok),
    ]);
    const cfg: ModelConfig = { provider: 'anthropic', model: 'claude-test-no-ttl', apiKey: 'k' };
    await anthropicAdapter.generate(cachedReq, cfg);
    expect(fetchMock.mock.calls.length).toBe(3);
    expect(cacheOf(bodyOf(fetchMock, 0))).toEqual({ type: 'ephemeral', ttl: '1h' });
    expect(cacheOf(bodyOf(fetchMock, 1))).toEqual({ type: 'ephemeral' });
    expect(cacheOf(bodyOf(fetchMock, 2))).toBeUndefined();
  });

  it('re-asks OpenRouter with a plain system message', async () => {
    const fetchMock = mockFetchSequence([
      refusal('cache_control is not supported by the upstream provider'),
      streamResponse(['data: {"choices":[{"delta":{"content":"{}"}}]}\n', 'data: [DONE]\n']),
    ]);
    const cfg: ModelConfig = { provider: 'openrouter', model: 'vendor/no-cache', apiKey: 'k' };
    await openrouterAdapter.generate(cachedReq, cfg);
    expect(fetchMock.mock.calls.length).toBe(2);
    const first = bodyOf(fetchMock, 0).messages as Array<{ content: unknown }>;
    const second = bodyOf(fetchMock, 1).messages as Array<{ content: unknown }>;
    expect(Array.isArray(first[0].content)).toBe(true);
    expect(second[0].content).toBe('stable base prompt');
    expect(bodyOf(fetchMock, 1).prompt_cache_key).toBeUndefined();
  });

  it('re-asks the Responses API with the prompt back in instructions', async () => {
    const fetchMock = mockFetchSequence([
      refusal("Unknown parameter: 'prompt_cache_breakpoint'"),
      streamResponse(['data: {"type":"response.output_text.delta","delta":"{}"}\n']),
    ]);
    const cfg: ModelConfig = { provider: 'openai', model: 'gpt-5.6-luna', apiKey: 'k' };
    await openaiAdapter.generate(cachedReq, cfg);
    expect(fetchMock.mock.calls.length).toBe(2);
    expect(bodyOf(fetchMock, 0).prompt_cache_options).toBeDefined();
    expect(bodyOf(fetchMock, 1).prompt_cache_options).toBeUndefined();
    expect(bodyOf(fetchMock, 1).prompt_cache_key).toBeUndefined();
    expect(bodyOf(fetchMock, 1).instructions).toBe('stable base prompt');
  });
});
