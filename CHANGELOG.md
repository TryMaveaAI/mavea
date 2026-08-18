# Changelog

All notable changes to Mavéa are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project aims to follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.0.1] - 2026-08-18

### Fixed

- **A downloaded conversation video no longer ends inside a spotlight.** The closing beat hands
  the canvas back and plays wide, carved out of the last scene so the cut still ends exactly
  where the narration does; the closing caption and Pen marks stay.
- **A map now names its places.** Each pin's name and detail line render in a numbered list
  beside the map — numbered to the circles themselves — instead of living only in a click-away
  popup. The list survives a map that fails to load, the same way a route keeps its stops.
- **First run: the speech questions come before the browser opens.** The window used to open
  over the terminal mid-prompt, so the voice and transcription setup was easy to never see and
  the first impression was silently captions-only. `npx @mavea/mavea` now asks first, then opens.
- **`npx @mavea/mavea` no longer reports a running voice as missing.** The reachability probe
  hit the service roots, and Kokoro's root answers 404 — so every start offered to set up
  speech services that were already up. It probes the health endpoints now.
- **Repeat starts stop rebuilding speech images the machine already has.** Compose builds only a
  missing image now (the whisper tag carries its version, so a version bump still builds), on
  Docker and Podman alike.

### Changed

- The README and setup guide say plainly what is free and what is metered: the model call is
  billed by the provider under your key; the app and both speech services run locally at no
  per-use cost, and published transcripts or voiced videos owe no fee and no credit line.

## [2.0.0] - 2026-08-18

### Added

- **What a session cost is now visible** (Settings → Model): tokens sent, how much of that was
  billed at the cached rate, tokens written back, and which pass spent them. Mavéa is BYOK, so
  every one of those calls was billed to your key — tokens only, never a guessed currency figure,
  and nothing is stored or sent anywhere.
- The dock's explanation-level chip says what it is. It rendered a bare word ("Standard") beside
  the voice and model chips, so the one control there that isn't self-evident read as a mystery.

### Changed

- **The gap between speaking and being answered isn't blank any more.** When the mic closed, every
  "I'm hearing you" indicator vanished at once while the words were still being transcribed —
  which read as not having been heard. The face now holds a working state through it, the
  listening card holds with its bars stilled instead of unmounting, and the mic button keeps a
  slowed pulse rather than just dimming. It starts about 1.3 seconds earlier than it could have:
  the mic reports that you have plainly stopped before its own hangover window closes the
  utterance, and takes that back if you were only pausing mid-thought. A transcription that lands
  inside 300ms changes nothing, so a fast machine never flashes.
- **A backgrounded tab stops animating.** Every ambient loop in the app — the landing's aurora, a
  card's glow, a hundred-odd others — kept repainting for nobody while the tab sat behind another
  window. They now pause while the tab is hidden, and a landing section pauses its own once it has
  scrolled entirely out of view. Nothing you can see ever changes.
- The demo images ship as AVIF (2.2MB → 1.6MB), and the component reference examples load per
  answer instead of arriving as one 390KB block held for the whole session (~19KB now stays
  resident). Both make the first load smaller and the session lighter.
- Answers below the drawer are generated when you open it, not on every rich turn. Six blocks were
  written into every answer whether or not anyone opened the drawer they live behind — the most
  expensive tokens in a turn, spent on content nobody had asked to see. Opening it now generates
  them once and caches them permanently.

- **A video export no longer takes exactly as long as the video.** Frames were stamped at real
  elapsed time, so a machine that rasterised slowly stretched them into a slideshow and a fast one
  gained nothing. The export now runs on its own clock — frame `n` belongs at `n/fps` whenever it
  finishes — so a weak machine produces the same sharp file, just later, and a strong one finishes
  ahead of real time. The face is drawn as its own small layer over a cached background, the
  preview stops rendering a second full-size copy while a render is in flight, and a rasterizer
  that fails now says so instead of quietly writing a blank video.
- **Audio is a choice in the export sheet**, on by default. Turning it off skips speech synthesis
  entirely — captions still pace themselves from the same estimate that drives the duration meter
  — which is also the cheapest path on a weak machine. Narration that does need synthesising is
  now made two lines at a time instead of all at once, which is what used to peg the fan.
- The in-sheet Share button is gone. On desktop it was a share that silently downloaded, then said
  it had shared; there is now one honest "Download video" action on both tabs.
