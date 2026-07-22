# Changelog

All notable changes to Mavéa are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project aims to follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed — the pre-launch pass

Everything below was found by measuring, not by reading.

- **OpenAI was broken for every substantive question.** A reasoning model spends its thinking tokens
  out of the same `max_output_tokens` budget as its answer, and when it runs out mid-thought the run
  ends `incomplete` having written nothing at all. Asking it to plan a three-day trip took 72 seconds
  and returned the honest-fallback card. The thinking headroom Gemini and Anthropic already had now
  extends to OpenAI and Grok; `response.incomplete` is surfaced instead of silently swallowed; and
  reasoning effort is pinned to `low`, where it demonstrably works (above that, the reasoning runs
  away — at ~18k tokens it thought for 119 seconds and still wrote nothing). Same question, search
  on: **72s → 27s, one model call instead of two, a real eight-block itinerary with live sources.**
- **Push-to-talk never worked in Live.** The hold listener refused to arm inside a text field, and
  the composer takes focus whenever you aren't speaking — so the target was always an input. A bare
  modifier types no character, so it now arms there and stands down the moment another key joins it
  (a real combination like ⌥E).
- **The app needed a refresh on `pnpm dev`, and could lose an answer mid-flight.** Vite's scanner
  only follows static imports, so a package reached solely through `import()` was invisible to it;
  the first time the running app touched one it re-bundled and hard-reloaded the page — a blank first
  paint on arrival, and on the mic (which pulls in the voice model) a reload straight through
  whatever turn was in flight.
- **The block library now fits a phone.** 76 of ~580 blocks clipped their content at 320px. Two
  shared rules caused most of it: the card footer could not wrap, and the card eyebrow carried
  `nowrap` over a label the model writes.
- **Nothing heavy loads before you ask for it.** The ~7MB on-device embedder was fetched the moment
  Live mounted; someone who opened Live, looked around and left paid for all of it. It waits for a
  sign you mean to ask something.
- Photos were stamped "AI image" though Mavéa does not generate images; a re-ask replayed the old
  answer when you toggled "explain simply"; a failed file read left the Synthesis drop zone spinning
  forever; a broken chunk could reload the browser without end; and `GradientDescent` drew no surface
  at all (it mixed data and pixel coordinates and emitted negative SVG rects, which browsers refuse).

### Removed

- `vercel.json`. It was never used, and its own comment conceded that BYOK Live could not work there
  without serverless forwarders that were never written — so deploying with it would have shipped an
  app with every provider call broken.

### Added

- **The voice-first redesign.** The spoken answer leads as a serif headline over the evidence;
  six theme templates (paper / daylight / ink / console / marquee / original), each a complete
  token re-skin with its own light **and** dark; honest turn states (a live listening card,
  skeletons labeled with the real streaming block type, a said-vs-shown speak ribbon); a
  "What are we figuring out?" welcome hub with starter chips and resumable moments cards.
- **It points while it talks.** Mavéa draws hand-style circles, underlines, and arrows on the
  exact figure each spoken line is about — targets are model-authored and located in the card's
  real DOM (no reason, no ink), with a generous **teach mode** ("walk me through it"). Strokes
  persist on the card, replay in shared Stories, and survive follow-up turns.
- **Edit its mind** — every answer lists the constraints it rests on as tappable chips; fixing
  one fires a single correction turn. **Self-healing history** — a genuine reversal marks the
  earlier moment _corrected_ (was → now) in the rail and recap instead of rewriting it silently.
- **Blocks fuse** — drag any card onto another for a grounded answer about the real relationship
  between their data. **Ask about this** pins blocks so follow-ups are grounded in their exact
  on-screen props.
- **Time as a medium.** Per-turn frames with replay; a session **Recap** ("Tonight, so far.");
  **semantic zoom** (pinch out to chapters, again to one breath); and **scrub-the-voice** — the
  settled answer's real spoken track as a waveform that un-builds the canvas to what had been
  _said_ at any moment, then rebuilds as it replays.
- **Ghost blocks** — while you're still talking, dashed _forming / maybe_ cards sketch the answer
  taking shape (speculative, abortable, off on the Fast quality dial).
- **The companion.** **Hold my thought** catches unfinished sentences and offers one back at
  wind-down; **whisper mode** dims the room and the voice during quiet hours (10 PM–6 AM,
  opt-out); **think-out-loud** banks a ramble and sorts it into decisions / todos /
  contradictions on "thoughts?".
- **The Rehearsal** — practice a hard conversation against a counterpart grounded only in
  context you supply, with a coach card between takes. **The Table** — two real agents negotiate
  on your key inside code-enforced boundaries; the deal stays pending both humans.
- **Living answers.** **Track this** turns anything you asked about into a **living dashboard**
  (`#/dashboards`) that re-checks itself on a cadence you set — an honest re-ask on your own key,
  never a fake background update — with a running check log, a spend ledger, tripwire alerts, and
  a Rewind of how the answer changed; **bendable answers** carry model-authored formulas so
  dragging the one number that matters recomputes the outputs, auditable (whitelist evaluator,
  never `eval`).
