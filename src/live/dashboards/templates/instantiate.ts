// dashboards/templates/instantiate.ts — turns a DashboardTemplate plus the one value a user typed
// into a real Dashboard, with no conversation and no model call involved. A parallel path to
// extract.ts's buildDashboard/foldDraftIntoDashboard: same chrome-assembly shape, same
// never-fabricate-a-value discipline (every metric starts null/'empty'), kept as its own module so
// template instantiation can evolve without touching the conversation-extraction path.
import { foldInto, newDashboardId } from '../store';
import { normLabel } from '../../ground/tokens';
import { nextDataDue } from '../cadence';
import type { Block } from '../../../data/conversation';
import type { TrackerPlan } from '../planTracker';
import type {
  Cadence,
  Dashboard,
  DashSource,
  MetricSpec,
  Tripwire,
  Widget,
  WidgetSpan,
} from '../types';
import type { DashboardTemplate } from './types';

/** Per-item enable/disable overrides a review step can pass before creating — absent entries fall
 *  back to "on" for a metric or widget, and to the template's own `enabledByDefault` for a
 *  tripwire. Indices line up with the template's own `metrics`/`tripwires`/`widgets` arrays. */
export interface TemplateToggles {
  metrics?: boolean[];
  tripwires?: boolean[];
  widgets?: boolean[];
}

interface TemplateComponents {
  metrics: MetricSpec[];
  tripwires: Tripwire[];
  widgets: Widget[];
}

/** WidgetSpan (S/M/L) → the 12-col card grid, same 4/8/12 mapping buildDashboard uses inline. */
function spanToCol(span: WidgetSpan): number {
  return span * 4;
}

/** Build the metrics/tripwires/widgets a template produces for one typed-in value — pure, no store
 *  access. `widgets` comes back per-metric insight cards FIRST, then the template's rich (non-numeric)
 *  widgets, regardless of the order they're declared in the registry — the order a fresh dashboard's
 *  chrome expects (see newDashboardFromTemplate). Shared by a fresh dashboard and by folding a
 *  template into an existing one. */
export function buildTemplateComponents(
  template: DashboardTemplate,
  inputValue: string,
  now: number,
  toggles: TemplateToggles = {},
): TemplateComponents {
  const fromSource = `template:${template.id}`;

  const metricIdByIndex = new Map<number, string>();
  const metrics: MetricSpec[] = [];
  template.metrics.forEach((tm, i) => {
    if (toggles.metrics?.[i] === false) return;
    const id = `m-${now}-${i}`;
    const label = tm.label(inputValue);
    metricIdByIndex.set(i, id);
    metrics.push({
      id,
      label,
      query: tm.query(inputValue),
      ...(tm.unit ? { unit: tm.unit } : {}),
      // No transcript to quote verbatim — the metric's own label stands in, the same fallback
      // coerceDraft uses in extract.ts when a real extraction arrives with no sourceQuote.
      sourceQuote: { text: label, saidAt: now },
      lastValue: null,
      origin: 'empty',
    });
  });

  const tripwires: Tripwire[] = [];
  template.tripwires.forEach((tt, i) => {
    const enabled = toggles.tripwires?.[i] ?? tt.enabledByDefault;
    if (!enabled) return;
    const metricId = metricIdByIndex.get(tt.metricIndex);
    if (!metricId) return; // watches a metric the caller turned off — nothing left to bind to
    const label = tt.label(inputValue);
    tripwires.push({
      id: `t-${now}-${i}`,
      label,
      metricId,
      comparator: tt.comparator,
      threshold: tt.threshold,
      ...(tt.unit ? { unit: tt.unit } : {}),
      sourceQuote: { text: label, saidAt: now },
      state: 'AWAITING',
    });
  });

  const metricWidgets: Widget[] = [];
  const richWidgets: Widget[] = [];
  template.widgets.forEach((tw, i) => {
    if (toggles.widgets?.[i] === false) return;
    if (tw.metricIndex !== undefined) {
      const metricId = metricIdByIndex.get(tw.metricIndex);
      if (!metricId) return; // its metric got turned off above — drop the card with it
      const metric = metrics.find((m) => m.id === metricId)!;
      metricWidgets.push({
        id: `w-${now}-${i}`,
        block: {
          type: tw.blockType,
          col: spanToCol(tw.span),
          id: `wblk-${now}-${i}`,
          num: String(metricWidgets.length + 1),
          props: {
            title: metric.label,
            stat: '—',
            conf: 'inferred',
            summary: metric.sourceQuote.text,
          },
        } as Block,
        span: tw.span,
        metricId,
        fromSource,
      });
      return;
    }
    const refreshQuery = tw.refreshQuery?.(inputValue);
    const seeded = tw.seedProps?.(inputValue) ?? {};
    richWidgets.push({
      id: `w-${now}-${i}`,
      block: {
        type: tw.blockType,
        col: spanToCol(tw.span),
        id: `wblk-${now}-${i}`,
        // A rich widget's own seedProps may already carry a title (forecast/list); when it doesn't,
        // the refresh question that will keep it live doubles as an honest starting title.
        props: refreshQuery ? { title: refreshQuery, ...seeded } : seeded,
      } as Block,
      span: tw.span,
      fromSource,
      ...(refreshQuery ? { refreshQuery } : {}),
    });
  });

  return { metrics, tripwires, widgets: [...metricWidgets, ...richWidgets] };
}