- **What a turn costs the model has come down** without changing what it can do: only the leading
  few components carry a worked example, the per-turn prompt now sits inside the cached prefix on
  Anthropic instead of after it, a repair pass no longer resends the whole component menu, a
  speculative glimpse is billed as a glimpse rather than at a reasoning model's floor, and a
  prefetched suggestion is reused across turns instead of being thrown away and paid for twice.

### Fixed

- **Local storage stops silently losing data.** Every store capped itself, but they share one
  browser quota and the caps sum past it, so whichever store wrote last simply failed — and said
  nothing. A refused write now sheds the oldest entry of the largest cache and retries, never
  touching anything that isn't a cache, and says so once if it still cannot land.
- **The scrubber's waveform stops repainting itself sixty times a second** while a line plays: the
  bars are drawn once per track and the playhead is a clip, so playback commits to React about
  once a second instead of once a frame.
- Speech no longer wakes up ~470 times to ask whether it can queue the next window, and the audio
  thread parks itself after 30 seconds of silence rather than idling for the whole session.
- **A streamed answer stops rebuilding itself as it arrives.** Each closed block used to land in
  its own render, and a mid-stream flip (a new block family arriving, the first section-tagged
  block landing) tore the whole grid down and replayed every card's entrance. Blocks now fold into
  one paint per frame, the loading placeholders hand their grid cell to the real card instead of
  being replaced wholesale, and the section decision is made once per answer.
- **A returning dark-mode reader no longer gets a light flash on load.** The boot splash had no
  way to know the stored choice before the bundle ran; it now takes the system setting as its
  guess and yields to the real choice the instant it's known.
- The hero no longer reflows when its display font lands: the fallback is now metric-matched to
  Newsreader, so the text occupies the same box before and after.
- **The on-device semantic model (~7MB) is fetched when you reach for the composer**, not on the
  first keystroke or click anywhere in Live. The behaviour its own comment described was never
  what the code did — scrolling the page or dismissing a hint counted as "about to ask".
- Glass blur now goes away where it's supposed to. 29 stylesheets hardcoded their own blur radius
  and so ignored the performance tier that exists to shed exactly that cost on weak machines.
- The face's mouth keeps moving on the main conversation surface when another surface is also
  showing a face. Live was the one mount that never registered as a voice-energy target.

## [1.2.1] - 2026-08-17

### Fixed

- **The legal acknowledgement could not be scrolled, so on a short window there was no way past
  it.** The gate is a document, but the app shell it appears over locks the viewport
  (`html, body { overflow: hidden }`) and a hash route change never unloads that lock — so a card
  taller than the window was clipped at the fold with the two consent checkboxes and Continue
  underneath it, unreachable by wheel, keys or scrollbar. The gate now re-asserts document
  scrolling the way the Terms and Privacy pages already did.
- `pnpm dev` recovers from a broken Docker credential helper again. The retry handed Docker a
  replacement config directory holding only empty auths, which also discarded the directory Docker
  Desktop keeps `compose` in — so the rescue attempt failed with `unknown command: docker compose`
  and local speech never started. It now keeps the real plugin directory in view.

## [1.2.0] - 2026-08-17

### Added

- The daily search budget is adjustable from any dashboard's Settings, under "Every dashboard" —
  one shared cap across all boards, because what it guards is the total daily spend on your key.
- **An ordinary answer's figures now prove themselves.** Prove it lists every figure the answer
  printed and what backs it: grounded ones quote the source's own sentence, and the rest are marked
  as the model's own rather than left to look measured. The living answer had refused an unbacked
  number since it shipped; every other answer printed its numbers straight from block props, so the
  rule held on exactly one surface.
- **A cause can be opened into its parts**, drawn through the component library rather than a fixed
  chart — and a part can be opened in turn. A subject whose parts nothing measured is named in a
  list instead of drawn as a proportion, because a hierarchy figure implies measured shares.
- The guided walkthrough's living-answer chapter now walks itself, cause by cause. Its line has
  always promised a narration nobody could trigger on a replay.

### Changed

- The Terms, Privacy Notice, and Disclaimer now cover tracked readings (stored per tracker in
  IndexedDB, encrypted, deleted with the dashboard) and state plainly that tracked or "live"
  values are best-effort and depend on the model you pick — a completed search can still surface
  out-of-date figures, alerts are never guaranteed to arrive, and every check spends on the key
  you supplied. The dashboards first-use notice says the same in plain words, and the alerts card
  itself now carries the don't-rely-on-this line. The in-app acceptance version was bumped, so
  existing users are shown the updated documents once.
