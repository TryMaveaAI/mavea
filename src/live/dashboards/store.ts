// dashboards/store.ts — persistence for living dashboards. Same idiom as living/library/memory:
// an in-memory cache + localStorage + a CustomEvent broadcast, with a coerce guard that filters
// malformed records (never throws). A dashboard is deliberate, so the cap is generous (24); when it
// overflows, the least-recently-updated one falls off. Heavy inline data: URIs inside widget blocks
// are stripped before persist so one generated image can't fill the quota.
//
// The hard contract enforced here: a refresh touches metric VALUES and tripwire STATES only — never
// the thesis. updateMetricValue / updateTripwireStates exist precisely so the loop can't reach for a
// blunt setter and rewrite your reasoning.
//
// Content at rest: a dashboard's thesis/metrics/widgets can carry real business-sensitive data
// (the CFO/business-review use case this app supports), so it's encrypted on disk
// (contentVault.ts), never plaintext. Web Crypto is async-only, so reads stay a two-step dance:
// a synchronous fast path handles legacy plaintext (and the crypto-unavailable fallback) directly
// via JSON.parse and re-encrypts it once read (migrate-on-read); real ciphertext isn't valid
// JSON, so that fast path degrades to "nothing yet" and a background hydrate decrypts it and
// broadcasts the existing DASHBOARDS_EVENT once it lands. `invalidate()` (cross-tab sync) re-runs
// that same hydrate.
import { AI_CADENCE_MIN, nextDue, nextDataDue } from './cadence';
import { encryptContent, decryptContent } from '../contentVault';
import type {
  Cadence,
  CadenceWindow,
  Dashboard,
  DashSource,
  MetricSpec,
  Prediction,
  PredictionGrade,
  TripwireState,
  Tripwire,
  ValueOrigin,
  Verdict,
  Widget,
  WidgetSpan,
} from './types';
import type { Block } from '../../data/conversation';
import { friendlyAsk } from '../friendlyAsk';

const STORAGE_KEY = 'mavea-dashboards-v1';
export const DASHBOARDS_EVENT = STORAGE_KEY;
/** Fired when a write is dropped for lack of storage space — a canary, not a blocker: the app
 *  keeps working off the in-memory cache, but a listener (settings/usage UI) can tell the user
 *  their last change may not survive a reload instead of that failing in total silence. */
export const DASHBOARDS_QUOTA_EVENT = `${STORAGE_KEY}:quota`;
/** Dashboards are deliberate artifacts, but bounded so localStorage stays healthy. */
const MAX_DASHBOARDS = 24;
/** Per-dashboard caps — the living-store "more is a token furnace" rule. Exported so the add
 *  flows can refuse a full board BEFORE spending a planning call, not after. */
export const MAX_WIDGETS = 12;
const MAX_INLINE_STRING = 4096;
/** Ring size for a metric's value history — enough points for an honest sparkline/area chart
 *  without letting a fast-cadence metric grow the (encrypted, re-written-whole) blob unbounded. */
const METRIC_HISTORY_CAP = 60;
/** Ring size for graded predictions — the "calls this week" record. */
const MAX_PREDICTION_HISTORY = 20;

let cache: Dashboard[] | null = null;
let idSeq = 0;

