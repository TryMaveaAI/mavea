// dashboards/extract.ts — turn a Live conversation into a dashboard draft. The primary path is ONE
// structured model call over the transcript (the product's promise): the model reads what the user
// SAID and returns their verbatim thesis, the "reconsider if…" tripwires, and the metrics worth
// watching — each carrying its source quote. A pure coerceDraft owns correctness (drops fabricated
// thresholds, validates comparators, keeps quotes verbatim). When no model is connected we fall back
// to a grounded draft built from the conversation's real on-canvas blocks — weaker, but honest and free.
//
// Real-data-only is enforced here: a metric is either search-grounded (a query), the user's to supply
// (userSupplied → a Blank), or dropped. We never invent a metric value or a tripwire threshold.
import { getAdapter } from '../providers';
import type { ChatMessage } from '../providers/types';
import type { ModelConfig } from '../../types/mavea';
import type { TurnFrame } from '../history';
import { foldInto, newDashboardId } from './store';
import type {
  Cadence,
  Comparator,
  Dashboard,
  DashboardDraft,
  DashSource,
  DraftMetric,
  DraftTripwire,
  MetricSpec,
  SourceQuote,
  Tripwire,
  Widget,
  WidgetSpan,
} from './types';
import { nextDataDue } from './cadence';
import { parseLooseJson } from '../ground/json';
import { meaningfulTokens, normLabel } from '../ground/tokens';

const COMPARATORS = new Set<Comparator>([
  'gt',
  'gte',
  'lt',
  'lte',
  'crosses_up',
  'crosses_down',
  'pct_drop',
  'pct_rise',
]);

const EXTRACT_SYSTEM = `You extract a LIVING DASHBOARD from a conversation. The user has been talking through a thesis, goal, project, or set of relationships. Capture their reasoning faithfully so we can later tell them when reality moves AGAINST it.

Return ONLY a JSON object, no prose, with this shape:
{
  "title": "short dashboard name",
  "thesis": { "text": "the user's core claim, QUOTED VERBATIM" },
  "metrics": [ { "label": "US 10-year yield", "query": "US 10 year treasury yield", "unit": "%", "sourceQuote": { "text": "their verbatim words about why this matters" }, "userSupplied": false } ],
  "tripwires": [ { "label": "10Y above 4.5%", "comparator": "gt", "threshold": 4.5, "unit": "%", "metricLabel": "US 10-year yield", "sourceQuote": { "text": "their verbatim reconsider-if line" } } ],
  "widgets": [ { "metricLabel": "US 10-year yield", "blockType": "insight", "span": 1 } ]
}

HARD RULES:
- Quote the user VERBATIM for thesis.text and every sourceQuote.text. Never paraphrase, never invent.
- A tripwire threshold MUST be a number the user actually stated as their reversal point. If they didn't state one, omit that tripwire — do NOT guess.
- comparator is one of: gt, gte, lt, lte, crosses_up, crosses_down, pct_drop, pct_rise.
- If a metric's value is the user's to supply (their weekly mileage, a private target), set "userSupplied": true and leave "query": "". Otherwise give a concrete web-search query for it.
- Keep it tight: at most 6 metrics and 6 tripwires. Each tripwire's metricLabel must match a metric's label.
- SINGLE TOPIC ONLY: extract components for the ONE subject the most recent messages are actually about. If any earlier line in this transcript is about a different, unrelated subject, ignore it completely — a number being quantifiable does not make it "a metric worth watching" if it's off-topic. When unsure whether two lines share a subject, prefer fewer, coherent metrics over mixing subjects.`;

const EXTRACT_INSTRUCTION =
  'From the conversation above, extract the living dashboard as a single JSON object following the schema and rules exactly.';

// parseLoose (tolerant JSON extraction) now lives in the shared spine as parseLooseJson
// (ground/json.ts) — used by coerceDraft below.

function asQuote(v: unknown, fallbackSaidAt: number): SourceQuote | null {
  if (v && typeof v === 'object') {
    const t = (v as { text?: unknown }).text;
    if (typeof t === 'string' && t.trim()) {
      const saidAt = (v as { saidAt?: unknown }).saidAt;
      return { text: t.trim(), saidAt: typeof saidAt === 'number' ? saidAt : fallbackSaidAt };
    }
  }
  return null;
}

