<div align="center">

# Mavéa

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://cdn.jsdelivr.net/npm/@mavea/mavea@latest/docs/media/mascot-dark.svg" />
  <img src="https://cdn.jsdelivr.net/npm/@mavea/mavea@latest/docs/media/mascot-light.svg" width="150" alt="The Mavéa presence" />
</picture>

### Talk to AI. See what it means.

<!-- HERO GIF — the single highest-leverage thing in this README. Record a 10-second autoplay loop
     (voice asks → face listens → canvas blooms into charts → ink draws on the answer) from the Demo
     (needs no keys) or via "Share as a Mavéa Story", save it to docs/media/hero.gif, and uncomment
     the <img> below. Until then the signature-move line keeps the fold looking intentional. -->
<!-- <img src="docs/media/hero.gif" alt="Mavéa in ten seconds — voice in, a living canvas out" width="820" /> -->

It listens, speaks the headline the instant it forms, then draws the answer — in charts, timelines,
and evidence you can check, marking the exact figure each line is about.
[See it in motion →](docs/FEATURES.md)

<p>
  <!-- No CI status badge: GitHub Actions badges for a PRIVATE repo require authentication, so
       they 404 for anyone viewing this README anonymously (e.g. on npm's package page). Add one
       back the day this repo goes public. -->
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black" alt="React 19" />
  <img src="https://img.shields.io/badge/TypeScript-6-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript 6" />
  <img src="https://img.shields.io/badge/Vite-8-646CFF?style=flat-square&logo=vite&logoColor=white" alt="Vite 8" />
</p>

**Try it in one command:** `npx @mavea/mavea`

</div>

---

## What it does

Mavéa is an AI you talk to and watch think. Ask out loud: a calm face listens, speaks the headline
the instant it forms, then steps aside while a living canvas draws the answer in charts, timelines,
and evidence you can check. As it talks, it draws on the answer, circling the exact figure each line
is about. Sourced claims keep their links and estimates can be labelled. Provider keys stay in
memory by default; optional remembering encrypts them locally. Live requests send them through the
same-origin proxy you run or deploy, onward to the model provider you chose.

A few specific things worth trying:

- **Ink is the interface.** Draw on the answer to ask — circle a value to explain it, cross one
  out, arrow between two figures, drop a "?". The gesture grounds the next turn on that exact bar,
  row, or number.
- **It draws while it talks.** It speaks each headline as it streams, then lands hand-style circles
  and arrows on the figure it's narrating.
- **It answers while you talk.** Mid-sentence, dashed ghost cards sketch the answer taking shape
  behind your words, reshaping as your question turns.
- **It maps your thinking.** Ramble for a minute and Mavéa clusters your words into the themes that
  surface from what you actually said — never fixed buckets — with the tensions between them.
- **The Blank Space.** When an answer needs a number only you have, Mavéa leaves a hole to fill —
  by voice, type, or a dragged card — instead of quietly guessing.

The full tour — Atlas, Rehearsal, living dashboards, Ripple, Share-as-a-Mavéa-Story, and ~30 more —
is in [docs/FEATURES.md](docs/FEATURES.md). In the app, press **⌘K**.

## Two ways in

- **Demo replays** — recorded persona sessions (for example, a CFO reviewing her quarter or a
  parent planning dinner). Each answer was generated once by a real model and frozen; it replays
  on the same Live surface, without a key. The characters are fictional; the answers are real
  model output.
- **Live** — bring your own model (Anthropic, OpenAI, Gemini, xAI Grok, or OpenRouter) and ask
  anything by voice or text, answered on the same canvas.

Honesty is built in, not bolted on: confidence labels, sourced claims, and a Live
[eval harness](docs/BENCHMARK.md) that scores whether a model picks the right visualization and
labels its estimates honestly.

## Quick start

Just want to run it? All you need is **Node 20.19+**:

```sh
npx @mavea/mavea                # → http://localhost:4173 — tour + demo replays, no model key required
```

Working on the source? Use pnpm instead (`corepack enable` once to get the pinned version):

```sh
pnpm install
pnpm dev                  # → http://localhost:5173 — dev server, with voice
pnpm build                # → dist/ — production build
pnpm preview              # → http://localhost:4173 — serves dist/ exactly as npx @mavea/mavea does, voice included
```

| Command        | What it does                                                                                                                                                                                                                                                             |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm dev`     | Starts everything: brings up the Kokoro voice container, then Vite. If Docker isn't running, it says so and serves the app anyway — answers appear as captions instead of being spoken.                                                                                  |
| `pnpm dev:web` | Vite alone, no voice container. Faster to start if you don't need speech.                                                                                                                                                                                                |
| `pnpm build`   | Type-checks, then produces the production bundle in `dist/`.                                                                                                                                                                                                             |
| `pnpm preview` | Serves the `dist/` build with the exact server `npx @mavea/mavea` runs: same-origin `/tts` + `/llm` proxies included, and it offers to bring up the Kokoro voice container when Docker is present. Without Docker it says so in one line and answers appear as captions. |
| `pnpm test`    | Runs the Vitest suite once.                                                                                                                                                                                                                                              |
| `pnpm verify`  | The full pre-PR gate: reference-example + gallery-fixture freshness → typecheck → lint → format check → test → build → bundle-size budget → artifact + package boundary checks. Run this before opening a PR.                                                            |

That's the everyday set. The rest of the scripts (linting, evals, one-off audits, internal tooling)
are documented in full in [CONTRIBUTING.md](./CONTRIBUTING.md#scripts-reference).

**Talk to a real model (Live):** click **"Open Mavéa"** and paste an Anthropic / OpenAI / Gemini /
Grok / OpenRouter key. It stays in memory unless you opt into encrypted local remembering, and each
provider request carries it through your same-origin proxy to that provider. Full options — models,
actions, hosting, and the trust boundary — are in
[docs/LIVE-SETUP.md](docs/LIVE-SETUP.md).

**The voice:** Mavéa speaks through [Kokoro](https://github.com/remsky/Kokoro-FastAPI), a natural
local TTS — the one thing that runs in Docker. `pnpm dev` and `pnpm preview` both start it for
you; it's optional, and without it every line appears as captions. To run or stop it on its own:

```sh
docker compose up -d     # Kokoro TTS on :8880 — dev and preview both proxy /tts to it
docker compose down      # stop it (it otherwise stays up between dev sessions)
```

## What it needs

Mavéa runs on your machine, not in a cloud. One set of numbers covers both using it and working on
it, because the toolchain is the heavier of the two and it still isn't heavy.

|          | Minimum | Recommended |
| -------- | ------- | ----------- |
| **CPU**  | 4 cores | 8 cores     |
| **RAM**  | 8 GB    | 16 GB       |
| **Disk** | 3 GB    | 10 GB       |
| **Node** | 24.11+  | 24.11+      |

Both columns describe your whole machine rather than Mavéa's share of it, and neither is a bare
floor. **Minimum** is the app and its toolchain with the voice off, alongside the browser and editor
you already have open. **Recommended** adds the voice and Docker on top of that, with enough room
left that you never think about any of it. Any browser in
[Baseline Widely Available](https://web.dev/baseline) — current Chrome, Edge, Safari, or Firefox —
on macOS, Windows, or Linux.

For reference, Mavéa itself asks for far less, and it's worth knowing which part costs what.
`npx @mavea/mavea` serves a static build and the work happens in your browser tab: the page it loads
is 89 kB over the wire, and every surface becomes usable in under half a second on a CPU throttled
6×. The toolchain is heavier and still modest — a production build peaks around 1.6 GB of memory and
finishes in ~12 s, a full typecheck of all 2,200 TypeScript files peaks under 1 GB and takes ~3 s,
and a checkout with dependencies and a build output on disk comes to ~750 MB. Everything caches, so
only the first run after a fresh clone is slow.

**The voice is the one part that costs real memory, and it's optional.** Kokoro's image is 4.9 GB on
disk and holds ~1.3 GB resident, and Docker Desktop itself adds ~1.5 GB before a word is spoken.
Synthesis briefly takes a few cores, and runs ahead of the playhead rather than at it. At the 8 GB
minimum, leaving the voice off is usually the better trade: every line becomes a caption and nothing
else changes. `docker compose down` reclaims all of it; the
container otherwise stays up between sessions on purpose, so the next start is instant, and
`pnpm dev:web` starts Vite without bringing Docker up at all.

**Nothing here should make a fan audible.** The always-on costs are the animated face and the glass
blur, so rather than guessing from core count, Mavéa watches its own frame pacing for the first few
seconds and calms both if this particular machine is actually struggling — an integrated GPU choking
on blurred glass is invisible to a spec sheet. It waits for two bad windows before demoting, so one
hitch won't do it, and it never promotes back mid-session. You can also just decide for it:
**Visual richness → Lite** in Live's settings is a per-device choice that takes effect immediately.
Everything else is idle until you ask it something — the one part that will genuinely work a CPU is
voice synthesis, and that only runs if you started Docker.

## How it works

Mavéa is one conversation surface (Live) plus a marketing landing, hash-routed in `main.tsx`.
However a turn is triggered — voice, text, a chip, or a replayed demo frame — it resolves to
the same shape:

```
ask ─▶ generateLive ─▶ validate/repair ─▶ settle (merge + tour) ─▶ Presence (the face) + Canvas (the blocks)
```

The canvas is data, not components: every answer is a list of typed `{ type, props }` blocks
(`data/conversation.ts`). A model never emits UI — it emits those same blocks, which
`live/generateLive` streams, validates, and repairs into the `ConversationSpec` contract. The
demo replays are frozen outputs of this exact pipeline, so they render through the same
contract and renderer. The generated selection catalog contains **600 component contracts across
23 families**, and the gallery production-renders every one of them — including the types that are
gated or surface-owned rather than offered in ordinary model selection. Every provider sits behind
one `ProviderAdapter`; Live credentials and
prompts cross the same-origin proxy operated by whoever runs the deployment before reaching the
selected provider. This repository does not include a hosted account, analytics, or data-retention
service.

The full design — the turn contract, the validation core, the BYOK proxy diagram, and the eval
harness — is in [ARCHITECTURE.md](./ARCHITECTURE.md).

## Built with

A deliberately small stack — React 19, TypeScript 6, Vite 8 — with no chart library and no UI
framework beyond React: every chart, dial, diagram, and the face is hand-rolled SVG/CSS. Beyond
`react`/`react-dom`, the runtime stays lean: `@ricky0123/vad-web` (Silero VAD for end-of-speech)
plus a handful of feature-scoped libraries — KaTeX, Leaflet, jsPDF, pdfjs-dist, openchemlib,
mediabunny, modern-screenshot, pptxgenjs, and Shiki — each lazy-loaded only when that feature is used and
bundled rather than fetched from a CDN. JavaScript/TypeScript snippets run only after an explicit
click in a bounded Worker; Python execution is disabled until it has an equally isolated runtime.
The face is one hand-drawn SVG animated purely by CSS off `data-*` attributes — JS never transforms
it.

## Documentation

| Doc                                                        | What's in it                                               |
| ---------------------------------------------------------- | ---------------------------------------------------------- |
| [docs/FEATURES.md](./docs/FEATURES.md)                     | The detailed product feature tour                          |
| [ARCHITECTURE.md](./ARCHITECTURE.md)                       | The turn lifecycle, the seams, and how the pieces fit      |
| [docs/BENCHMARK.md](./docs/BENCHMARK.md)                   | The eval as a benchmark — score any model, leaderboard     |
| [docs/LIVE-SETUP.md](./docs/LIVE-SETUP.md)                 | Running Live: models, voice, actions, troubleshooting      |
| [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md)                 | Edge contract: TLS, HTTP/2/3, compression, cache, headers  |
| [docs/ADDING-A-COMPONENT.md](./docs/ADDING-A-COMPONENT.md) | The full contract + scaffold for a new canvas block        |
| [CONTRIBUTING.md](./CONTRIBUTING.md)                       | Setup, the full script reference, conventions, and recipes |
| [docs/ENGINEERING.md](./docs/ENGINEERING.md)               | The review rubric: security, scalability, readability      |
| [SECURITY.md](./SECURITY.md)                               | The BYOK security model and how to report a vulnerability  |
| [TERMS.md](./TERMS.md)                                     | Terms for using the software and connected features        |
| [PRIVACY.md](./PRIVACY.md)                                 | Local, provider, proxy, storage, and transfer data flows   |
| [DISCLAIMER.md](./DISCLAIMER.md)                           | Plain-language AI and third-party risk summary             |

## Feedback and maintenance

Issues with code-free bug reports and feature suggestions are welcome. This repository does not
accept external code, patch, or documentation pull requests; see [CONTRIBUTING.md](./CONTRIBUTING.md)
for the maintainer workflow and feedback rules. Maintainer changes are held to the
[engineering bar](./docs/ENGINEERING.md) (security, scalability, readability), and CI runs
`typecheck → lint → format → test → build` plus bundle, dependency, secret, and static-analysis
checks.

Two checks the unit suite can't make, both against a running `pnpm dev`:

```bash
pnpm audit:ui             # every block, 280px → 4K, both themes: clipped · overlapping · illegible
pnpm perf                 # every surface under CPU throttling — and nothing heavy loaded unasked
```

## 📄 License

Mavéa is **source-available under the
[PolyForm Noncommercial License 1.0.0](./LICENSE)**. It is not licensed under MIT and is not
distributed under an Open Source Initiative-approved open-source license. The PolyForm license
permits use, modification, and distribution only for purposes it defines as noncommercial.
Commercial use requires separate written permission or a separate license from the applicable
rights holder.

That restriction applies to recipients of the PolyForm license. It does not stop an applicable
rights holder from selling or commercially licensing Mavéa, offering it under different terms, or
transferring rights it owns or controls, including as part of an acquisition. Third-party
components remain under their own licenses.

Copies of the software must keep the license's required notice:

> Required Notice: Copyright (c) 2026 Akash Maitra and Aryan Chordia