- **Reach.** **Share-to-Mavéa** — paste or drop a link/screenshot anywhere on Live for a
  source-grounded claim check; **Present mode** — a full-theater stage with slide nav and the
  mic left live so room questions become canvases ("from the room"); **Your Atlas** — every
  conversation as a flyable map clustered by your own words; **Mavéa Story** — share a session as
  a cinematic MP4 of the real components; **per-fact memory provenance** ("you said so" vs
  inferred — and an inferred guess is never asserted as fact) with grouped view and JSON export,
  plus memory that **learns how you like answers** — honoring a correction or a stated
  format/depth on the very next turn, query-conditioned recall, all local and at no extra cost,
  with a multi-turn eval that proves the lift.
- **The new face** — an aurora jelly replaces the original orb: its bell gradient _is_ the mood,
  and four tentacle curtains carry the state. Same data-attribute contract (state / emotion /
  gaze), so templates, docking, and voice-energy sync carry over.
- `pnpm new:block <family> <type>` — a scaffold that wires a new canvas block into the family
  types, registry, and the `ComponentMeta` catalog — plus `docs/ADDING-A-COMPONENT.md` as the
  one canonical guide to the block contract.
- A registry ↔ `ComponentMeta` bijection test and a gallery-family coverage test: a block added
  without metadata (so Live can never select it) or a family missing from the `#/gallery` QA
  surface now fails the suite instead of slipping through silently.
- `.env.example` documenting local service URLs, gateway credentials, and eval keys.
- A Content-Security-Policy (meta + nginx headers) plus `X-Content-Type-Options`,
  `Referrer-Policy`, `X-Frame-Options`, and a microphone/screen-capture-scoped
  `Permissions-Policy` — verified against the production build with the policy enforcing.

### Changed

- **Kokoro is now the only voice.** The browser `speechSynthesis` engine is removed — when the
  model isn't reachable, lines are captions-only rather than read in a robotic system voice.
  Kokoro's container now runs by default (`docker compose up`), not only under `--profile live`,
  so a hosted-model Live user hears the natural voice; Whisper stays live-profile-only.
- Consolidated to a single documented block standard (`ComponentMeta`); the orphaned
  `BlockDescriptor` "standard" that no code used was removed.
- Wired the `code`, `compose`, `diagrams`, `everyday`, and `reference` families into the gallery
  so their blocks group correctly instead of falling into a catch-all bucket.

### Fixed

- **Security** — add SRI integrity check (`sha384`) to the PDF.js worker `fetch()` call in
  Prism; the code sandbox already pinned Pyodide the same way — this closes the asymmetric gap.
- **Security** — sanitize the HTML render boundary for model- and search-derived content
  (message-draft bodies, web-search excerpts, source snippets, accordion bodies). Closes an
  entity-decode XSS in the search path and an un-neutralized message-draft body.
- **Security** — validate and bound actions-gateway inputs: reject CR/LF in Gmail
  recipients/subjects (MIME header injection) and length-cap every field.
- **CSP** — `<object type="application/pdf">` silently blocked by `object-src 'none'`; replaced
  with `<iframe>` (permitted by `default-src 'self'` for same-origin PDFs).
- **Mobile nav** — More-menu and topbar divider failed to hide at ≤430px because `voice.css`
  (imported later) was winning the cascade; added `!important` to the mobile CSS rules.
- **Accessibility** — Combobox: added `role="combobox"`, `aria-expanded`, `aria-autocomplete`
  so screen readers announce it as a combobox, not a bare text field.
- **Accessibility** — Formpanel: labels were siblings without `for`/`id` pairing; added
  `htmlFor`/`id` association on every field type (text, email, select, textarea).
- **Accessibility** — Hidden file-picker inputs (attach + import settings) now carry
  `aria-hidden="true"` so they are invisible to assistive technology.
- **Accessibility** — Composer text input and the demo play-stop button were missing
  `aria-label`; both are now properly labelled for screen readers.
- **Tests** — `parsetree [extreme]` gauntlet fixture was O(exponential): `stressValue()` expanded
  `children` arrays ×10 (cap 50), creating ~27 000 SVG nodes at 3 levels of nesting. Capped
  `children`/`nodes` keys at 4 items; render time dropped from >20 s to 6 ms.
- **Canvas** — `BlockBoundary` now calls `console.error` in `componentDidCatch` so block render
  failures are visible in the browser console without crashing the canvas or the voice track.

### Removed

- Dead code — an unused descriptor system, an unused text-fitting module, and a chain of unused
  exports; `pnpm knip` now reports zero.

## [1.0.0]

Initial release. Two surfaces that share one component library and one stylesheet:

- **Demo** — a home library of spoken, two-voice persona conversations across a large
  visualization library (the "living canvas").
- **Live** — bring-your-own-key, multi-provider (Anthropic, OpenAI, Gemini, xAI Grok, OpenRouter)
  talk-to-a-real-model mode with a real canvas, two-voice TTS, and web search.

React 19 + Vite + TypeScript with a bespoke CSS design system; keys stay client-side; runs in
Docker.