/** The pure, testable core: coerce loose model JSON into a valid draft, or null if unusable. Drops
 *  malformed metrics/tripwires (bad comparator, non-finite threshold, missing verbatim quote) rather
 *  than letting a fabricated number through. */
export function coerceDraft(raw: unknown, now: number = Date.now()): DashboardDraft | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const thesis = asQuote(o.thesis, now);
  if (!thesis) return null; // no verbatim thesis ⇒ not a dashboard

  const metricsIn = Array.isArray(o.metrics) ? o.metrics : [];
  const metrics: DraftMetric[] = [];
  for (const m of metricsIn.slice(0, 6)) {
    if (!m || typeof m !== 'object') continue;
    const mm = m as Record<string, unknown>;
    const label = typeof mm.label === 'string' ? mm.label.trim() : '';
    if (!label) continue;
    const userSupplied = mm.userSupplied === true;
    const query = typeof mm.query === 'string' ? mm.query.trim() : '';
    // A metric with no query AND not user-supplied has no honest source — drop it.
    if (!query && !userSupplied) continue;
    metrics.push({
      label,
      query: userSupplied ? '' : query,
      ...(typeof mm.unit === 'string' && mm.unit ? { unit: mm.unit } : {}),
      sourceQuote: asQuote(mm.sourceQuote, now) ?? { text: label, saidAt: now },
      userSupplied,
    });
  }

  const labels = new Set(metrics.map((m) => m.label));
  const tripwiresIn = Array.isArray(o.tripwires) ? o.tripwires : [];
  const tripwires: DraftTripwire[] = [];
  for (const t of tripwiresIn.slice(0, 6)) {
    if (!t || typeof t !== 'object') continue;
    const tt = t as Record<string, unknown>;
    const comparator = tt.comparator as Comparator;
    const threshold = tt.threshold;
    const quote = asQuote(tt.sourceQuote, now);
    const metricLabel = typeof tt.metricLabel === 'string' ? tt.metricLabel : '';
    if (!COMPARATORS.has(comparator)) continue;
    if (typeof threshold !== 'number' || !Number.isFinite(threshold)) continue; // no fabricated thresholds
    if (!quote) continue;
    if (!labels.has(metricLabel)) continue; // must reference a real metric
    tripwires.push({
      label: typeof tt.label === 'string' && tt.label ? tt.label : metricLabel,
      comparator,
      threshold,
      ...(typeof tt.unit === 'string' && tt.unit ? { unit: tt.unit } : {}),
      sourceQuote: quote,
      metricLabel,
    });
  }

  const widgetsIn = Array.isArray(o.widgets) ? o.widgets : [];
  const suggestedWidgets = widgetsIn
    .filter((w): w is Record<string, unknown> => !!w && typeof w === 'object')
    .map((w) => ({
      metricLabel: typeof w.metricLabel === 'string' ? w.metricLabel : '',
      blockType: typeof w.blockType === 'string' ? w.blockType : 'insight',
      span: clampSpan(w.span),
    }));

  return {
    title: typeof o.title === 'string' && o.title.trim() ? o.title.trim() : 'Untitled dashboard',
    thesis,
    metrics: coherentMetrics(metrics, tripwires, thesis),
    tripwires: coherentTripwires(tripwires, metrics, thesis),
    suggestedWidgets,
  };
}

/** Does `text` share a meaningful word with `vocab`? An empty vocab means there was nothing real
 *  to compare against, so nothing gets penalized for it. */
function sharesTopic(text: string, vocab: Set<string>): boolean {
  if (vocab.size === 0) return true;
  for (const tok of meaningfulTokens(text)) if (vocab.has(tok)) return true;
  return false;
}

/** Drop a metric that isn't transitively connected to the thesis by shared vocabulary. Grows a core
 *  vocabulary starting from the thesis + every tripwire's source quote, then repeatedly admits any
 *  metric whose own text overlaps the CURRENT core — folding that metric's own words into the core
 *  before the next pass. This must be a closure over the thesis, not "does X overlap any OTHER
 *  metric" (the earlier approach) — two independently off-topic metrics that happen to share
 *  vocabulary WITH EACH OTHER (a stray "Tokyo temperature" and "Tokyo humidity" both associatively
 *  harvested from the same unrelated aside) would otherwise validate one another and both survive,
 *  even though neither has anything to do with the thesis — exactly the class of bug this filter
 *  exists to catch. A user-supplied metric is the user's own typed-in number, never associatively
 *  harvested, so it's always kept regardless; with only one metric there's nothing else to be
 *  incoherent WITH, so the check is moot. */
