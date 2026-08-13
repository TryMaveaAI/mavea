# Mavéa feature guide

The [README](../README.md) keeps it to the three things that make people say _whoa_. This is the
full tour. In the app you don't need to memorize it — press **⌘K** (Ctrl-K) to search the feature
index, or open the **Explore** menu in the top bar.

## The canvas

- 🎨 **A living canvas, not a chatbot** — ordinary Live selection uses **600 component contracts**;
  `#/gallery` production-renders **all 600 types**, including gated/surface-owned types and the two
  internal full-frame renderers. Charts, tables, flows, diagrams, documents, and the UI kit are all
  rendered by the same canvas code used in answers.
- 📰 **Voice-first design language** — the spoken answer leads as a serif headline above the
  evidence; data sits in mono; provenance reads as designed badges (LIVE / INFERRED / GROUNDED IN).
  Six **theme templates** (paper, daylight, ink, console, marquee, original), each a complete re-skin
  with its own light **and** dark — same answer, different room.
- ✨ **Builds a visual when none fits** — when nothing in the library suits an ask, Live can compose
  one on the fly — a freeform diagram, or a custom layout arranged from existing blocks — rendered
  with the same design tokens and safety boundary. This is on by default; disabling it removes those
  contracts from the model menu.
- 🎯 **Focus mode & Present mode** — flip any answer to a single hero card on a center stage with a
  live-thumbnail filmstrip, or go full theater: **Present** drops the chrome entirely, puts one slide
  on a dark stage with prev/next nav, and keeps the mic live so questions from the room become new
  canvases (tagged _from the room_ in the session rail).

## A friend at the whiteboard

- 🎙️ **It talks — and points while it talks.** The face speaks the headline the instant it streams,
  its mouth and body tracking the real audio. As it walks the answer, it **draws**: hand-style circles,
  underlines, and arrows land on the exact figure each spoken line is about (the model names its
  target; no reason, no ink). A **teach mode** ("walk me through it") draws more generously. Turn
  off the **Mavéa's voice** toggle to reveal the complete answer immediately without disabling the
  microphone.
- 👻 **It answers while you talk** — mid-sentence, dashed _forming / maybe_ ghost cards sketch the
  answer taking shape behind your words, reshaping as the sentence changes direction (off on the Fast
  quality dial — speculation is a spend you opt into).
- ✏️ **Edit its mind** — generated answers can state their read of the constraints as chips
  ("Tokyo trip" · "late April" · "~$2,500 each"). Tap one, fix it, and a correction turn
  re-renders the answer without requiring you to restate the whole ask.
- ⚡ **Blocks fuse** — pin two or more cards (the per-card **Ask** affordance) and hit **"Fuse N into
  one"** to have Mavéa answer the real relationship across their data, grounded in every pinned
  block's actual props, honest about correlation versus cause.
