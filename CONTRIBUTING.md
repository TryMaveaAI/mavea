# Mavéa feedback and maintainer guide

Mavéa does not accept external code, patches, documentation changes, or pull requests. The only
authorized code maintainers are Akash Maitra (`@amaitra218`) and Aryan Chordia
(`@aryanchordia`). External users may open an issue to report a bug or suggest a feature, but must
not include code, secrets, personal data, trade secrets, or other confidential material.

Voluntary feedback may be used as described in [TERMS.md](./TERMS.md). A response, discussion, or
issue label does not grant a software, trademark, or commercial license.

The rest of this document is the internal development guide for the two maintainers and does not
invite outside contributions.

## Setup

```sh
corepack enable      # one-time: activates the pnpm version pinned in package.json
pnpm install
pnpm dev
```

You need Node 24.11+ (what `package.json` enforces); Mavéa uses [pnpm](https://pnpm.io) (Corepack
pins the version, so there's nothing to install globally). The dev server prints a local URL; open it and you're running the demo. A
fresh browser (no `localStorage` from a prior visit) shows the landing page with a one-time,
dismissible invite to play the ~2-minute guided walkthrough — it never launches on its own, and
the tour stays reachable afterward from the "Take the tour" nav link, ⌘K, or a `?tour=1` deep-link.
To work on Live mode, click **Open Mavéa** and paste a hosted provider key (Live is BYOK:
Anthropic, OpenAI, Gemini, OpenRouter, or xAI Grok).

## Before a maintainer opens a PR

Run the full gate before opening a PR (the pre-push hook only runs typecheck + lint):

```sh
pnpm verify   # reference/gallery fixture freshness → typecheck → lint → format:check → test → build → bundle-size budget → artifact + package boundary
```

Or step by step:

```sh
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm build
pnpm size
```

`pnpm format` fixes formatting in place; `pnpm lint:fix` fixes what it can. Maintainer PRs stay
focused—one change per PR is much easier to review than a grab-bag.

A **pre-commit hook** (Husky + lint-staged) auto-formats and lints your staged files, and a
**pre-push hook** runs `pnpm typecheck` and `pnpm lint` as a fast local sanity check; the full gate
runs in CI. CI re-runs the
same checks on each push and pull request, plus a few gates that only run there: dead-code/dependency
checks (`pnpm knip`, `pnpm check:licenses` + `pnpm check:vulnerabilities`, all bundled in `pnpm verify:full`), a secret scan and
Semgrep SAST pass, and — on pull requests — a Conventional Commits lint over the PR's commits.

Changes are reviewed against our [**engineering standards**](./docs/ENGINEERING.md) — the
security, scalability, architecture, and readability bar, with a checklist you can self-review
before opening a PR.

## Scripts reference

The `pnpm <script>`s you'll reach for most, grouped by when you'd use them (see `package.json` for
the complete list).

**Everyday dev loop**

| Script    | Does                                                                                                                                     |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `dev`     | Full local stack: brings up the Kokoro voice container, then Vite. Serves the app without voice (captions only) if Docker isn't running. |
| `dev:web` | Vite alone, no voice container.                                                                                                          |
| `build`   | Typecheck, then production build to `dist/`.                                                                                             |
| `preview` | Serves the `dist/` build on `:4173` — the same bundle `npx mavea` runs.                                                                  |
| `analyze` | Production build with the bundle visualizer turned on (`ANALYZE=1`), for inspecting what's inside a chunk.                               |
| `actions` | Starts the actions gateway (`:8910`) that proxies Live's confirm-to-execute actions (Calendar, Gmail, Slack, …) to third-party APIs.     |

**Quality gates** (what CI runs; the pre-push hook runs only `typecheck` and `lint`)

| Script           | Does                                                                                                                                                                |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `typecheck`      | `tsc --noEmit` — type errors only, no build output.                                                                                                                 |
| `lint`           | ESLint over the repo.                                                                                                                                               |
| `lint:fix`       | ESLint with auto-fix.                                                                                                                                               |
| `format`         | Prettier, writes changes in place.                                                                                                                                  |
| `format:check`   | Prettier, fails if anything is unformatted (no writes) — what CI runs.                                                                                              |
| `test`           | Vitest suite, once.                                                                                                                                                 |
| `test:watch`     | Vitest in watch mode.                                                                                                                                               |
| `size`           | Checks the landing page's eager (gzipped) bundle against the size budget.                                                                                           |
| `knip`           | Finds unused files, exports, and dependencies.                                                                                                                      |
| `check:licenses` | Verifies every dependency's license is on the allowed list.                                                                                                         |
| `verify`         | The full pre-PR gate: `check:reference-examples → check:gallery-fixtures → typecheck → lint → format:check → test → build → size → check:artifact → check:package`. |
| `verify:full`    | `verify` plus `knip`, `check:licenses`, and `check:vulnerabilities` (OSV.dev) — what a release should pass, not every PR.                                           |

**Scaffolding**

| Script      | Does                                                                                                                                                 |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `new:block` | `pnpm new:block <family> <type>` — scaffolds a new canvas block's component, CSS, and catalog wiring. See [Add a canvas block](#add-a-canvas-block). |

**Eval and model-quality tooling** (exercise a real model — cost API calls; not part of `verify`)

| Script              | Does                                                                                                                                                                                                      |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `eval`              | Runs the Live golden eval set against whichever model is configured (`EVAL_LIVE=1`); see [docs/BENCHMARK.md](./docs/BENCHMARK.md).                                                                        |
| `eval:mindshape`    | Quality gate for the "Watch Me Think" mind-mapping feature — scores resonance/fidelity/emergence against fixtures.                                                                                        |
| `pairs:selection`   | Collects pairwise human/model preference labels for the block-selector's ranking weights. Output feeds `weights:selection`.                                                                               |
| `weights:selection` | Fits the selector's ranking weights from `pairs:selection` output. A recommendation only — adopted by hand-editing `rank.ts` if it beats the current weights.                                             |
| `gen:catalog`       | Regenerates the compact block-catalog index the selector reads at runtime from the per-family source files. A staleness test fails if this drifts, so re-run it after editing a family's catalog entries. |
| `semantic:build`    | Rebuilds the semantic embedding index (`public/semantic`) used for meaning-based block selection.                                                                                                         |

**Headless browser audits** (require a dev server already running — start `pnpm dev` first)

| Script        | Does                                                                                                                                     |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `audit:ui`    | Sweeps the whole block library across screen sizes and both themes for overflow, overlapping text, and type below legibility.            |
| `audit:tap`   | Walks every surface at a phone width and hit-tests each control against the 44px thumb bar.                                              |
| `perf`        | Drives every surface under CPU throttling and reports load time, main-thread blocking, and any heavy asset pulled before the user asked. |
| `audit:reel`  | Sweeps the `#/reel` gallery across aspect ratio × palette × longest-text combinations.                                                   |
| `slides:gate` | Sweeps every skin and both decks in `#/slidelab` for overflow.                                                                           |
| `export:gate` | Sweeps every skin and both page formats in `#/exportlab` (the PDF export system) for overflow.                                           |

Each of these prints a report and exits non-zero if it flags anything; pass `-- --url <url>` to
point at `pnpm preview` instead of the dev server, and `-- --help`-style flags are documented in
each script's own header comment in `scripts/`.

## Commit messages

Commits follow [**Conventional Commits**](https://www.conventionalcommits.org): a `type(scope):`
subject, then a blank line, then a body explaining _what_ changed and _why_. A `commit-msg` hook
(and CI on PRs) validates the format.

```
feat(canvas): add a sunburst block for nested compositions
fix(live): route Gemini generation through the /llm/gemini proxy
docs: document the LLM → block → component pipeline
```

Common types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `ci`, `perf`, `style`.

## Conventions

The codebase aims to read like one person wrote it on a good day. A few things keep it that way:

- **Comments explain _why_, not _what_.** The code already says what it does. A comment earns its
  place by explaining a decision, a constraint, or a non-obvious consequence — a browser quirk,
  an ordering that matters, a deliberate edge case. Delete comments that merely narrate the line
  below them.
- **No breadcrumbs to how the code was made.** No references to prior prototypes, line numbers in
  other files, review notes, or task/phase labels. Write for the next reader, who has only this
  repository.
- **Names carry their weight.** Prefer a clear name over a comment. Avoid throwaway names
  (`data`, `tmp`, `handleStuff`) and inconsistent casing. A reader should be able to guess what a
  value is from its name alone.
- **Types over runtime guesswork.** Reach for discriminated unions and exhaustive `switch`es.
  Validate data crossing a trust boundary (model output, storage) rather than casting it.
- **Match the surrounding code.** Comment density, naming, and structure should look like the
  file you're editing, not like a different house style dropped in.

Behavior is load-bearing, especially the demo choreography. The face and its timing are tuned;
`Presence.tsx` is a hard constraint — its DOM and `data-*` API must stay exactly as they are, and
animation belongs in CSS, never in JS. When you change behavior, update or add a test.

## Tests

Tests live in `tests/` and run under Vitest. The most important ones lock down behavior we don't
want to drift:

- `Presence.test.tsx` — the face renders the exact DOM the CSS animates.
- `liveSchema.test.ts` — malformed model output is repaired into safe, typed blocks.
- `providers.test.ts`, `streamParse.test.ts` — adapter transport and narration-first parsing.
- `eval-score.test.ts` — the eval scorer grades invariants correctly.
- `leak-guard.test.tsx` — mounts then unmounts every block under fake timers; fails if any timer
  is left pending, so uncleaned `setTimeout`/`setInterval` calls can't merge.
- `component-catalog.test.ts`, `component-protocol.test.ts` — every catalog entry has a matching
  component and every component follows the overflow/card contract.

## Recipes

### Add a block fixture (topic)

`data/topics/` is the shared fixture corpus: the gallery renders from it, Live harvests real
prop-shape examples from it, and the render/leak gauntlets iterate it. To add one:

1. Create `data/topics/<id>.ts` exporting a `ConversationSpec` (see an existing topic such as
   `money.ts` for the shape).
2. Register it in `data/topics/index.ts`.

No renderer change is required.

### Add a demo persona (a recorded landing session)

1. Add an identity to `demo/cast.ts` and a script (asks + feature beats) to `demo/scripts.ts` —
   keep every ask publicly answerable or self-contained (the persona states their own numbers).
2. Bake the real session: `ONLY=<id> GEMINI_API_KEY=… npx vite-node scripts/build-demo-corpus.mts`,
   review the logged ✓/✗ expectations, and re-run to re-roll weak turns.
3. `tests/demo-corpus.test.ts` verifies the cast, script, and baked shard stay in lockstep.

**Minimal shape:**

```ts
// src/data/topics/mysubject.ts
import type { ConversationSpec } from '../conversation';

export const mysubject: ConversationSpec = {
  id: 'mysubject',
  workspace: 'My subject',
  title: 'Canvas title',
  sub: 'One-line subtitle',
  opener: 'What the face says before blocks appear.',
  context: [],
  blocks: [
    {
      type: 'insight',
      col: 12,
      id: 'main',
      delay: 0,
      props: { title: 'Key finding', summary: 'Details here.' },
    },
  ],
  proof: null,
  extras: {},
  group: 'home',
  suggests: [],
  keywords: [{ test: /mysubject/, route: 'topic:mysubject' }],
};
```

> **Registry order is routing precedence.** The router returns the first keyword match in `TOPIC_LIST` order in `src/data/topics/index.ts`. Place topics with narrow or colliding keywords before broader ones.

### Add a Live provider

1. Create `live/providers/<name>.ts` exporting a `ProviderAdapter` — implement `probe` (a short,
   never-throws readiness check) and `generate` (stream the raw model output; do **not** validate
   or render it). For providers that speak the OpenAI Chat Completions wire format, use
   `openaiCompatible` from `providers/openaiCompatible.ts` as a thin wrapper (see `grok.ts`).
2. Add it to the registry and `PROVIDERS` list in `live/providers/index.ts` with its label,
   default model, and whether it needs a key.
3. Add a proxy route to `vite.config.ts` so the browser reaches the API same-origin
   (a production deploy replicates that proxy at the infrastructure level).

Transport-only adapters keep every provider behind the single validation core, so they all get
the same safety for free.

**Adapter skeleton:**

```ts
// src/live/providers/myprovider.ts
import type { ProviderAdapter, LiveRequest, DeltaFn } from './types';
import type { ModelConfig } from '../../types/mavea';

export const myproviderAdapter: ProviderAdapter = {
  id: 'myprovider',
  capabilities: {
    constrainedDecoding: false,
    streaming: true,
    vision: false,
    contextWindow: 8_192,
    strengthTier: 'frontier', // 'frontier' | 'mid' | 'small'
  },

  async probe(cfg: ModelConfig) {
    // Must never throw — return { ok: false } on any error
    try {
      const res = await fetch('/llm/myprovider/models', {
        /* auth header */
      });
      return { ok: res.ok, model: true };
    } catch {
      return { ok: false, model: false };
    }
  },

  async generate(req: LiveRequest, cfg: ModelConfig, onDelta?: DeltaFn) {
    // Stream raw JSON to onDelta; return the full accumulated text.
    // Do NOT validate or parse — validateLiveResponse handles that.
    const res = await fetch('/llm/myprovider/v1/chat', {
      /* … */
    });
    // … stream handling …
    return { raw: fullText };
  },
};
```

You also need to add a proxy route to `vite.config.ts` (for dev) so the browser can reach the upstream API without CORS issues. Follow the existing `/llm/anthropic` and `/llm/openrouter` entries as a pattern.

### Add a canvas block

Scaffold it, then fill it in:

```bash
pnpm new:block <family> <type>   # e.g. pnpm new:block charts2 sparkline
```

This creates the component + CSS stub and wires the family `types.ts`, `registry.tsx`, and the
`ComponentMeta` catalog. You then flesh out the props/styles/blurb and **add a demo** (a real
instance in a `data/topics/*` spec) — required, not optional: the coverage tests stay red until the
block appears in a topic, since that authored instance is both what `#/gallery` shows and the example
Live shows the model.

The full contract — the standard every block follows, the `ComponentMeta` fields, what each test
enforces, and custom-coercion/nesting — is in **[docs/ADDING-A-COMPONENT.md](docs/ADDING-A-COMPONENT.md)**.

### Add an action

Actions are declarative proposals — Mavéa offers them to the user as a confirm card; they only execute after explicit confirmation through the same-origin `/actions` proxy. Three files are involved:

**Step 1 — `src/live/actions/catalog.ts`:** add an entry to the action catalog.

```ts
{
  id: 'myservice.doThing',
  mcp: 'myservice',
  label: 'Do the thing',
  desc: 'One-line description the model reads to decide when to offer this.',
  cta: 'Do it',
  params: [
    { name: 'target', type: 'string', required: true, desc: 'What to act on' },
  ],
},
```

**Step 2 — `gateway/connectors.mjs`:** implement the connector function and add it to the `CONNECTORS` map.

```js
async function myserviceDoThing(args, env, fetchImpl) {
  const token = env.MYSERVICE_TOKEN;
  if (!token) return unconfigured('MYSERVICE_TOKEN not set.');
  const target = (args.target ?? '').trim();
  if (!target) return badRequest('target is required.');
  const res = await fetchImpl('https://api.myservice.com/do', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ target }),
  });
  if (!res.ok) return upstreamFailed('MyService', res.status);
  return { ok: true, status: 200, detail: 'Done.' };
}
// add to CONNECTORS map: 'myservice.doThing': myserviceDoThing
```

**Step 3 — `tests/actions-gateway.test.ts`:** cover the four paths — unconfigured (missing token), bad input, upstream failure, and success.

Finally, document `MYSERVICE_TOKEN` in `.env.example` so `pnpm actions` picks it up at runtime.

## Reporting bugs

Open an issue with what you did, what you expected, and what happened. A failing test or a small
reproduction is the fastest way to a fix.

## Troubleshooting

**`pnpm install` fails — Node version mismatch**
Mavéa requires Node ≥ 24.11 (the published `npx mavea` CLI runs on Node ≥ 20.19). Check `node --version`. Then `corepack enable` to get the pinned pnpm.

**TypeScript errors after adding a block**
Check that (a) the `Block` union or extended-block union includes the new type, (b) the canvas renderer handles the new `type` key, and (c) `canvas/blocks/index.ts` imports the new family.

**Test fails with "timer pending after unmount"**
A component left a `setTimeout` or `setInterval` running. Replace with `useTimeout` or `useInterval` from `src/hooks/` — those hooks cancel automatically on unmount. See `tests/leak-guard.test.tsx` for the pattern.

**Commit rejected by commitlint**
Format: `type(scope): subject` — max 100 chars, no period at end.
Common types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `ci`, `perf`, `style`.
Example: `feat(canvas): add sunburst block for nested compositions`