function coherentMetrics(
  metrics: DraftMetric[],
  tripwires: DraftTripwire[],
  thesis: SourceQuote,
): DraftMetric[] {
  if (metrics.length <= 1) return metrics;
  const core = meaningfulTokens(
    [thesis.text, ...tripwires.map((t) => t.sourceQuote.text)].join(' '),
  );
  const kept = new Set<DraftMetric>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const m of metrics) {
      if (kept.has(m) || m.userSupplied) continue;
      const text = `${m.label} ${m.sourceQuote.text}`;
      if (sharesTopic(text, core)) {
        kept.add(m);
        changed = true;
        for (const tok of meaningfulTokens(text)) core.add(tok);
      }
    }
  }
  return metrics.filter((m) => m.userSupplied || kept.has(m));
}

/** Same idea for tripwires: drop one that shares no vocabulary with the thesis or the metric it
 *  watches — a "reconsider if…" line that isn't actually about the same subject as its metric is
 *  more likely bled in from elsewhere in the transcript than a real reversal condition. */
function coherentTripwires(
  tripwires: DraftTripwire[],
  metrics: DraftMetric[],
  thesis: SourceQuote,
): DraftTripwire[] {
  return tripwires.filter((t) => {
    const metric = metrics.find((m) => m.label === t.metricLabel);
    const vocab = meaningfulTokens(
      `${thesis.text} ${t.metricLabel} ${metric?.sourceQuote.text ?? ''}`,
    );
    return sharesTopic(`${t.label} ${t.sourceQuote.text}`, vocab);
  });
}

function clampSpan(v: unknown): WidgetSpan {
  return v === 2 ? 2 : v === 3 ? 3 : 1;
}

/** Index into `frames` of the most recent turn that started the CURRENT thread — the last frame
 *  whose mode is 'replace' (a genuine topic switch, per lifecycle.ts's resolveMode), or 0 when the
 *  whole session has been one continuous thread. Everything before this index is an earlier,
 *  possibly unrelated conversation the extraction has no business drawing from. */
export function currentTopicStart(frames: TurnFrame[]): number {
  for (let i = frames.length - 1; i >= 0; i--) {
    if (frames[i].mode === 'replace') return i;
  }
  return 0;
}

/** The messages actually worth sending to the extraction model: from the start of the CURRENT
 *  topic onward (so an earlier, unrelated thread in the same session can't bleed in), capped at
 *  the last 12 for cost — same ceiling as before, just narrowed to the right window. `frames` is
 *  one per user+assistant pair in the normal case; when that 2:1 pairing doesn't hold (a saved
 *  Library canvas has a synthetic single frame over a one-line history, say) there's no reliable
 *  way to map a frame index to a message index, so this falls back to today's exact behavior. */
function historyWindow(history: ChatMessage[], frames: TurnFrame[]): ChatMessage[] {
  if (history.length !== frames.length * 2) return history.slice(-12);
  return history.slice(currentTopicStart(frames) * 2).slice(-12);
}

/** The model call: extract a draft from the transcript. Returns null on a failed/unparseable call —
 *  the caller falls back to the grounded draft rather than surfacing a half-answer. */
export async function extractDashboard(
  history: ChatMessage[],
  frames: TurnFrame[],
  cfg: ModelConfig,
  now: number = Date.now(),
): Promise<DashboardDraft | null> {
  try {
    const adapter = getAdapter(cfg.provider);
    const rr = await adapter.generate(
      {
        usageLabel: 'dashboard-extract',
        system: EXTRACT_SYSTEM,
        history: historyWindow(history, frames),
        user: EXTRACT_INSTRUCTION,
        // Up to 6 metrics + 6 tripwires, each carrying a verbatim sourceQuote, plus the thesis quote
        // itself — a rich conversation can fill every slot and crowd out the old 900, losing tripwires
        // (and the whole draft, since the object must parse whole). thinkingLevel 'low' also means
        // Gemini spends part of this same budget on reasoning before it ever emits JSON.
        maxTokens: 1900,
        temperature: 0.2,
        thinkingLevel: 'low',
      },
      cfg,
    );
    return coerceDraft(parseLooseJson(rr.raw), now);
  } catch {
    return null;
  }
}

/** Offline fallback: a grounded draft from the conversation's real content — the last user line as a
 *  rough thesis, and the data-bearing blocks already on the last canvas as user-supplied metrics. No
 *  tripwires (those live in the user's words, which only the model reads reliably). Honest, never invented. */
