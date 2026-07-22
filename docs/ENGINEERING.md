# Engineering standards

The bar every maintainer change is held to—and a reference for noncommercial evaluators permitted
by the license. Only the two authorized maintainers submit code or pull requests. If a maintainer
uses an AI agent, point it here.

## Principles

These draw on the field's best engineering writing — _Clean Code_, _A Philosophy of Software
Design_, _The Pragmatic Programmer_, _Refactoring_ — and each library's own guidance, all in
service of one goal: an **elite product that runs on any machine, is effortless to start, fun to
use, and secure.**

- **Clarity first.** Code is read far more than it's written — optimize for the next person.
- **Smallest correct change.** One concern per PR; no drive-by refactors or scope creep.
- **Modern and idiomatic.** Use the current best-practice idioms and the best features of the
  language, framework, and libraries (modern React 19 + TypeScript, current Vite / Vitest). Avoid
  deprecated patterns; when unsure, check the library's own docs rather than guessing.
- **Honest verification.** `tsc`, lint, format, tests, and build must pass, and you've exercised
  the real behaviour before calling it done.
- **Multiple reviews.** Non-trivial changes get more than one pass — a code-review pass _and_ an
  architecture/security pass — before they ship.

## Review checklist

Review every change against all of these. Add an **architecture review** for anything that
introduces a seam, a dependency, or a new module.

### Correctness

- [ ] Handles edge cases and the empty / loading / error / failure paths
- [ ] Types are sound — no `any` escape hatches or unsafe casts; discriminated unions stay exhaustive
- [ ] Tests cover the new behaviour; existing tests still pass

### Security

- [ ] No secrets in code or logs; provider keys are session-only by default (optional encrypted
      local store) and transit only through the documented same-origin proxy to the provider
- [ ] All external input (LLM output, user text, uploaded files) is treated as untrusted and validated/escaped — no injection, no unsanitized HTML
- [ ] `dangerouslySetInnerHTML` only on content we control and sanitize
- [ ] No new network egress or data collection; dependencies are trusted and minimal

### Scalability & performance

- [ ] No needless re-renders, O(n²) loops, or unbounded growth; large lists are bounded/virtualized where needed
- [ ] **No leaks** — every timer, listener, subscription, interval, and object URL is cleaned up; async is cancellable (`AbortController`); audio/network/animation loops stop on unmount. In components, drive timers with the `useTimeout` / `useInterval` hooks (`src/hooks`) so they cancel automatically. Prove it with a test, don't just intend it
- [ ] Bundle impact is considered — prefer **zero new runtime dependencies** (beyond `react` + `react-dom`, Mavéa's own footprint is a handful of feature-scoped, lazy-loaded libraries — see README's "Built with")

### Architecture & design

- [ ] Fits the existing seams (Intent → engine → beats → canvas; one `ProviderAdapter`; data-driven blocks)
- [ ] **Extensible by data, not by widening core switches** — a new block is a family file + one registry line, not a renderer edit
- [ ] Clear module boundaries, no circular dependencies, the right abstraction (neither over- nor under-engineered)

### Readability & maintainability

- [ ] Names say what things are/do; comments explain _why_, not _what_
- [ ] Matches the surrounding code's style, structure, and idioms
- [ ] Dead code removed; docs (`README` / `ARCHITECTURE` / `CONTRIBUTING`) updated in the **same** change
- [ ] Accessible UI (labels, roles, keyboard, contrast); respects light/dark and reduced-motion

## Testing

Tests are the safety net that lets maintainers change Mavéa with confidence. The bar: **when the suite is
green, you can trust that nothing broke and the app works.**

- **Test behaviour, not implementation.** Assert what the user or caller observes; avoid brittle snapshots and over-mocking.
- **Fast & deterministic.** No real network, real timers, or randomness — mock them (`vi.mock`, `vi.useFakeTimers`). A flaky test is worse than no test: fix it or delete it.
- **Cover the load-bearing seams** — the data contract (every topic, block, and persona is valid and wired), the canvas (every component renders), the turn machinery (reducer + beat runner + engine), the Live pipeline (validate → repair → honest fallback), and a smoke render of each surface.

```mermaid
graph BT
    UNIT["Unit — most numerous, deterministic\neval-score · streamParse · data-integrity\nleak-guard · Presence"]
    INT["Seam tests — many, fast, no real I/O\nliveSchema · orchestration · engine\nproviders · actions-gateway · router"]
    E2E["Smoke / integration — few, high-confidence\napp-smoke · live-smoke · canvas-render"]
    UNIT --> INT --> E2E
```

- **Readable.** `describe` / `it` read like sentences; one behaviour per test; clear arrange–act–assert.
- **Grows with the code.** A new feature or bug fix ships with a test that would have caught it. Run `pnpm test`, and `pnpm verify` before pushing.

### Two things the unit suite cannot see

A green suite proves the logic holds. It says nothing about whether a card is legible on a phone or
whether the app is usable on a slow laptop — and both of those are how people actually meet Mavéa.
Each has a script; both need a dev server running (`pnpm dev`).

- **`pnpm audit:ui`** — renders all 584 browsable block types in `#/gallery` across the full width range (a folded
  phone at 280px through 4K) in both themes, and reports three faults: content **clipped** out of its
  card, text **overlapping** other text, and type shrunk **below legibility**. The clip check is the
  gallery's own; the other two exist because a collision clips nothing, so nothing else catches it —
  and it is the failure the eye notices first. It measures the ink, line by line, and knows to ignore
  the back of a flip card, text scrolled out of an overflow pane, and a line a `line-clamp` cut away.
- **`pnpm perf`** — drives every surface under real CPU throttling (`--throttle 6` ≈ a budget laptop,
  `4` ≈ mid-range) and reports when the surface is actually _there_, how long the main thread was
  blocked (i.e. how long a click would have gone unanswered), and — the one that catches real
  regressions — whether any heavy asset (the voice model, its WASM, the on-device embedder, the block
  library) was pulled down **before the user asked for anything**. Nothing heavy should load on
  arrival; it loads when someone shows intent.
- **`pnpm perf:memory`** — warms every public route, then repeatedly mounts/unmounts them in one
  production Chromium process with forced GC. It fails on retained heap, DOM nodes, documents,
  event listeners, page errors, or console errors above the explicit budgets.

## How the bar is enforced

- **Automated** — CI runs `typecheck · lint · format · test · build` on every push and PR, and a
  **pre-push hook** runs the same `pnpm verify` gate locally so red never reaches CI. Pre-commit
  hooks format and lint staged files; commit messages are Conventional-Commit-linted; Dependabot
  keeps dependencies fresh; `pnpm knip` flags unused files, exports, and dependencies; and a
  leak-guard test mounts then unmounts every block under fake timers and fails if any timer is
  left pending — so an uncleaned `setTimeout`/`setInterval` can't merge.
- **Human** — `CODEOWNERS` requests review, the pull-request template carries this checklist, and
  significant changes get a second review plus an architecture review.
- **AI-assisted work** — make multiple independent passes (a code-review pass and an
  architecture + security pass) and self-review the diff against this list **before** opening a PR.