- The default daily search budget is 25 (was 40), sized from the app's own cadence math: hourly ≈
  up to ~24 checks/day while Mavéa is open, so out of the box the cap covers one always-on hourly
  board. Running more than that is a deliberate spend choice you make by raising the knob; manual
  actions like Refresh now were never counted against it.

- **A dashboard check now fetches data, not a rendered card.** Checks used to ask the model to
  rebuild a finished canvas block — exact component type, exact prop names, nested item shapes —
  which made it responsible for Mavéa's rendering contract; any drift discarded a grounded search
  you had already paid for. Data-shaped cards (lists, tables, timelines, charts) now come back in a
  one-line schema and Mavéa builds the component itself. Cards that carry prose keep the old path.
- **Readings are kept per tracker in IndexedDB**, encrypted with the same device key as the rest of
  a dashboard, instead of being folded into the one blob that was rewritten whole on every write.
- Only one browser tab runs the refresh loop now. Every extra open tab used to run its own
  scheduler and bill your key again for the same checks.
- **A living answer is offered on the answer, not the question.** Asking "why" is not the same as
  getting back something with causes in it, so the offer is judged on what the answer actually
  contains — no more opening a causal web onto an answer that has none.
- **The "show only what is sourced" filter is gone.** Measured across every scenario, not one
  receipt carried a followable link or document anchor, so the control promised a reader something
  it could never show them.

### Fixed

- **Dashboard checks asked for live data and accepted an answer from memory.** The search tool was
  offered but never required, so a model could skip it and reply from training data; the reply was
  correctly discarded, after being billed for. Checks now require the search.
- Creating a tracker no longer waits on its first check. It used to hold the sheet open for the
  length of a real web search — routinely 30-60 seconds — with the finished board invisible behind
  it.
- **A tracker that cannot complete its first check is kept, not deleted.** A provider hiccup used
  to make a tracker you had just described disappear. It now stays, marked as waiting, and says
  what it is waiting on. Nothing unverified is ever shown either way.
- Each failure now names its own cause — a rate limit, a rejected key, an unreachable provider, a
  search that grounded nothing — and retries on a schedule that fits it, instead of one message and
  one five-minute retry for all of them.
- "What happened on the last check?" on a dashboard shows the steps that check actually took, so a
  failure can be diagnosed without a network panel.
- Check all stops after a whole round fails at the provider, instead of spending the rest of your
  per-minute quota collecting the same error.
- The dashboards surface scrolls again — content below the fold had become unreachable.
- An ask-the-user form card can no longer be pinned onto a dashboard; a dashboard's values come
  from live search.
- **Three places a living answer could state a figure with nothing behind it.** Source excerpts
  never reached it, so every figure failed the verbatim check however good the sources were; an
  arrow's share was drawn without any source stating that share, which sized the ribbons by an
  unproven number; and a date could place a cause on the timeline unproven, where the position
  _is_ the claim.
- A new turn could leave the answer blank instead of drawing it.
- A pen mark aimed at a collapsed section landed on empty space, next to nothing.
- Breaking down a cause that had itself come from a breakdown did nothing at all, and the fold-up
  control on one did nothing either.
- A cause could be named by a truncated slug ("consumer-switch-to-digit") or, with an invisible
  label, by nothing at all — leaving a nameless card, a nameless lever, and a sentence with no
  subject.
- Long connector labels in a flow diagram were drawn wider than the gap between the shapes and
  painted over by them, leaving the reader a sliver of each word.

## [1.1.0] - 2026-08-16

### Added

- **The living answer.** A "why" answer can now open into the causal web behind it: one spec
  rendered as four representations — what led to what, how much each cause was measured to
  explain, when each happened, and what each one measured. "Walk me through it" flies the camera
  cause to cause while the narration speaks lines composed from the spec itself — zero model
  calls, so the walk replays free on your own key. A what-if re-runs the cascade locally and
  re-weights the world in place, stated in prose.
- **Dashboards refresh anywhere in Mavéa.** The refresh loop now lives at the app root instead
  of inside the Dashboards tab, so a tracker on a cadence keeps checking while you're on Live or
  the landing — and in Present, the wall view whose entire point is updating on its own, which
  previously never refreshed at all. Manual-cadence trackers are still never auto-checked, and
  every cost guard (visibility, budget, missing key) travels with the loop.

### Changed

- **The Rehearsal and The Table are one feature now: Rehearse.** One Practice-menu entry covers
  both seats: send your Mavéa to negotiate against the stand-in (the old Table), or take the
  seat yourself and say your own lines against the counterpart in character, spoken aloud, with
  a coach card between takes (the old Rehearsal). Searching "table" in ⌘K still lands on it.