export function groundedDraft(
  history: ChatMessage[],
  frames: TurnFrame[],
  now: number = Date.now(),
): DashboardDraft {
  const lastUser = [...history].reverse().find((m) => m.role === 'user');
  const lastFrame = frames[frames.length - 1];
  const title = lastFrame?.spec.title || lastFrame?.question || 'New dashboard';
  const thesis: SourceQuote = { text: lastUser?.content?.trim() || title, saidAt: now };

  const metrics: DraftMetric[] = [];
  const blocks = lastFrame?.spec.blocks ?? [];
  for (const b of blocks) {
    if (metrics.length >= 4) break;
    const title2 = (b as { props?: { title?: unknown } }).props?.title;
    if ((b.type === 'insight' || b.type === 'kpi') && typeof title2 === 'string' && title2.trim()) {
      metrics.push({
        label: title2.trim(),
        query: '',
        sourceQuote: { text: title2.trim(), saidAt: now },
        userSupplied: true,
      });
    }
  }

  return { title, thesis, metrics, tripwires: [], suggestedWidgets: [] };
}

export interface BuildOpts {
  conversationId: string;
  conversationTitle: string;
  now?: number;
  /** Defaults to manual/manual — the same "never auto-search until asked" default every creation
   *  path uses. Callers (the ExtractionPreview review sheet) can offer the standing "hourly" this
   *  builder used to hardcode as a labeled suggestion instead. */
  cadence?: Cadence;
}

/** Pure: a reviewed draft → a persistable Dashboard. Reasoning (thesis/tripwires/sources) is set once
 *  and never refresh-mutated; metric values start empty (search/blank/—), never fabricated. */
export function buildDashboard(draft: DashboardDraft, opts: BuildOpts): Dashboard {
  const now = opts.now ?? Date.now();
  const id = newDashboardId();

  const metrics: MetricSpec[] = draft.metrics.map((m, i) => ({
    id: `m${i}`,
    label: m.label,
    query: m.query,
    ...(m.unit ? { unit: m.unit } : {}),
    sourceQuote: m.sourceQuote,
    lastValue: null,
    origin: 'empty',
    ...(m.userSupplied ? { blankKey: `m${i}` } : {}),
  }));
  const metricIdByLabel = new Map(draft.metrics.map((m, i) => [m.label, `m${i}`]));

  const tripwires: Tripwire[] = draft.tripwires.map((t, i) => ({
    id: `t${i}`,
    label: t.label,
    metricId: metricIdByLabel.get(t.metricLabel) ?? '',
    comparator: t.comparator,
    threshold: t.threshold,
    ...(t.unit ? { unit: t.unit } : {}),
    sourceQuote: t.sourceQuote,
    state: 'AWAITING',
  }));

  const widgets: Widget[] = [];
  let n = 0;
  const add = (block: Widget['block'], span: WidgetSpan, metricId?: string): void => {
    widgets.push({
      id: `w${n++}`,
      block,
      span,
      fromSource: opts.conversationId,
      ...(metricId ? { metricId } : {}),
    });
  };

  // The chrome that makes it a living dashboard (props projected from state at render time).
  add({ type: 'thesis', col: 8, id: 'w-thesis', props: { reasoning: draft.thesis.text } }, 2);
  add({ type: 'alignmentgauge', col: 4, id: 'w-align', props: { pct: null } }, 1);
  // One honest-empty metric card per metric — fills in once data is fetched / supplied.
  metrics.forEach((m) => {
    add(
      {
        type: 'insight',
        col: 4,
        id: `w-${m.id}`,
        num: String(n),
        props: { title: m.label, stat: '—', conf: 'inferred', summary: m.sourceQuote.text },
      },
      1,
      m.id,
    );
  });
  if (tripwires.length > 0)
    add({ type: 'standingalerts', col: 4, id: 'w-alerts', props: { alerts: [] } }, 1);
  add({ type: 'sourceslineage', col: 8, id: 'w-sources', props: { rows: [] } }, 2);

  const cadence: Cadence = opts.cadence ?? { data: 'manual', ai: 'manual' };
  // Mirrors format.ts's hasLiveContent (a search-tracked metric, or a widget with a refreshQuery —
  // this builder never sets the latter) without needing the whole Dashboard assembled first: only
  // a board with something to actually fetch gets the durable first-check one-shot below.
  const hasLive = metrics.some((m) => m.query.trim() !== '' && !m.blankKey);

  return {
    id,
    title: draft.title,
    question: opts.conversationTitle,
    thesis: draft.thesis,
    tripwires,
    metrics,
    sources: [
      {
        kind: 'ORIGIN',
        conversationId: opts.conversationId,
        title: opts.conversationTitle,
        contributed: 'Created this dashboard from this conversation.',
        at: now,
      },
    ],
    widgets,
    cadence,
    // Break-verdicts still fire on a real tripwire crossing regardless of cadence.ai (manual only
    // silences the SCHEDULED verdict, not shouldFireAi's smart-trigger branch).
    smartTrigger: true,
    alerts: { inApp: true, push: false },
    createdAt: now,
    updatedAt: now,
    nextDataAt: nextDataDue(cadence, now),
    nextAiAt: Number.MAX_SAFE_INTEGER,
    lastRefreshedAt: null,
    // A durable "first check": the immediate refreshDashboardNow the caller kicks right after this
    // (see ExtractionPreview.build) is fire-and-forget and no-ops with no key — this one-shot
    // survives that and fires the moment a model IS connected, even on a manual-cadence board
    // whose nextDataAt is otherwise parked forever.
    ...(hasLive ? { oneShotAt: now, oneShotLabel: 'first check' } : {}),
  };
}

