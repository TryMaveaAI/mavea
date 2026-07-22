# The Mavéa Eval — a benchmark for honest data-visualization by LLMs

Most LLM benchmarks score _text_. Mavéa's scores something almost nothing else does: **does a model
turn an answer into the _right_ visualization for the data — and is it honest about what it doesn't
know?** When you ask "how did my spending break down," a good answer is a composition donut, not a
line chart; when the numbers are guesses, they must be _labeled_ as guesses, not dressed up as fact.

The harness that ships with Mavéa (`pnpm eval`) measures exactly that, deterministically, on any
model you can connect. This doc is how to run it as a benchmark and compare models.

## What it measures

Every case is a real ask with a known-good answer shape. Each model response is scored two ways:

**Structural (deterministic, no model in the loop)** — `src/live/eval/score.ts`:

| Check             | Passes when…                                                                     |
| ----------------- | -------------------------------------------------------------------------------- |
| `valid`           | the response parses into typed blocks                                            |
| `countOk`         | block count is within the case's expected range                                  |
| `expectedPresent` | at least one _correct_ block type for the data shape is present                  |
| `noForbidden`     | zero _wrong_ block types (e.g. a time-series `chart` for a category split)       |
| `honest`          | on estimate-only asks, no unsourced `conf:'strong'` — guesses are labeled        |
| `noRepeat`        | informational only — a type appears once (fit-driven reuse is fine, never gated) |

**LLM-judge (graded 1–5 by a separate model)** — `src/live/eval/judge.ts`:
`accuracy` · `completeness` · `fillDepth` (blocks richly filled, not half-empty) · `fit` (block type
matches the data shape) · `wow` (varied and designed vs. a generic chatbot default) · `intentFit`
(answered in the FORM and at the DEPTH the user asked — a table when they asked for a table, tight
when they asked for short).

The two are complementary: structural catches "picked the wrong chart / faked confidence"
mechanically; the judge catches "technically valid but thin or ugly."

## The set

**51 human-authored cases** — 25 core (`src/live/eval/golden.ts`) + 26 extended
(`src/live/eval/goldenExtra.ts`) — spanning money, health, travel, decisions, how-to, business, and
learning, plus explicit-format ("make me a table", "show the code"), brevity ("in one line",
"tl;dr"), and deep-dive asks that exercise `intentFit`. Each pins the acceptable primary block
types, the forbidden ones, an estimate-only flag, and an expected block-count range. The set is the
source of truth; add a case by appending one object.

## Run it

Set a provider + key (a JSON-mode model — Gemini or OpenAI — is required for the judge), then:

```sh
# .env (repo root)
EVAL_PROVIDER=gemini      # gemini | openai | anthropic | openrouter | grok
EVAL_MODEL=               # e.g. gemini-3.5-flash (defaults to the provider's default)
EVAL_KEY=                 # your API key
EVAL_JUDGE=1              # also run the LLM judge
EVAL_JUDGE_PROVIDER=gemini
EVAL_JUDGE_KEY=
EVAL_JUDGE_ONLY=          # optional: comma-separated case ids (a representative subset)
EVAL_JUDGE_DELAY=         # optional: ms to wait between cases — a free-tier key trips
                         #   RESOURCE_EXHAUSTED around ~15 req/min, so set e.g. 7000

pnpm eval
```

It prints a per-case pass/fail line and an aggregate scorecard (structural pass-rate + mean judge
scores). A companion eval, **`pnpm eval:mindshape`**, scores the "Watch me think" extraction on a
separate axis — _emergence_: does the model name a person's themes in their own words rather than
imposing generic categories.

## Leaderboard

Run the harness against each model and drop the numbers in. We do not publish fabricated rows.
External users may report reproducible results in an issue without submitting code or patches;
maintainers decide whether to update the table.

| Model                   | Structural pass % | fit (1–5) | wow (1–5) | honest % | Notes                  |
| ----------------------- | ----------------- | --------- | --------- | -------- | ---------------------- |
| _gemini-3.1-flash-lite_ | —                 | —         | —         | —        | Gemini default         |
| _gemini-3.5-flash_      | —                 | —         | —         | —        | Gemini step-up         |
| _claude-haiku-4-5_      | —                 | —         | —         | —        | Anthropic default      |
| _claude-sonnet-5_       | —                 | —         | —         | —        | Anthropic step-up      |
| _gpt-5.4-mini_          | —                 | —         | —         | —        | OpenAI default         |
| _(local, user-set)_     | —                 | —         | —         | —        | No bundled local model |

> Reproduce: each row is one `pnpm eval` run with `EVAL_MODEL` set to that id and `EVAL_JUDGE=1`.
> "honest %" is the share of estimate-only cases that passed the `honest` check.

## Why this is hard (and worth measuring)

A model can ace a text benchmark and still answer "what's my runway" with a wall of prose, or draw a
trend line for a thing that has no time axis, or state an invented figure with full confidence. None
of that shows up in token-level evals. It shows up here.