/** A stable id, preferring crypto.randomUUID with a deterministic-ish fallback (test/SSR). */
export function newDashboardId(): string {
  try {
    const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
    if (c?.randomUUID) return c.randomUUID();
  } catch {
    /* no crypto */
  }
  idSeq += 1;
  return `dash-${idSeq.toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}

/** Deep-clone a dashboard, dropping large inline data: URIs so one widget image can't fill quota. */
function stripHeavy(d: Dashboard): Dashboard {
  const json = JSON.stringify(d, (_k, v) =>
    typeof v === 'string' && v.length > MAX_INLINE_STRING && v.startsWith('data:') ? '' : v,
  );
  return JSON.parse(json) as Dashboard;
}

function isObj(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object';
}
function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}
function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

/** '5min' was renamed to '15min' (the fastest data cadence is now 15 minutes, not 5) — map an
 *  already-persisted dashboard's old value forward instead of letting it silently fall through
 *  to an unrecognized string, which would park its clock at MAX_SAFE_INTEGER (see cadence.ts's
 *  nextDue) and make a previously auto-refreshing dashboard silently stop refreshing at all. A
 *  record with NO cadence.data at all (malformed, or hand-built in a test) falls back to manual
 *  — the same "never auto-search without being told to" default every creation path now uses,
 *  rather than quietly opting a recovered dashboard into standing hourly search spend. */
function coerceDataCadence(v: unknown): Dashboard['cadence']['data'] {
  if (v === '5min') return '15min';
  return str(v, 'manual') as Dashboard['cadence']['data'];
}

function coerceHistoryPoint(v: unknown): { at: number; value: number } | null {
  if (!isObj(v)) return null;
  const at = v.at;
  const value = v.value;
  if (typeof at !== 'number' || !Number.isFinite(at)) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return { at, value };
}

/** Metrics otherwise pass through un-typechecked (today's permissive behaviour, unchanged) — the
 *  one thing worth sanitizing on read is `history`, since a corrupt or missing ring must never
 *  grow past the cap or crash a sparkline on a bad point. */
function coerceMetric(v: unknown): MetricSpec | null {
  if (!isObj(v)) return null;
  const rawHistory = Array.isArray(v.history) ? v.history : [];
  const history = rawHistory
    .map(coerceHistoryPoint)
    .filter((p): p is { at: number; value: number } => p !== null)
    .slice(-METRIC_HISTORY_CAP);
  return { ...(v as unknown as MetricSpec), history: history.length ? history : undefined };
}

function coerceCadenceWindow(v: unknown): CadenceWindow | undefined {
  if (!isObj(v)) return undefined;
  const startAt = v.startAt;
  const endAt = v.endAt;
  if (typeof startAt !== 'number' || !Number.isFinite(startAt)) return undefined;
  if (typeof endAt !== 'number' || !Number.isFinite(endAt) || endAt <= startAt) return undefined;
  return { label: str(v.label), startAt, endAt, origin: v.origin === 'search' ? 'search' : 'user' };
}

function coercePrediction(v: unknown): Prediction | undefined {
  if (!isObj(v) || typeof v.text !== 'string' || !v.text) return undefined;
  return { text: v.text, at: num(v.at, 0) };
}

function coercePredictionHistory(v: unknown): PredictionGrade[] {
  if (!Array.isArray(v)) return [];
  const out: PredictionGrade[] = [];
  for (const g of v) {
    if (!isObj(g) || typeof g.expected !== 'string' || !g.expected) continue;
    const result = g.result;
    if (result !== 'hit' && result !== 'miss' && result !== 'unclear') continue;
    out.push({
      at: num(g.at, 0),
      expected: g.expected,
      result,
      ...(typeof g.note === 'string' && g.note ? { note: g.note } : {}),
    });
  }
  return out.slice(-MAX_PREDICTION_HISTORY);
}

/** Drop an expired live-event window so a dashboard doesn't carry a dead `cadence.window` around
 *  forever — the window is a one-off, self-cleaning the moment `now` passes its `endAt`. */
function cleanCadenceWindow(cadence: Cadence, now: number): Cadence {
  if (!cadence.window || now <= cadence.window.endAt) return cadence;
  const { window: _expired, ...rest } = cadence;
  return rest;
}

/** The dashboard "chrome" widgets — their props are PROJECTED from live dashboard state at render
 *  time (project.ts), never frozen content, so they're never backfill candidates below. */
const CHROME_WIDGET_TYPES = new Set([
  'thesis',
  'alignmentgauge',
  'standingalerts',
  'sourceslineage',
]);

/** A widget pinned before refreshQuery existed never got a chance to store the question that
 *  produced it — without one it stays frozen forever, exactly the "one-time snapshot" a living
 *  dashboard isn't supposed to be. Reconstruct a reasonable stand-in from the dashboard's own
 *  title/question plus the widget's own label: not the exact original wording, but close enough
 *  to keep old pins alive instead of leaving them dead. Never touches a metric-linked or chrome
 *  widget (those already refresh their own way, or are always current by construction). */
function backfillRefreshQuery(widgets: Widget[], title: string, question: string): Widget[] {
  const topic = question || title;
  if (!topic) return widgets;
  return widgets.map((w) => {
    if (w.refreshQuery?.trim() || w.metricId || CHROME_WIDGET_TYPES.has(w.block.type)) return w;
    const label = (w.block as { props?: { title?: unknown } }).props?.title;
    const ask = typeof label === 'string' && label.trim() ? `${topic} — ${label.trim()}` : topic;
    return { ...w, refreshQuery: ask };
  });
}

/** Coerce one stored record into a valid Dashboard, or null if it's unusable. Permissive about
 *  optional fields, strict about the load-bearing ones (id, a thesis, the arrays). */
function coerceDashboard(v: unknown): Dashboard | null {
  if (!isObj(v)) return null;
  const id = str(v.id);
  if (!id) return null;
  const thesis = isObj(v.thesis) ? v.thesis : null;
  const widgets = Array.isArray(v.widgets)
    ? (v.widgets.filter((w) => isObj(w) && isObj((w as { block?: unknown }).block)) as Widget[])
    : [];
  const cad = isObj(v.cadence) ? v.cadence : {};
  const alerts = isObj(v.alerts) ? v.alerts : {};
  const verdict = coerceVerdict(v.lastVerdict);
  const title = str(v.title, 'Untitled');
  const question = friendlyAsk(str(v.question));
  const window = coerceCadenceWindow((cad as { window?: unknown }).window);
  const prediction = coercePrediction(v.prediction);
  const predictionHistory = coercePredictionHistory(v.predictionHistory);
  return {
    id,
    title,
    question,
    thesis: {
      text: str(thesis?.text),
      saidAt: num(thesis?.saidAt, 0),
    },
    tripwires: Array.isArray(v.tripwires) ? (v.tripwires as Tripwire[]) : [],
    metrics: Array.isArray(v.metrics)
      ? v.metrics.map(coerceMetric).filter((m): m is MetricSpec => m !== null)
      : [],
    sources: Array.isArray(v.sources) ? (v.sources as DashSource[]) : [],
    widgets: backfillRefreshQuery(widgets.slice(0, MAX_WIDGETS), title, question),
    cadence: {
      data: coerceDataCadence((cad as { data?: unknown }).data),
      ai: str((cad as { ai?: unknown }).ai, 'manual') as Dashboard['cadence']['ai'],
      ...(window ? { window } : {}),
    },
    smartTrigger: typeof v.smartTrigger === 'boolean' ? v.smartTrigger : true,
    alerts: {
      inApp: (alerts as { inApp?: unknown }).inApp !== false,
      push: (alerts as { push?: unknown }).push === true,
    },
    ...(typeof v.topic === 'string' && v.topic ? { topic: v.topic } : {}),
    createdAt: num(v.createdAt, 0),
    updatedAt: num(v.updatedAt, 0),
    ...(typeof v.lastTouchedByUserAt === 'number' && Number.isFinite(v.lastTouchedByUserAt)
      ? { lastTouchedByUserAt: v.lastTouchedByUserAt }
      : {}),
    nextDataAt: num(v.nextDataAt, 0),
    nextAiAt: num(v.nextAiAt, Number.MAX_SAFE_INTEGER),
    ...(typeof v.oneShotAt === 'number' && Number.isFinite(v.oneShotAt)
      ? { oneShotAt: v.oneShotAt, oneShotLabel: str(v.oneShotLabel) }
      : {}),
    ...(prediction ? { prediction } : {}),
    ...(predictionHistory.length ? { predictionHistory } : {}),
    lastRefreshedAt:
      typeof v.lastRefreshedAt === 'number' && Number.isFinite(v.lastRefreshedAt)
        ? v.lastRefreshedAt
        : null,
    ...(v.lastDataOutcome === 'updated' ||
    v.lastDataOutcome === 'no-change' ||
    v.lastDataOutcome === 'unverified'
      ? { lastDataOutcome: v.lastDataOutcome }
      : {}),
    ...(verdict ? { lastVerdict: verdict } : {}),
    ...(typeof v.lastVerdictAttemptAt === 'number' && Number.isFinite(v.lastVerdictAttemptAt)
      ? { lastVerdictAttemptAt: v.lastVerdictAttemptAt }
      : {}),
    ...(typeof v.lastVerdictError === 'string' && v.lastVerdictError
      ? { lastVerdictError: v.lastVerdictError }
      : {}),
  };
}

/** A stored verdict is only kept if it has real text; sources/tripwireId pass through if present.
 *  `grounded` defaults to false for a pre-existing stored verdict that predates the field — the
 *  conservative read (never retroactively call an old, unlabeled verdict "grounded"). */
function coerceVerdict(v: unknown): Verdict | null {
  if (!isObj(v) || typeof v.text !== 'string' || !v.text) return null;
  return {
    text: v.text,
    at: num(v.at, 0),
    grounded: v.grounded === true,
    ...(Array.isArray(v.sources) ? { sources: v.sources as Verdict['sources'] } : {}),
    ...(typeof v.tripwireId === 'string' ? { tripwireId: v.tripwireId } : {}),
  };
}

/** True once `cache` reflects a real source (a persisted write, or the async hydrate below) —
 *  guards a slow, late-arriving decrypt from clobbering a fresher write made while it was
 *  in flight. */
let settled = false;
/** Bumped on every write attempt; a write only lands if it's still the latest by the time its
 *  encryption resolves, so two writes racing (a migrate vs. a real save, or two quick saves)
 *  can't land out of order and leave a stale copy on disk. */
let writeGen = 0;

function decode(parsed: unknown): Dashboard[] {
  if (!Array.isArray(parsed)) return [];
  return parsed.map(coerceDashboard).filter((d): d is Dashboard => d !== null);
}

/** Write the encrypted blob to disk, but only if no newer write has started since — otherwise a
 *  slow migrate-write (or an earlier save) could resolve after a fresher one and clobber it. */
async function writeEncrypted(dashboards: Dashboard[]): Promise<void> {
  const gen = ++writeGen;
  try {
    if (typeof localStorage === 'undefined') return;
    const enc = await encryptContent(dashboards);
    if (gen !== writeGen) return; // a newer write has since started — don't overwrite it
    localStorage.setItem(STORAGE_KEY, enc);
  } catch (err) {
    // Quota / private mode: the app keeps running off the in-memory cache, but a dropped write is
    // worth telling someone about rather than pretending it landed — see DASHBOARDS_QUOTA_EVENT.
    // Do not rely on `instanceof DOMException`: Firefox uses
    // NS_ERROR_DOM_QUOTA_REACHED/code 1014, and errors crossing an iframe/realm fail the
    // instanceof check even when they are genuine storage quota failures.
    const storageError = err as { name?: unknown; code?: unknown } | null;
    const isQuotaError =
      !!storageError &&
      (storageError.name === 'QuotaExceededError' ||
        storageError.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
        storageError.code === 22 ||
        storageError.code === 1014);
    if (isQuotaError) {
      try {
        if (typeof window !== 'undefined' && typeof CustomEvent === 'function') {
          window.dispatchEvent(new CustomEvent(DASHBOARDS_QUOTA_EVENT));
        }
      } catch {
        /* non-browser env */
      }
    }
  }
}

/** Synchronous read: legacy plaintext (or the crypto-unavailable fallback) parses directly as
 *  JSON — upgrade it to ciphertext right after. Real ciphertext doesn't parse, so this degrades
 *  to empty; hydrateAsync below decrypts it moments later. */
function fromStorage(): Dashboard[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const dashboards = decode(JSON.parse(raw));
    if (dashboards.length) void writeEncrypted(dashboards);
    return dashboards;
  } catch {
    return [];
  }
}

/** Background decrypt of an already-encrypted store. Run once eagerly at module load, and again
 *  from `invalidate()` so a cross-tab write (which lands encrypted) is actually picked up — a
 *  synchronous re-read alone can't decrypt it. A no-op when the on-disk value is already plain
 *  JSON (the synchronous path above already handled it). */
async function hydrateAsync(): Promise<void> {
  try {
    if (typeof localStorage === 'undefined') return;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
      JSON.parse(raw);
      return; // plain JSON — the synchronous fast path already covered this
    } catch {
      /* not plain JSON — try decrypting it below */
    }
    const dashboards = decode(await decryptContent(raw));
    if (settled) return; // a real write landed while we were decrypting
    cache = dashboards;
    settled = true;
    if (typeof window !== 'undefined' && typeof CustomEvent === 'function') {
      window.dispatchEvent(new CustomEvent(DASHBOARDS_EVENT, { detail: dashboards }));
    }
  } catch {
    /* corrupt, or this device's content key was rotated/cleared — not restored */
  }
}
let hydration = hydrateAsync();

/** Resolve after the latest encrypted dashboard read finishes. */
export function whenDashboardsHydrated(): Promise<void> {
  return hydration;
}

function get(): Dashboard[] {
  cache ??= fromStorage();
  return cache;
}

/** Drop the in-memory cache so the next read reflects another tab's write (the `storage` event
 *  fires only in OTHER tabs, against this tab's stale cache). useDashboards calls this. The write
 *  it needs to see lands encrypted, so this also re-arms the async decrypt (settled goes false
 *  again) rather than only clearing the synchronous cache. */
export function invalidate(): void {
  cache = null;
  settled = false;
  hydration = hydrateAsync();
}

/** Keep the MAX_DASHBOARDS the user last actually touched; evict the rest. Sorts by
 *  `lastTouchedByUserAt` (falling back to `updatedAt` for a dashboard predating that field), NOT
 *  `updatedAt` alone — a cross-dashboard batched refresh bumps `updatedAt` on every member at
 *  once, which would make eviction order effectively random and unfairly evict a manual-cadence
 *  dashboard the user cares about (never auto-bumped) ahead of ones the loop happens to touch. */
function capList(list: Dashboard[]): Dashboard[] {
  if (list.length <= MAX_DASHBOARDS) return list;
  return [...list]
    .sort((a, b) => (b.lastTouchedByUserAt ?? b.updatedAt) - (a.lastTouchedByUserAt ?? a.updatedAt))
    .slice(0, MAX_DASHBOARDS);
}

function persist(next: Dashboard[]): void {
  // Route through the same decode() a disk read uses, so a same-session cache hit can never be
  // less validated than a genuine reload would be.
  const clean = decode(next);
  cache = clean;
  settled = true;
  void writeEncrypted(clean);
  try {
    if (typeof window !== 'undefined' && typeof CustomEvent === 'function') {
      window.dispatchEvent(new CustomEvent(DASHBOARDS_EVENT, { detail: clean }));
    }
  } catch {
    /* non-browser env */
  }
}

/** Apply `fn` to the matching dashboard, bump `updatedAt`, and persist. No-op if not found.
 *  `userTouch` additionally bumps `lastTouchedByUserAt` — pass it only from a genuinely
 *  user-initiated edit (settings, layout, a Blank Space fill), never from the refresh loop, so
 *  eviction (capList) can tell real engagement apart from an automated background touch. */
function patchOne(
  id: string,
  fn: (d: Dashboard) => Dashboard,
  now = Date.now(),
  opts: { userTouch?: boolean } = {},
): void {
  let touched = false;
  const next = get().map((d) => {
    if (d.id !== id) return d;
    touched = true;
    return {
      ...fn(d),
      updatedAt: now,
      ...(opts.userTouch ? { lastTouchedByUserAt: now } : {}),
    };
  });
  if (touched) persist(next);
}

/* ---- reads ---- */

// getDashboards is a useSyncExternalStore snapshot — it MUST return the same array reference
// when nothing has changed, or React treats every render as a store update. Memoize the sort
// against whichever `cache` array it was computed from, rather than sorting fresh each call.
let sortedSnapshot: Dashboard[] | null = null;
let sortedFrom: Dashboard[] | null = null;

/** Every dashboard, most-recently-updated first. */
export function getDashboards(): Dashboard[] {
  const c = get();
  if (sortedFrom !== c || sortedSnapshot === null) {
    sortedSnapshot = [...c].sort((a, b) => b.updatedAt - a.updatedAt);
    sortedFrom = c;
  }
  return sortedSnapshot;
}
export function getDashboard(id: string): Dashboard | null {
  return get().find((d) => d.id === id) ?? null;
}

/* ---- lifecycle ---- */

/** Add a freshly-built dashboard (front of the list), stripping heavy data and capping the store.
 *  Creating a dashboard is unambiguously a user action, so this stamps `lastTouchedByUserAt` for
 *  callers (createBlankDashboard, buildDashboard, instantiate.ts) that don't set it themselves. */
export function addDashboard(dash: Dashboard): void {
  const stamped = { ...dash, lastTouchedByUserAt: dash.lastTouchedByUserAt ?? dash.updatedAt };
  persist(capList([stripHeavy(stamped), ...get().filter((d) => d.id !== dash.id)]));
}

/** Merge dashboards from an imported backup. Each is coerced through the same decode() a disk read
 *  uses (a hand-edited/malicious file yields dropped items, never a crash), then upserted by id —
 *  never deleting a dashboard the bundle doesn't carry. On an id collision the newer `updatedAt`
 *  wins, so a stale backup can't clobber fresher local edits. Returns how many valid dashboards the
 *  input yielded. */
export function mergeDashboards(raw: unknown[]): number {
  const incoming = decode(raw);
  if (!incoming.length) return 0;
  const byId = new Map(get().map((d) => [d.id, d]));
  for (const d of incoming) {
    const existing = byId.get(d.id);
    if (!existing || d.updatedAt >= existing.updatedAt) byId.set(d.id, d);
  }
  persist(capList([...byId.values()]));
  return incoming.length;
}

/** A blank dashboard with no thesis/metrics/tripwires — the lightweight kind you start by pinning
 *  a single card onto it (not the thesis-tracking kind the extraction flow builds). Cadence is
 *  manual and the clocks are parked, so the refresh loop never tries to fetch for it (it has
 *  nothing to refresh until real metrics are added). */
export function createBlankDashboard(opts: {
  title: string;
  question?: string;
  topic?: string;
  now?: number;
}): Dashboard {
  const now = opts.now ?? Date.now();
  return {
    id: newDashboardId(),
    title: opts.title || 'Untitled dashboard',
    question: opts.question ?? '',
    thesis: { text: '', saidAt: now },
    tripwires: [],
    metrics: [],
    sources: [
      {
        kind: 'ORIGIN',
        conversationId: 'pin',
        title: opts.title || 'Pinned cards',
        contributed: 'Started by pinning a card.',
        at: now,
      },
    ],
    widgets: [],
    cadence: { data: 'manual', ai: 'manual' },
    smartTrigger: false,
    alerts: { inApp: true, push: false },
    ...(opts.topic ? { topic: opts.topic } : {}),
    createdAt: now,
    updatedAt: now,
    nextDataAt: Number.MAX_SAFE_INTEGER,
    nextAiAt: Number.MAX_SAFE_INTEGER,
    lastRefreshedAt: null,
  };
}

/** Wrap a canvas Block as a dashboard widget. Wider blocks (charts/timelines) get a 2-col span so
 *  they don't get squeezed; everything else is a single tile. The captured values are a snapshot —
 *  a pinned card doesn't auto-refresh (it has no metric binding). */
export function blockToWidget(block: Block, fromSource = 'pin', refreshQuery?: string): Widget {
  const WIDE = new Set(['chart', 'plot', 'dualaxis', 'bars', 'timeline', 'breakdown', 'table']);
  return {
    id: 'w-pin-' + Math.random().toString(36).slice(2, 9),
    block,
    span: (WIDE.has(block.type) ? 2 : 1) as WidgetSpan,
    fromSource,
    ...(refreshQuery?.trim() ? { refreshQuery: refreshQuery.trim() } : {}),
  };
}

/** Generic field patch — settings only (title, alerts, smartTrigger). Never used by the refresh loop
 *  for values (those go through updateMetricValue / updateTripwireStates), and never for `cadence`
 *  (see updateCadence) — a raw merge there would leave nextDataAt/nextAiAt pointed at the OLD mode's
 *  clock, so a dashboard switched from manual to an active cadence would never become due. */
export function updateDashboard(id: string, patch: Partial<Dashboard>): void {
  patchOne(id, (d) => ({ ...d, ...patch }), undefined, { userTouch: true });
}

/** Change a dashboard's data/AI cadence AND rewind the matching clock to match — otherwise a switch
 *  away from 'manual' would stay parked at the creation-time MAX_SAFE_INTEGER sentinel forever, since
 *  nextDataAt/nextAiAt only ever advance from inside markDataRefreshed/markAiRefreshed, which the
 *  refresh loop reaches only once the OLD clock says a dashboard is due. */
export function updateCadence(
  id: string,
  patch: Partial<Dashboard['cadence']>,
  now = Date.now(),
): void {
  patchOne(
    id,
    (d) => {
      const cadence = { ...d.cadence, ...patch };
      return {
        ...d,
        cadence,
        ...(patch.data !== undefined ? { nextDataAt: nextDataDue(cadence, now) } : {}),
        ...(patch.ai !== undefined ? { nextAiAt: nextDue(now, AI_CADENCE_MIN[cadence.ai]) } : {}),
      };
    },
    now,
    { userTouch: true },
  );
}

export function removeDashboard(id: string): void {
  const rest = get().filter((d) => d.id !== id);
  if (rest.length !== get().length) persist(rest);
}

export function clearDashboards(): void {
  if (get().length > 0) persist([]);
}

/* ---- layout (edit mode) ---- */

export function reorderWidgets(id: string, fromIdx: number, toIdx: number): void {
  patchOne(
    id,
    (d) => {
      const w = [...d.widgets];
      if (fromIdx < 0 || fromIdx >= w.length || toIdx < 0 || toIdx >= w.length) return d;
      const [moved] = w.splice(fromIdx, 1);
      w.splice(toIdx, 0, moved);
      return { ...d, widgets: w };
    },
    undefined,
    { userTouch: true },
  );
}

export function setWidgetSpan(id: string, widgetId: string, span: WidgetSpan): void {
  patchOne(
    id,
    (d) => ({
      ...d,
      widgets: d.widgets.map((w) => (w.id === widgetId ? { ...w, span } : w)),
    }),
    undefined,
    { userTouch: true },
  );
}

export function removeWidget(id: string, widgetId: string): void {
  patchOne(id, (d) => ({ ...d, widgets: d.widgets.filter((w) => w.id !== widgetId) }), undefined, {
    userTouch: true,
  });
}

/** Add one widget (or one pin's worth of them) to a dashboard, in a single persist. `at` places
 *  them at a specific index — pin.ts lands a fresh card ahead of older content instead of
 *  appending it blind below the fold; omitted, it appends (the palette's behaviour). When the
 *  add carries provenance (a Talk pin's "Asked: …" row), `source` records it in the SAME write —
 *  a separate appendSource would re-encrypt the whole blob a second time for one action. */
export function addWidget(
  id: string,
  widget: Widget | Widget[],
  opts: { at?: number; source?: DashSource } = {},
): void {
  const added = Array.isArray(widget) ? widget : [widget];
  if (added.length === 0) return;
  patchOne(
    id,
    (d) => {
      const at = Math.max(0, Math.min(opts.at ?? d.widgets.length, d.widgets.length));
      const merged = [...d.widgets.slice(0, at), ...added, ...d.widgets.slice(at)];
      // Over the cap, evict from the tail — but never the chrome cards (sources, alerts, thesis,
      // alignment), which templates keep at the end: a head-inserted pin on a full board would
      // otherwise silently delete the Sources card. Content is evicted newest-position-last;
      // chrome survives; if somehow ALL slots are chrome, the plain tail cut applies.
      let widgets = merged;
      if (merged.length > MAX_WIDGETS) {
        const removable = merged.filter((w) => !CHROME_WIDGET_TYPES.has(w.block.type));
        const overflow = merged.length - MAX_WIDGETS;
        if (removable.length >= overflow) {
          const evict = new Set(removable.slice(-overflow).map((w) => w.id));
          widgets = merged.filter((w) => !evict.has(w.id));
        } else {
          widgets = merged.slice(0, MAX_WIDGETS);
        }
      }
      return {
        ...d,
        widgets,
        ...(opts.source ? { sources: [...d.sources, opts.source].slice(-MAX_SOURCES) } : {}),
      };
    },
    undefined,
    { userTouch: true },
  );
}

/** Late-bind the standing refreshQuery on the widgets of one confirmed pin — written by pin.ts
 *  when its background refine resolves; until then the raw ask already stored on each widget
 *  keeps refreshes working. One write for the whole pin. Not a user touch: the pin itself was;
 *  this is its automated completion, not fresh engagement. */
export function setWidgetRefreshQuery(id: string, widgetIds: string[], refreshQuery: string): void {
  const q = refreshQuery.trim();
  if (!q || widgetIds.length === 0) return;
  const ids = new Set(widgetIds);
  patchOne(id, (d) => ({
    ...d,
    widgets: d.widgets.map((w) => (ids.has(w.id) ? { ...w, refreshQuery: q } : w)),
  }));
}

/** Persist a reordered widget list (the final order after a drag). Ids not present are ignored;
 *  any widget missing from `orderedIds` is kept appended, so a stale id can never drop a widget. */
export function setWidgetOrder(id: string, orderedIds: string[]): void {
  patchOne(
    id,
    (d) => {
      const byId = new Map(d.widgets.map((w) => [w.id, w]));
      const ordered = orderedIds.map((wid) => byId.get(wid)).filter((w): w is Widget => !!w);
      const seen = new Set(ordered.map((w) => w.id));
      const rest = d.widgets.filter((w) => !seen.has(w.id));
      return { ...d, widgets: [...ordered, ...rest] };
    },
    undefined,
    { userTouch: true },
  );
}

/* ---- lineage (append-only) ---- */

/** Cap on retained lineage sources. They're tiny (url/title/timestamps), but a dashboard folded
 *  into many times would otherwise grow this array without limit — bound it like every other list
 *  on the dashboard, keeping the most recent provenance. */
const MAX_SOURCES = 24;

export function appendSource(id: string, src: DashSource): void {
  patchOne(id, (d) => ({ ...d, sources: [...d.sources, src].slice(-MAX_SOURCES) }), undefined, {
    userTouch: true,
  });
}

/** Per-dashboard metric cap — keeps a long-lived dashboard from becoming a token furnace. */
export const MAX_METRICS = 12;

/** Fold a later conversation's components into an existing dashboard: append new metrics, tripwires,
 *  and widgets, and record an ADDED source — all in one write. Reasoning already on the dashboard is
 *  untouched (this only adds). Caps keep it bounded. */
export function foldInto(
  id: string,
  add: { metrics: MetricSpec[]; tripwires: Tripwire[]; widgets: Widget[]; source: DashSource },
): void {
  patchOne(
    id,
    (d) => ({
      ...d,
      metrics: [...d.metrics, ...add.metrics].slice(0, MAX_METRICS),
      tripwires: [...d.tripwires, ...add.tripwires].slice(0, MAX_METRICS),
      widgets: [...d.widgets, ...add.widgets].slice(0, MAX_WIDGETS),
      sources: [...d.sources, add.source].slice(-MAX_SOURCES),
    }),
    undefined,
    { userTouch: true },
  );
}

/** Append a real observation to a metric's history ring, capped — a null value (no real reading)
 *  is never recorded, so the ring stays an honest, gap-free record of actual checks. */
function appendHistory(
  existing: MetricSpec['history'],
  at: number,
  value: number | null,
): MetricSpec['history'] {
  if (value === null) return existing;
  const next = [...(existing ?? []), { at, value }];
  return next.length > METRIC_HISTORY_CAP ? next.slice(-METRIC_HISTORY_CAP) : next;
}

/* ---- refresh-driven value updates (the only setters the loop may use) ---- */

export function updateMetricValue(
  id: string,
  metricId: string,
  value: number | null,
  raw: string | undefined,
  origin: ValueOrigin,
  now = Date.now(),
): void {
  patchOne(
    id,
    (d) => ({
      ...d,
      metrics: d.metrics.map((m) =>
        m.id === metricId
          ? {
              ...m,
              lastValue: value,
              lastRaw: raw,
              origin,
              asOf: now,
              history: appendHistory(m.history, now, value),
            }
          : m,
      ),
    }),
    now,
    // origin:'user' is a Blank Space fill — a genuine user edit; origin:'search' is the refresh
    // loop's own write and must never count as user engagement.
    { userTouch: origin === 'user' },
  );
}

export function updateTripwireStates(id: string, tripwires: Tripwire[], now = Date.now()): void {
  patchOne(id, (d) => ({ ...d, tripwires }), now);
}

/** A verdict call succeeded — store it, and stamp this AS the last attempt (a success is itself a
 *  successful attempt), clearing any earlier failure note so the card doesn't keep flagging a
 *  problem that's since resolved. */
export function setVerdict(id: string, verdict: Verdict, now = Date.now()): void {
  patchOne(
    id,
    (d) => ({ ...d, lastVerdict: verdict, lastVerdictAttemptAt: now, lastVerdictError: undefined }),
    now,
  );
}

/** A verdict call ran but came back empty (analyzeMove returned null) — record the attempt and an
 *  honest, brief reason so the card can say so instead of silently keeping the stale prior verdict
 *  and implying it's still current. Never touches `lastVerdict` itself. */
export function markVerdictFailed(id: string, now: number, message: string): void {
  patchOne(id, (d) => ({ ...d, lastVerdictAttemptAt: now, lastVerdictError: message }), now);
}

/** A data refresh ran — wind the data clock + the honest "last refreshed" marker. `outcome`
 *  records whether this specific pass actually found anything new, so the UI can say "updated"
 *  only when that's true instead of always claiming success just because an attempt happened. */
export function markDataRefreshed(
  id: string,
  now = Date.now(),
  outcome: 'updated' | 'no-change' = 'updated',
): void {
  patchOne(id, (d) => {
    const cadence = cleanCadenceWindow(d.cadence, now);
    return {
      ...d,
      cadence,
      nextDataAt: nextDataDue(cadence, now),
      lastRefreshedAt: now,
      lastDataOutcome: outcome,
    };
  });
}

/** A data refresh ATTEMPT died (network, quota, auth) — schedule a soon retry WITHOUT touching
 *  lastRefreshedAt/lastDataOutcome. A failed call never happened as far as the honest clock is
 *  concerned ("updated 35m ago" over a dash, when every attempt 429'd, reads as a working
 *  dashboard that found nothing — a lie), and winding the full cadence on a transient failure
 *  parks an hourly dashboard stale for an hour over a blip.
 *
 *  A DUE one-shot (set by the user, or the durable "first check" every new dashboard gets — see
 *  ensureFirstCheck) needs the same deferral: `isDataDue` fires on either clock, so leaving a due
 *  `oneShotAt` untouched would have the next 15s tick re-select this dashboard and retry
 *  immediately instead of waiting out `retryAt` — a network blip would hot-loop a fresh dashboard
 *  every tick until it happened to succeed. Push it out to match, never clear it early. */
export function markDataRetry(id: string, retryAt: number): void {
  patchOne(id, (d) => ({
    ...d,
    nextDataAt: retryAt,
    ...(d.oneShotAt !== undefined && d.oneShotAt < retryAt ? { oneShotAt: retryAt } : {}),
  }));
}

/** Arms the durable "first check" every fresh dashboard with live content gets: a one-shot due
 *  right now, so the fetch survives a keyless/reloaded creation and fires on the first tick once
 *  a model IS connected — instead of the immediate `refreshDashboardNow` creation kicks being the
 *  only chance at ever populating. Never overwrites a REAL one-shot (a time the user explicitly
 *  stated, or a grounded refresh's own liveWindow discovery) — those carry meaning this one
 *  doesn't, so only an empty slot gets claimed. Not a user touch; this is bookkeeping, not an edit. */
export function ensureFirstCheck(id: string, now = Date.now()): void {
  patchOne(id, (d) =>
    d.oneShotAt === undefined ? { ...d, oneShotAt: now, oneShotLabel: 'first check' } : d,
  );
}

/** An AI verdict ran — wind the AI clock. */
export function markAiRefreshed(id: string, now = Date.now()): void {
  patchOne(id, (d) => ({ ...d, nextAiAt: nextDue(now, AI_CADENCE_MIN[d.cadence.ai]) }));
}

/** The ONLY setter that writes `cadence.window` — rewinds `nextDataAt` immediately (a future
 *  window parks until its start; a currently-live one is due now). `window: null` clears it (e.g.
 *  the user cancels a match-only tracker). A `'user'` origin (the user stated the time themselves)
 *  counts as a user touch; a `'search'` origin (the engine discovered it while refreshing) does
 *  not — it's an automated finding, not an edit. */
export function setCadenceWindow(id: string, window: CadenceWindow | null, now = Date.now()): void {
  patchOne(
    id,
    (d) => {
      const cadence: Cadence = window
        ? { ...d.cadence, window }
        : { ...d.cadence, window: undefined };
      return { ...d, cadence, nextDataAt: nextDataDue(cadence, now) };
    },
    now,
    { userTouch: window?.origin === 'user' },
  );
}

/** A single scheduled check at a known future moment, instead of a recurring cadence — always a
 *  user edit (only ever set from a time the user explicitly stated). */
export function setOneShot(id: string, at: number, label: string, now = Date.now()): void {
  patchOne(id, (d) => ({ ...d, oneShotAt: at, oneShotLabel: label }), now, { userTouch: true });
}

/** The refresh loop calls this once the scheduled check has run — an automated cleanup, not a
 *  user edit. */
export function clearOneShot(id: string, now = Date.now()): void {
  patchOne(id, (d) => ({ ...d, oneShotAt: undefined, oneShotLabel: undefined }), now);
}

export interface RefreshResultPatch {
  values?: { metricId: string; value: number | null; raw?: string; origin: ValueOrigin }[];
  blocks?: { widgetId: string; block: Widget['block'] }[];
  tripwires?: Tripwire[];
  outcome: 'updated' | 'no-change' | 'unverified';
  /** A one-shot check just ran — clear it so it doesn't fire again. */
  consumedOneShot?: boolean;
  /** A fresh "expects by next check" to stand from this pass. */
  expects?: string;
  /** Grades the CURRENT `prediction` (only meaningful when one exists) and moves it into
   *  `predictionHistory`; a `grade` with no standing `prediction` is silently ignored. */
  grade?: { result: PredictionGrade['result']; note?: string };
}

/** How soon an 'unverified' pass (a call that ran but never grounded in real search, even after
 *  refresh.ts's in-pass retry) gets another shot, instead of waiting out the dashboard's full
 *  cadence over what might just be one bad turn. */
const UNVERIFIED_RETRY_MS = 5 * 60_000;

/** Apply one whole batched-refresh pass — metric values (+ their history), rich-widget blocks,
 *  tripwire states, the honest clock, and (optionally) a prediction write/grade — in a SINGLE
 *  persist. A pass touching N metrics + M widgets used to cost up to N+M+2 separate
 *  encrypt-and-rewrite cycles (persist() re-encrypts the WHOLE blob every call); with per-metric
 *  history now living in that same blob, that write amplification stops being a rounding error.
 *  Still strictly value-scoped — thesis/sources/title are unreachable through this setter, and
 *  this is never a user touch (the refresh loop is automated, not an edit). */
export function applyRefreshResult(id: string, patch: RefreshResultPatch, now = Date.now()): void {
  patchOne(
    id,
    (d) => {
      const byMetric = new Map((patch.values ?? []).map((v) => [v.metricId, v]));
      const byWidget = new Map((patch.blocks ?? []).map((b) => [b.widgetId, b.block]));
      let prediction = d.prediction;
      let predictionHistory = d.predictionHistory;
      if (patch.grade && prediction) {
        const entry: PredictionGrade = {
          at: now,
          expected: prediction.text,
          result: patch.grade.result,
          ...(patch.grade.note ? { note: patch.grade.note } : {}),
        };
        predictionHistory = [...(predictionHistory ?? []), entry].slice(-MAX_PREDICTION_HISTORY);
        prediction = undefined;
      }
      if (patch.expects?.trim()) {
        prediction = { text: patch.expects.trim(), at: now };
      }
      const cadence = cleanCadenceWindow(d.cadence, now);
      const dueBase = nextDataDue(cadence, now);
      // 'unverified' still winds the honest clock (an attempt genuinely happened, after
      // refresh.ts's own in-pass retry already tried once more) — but for the FIRST unverified
      // pass in a streak, on a cadence that would auto-check again anyway, pull that recheck in
      // to UNVERIFIED_RETRY_MS rather than making a user wait out a full hourly/daily cadence over
      // what might just be a bad turn. A SECOND consecutive unverified winds the full cadence like
      // any other outcome — bounded, not a hot loop. Manual stays parked (Check Now IS the retry);
      // a not-yet-open live window is never pulled earlier than its own start.
      const nextDataAt =
        patch.outcome === 'unverified' &&
        d.lastDataOutcome !== 'unverified' &&
        dueBase !== Number.MAX_SAFE_INTEGER &&
        (!cadence.window || now >= cadence.window.startAt)
          ? Math.min(dueBase, now + UNVERIFIED_RETRY_MS)
          : dueBase;
      return {
        ...d,
        cadence,
        metrics: d.metrics.map((m) => {
          const v = byMetric.get(m.id);
          if (!v) return m;
          return {
            ...m,
            lastValue: v.value,
            lastRaw: v.raw,
            origin: v.origin,
            asOf: now,
            history: appendHistory(m.history, now, v.value),
          };
        }),
        widgets: d.widgets.map((w) => {
          const b = byWidget.get(w.id);
          return b ? { ...w, block: b } : w;
        }),
        ...(patch.tripwires ? { tripwires: patch.tripwires } : {}),
        ...(patch.consumedOneShot ? { oneShotAt: undefined, oneShotLabel: undefined } : {}),
        nextDataAt,
        lastRefreshedAt: now,
        lastDataOutcome: patch.outcome,
        prediction,
        predictionHistory,
      };
    },
    now,
  );
}

export type { TripwireState };