/** Fold a later conversation's draft into an EXISTING dashboard: add its new metrics (skipping ones
 *  already tracked), the tripwires that reference them, a metric card per new metric, and an ADDED
 *  lineage row. The dashboard's existing reasoning is never touched — this only appends. Returns the
 *  count of components added (0 when the conversation brought nothing new). */
export function foldDraftIntoDashboard(
  d: Dashboard,
  draft: DashboardDraft,
  conversationTitle: string,
  now: number = Date.now(),
): number {
  const have = new Set(d.metrics.map((m) => normLabel(m.label)));
  const idByLabel = new Map(d.metrics.map((m) => [normLabel(m.label), m.id]));
  const metrics: MetricSpec[] = [];
  const widgets: Widget[] = [];
  let w = d.widgets.length;

  draft.metrics.forEach((m, i) => {
    if (have.has(normLabel(m.label))) return; // already tracked — don't duplicate
    const mid = `m-${now}-${i}`;
    metrics.push({
      id: mid,
      label: m.label,
      query: m.query,
      ...(m.unit ? { unit: m.unit } : {}),
      sourceQuote: m.sourceQuote,
      lastValue: null,
      origin: 'empty',
      ...(m.userSupplied ? { blankKey: mid } : {}),
    });
    idByLabel.set(normLabel(m.label), mid);
    widgets.push({
      id: `w-${now}-${i}`,
      block: {
        type: 'insight',
        col: 4,
        id: `wadd-${now}-${i}`,
        num: String(++w),
        props: { title: m.label, stat: '—', conf: 'inferred', summary: m.sourceQuote.text },
      } as Widget['block'],
      span: 1,
      fromSource: conversationTitle,
      metricId: mid,
    });
  });

  const haveTrip = new Set(d.tripwires.map((t) => normLabel(t.label)));
  const tripwires: Tripwire[] = draft.tripwires
    .filter((t) => idByLabel.has(normLabel(t.metricLabel)) && !haveTrip.has(normLabel(t.label)))
    .map((t, i) => ({
      id: `t-${now}-${i}`,
      label: t.label,
      metricId: idByLabel.get(normLabel(t.metricLabel))!,
      comparator: t.comparator,
      threshold: t.threshold,
      ...(t.unit ? { unit: t.unit } : {}),
      sourceQuote: t.sourceQuote,
      state: 'AWAITING',
    }));

  const added = metrics.length + tripwires.length;
  const parts: string[] = [];
  if (metrics.length) parts.push(`${metrics.length} metric${metrics.length > 1 ? 's' : ''}`);
  if (tripwires.length) parts.push(`${tripwires.length} alert${tripwires.length > 1 ? 's' : ''}`);
  const source: DashSource = {
    kind: 'ADDED',
    conversationId: normLabel(conversationTitle),
    title: conversationTitle,
    contributed: parts.length ? `Added: ${parts.join(' + ')}` : 'Linked this conversation.',
    at: now,
  };

  foldInto(d.id, { metrics, tripwires, widgets, source });
  return added;
}