export interface NewDashboardOpts {
  now?: number;
  toggles?: TemplateToggles;
  /** Overrides `template.cadence` — the "Track anything" review sheet lets the user pick manual
   *  (the default everywhere now) over the template/plan's own suggestion instead of applying it
   *  silently. */
  cadence?: Cadence;
}

/** A fresh dashboard built straight from a template + the value typed for it. The reasoning chrome
 *  (thesis card, alignment gauge, standing alerts) appears ONLY when there's an actual tripwire to
 *  reason about — "is my thesis holding?" is meaningful for a watched threshold, but pure noise on
 *  a plain tracker (scores, weather, headlines), which is just its live cards + lineage. Pure: the
 *  caller persists it (store.addDashboard) and kicks the first fetch
 *  (useDashboardLoop.refreshDashboardNow) itself, same as ExtractionPreview does for a
 *  conversation-built dashboard. */
export function newDashboardFromTemplate(
  template: DashboardTemplate,
  inputValue: string,
  opts: NewDashboardOpts = {},
): Dashboard {
  const now = opts.now ?? Date.now();
  const fromSource = `template:${template.id}`;
  const title = template.title(inputValue);
  const { metrics, tripwires, widgets } = buildTemplateComponents(
    template,
    inputValue,
    now,
    opts.toggles,
  );

  const hasReasoning = tripwires.length > 0;
  const thesisWidget: Widget = {
    id: 'w-thesis',
    block: {
      type: 'thesis',
      col: 8,
      id: 'w-thesis',
      props: { reasoning: template.thesis(inputValue) },
    } as Block,
    span: 2,
    fromSource,
  };
  const alignWidget: Widget = {
    id: 'w-align',
    block: { type: 'alignmentgauge', col: 4, id: 'w-align', props: { pct: null } } as Block,
    span: 1,
    fromSource,
  };
  const alertsWidget: Widget = {
    id: 'w-alerts',
    block: {
      type: 'standingalerts',
      col: 4,
      id: 'w-alerts',
      props: { alerts: [] },
    } as Block,
    span: 1,
    fromSource,
  };
  const sourcesWidget: Widget = {
    id: 'w-sources',
    block: { type: 'sourceslineage', col: 8, id: 'w-sources', props: { rows: [] } } as Block,
    span: 2,
    fromSource,
  };

  const cadence = opts.cadence ?? template.cadence;
  // Mirrors format.ts's hasLiveContent — only a board with something to actually fetch gets the
  // durable first-check one-shot below (a chrome-only/blank result never would).
  const hasLive =
    metrics.some((m) => m.query.trim() !== '' && !m.blankKey) ||
    widgets.some((w) => w.refreshQuery?.trim());

  return {
    id: newDashboardId(),
    title,
    question: title,
    thesis: { text: template.thesis(inputValue), saidAt: now },
    tripwires,
    metrics,
    sources: [
      {
        kind: 'ORIGIN',
        conversationId: fromSource,
        title: template.label,
        contributed: `Started from the '${template.label}' template.`,
        at: now,
      },
    ],
    widgets: [
      ...(hasReasoning ? [thesisWidget, alignWidget] : []),
      ...widgets,
      ...(hasReasoning ? [alertsWidget] : []),
      sourcesWidget,
    ],
    cadence,
    smartTrigger: hasReasoning,
    alerts: { inApp: true, push: false },
    ...(template.topic ? { topic: template.topic } : {}),
    createdAt: now,
    updatedAt: now,
    nextDataAt: nextDataDue(cadence, now),
    nextAiAt: Number.MAX_SAFE_INTEGER,
    lastRefreshedAt: null,
    // Durable "first check" — survives the caller's fire-and-forget refreshDashboardNow being a
    // no-op with no key connected, and fires the moment one is (see extract.ts's buildDashboard
    // for the identical reasoning).
    ...(hasLive ? { oneShotAt: now, oneShotLabel: 'first check' } : {}),
  };
}

