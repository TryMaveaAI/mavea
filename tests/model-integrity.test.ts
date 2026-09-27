// A reader brings their own key and pays per token, so every request Mavéa sends must name the
// exact model they chose — never a cheaper one for a sub-task, never a default nobody picked, and
// never a different one on a retry. Two halves: the adapters are driven through the registry and
// every request they emit is read back, and the source is scanned so a model id cannot be written
// into a feature outside the one place defaults live.
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getAdapter } from '../src/live/providers';
import { EVAL_PRICES } from '../src/live/eval/cost';
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
const KNOWN_IDS = [
  ...PROVIDERS.flatMap((p) => [p.defaultModel, ...p.suggestedModels]),
  ...Object.keys(EVAL_PRICES),
].filter(Boolean);

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
    // The adapter remembers a refusal per model, in memory and on disk, so a model this process
    // (or a retry of this test) has already taught it would open at LOW and never be re-asked.
    localStorage.removeItem('mavea-gemini-no-minimal');
    const model = `reader-pick-no-minimal-${crypto.randomUUID()}`;
    const cfg: ModelConfig = { provider: 'gemini', model, apiKey: 'k' };
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
  /** A model family followed by its hyphen, at the start of a string or after a `/` or a space:
   *  catches a whole id, a gateway id (`google/gemini-…`), a path (`models/gemini-…`), and a
   *  prefix a feature would finish with a template or a `+`. Ids are lowercase; prose such as
   *  "GPT-4o baseline" in a block fixture is not a request. */
  const FAMILY = /(?:^|[/\s])(?:chatgpt|gemini|gpt|claude|grok)-/;
  /** OpenAI's o-series has no hyphenated family word: `o3`, `o4-mini`, `openai/o3`. */
  const O_SERIES = /(?:^|[/\s])o\d+(?:-[a-z0-9.-]+)?$/;

  function sourceFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const path = join(dir, e.name);
      if (e.isDirectory()) return sourceFiles(path);
      return /\.tsx?$/.test(e.name) ? [path] : [];
    });
  }

  const rel = (file: string): string => relative(ROOT, file).split('\\').join('/');

  /** Every piece of text a file's CODE carries: string and template literals and JSX text, read
   *  off TypeScript's own parse, so a comment may name a model to explain a quirk while a `/*`
   *  inside a string (a glob, a MIME list) can never hide the code after it. */
  function literalsOf(file: string): string[] {
    const source = ts.createSourceFile(
      file,
      readFileSync(file, 'utf8'),
      ts.ScriptTarget.Latest,
      false,
      file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    const texts: string[] = [];
    const visit = (node: ts.Node): void => {
      if (
        ts.isStringLiteral(node) ||
        ts.isNoSubstitutionTemplateLiteral(node) ||
        ts.isTemplateHead(node) ||
        ts.isTemplateMiddle(node) ||
        ts.isTemplateTail(node) ||
        ts.isJsxText(node)
      ) {
        texts.push(node.text);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
    return texts;
  }

  const files = sourceFiles(join(ROOT, 'src'));

  it('no feature hardcodes a model id', () => {
    const offenders = files
      .filter((file) => !ALLOWED.has(rel(file)))
      .flatMap((file) =>
        literalsOf(file)
          .filter((text) => FAMILY.test(text) || O_SERIES.test(text))
          .map((text) => `${rel(file)}: ${JSON.stringify(text)}`),
      );
    expect(offenders).toEqual([]);
  });

  it('the scan sees what it is meant to see', () => {
    const hits = (code: string): boolean => {
      const source = ts.createSourceFile('probe.ts', code, ts.ScriptTarget.Latest);
      let found = false;
      const visit = (node: ts.Node): void => {
        if (
          (ts.isStringLiteral(node) || ts.isTemplateLiteralToken(node)) &&
          (FAMILY.test(node.text) || O_SERIES.test(node.text))
        ) {
          found = true;
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
      return found;
    };
    for (const code of [
      "const m = 'gemini-3.1-flash-lite';",
      "const m = 'google/gemini-3-pro';",
      "const u = '/models/claude-haiku-4-5';",
      'const m = `gemini-${version}`;',
      "const m = 'gpt-' + tier;",
      "const m = 'chatgpt-4o-latest';",
      "const m = 'o3';",
      "const m = 'openai/o4-mini';",
      "const g = './*.json'; const m = 'grok-4.3';",
    ]) {
      expect(hits(code), code).toBe(true);
    }
    for (const code of [
      "// 'gemini-3.1-flash-lite' named in a comment\nconst x = 1;",
      "const key = 'mavea-gemini-no-minimal';",
      "const note = 'GPT-4o baseline';",
      'const re = /^gpt-5/;',
    ]) {
      expect(hits(code), code).toBe(false);
    }
  });

  it('the app never reads the evaluation pricing table', () => {
    const importers = files.filter((file) => {
      if (rel(file).startsWith('src/live/eval/')) return false;
      return /from\s+['"][^'"]*eval\/cost['"]|import\(\s*['"][^'"]*eval\/cost['"]/.test(
        readFileSync(file, 'utf8'),
      );
    });
    expect(importers.map(rel)).toEqual([]);
  });
});
