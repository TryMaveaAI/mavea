<div align="center">

# Mavéa

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://cdn.jsdelivr.net/npm/@mavea/mavea@latest/docs/media/mascot-dark.svg" />
  <img src="https://cdn.jsdelivr.net/npm/@mavea/mavea@latest/docs/media/mascot-light.svg" width="150" alt="The Mavéa presence" />
</picture>

### Talk to AI. See what it means.

<!-- Screenshots are GENERATED, never hand-captured: `pnpm gen:media` re-shoots every image below
     from the recorded demo replays (scripts/capture-media.mts), so refreshing them after a UI change
     is a command rather than a chore. Served by absolute URL, not a repo-relative path: npm's
     package page cannot resolve those, and raw.githubusercontent serves the file that is on main. -->
<img src="https://raw.githubusercontent.com/TryMaveaAI/mavea/main/docs/media/hero.jpg" alt="Mavéa answering a trip-planning question: the spoken line above a canvas of cards" width="820" />

It listens, speaks the headline the instant it forms, then draws the answer — in charts, timelines,
and evidence you can check, marking the exact figure each line is about.
[See it in motion →](docs/FEATURES.md)

<p>
  <a href="https://github.com/TryMaveaAI/mavea/actions/workflows/ci.yml"><img src="https://github.com/TryMaveaAI/mavea/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI" /></a>
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black" alt="React 19" />
  <img src="https://img.shields.io/badge/TypeScript-6-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript 6" />
  <img src="https://img.shields.io/badge/Vite-8-646CFF?style=flat-square&logo=vite&logoColor=white" alt="Vite 8" />
</p>

```sh
npx @mavea/mavea
```

Opens `http://localhost:4173` — no install, no account, no model key required.

</div>

---

## What it looks like

Every answer is typed data, not prose — so Mavéa draws it. The same question renders as comparison
tables, checklists, timelines and figures, and the pen marks the exact claim it is talking about.

<img src="https://raw.githubusercontent.com/TryMaveaAI/mavea/main/docs/media/canvas-build.jpg" alt="An OAuth walkthrough: a protocol comparison table and a security checklist with Mavéa's pen marks on two items" width="880" />

<img src="https://raw.githubusercontent.com/TryMaveaAI/mavea/main/docs/media/canvas-plan.jpg" alt="A three-day Lisbon itinerary built as day-by-day cards under the spoken answer" width="880" />

Both are real recorded sessions — replay them yourself with no key via `npx @mavea/mavea`.

---

## Get started

All you need is **Node 20.19+**. That command above opens the tour and demo replays immediately
— nothing else to set up. Demo replays are fictional, curated prerecorded examples with scripted
feature choreography; playback does not call a model provider.

**To talk to a real model (Live):** click **"Open Mavéa"** and paste an Anthropic / OpenAI /
Gemini / Grok / OpenRouter key. It stays in memory unless you opt into encrypted local
remembering, and each provider request carries it through your same-origin proxy to that
provider — your key and prompts never pass through Mavéa's own servers, because there aren't
any. Full options — models, actions, hosting, and the trust boundary — are in
[docs/LIVE-SETUP.md](docs/LIVE-SETUP.md).

**Local speech:** Mavéa speaks through Apache-2.0
[Kokoro weights and wrapper](https://github.com/remsky/Kokoro-FastAPI) and transcribes through MIT-licensed
[whisper.cpp](https://github.com/ggml-org/whisper.cpp). The defaults run on your machine through
loopback-only proxies; a deployment that overrides `WHISPER_URL` sends microphone audio to that
configured endpoint. [Podman](https://podman.io/) is the recommended free/open-source
container runtime. Docker also works, but Docker Desktop has separate commercial subscription
terms. Without the configured services, captions and typing still work; audio is never handed to a
browser-vendor speech service as a fallback.

During a conversation, the **Mavéa's voice** toggle turns output speech off without changing the
microphone. A paced answer then reveals in full immediately, with captions, notes, and Pen marks in
place of the spoken walk.

## What it does

Mavéa is an AI you talk to and watch think. Ask out loud: a calm face listens, speaks the headline
the instant it forms, then steps aside while a living canvas draws the answer in charts, timelines,
and evidence you can check — composed from a catalog of **608 block types**. As it talks, it draws
on the answer, circling the exact figure each line is about. Sourced claims keep their links and
estimates can be labelled.

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

The full tour — Atlas, the Rehearsal, living dashboards, Ripple, selective Conversation video,
Mavéa Reels, and ~30 more —
is in [docs/FEATURES.md](docs/FEATURES.md). In the app, press **⌘K**.

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
alongside the browser and whatever else you already have open. **Recommended** adds the local
Kokoro + whisper.cpp services and a container runtime, with enough room that you never think about
it.

**Local speech costs real memory, and it's optional.** Kokoro holds roughly 1.3 GB resident;
whisper.cpp adds its local model and working memory; a desktop container VM adds its own overhead.
At the 8 GB minimum, leaving local speech off can be the better trade. `podman compose down` (or the
Docker equivalent) reclaims it whenever you want it back.

## Third-party commercial-use policy

Generated videos stay inside an explicit open-media allowlist — AV1 video with Opus audio in an
MP4 container where the browser can encode them, WebM (VP9/VP8 + Opus) otherwise. Mavéa does
not generate H.264, H.265, or AAC files or silently fall back to them. Published source licences
and patent commitments reduce risk but are not a universal patent-clearance opinion. Conversation and Reel direction, rendering, and
encoding stay local; opening Reel never calls a configured model provider. Narration uses the local
Kokoro service. Document and presentation exports use bundled permissively licensed libraries and
self-hosted SIL OFL fonts. Maps use BSD-licensed MapLibre with
OpenFreeMap, whose public service terms reviewed August 11, 2026 currently permit commercial use
without request fees; the required map attribution
stays visible. The Kokoro weights and wrapper are Apache-2.0; the separately pulled service image
also contains GPL-3.0-or-later eSpeak NG, whose license permits commercial use. Mavéa communicates
with that separate process over HTTP and does not bundle or link its code. whisper.cpp and its
selected model are MIT. The Kokoro image is pinned by immutable digest; the speech source archive
and model are revision-pinned and checksum-verified before execution. The npm package does not
contain either model or a container image: the user's container runtime fetches/builds those
artifacts directly. Podman is Apache-2.0 and recommended; Docker Desktop is not universally free
for commercial organizations, so users who choose it must confirm its terms.

`pnpm check:licenses` scans the installed dependency graph and fails on unapproved, noncommercial,
or strong-copyleft licenses. The same gate rejects generated-media codecs outside the reviewed allowlist,
provider-directed Reel generation, restricted tile-service fallbacks, and bundled
MP4/M4A/AAC/MP3/MOV files. `pnpm verify` and package publication both run this gate. Permissive
licenses can still require copyright notices or
attribution; those are preserved in [`THIRD-PARTY.txt`](THIRD-PARTY.txt) and
[`public/fonts/LICENSE.txt`](public/fonts/LICENSE.txt).

This automated gate is an engineering control, not a legal opinion: it cannot eliminate patent,
training-data, ownership-chain, provider-terms, or other third-party-claim risk. A commercial launch
that needs formal assurance should have counsel review the release artifact, notices, provider
terms, and the rights held by every Mavéa rights holder. Anyone who redistributes the Kokoro image
itself must also satisfy the GPL obligations carried by eSpeak NG inside that image.

## 📄 Mavéa license

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