- 🌙 **Whisper in, whisper out** — after 10 PM the room dims and the voice drops to an ember ("won't
  wake anyone"). 🚶 **Think-out-loud** banks a whole ramble without answering, then a single
  _"thoughts?"_ sorts your own words into decisions, todos, and contradictions.
- 🗺️ **Watch me think** — talk for a minute and Mavéa maps your thinking as you speak, clustering it
  into the **themes that emerge from your own words** (never a fixed set of categories) with the
  tension threads between what pulls against what. When you settle the shape, it becomes a kept canvas
  — ask about it, share it as a Mavéa Story, or let it stay as the prompt for what's next.

## Time as a medium

- 🕰️ **Scroll back & replay** — settled turns are captured: step through the conversation, re-see a canvas
  a later turn cleared, replay any moment with its narration, spotlight tour, and drawn gestures.
- 🔊 **Scrub the voice, the canvas time-travels** — the settled answer's real spoken track renders as
  a waveform; drag it and the blocks un-build to exactly what had been _said_ by that moment, then
  rebuild as the voice replays.
- 🔭 **Semantic zoom** — pinch out and the session reads as chapters; pinch again and the whole night
  is one breath. **Recap** ("Tonight, so far.") folds it into one screen of real moments.
- 🩹 **Self-healing history** — when an answer genuinely reverses an earlier claim it says so, and the
  earlier moment is visibly marked _corrected_ (was → now) instead of history silently disagreeing
  with itself.
- 🗺️ **Your Atlas** — kept conversations and remembered topics as a flyable map, clustered into
  neighborhoods named by your own words.

## It keeps living

- 📚 **A library that stays warm** — by default, completed canvases are kept on your device as
  moments cards (the ask, findings, and headline stat), searchable and resumable from a welcome hub
  that asks **"What are we figuring out?"** You can disable or clear the library at any time.
- 📊 **Living dashboards** — turn a conversation into a dashboard that refreshes on its configured
  cadence while Mavéa is open (`#/dashboards`), with its checks and estimated provider cost visible.
- 🔄 **Bendable answers** — a calculation answer can carry its model-authored formula; drag the one
  number worth dragging and the outputs recompute in front of you, auditable.
- ◌ **The Blank Space** — when an answer turns on something only you can know (a real deadline, your
  budget, a dealbreaker), Mavéa is designed to leave a glowing
  hole right in the answer. Fill it by typing, speaking, or dragging a card in, hit **Complete**, and
  the same answer finishes with your real values. Uncertainty made honest, beautiful, and interactive.
- ✍️ **Ink is the interface** — mark the answer like a whiteboard: **circle** a value to explain it,
  **cross out** what to drop, **underline** what matters, draw an **arrow** between two things,
  **bracket** a group, put a **"?"** where you're lost. Each mark grounds the next turn on exactly that
  **part** — a single bar, row, or value, not the whole card. A pen draws anywhere; mouse and touch arm
  the **Mark** tool, and the gesture itself is the message (no typing required).
- 🧠 **It can remember you (optional)** — durable facts with per-fact provenance ("you said so" vs
  inferred, with controls intended to keep inferred material distinct), grouped, editable, exportable,
  and stored on this device. While Memory is enabled, relevant facts are included in later requests
  to the selected model provider. It can apply a stored correction or stated format/depth preference
  without a separate model call. Off by default.

## Reach & trust

- 🔌 **Bring your own model** — Anthropic, OpenAI, Gemini, OpenRouter, or xAI Grok behind one
  adapter. Keys stay in memory by default; optional remembering encrypts them locally. Requests
  carry the key and prompt through your deployment's same-origin proxy to the chosen provider. The
  proxy operator can access them in transit; provider privacy, retention, and usage-charge terms
  apply. The Connect step offers fast, lower-cost defaults where available; step up only when a task
  needs it.
- 🔎 **Search the web when it helps — your choice, your cost** — off, free (keyless Wikipedia), or
  real-time provider grounding (Gemini's cited Google search), fired only on asks that need it.
- 🧾 **Share-to-Mavéa, the receipts machine** — paste or drop any link or screenshot and the claim-check
  ask is ready: what's true, what's shaky, what's missing context, grounded in real sources.
- 🎭 **The Rehearsal** — prepare a hard conversation before you have it, in whichever seat helps.
  Send your Mavéa: it argues your side against a stand-in grounded in your notes, your stated
  boundaries enforced in code, and a debrief tells you what moved them, where you're exposed, and
  what to open with. Or take the seat yourself: you say your own lines, the counterpart answers in
  character (and out loud), and a coach card between takes says the one thing to change. The
  brief's context is sent to your selected model provider; no outside action is executed.
- 🎬 **Video** — Video Studio opens on **Conversation**, where you choose the exact turns to
  keep in chronological order; the current-turn, current-topic, and all-turn presets make the common
  cuts immediate. The preview plays your cut live — pause it whenever you like, and it holds a
  still frame instead of looping if your system asks for reduced motion. Narration is required and
  always on, while captions, spotlights, Mavéa Pen marks, and the face are optional. A conversation cut is plain
  16:9 screen video — pick the size (1080p 1920×1080 or 720p 1280×720) and a Balanced/High/Ultra
  quality tier — with a three-minute limit; social aspects live on the Reel tab. Supported
  browsers produce an easy-to-share MP4 carrying AV1 video with Opus audio,
  falling back to WebM (VP9/VP8 + Opus); H.264, H.265, AAC, and unspecified codec fallbacks are
  excluded. Published open-codec patent commitments reduce risk but are not a patent-clearance
  opinion. The separate **Reel** tab keeps the cinematic editorial recut, but its direction,
  rendering, and encoding are local and never call a configured model provider. Document Export is
  unchanged. 📌 **Ask about this** pins any
  block so the next question is grounded in its exact on-screen data.
- 🔍 **Transparency controls** — confidence labels, source citations, real-data-oriented rules, and
  a measured eval harness ([`pnpm eval`](BENCHMARK.md)). These controls do not guarantee accuracy.

## Find your way around

- ⌘ **Command palette** — press **⌘K** (or Ctrl-K) anywhere to search the feature index and jump
  straight to an available action; the **Explore** menu in the top bar opens the same index and surfaces the
  easily-missed gems (Watch me think, the Rehearsal).
