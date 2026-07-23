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
is about. Sourced claims keep their links and estimates can be labelled.

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

## Get started

All you need is **Node 20.19+**:

```sh
npx @mavea/mavea
```

That opens `http://localhost:4173` — the tour and demo replays work immediately, no model key
required.

**To talk to a real model (Live):** click **"Open Mavéa"** and paste an Anthropic / OpenAI /
Gemini / Grok / OpenRouter key. It stays in memory unless you opt into encrypted local
remembering, and each provider request carries it through your same-origin proxy to that
provider — your key and prompts never pass through Mavéa's own servers, because there aren't
any. Full options — models, actions, hosting, and the trust boundary — are in
[docs/LIVE-SETUP.md](docs/LIVE-SETUP.md).

**The voice:** Mavéa speaks through [Kokoro](https://github.com/remsky/Kokoro-FastAPI), a natural
local text-to-speech model that runs in Docker. The first time you start it, Mavéa offers to set
Docker up for you; without it, every line just appears as a caption instead — nothing else
changes.

## What it needs

Mavéa runs on your machine, not in a cloud.

|          | Minimum | Recommended |
| -------- | ------- | ----------- |
| **CPU**  | 4 cores | 8 cores     |
| **RAM**  | 8 GB    | 16 GB       |
| **Disk** | 3 GB    | 10 GB       |
| **Node** | 20.19+  | 20.19+      |

Any browser in [Baseline Widely Available](https://web.dev/baseline) — current Chrome, Edge,
Safari, or Firefox — on macOS, Windows, or Linux. **Minimum** covers the app with voice off,
alongside the browser and whatever else you already have open. **Recommended** adds Kokoro
(voice) and Docker on top, with enough room that you never think about it.

**The voice is the one part that costs real memory, and it's optional.** Kokoro's image holds
roughly 1.3 GB resident, and Docker Desktop itself adds another ~1.5 GB before a word is spoken.
At the 8 GB minimum, leaving voice off is usually the better trade — every line becomes a caption
and nothing else changes. `docker compose down` reclaims it whenever you want it back.

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
