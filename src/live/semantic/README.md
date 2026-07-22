# On-device semantic component fit

Live picks which UI component answers a question. Keyword + intent rules (`../select`) anchor the
asks whose wording trips a rule; this layer covers the rest. A vague or novel question
("explain how a black hole works", "is my friendship draining me") is embedded and matched against a
per-component **exemplar** vector, so it still reaches the right component.

## Why a static embedder (Model2Vec)

It must run well on the **weakest old machine** and be **free for commercial use** (see the
`feedback-runs-on-all-hardware` / `feedback-free-commercial-licensing` memories). We use
**`minishlab/potion-base-8M`** (MIT). Encoding a string is _tokenize → look up each token's row in a
`[vocab × 256]` matrix → mean-pool → L2-normalize_ — **no neural network, no WASM, no GPU/threads**.
That's sub-millisecond on a 2012 CPU and runs in pure JS (`encode.ts`), which matters because Mavéa is
not cross-origin-isolated (single-threaded WASM only). `encode.ts` reproduces the Python reference to
cosine ≥ 0.995 (the gap is int8 quantization), proven by `tests/semantic-fit.test.ts`.

## Shape

- `encode.ts` — the pure-JS Model2Vec encoder (BERT WordPiece + int8 matrix lookup + mean + norm).
- `worker.ts` — loads the assets off-thread, embeds a query, cosine-ranks the component vectors.
- `client.ts` — the main-thread handle. `semanticFit(query)` resolves to a `type→cosine` map, or
  **null instantly** when the model isn't warm (cold start, weak device, no worker) — so it adds zero
  latency. `warmSemanticFit()` preloads it during idle (called from `LiveApp`).
- `exemplars.json` — **committed source of truth**: the query-style "questions this answers" text per
  component. This is what makes matching accurate; edit it, then rebuild.
- The selector (`../select/rank.ts`) folds the result in as a **bounded, additive boost** on top of
  shape + intent fit — never an override, never a sole pin. Absent → exactly the prior behaviour.

## Building the assets

The matrix/vocab/component-vectors are generated (gitignored, ~7 MB) and lazy-fetched at runtime from
`public/semantic/`. Regenerate after editing `exemplars.json` or changing the model:

```sh
python3 -m venv .venv && .venv/bin/pip install model2vec   # one-time
pnpm semantic:build                                        # dumps the catalog + builds public/semantic
```

When the assets are absent the worker fails to load and Live silently uses the keyword/intent path, so
a checkout without them still works — semantic fit is a pure enhancement.