/** Fold a template's components into an EXISTING dashboard — the "add this template's tracking to a
 *  dashboard I already have" path. Builds the full component set via buildTemplateComponents, drops
 *  any metric whose normalized label the target already tracks (the same dedup convention
 *  foldDraftIntoDashboard uses in extract.ts), drops whatever tripwires/insight-cards were bound to a
 *  dropped metric, then writes through the store's own unmodified foldInto. Rich (non-metric) widgets
 *  — a chart, a scoreboard — are never "duplicates" of an existing metric, so they always fold in.
 *  Returns the count of metrics + tripwires actually added (0 when the template brought nothing new). */
export function foldTemplateIntoDashboard(
  existing: Dashboard,
  template: DashboardTemplate,
  inputValue: string,
  now: number = Date.now(),
): number {
  const have = new Set(existing.metrics.map((m) => normLabel(m.label)));
  const haveTrip = new Set(existing.tripwires.map((t) => normLabel(t.label)));
  const built = buildTemplateComponents(template, inputValue, now);

  const metrics = built.metrics.filter((m) => !have.has(normLabel(m.label)));
  const keptIds = new Set(metrics.map((m) => m.id));
  const tripwires = built.tripwires.filter(
    (t) => keptIds.has(t.metricId) && !haveTrip.has(normLabel(t.label)),
  );
  const widgets = built.widgets.filter((w) => !w.metricId || keptIds.has(w.metricId));

  const added = metrics.length + tripwires.length;
  const parts: string[] = [];
  if (metrics.length) parts.push(`${metrics.length} metric${metrics.length > 1 ? 's' : ''}`);
  if (tripwires.length) parts.push(`${tripwires.length} alert${tripwires.length > 1 ? 's' : ''}`);
  const source: DashSource = {
    kind: 'ADDED',
    conversationId: `template:${template.id}`,
    title: template.label,
    contributed: parts.length
      ? `Added: ${parts.join(' + ')}`
      : `Linked the '${template.label}' template.`,
    at: now,
  };

  foldInto(existing.id, { metrics, tripwires, widgets, source });
  return added;
}

/** Honest-empty starter props per plan-eligible block type — arrays only, never a guessed row.
 *  (Every type here was checked against its real props interface: the required non-array fields,
 *  like a list's/forecast's `title`, arrive from buildTemplateComponents' refreshQuery-as-title
 *  fallback.) */
const PLAN_SEEDS: Record<string, Record<string, unknown>> = {
  chart: { labels: [], series: [] },
  scoreboard: { games: [] },
  standings: { rows: [] },
  forecast: { days: [] },
  list: { items: [] },
  timeline: { events: [] },
};

/** Adapt a model-planned tracker (planTracker.ts) into the same DashboardTemplate shape the
 *  assembly path already speaks — one metric card per planned number first, then the plan's rich
 *  widgets, exactly the order buildTemplateComponents emits and the review UI's toggles index. A
 *  plan never carries tripwires, so the resulting dashboard is lean by construction (no thesis /
 *  alignment chrome — see newDashboardFromTemplate). */
export function planToTemplate(plan: TrackerPlan): DashboardTemplate {
  return {
    id: 'plan',
    label: 'Track anything',
    blurb: '',
    input: { key: 'ask', label: 'Track', placeholder: '' },
    title: () => plan.title,
    thesis: () => `Tracking ${plan.title}.`,
    metrics: plan.metrics.map((m) => ({
      label: () => m.label,
      query: () => m.query,
      ...(m.unit ? { unit: m.unit } : {}),
    })),
    tripwires: [],
    widgets: [
      ...plan.metrics.map((_, i) => ({
        blockType: 'insight',
        span: 1 as WidgetSpan,
        metricIndex: i,
      })),
      ...plan.widgets.map((w) => ({
        blockType: w.blockType,
        span: w.span,
        refreshQuery: () => w.query,
        seedProps: () => ({ ...(PLAN_SEEDS[w.blockType] ?? {}) }),
      })),
    ],
    cadence: { data: plan.cadence, ai: 'manual' },
  };
}