- A first-time visitor lands on the Paper template in light — an answer is something to read,
  and the first impression should look composed. The other skins stay one click away.

### Fixed — the dashboards actually update now

Everything below was found by driving the real product with a real key and watching where the
data died.

- **A refreshed card kept reading "no new data" while every check grounded.** The refresh prompt
  told the model only a block's type name plus its current content — an empty skeleton on a
  never-filled board — so the model invented its own field names and the validator rejected the
  very data the search had just paid for. Every reachable block type now teaches its exact prop
  shape in the refresh prompt, a list salvages an alien-but-real item instead of discarding the
  fetch, a standalone tile may keep a single-item list (the two-item floor is a canvas
  composition rule), and a pinned composite card — which could never refresh at all — now can.
- **OpenAI refreshes died thinking.** gpt-5.x meters hidden reasoning out of the same output
  budget, and search turns run at medium effort where reasoning routinely burns thousands of
  tokens; the flat budget floor was sized for low. Every dashboard check failed with "used its
  entire output budget on reasoning" — billed reasoning plus billed search, zero data. The floor
  now scales with the effort the adapter itself chose.
- **Creating a tracker was fragile and sometimes expensive.** The add-time reality gate no
  longer fires a second identical search behind the automatic first check (one addition billed
  two searches), gives a failed probe the same bounded patience a busy slot gets (a per-minute
  rate window no longer kills a create), explains the wait while a probe runs, and names the
  actual reason in the check log when an addition is refused — an ungrounded topic, a missing
  model, and an unreachable model are three different fixes.
- **A rolled-back addition vanished without a trace.** The reality gate's rollback is now
  recorded in the check log whether or not the sheet that started it is still open.
- **Asking a dashboard about its own numbers answered "I don't have live access — paste the
  values."** Talk-to-dashboard ran with search off; it now searches like the refresh path, and
  an ask-the-user form block can no longer be pinned onto a board at all — a dashboard's values
  arrive from live search, never from a pasted form.
- **Hydration races on encrypted state.** `#/dashboards` now waits for the encrypted trackers
  and API keys to decrypt before mounting — previously a tracker created in that window was
  deleted as "no model" with a key configured — the pin sheet no longer latches the pre-decrypt
  empty list, and a cross-tab write no longer blanks the other tab's board list (permanently, if
  the device key had rotated).
- **Quality-of-life honesty.** Background checks no longer reshuffle the tracker grids; Check
  now responds on the press instead of after its chunk loads, and a double-tap can't spend a
  second call; the metric input follows a value refreshed underneath it; a full localStorage now
  says that changes may not survive a reload instead of losing them silently; a deleted
  tracker's open-history is pruned with it; and the surface scrolls again regardless of
  stylesheet order — the detail page had shipped with everything below the fold unreachable.
- A journey card (storystrip) no longer dies on **Next** when the model invents a panel icon —
  unknown icon names fall back safely, and the schema now drops hallucinated icons at any depth
  for every extended block.
- Mavéa's drawn marks re-measure when a card's content moves under them (a chart re-sorting, a
  trace expanding inside its own scroller), numbered pen chips no longer park on ink an earlier
  mark already drew, a lasso in tight quarters hugs its words instead of grazing the labels
  around them, and ink inside an inner scroll region is no longer drawn slightly off on a
  spotlit card.

## [1.0.11] - 2026-07-23

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

### Fixed — shipping the npm package

- **`npx @mavea/mavea` silently did nothing.** npm/npx installs `bin` entries as a symlink, and
  the CLI's "is this the main module" check compared an unresolved symlink path against the
  module's real path — they never matched, so `main()` ran zero times with no error and exit
  code 0. Fixed by resolving both sides through the real filesystem path before comparing, and
  added a regression test that reproduces npm's actual symlink mechanism (the existing smoke
  test invoked the file directly, with no symlink involved, so it could never have caught this).
- **Published under `@mavea/mavea`, not `mavea`.** npm's anti-typosquatting check blocks new
  unscoped package names it judges too similar to existing ones; scoping sidesteps it.
- **The README's mascot images didn't render on npm's package page.** Relative image paths
  resolve against GitHub's raw-content host, which requires authentication for a private repo —
  they now load from jsDelivr's npm CDN instead, which serves straight from the published
  package regardless of the source repo's visibility.
- Release publishing no longer requests npm provenance attestation, which npm rejects outright
  for a private source repository.

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
