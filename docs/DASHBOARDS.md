# Living Dashboards

Turn a Live conversation into a persistent dashboard that carries your **reasoning**, refreshes
itself while Mavéa is open, and surfaces a change only when it moves **against the tripwires you
stated** — not generic news. The dashboard is a byproduct of talking, so it knows _why_ each number
matters, not just what it is.

## How to use it

**Get there:** the **"Living dashboards"** button on the home screen, the **Dashboards / How it
works** links in the surface's top nav, or `#/dashboards` directly. First time? **`#/dashboards/overview`**
("How it works") explains the whole flow.

**Create one (from a real conversation):**

1. Talk through a thesis, goal, or project in **Live** (`#/live`).
2. Open **Dashboards** → **"New from a conversation"** (or type straight into the **"Track
   anything"** composer bar on the Dashboards home). Mavéa plans what's worth watching and shows
   it for review — your own words on the left (highlighted GOAL / RISK / METRIC) for a
   conversation, or a toggleable metric/card list for a typed ask.
3. Pick **how often** — **Manual** (only when you ask) is preselected everywhere; the planner's own
   suggestion (e.g. "hourly") is offered as a labeled option, never applied silently. Keep what's
   right, name it, **Build/Create**. You land on the dashboard, already fetching: a real first check
   fires immediately, and — because that fetch is a no-op without a connected model — a **durable
   first-check** is armed too, so it survives a keyless session or a reload and fires itself the
   moment a model IS connected, on the very next tick.

**Live the dashboard:** it shows your verbatim **thesis**, an **alignment gauge** ("is my reasoning
still holding?"), **metric cards**, **standing alerts** (WATCHING / CLEAR / TRIGGERED), a **sources**
lineage (ORIGIN / ADDED / LINKED), and **talk-to-dashboard** (ask anything, grounded in this
dashboard's own widgets). **Edit layout** to drag-reorder (mouse / touch / arrow keys), resize
(S/M/L), remove, or add widgets. The **gear** opens settings.

**Making sure it actually fills:** every tile carries a small **"Check now"** affordance, and the
home grid's header has a **"Check all"** button for checking every live-content dashboard in one
pass — the everyday way anything populates now that manual is the default. If no model is
connected, a banner says so instead of leaving tiles unexplained on a bare "—". The first time a
dashboard fetches with a connected-but-not-remembered key, a quiet one-time card offers to **keep
the key on this device** (encrypted) so checks keep working after a reload — dismissible, never
re-asked.

## Transparency controls

- **Real-data only.** A metric value is search-grounded, supplied by you (a fillable "Blank Space"
  hole), or empty (`—` / "awaiting" / "not connected") when the validation path cannot ground it.
  This control reduces unsupported values but does not guarantee accuracy.
- **Honest clocks.** Refreshes happen only **while Mavéa is open** — there is no background-while-closed
  worker, and the UI says so. A dashboard's "updated" time is real: it distinguishes a pass that
  actually found something ("updated 4m ago") from one that ran and found nothing ("checked 4m ago —
  no new data"), from one that ran but never grounded in real search ("checked 4m ago — couldn't
  verify with sources" — refresh.ts retries once with a sharpened search demand before landing
  here), and calls out a dashboard with nothing live-fetchable at all rather than ever implying a
  refresh that couldn't do anything actually did. A **"Refresh now"** button (detail) / **"Check
  now"** (tile) / **"Check all"** (home) forces an on-demand pass on any cadence — the only way to
  update a dashboard set to Manual, the default for every new dashboard. A no-key tick is left
  fully due (no false "checked" stamp, no consumed schedule) rather than silently marked as a
  no-op pass — it fetches for real the moment a model connects.
- **Cost is awareness, not a price tag.** Settings show a qualitative **API-usage band** + an honest
  warning to check _your connected model's_ pricing — never invented dollar amounts or call counts.
  The "did this move against my reasoning?" model call fires only when a tripwire actually breaks
  (smart trigger) or on a schedule you choose; most days, none.

## Architecture

A dashboard is additive and isolated — its own lazy chunk, **zero impact on the Demo or the Live
answer canvas.**

- **Surface + logic:** `src/live/dashboards/` — `DashboardsApp` (hash sub-router: gallery / detail /
  settings / overview), `store.ts` (cache + `localStorage` + `CustomEvent`, the only setters the
  refresh loop may use — so a refresh can never rewrite your thesis), `useDashboards` hook,
  `extract.ts` (one structured model call + pure `coerceDraft` + grounded fallback + `buildDashboard`),
  `refresh.ts` (pure, free threshold engine: `evalDashboard` fires tripwires on the _transition_, plus
  two model-dependent fetches — `refreshData` for single-number metrics, `refreshWidgets` for RICH
  content), `analyze.ts` (the one gated verdict call), `relate.ts` (keep-current matching), `cost.ts`
  (usage awareness), `project.ts` (bespoke-widget props projected from state), `useDashboardLoop`
  (the foreground update loop + `refreshDashboardNow`/`checkAllDashboardsNow` for the manual
  triggers — visibility + busy gated; a no-key tick leaves due members untouched rather than
  running a fetch-free no-op pass). `useDataPending(id)` broadcasts whether a dashboard's data
  fetch is in flight right now — the tile/hero "Checking for live data…" shimmer, distinct from
  `useVerdictPending`'s narrower "the AI read itself is running" signal.
- **Widgets:** `src/canvas/blocks/dashboard/` — `thesis`, `alignmentgauge`, `standingalerts`,
  `sourceslineage` (rendered through the normal block registry; kept out of the model's selection
  catalog — see `META_OPTIONAL` in `tests/component-protocol.test.ts`). Metric/chart/feed widgets
  reuse existing blocks.
- **Data model:** `{ thesis (verbatim + date), tripwires[], metrics[], sources[], widgets[] (ordered,
spanned, each optionally carrying a `refreshQuery`), cadence, smartTrigger, alerts }`. Reasoning is
  stable; only metric values, widget content, and the tripwire states derived from them move on
  refresh.
- **Two kinds of "live":** a `MetricSpec` (a single number — a price, a KPI) refreshes via its
  `query`; a `Widget` pinned with a `refreshQuery` (the question that originally produced it)
  refreshes by re-asking that exact question with search and swapping in a freshly-generated block
  of the SAME type — the difference between "update a number" and "update a scores list, a
  timeline, anything that isn't reducible to one number." Both batch every refreshable item on the
  dashboard into a single call each, and both refuse to fabricate: no source, no update.
- **Update layers:** _your reasoning + conversations_ (free) · _threshold checks_ (free, deterministic) ·
  _the AI verdict_ (one call on your key, gated). See `#/dashboards/overview`.

## In Live

You can create a dashboard without leaving a conversation:

- **"+ Dashboard"** in the Live top bar opens the Extraction Preview over the current conversation.
- A quiet inline **"Track this live →"** pill appears in the answer footer when the model itself
  judges an answer genuinely worth tracking over time (rare by design — most answers score under
  50, reserved for the 80+ cases; see `trackLine` in `generateLive.ts` and `shouldOfferTrack` in
  `detect.ts`), offering to turn it into a dashboard.
- Tapping "**+**" on any individual answer card pins just that one card onto a dashboard — new or
  existing — carrying the question that produced it, so it refreshes like everything else here.
- The preview's **"Build from"** picker lets you choose the live conversation _or_ any saved Library
  conversation, so you're never limited to the latest.

The model-dependent value fetch + the gated "did this move against my reasoning?" verdict are best
confirmed with a connected BYOK model.
