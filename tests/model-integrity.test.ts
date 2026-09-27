// A reader brings their own key and pays per token, so every request Mavéa sends must name the
// exact model they chose — never a cheaper one for a sub-task, never a default nobody picked, and
// never a different one on a retry. Two halves: the adapters are driven through the registry and
// every request they emit is read back, and the source is scanned so a model id cannot be written
// into a feature outside the one place defaults live.
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getAdapter } from '../src/live/providers';
import { PROVIDERS } from '../src/live/providers/info';
import { forgetReadiness } from '../src/live/providers/readiness';
import type { LiveRequest } from '../src/live/providers/types';
import type { ModelConfig, ProviderId } from '../src/types/mavea';

interface Sent {
  url: string;
  body: string;
}

/** Every request the adapter hands to fetch, answered by `respond` in order. */
function recordFetch(respond: (n: number) => Response): Sent[] {
  const sent: Sent[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      sent.push({ url: String(url), body: typeof init?.body === 'string' ? init.body : '' });
      return respond(sent.length - 1);
    }),
  );
  return sent;
}

/** A refusal no adapter retries, so each ask ends after the request it made. */
const refused = (): Response =>
  new Response(JSON.stringify({ error: { message: 'bad request' } }), { status: 400 });

/** The model a request asks for: Gemini puts it in the path, everyone else in the body. */
function requestedModel(provider: ProviderId, req: Sent): string | undefined {
  if (provider === 'gemini') return /\/models\/([^:/?]+):/.exec(req.url)?.[1];
  return (JSON.parse(req.body) as { model?: string }).model;
}

const ask: LiveRequest = { system: 'sys', history: [], user: 'hello', thinkingLevel: 'minimal' };

/** Every id this codebase knows by name — none may appear in a request for another model. */
const KNOWN_IDS = PROVIDERS.flatMap((p) => [p.defaultModel, ...p.suggestedModels]).filter(Boolean);

beforeEach(() => forgetReadiness());
afterEach(() => vi.unstubAllGlobals());

describe('every request names the model the reader chose', () => {
  for (const { id } of PROVIDERS) {
    it(`${id}: a generation asks for the configured model and no other`, async () => {
      const cfg: ModelConfig = { provider: id, model: `reader-pick-${id}`, apiKey: 'k' };
      const sent = recordFetch(refused);
      await getAdapter(id)
        .generate(ask, cfg)
        .catch(() => undefined);
      expect(sent.length).toBeGreaterThan(0);
      for (const req of sent) {
        expect(requestedModel(id, req)).toBe(cfg.model);
        for (const other of KNOWN_IDS) expect(req.url + req.body).not.toContain(other);
      }
    });
  }

  it('gemini: re-asking a model with no MINIMAL tier keeps the same model', async () => {
    const cfg: ModelConfig = { provider: 'gemini', model: 'reader-pick-no-minimal', apiKey: 'k' };
    const sent = recordFetch((n) =>
      n === 0
        ? new Response(
            JSON.stringify({ error: { message: 'Thinking level MINIMAL is not supported' } }),
            { status: 400 },
          )
        : refused(),
    );
    await getAdapter('gemini')
      .generate(ask, cfg)
      .catch(() => undefined);
    expect(sent).toHaveLength(2);
    for (const req of sent) expect(requestedModel('gemini', req)).toBe(cfg.model);
  });

  it('anthropic: the paid readiness check asks for the configured model', async () => {
    const cfg: ModelConfig = { provider: 'anthropic', model: 'reader-pick-probe', apiKey: 'k' };
    const sent = recordFetch(() => new Response('{}', { status: 200 }));
    await getAdapter('anthropic').probe(cfg);
    const paid = sent.filter((r) => r.body);
    expect(paid).toHaveLength(1);
    expect(requestedModel('anthropic', paid[0])).toBe(cfg.model);
  });

  it('no model chosen means no request at all', async () => {
    const sent = recordFetch(refused);
    for (const { id } of PROVIDERS) {
      await expect(
        getAdapter(id).generate(ask, { provider: id, model: '', apiKey: 'k' }),
      ).rejects.toMatchObject({ reason: 'unconfigured' });
    }
    expect(sent).toHaveLength(0);
  });
});

describe('model ids live in one place', () => {
  const ROOT = join(__dirname, '..');
  /** The seam that names each provider's prefilled default, and the offline pricing table the
   *  evaluation harness reads. Nothing else may spell a model id. */
  const ALLOWED = new Set(['src/live/providers/info.ts', 'src/live/eval/cost.ts']);
  const MODEL_ID = /['"`](?:gemini|gpt|claude|grok|o\d)-[\w.-]*\d[\w.-]*['"`]/g;

  function sourceFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const path = join(dir, e.name);
      if (e.isDirectory()) return sourceFiles(path);
      return /\.tsx?$/.test(e.name) ? [path] : [];
    });
  }

  /** Comments may name models to explain a quirk; only code can send one. */
  const stripComments = (src: string): string =>
    src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');

  it('no feature hardcodes a model id', () => {
    const offenders = sourceFiles(join(ROOT, 'src'))
      .map((file) => relative(ROOT, file).split('\\').join('/'))
      .filter((rel) => !ALLOWED.has(rel))
      .flatMap((rel) =>
        [...stripComments(readFileSync(join(ROOT, rel), 'utf8')).matchAll(MODEL_ID)].map(
          (m) => `${rel}: ${m[0]}`,
        ),
      );
    expect(offenders).toEqual([]);
  });
});
