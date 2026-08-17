// dashboards/project.ts — turn a dashboard's live state into the props its bespoke widgets render.
// The four dashboard-chrome widgets (thesis / alignment gauge / standing alerts / sources) hold no
// values of their own: they PROJECT from the dashboard's metrics, tripwires, and sources at render
// time, so they always reflect the latest state and there's a single source of truth. Data widgets
// (sparkstat/chart/timeline) carry their own props, refreshed in place — projection passes them through.
import type { Block } from '../../data/conversation';
import type {
  AlertState,
  LineageKind,
  StandingAlertsProps,
  ThesisProps,
  SourcesLineageProps,
  AlignmentGaugeProps,
} from '../../canvas/blocks/dashboard/types';
import { valueWithUnit } from './format';
import type { Dashboard, SourceKind, TripwireState, Widget } from './types';

const STATE_TO_ALERT: Record<TripwireState, AlertState> = {
  WATCHING: 'watching',
  CLEAR: 'clear',
  TRIGGERED: 'triggered',
  AWAITING: 'awaiting',
};
const KIND_TO_LINEAGE: Record<SourceKind, LineageKind> = {
  ORIGIN: 'origin',
  ADDED: 'added',
  LINKED: 'linked',
};
const STATE_WEIGHT: Record<TripwireState, number> = {
  CLEAR: 1,
  WATCHING: 0.75,
  TRIGGERED: 0,
  AWAITING: 0,
};

/** "Is my reasoning still holding?" as a single %, derived honestly from tripwire states. Null when
 *  nothing can be assessed yet (no tripwires, or all awaiting a real value) → the gauge shows "awaiting". */
export function alignmentPct(d: Dashboard): number | null {
  const assessable = d.tripwires.filter((t) => t.state !== 'AWAITING');
  if (assessable.length === 0) return null;
  const sum = assessable.reduce((n, t) => n + STATE_WEIGHT[t.state], 0);
  return Math.round((100 * sum) / assessable.length);
}

function alignmentBand(pct: number | null): string {
  if (pct === null) return '';
  if (pct >= 80) return 'Tracking well';
  if (pct >= 55) return 'Holding, with risks';
  if (pct >= 30) return 'Slipping';
  return 'Lines are breaking';
}

const DASHBOARD_WIDGET_TYPES = new Set([
  'thesis',
  'alignmentgauge',
  'standingalerts',
  'sourceslineage',
]);

/** Is this widget's content DERIVED from dashboard state at render time rather than stored on the
 *  block? Two kinds are: the bespoke chrome (thesis, gauge, alerts, lineage), and a metric card,
 *  whose stat comes from its MetricSpec — the single source of truth a refresh actually writes.
 *
 *  This is the seam that decides what a refresh may ask a model to regenerate. A projected widget
 *  must never be a refresh target: whatever the model returned for it would be overwritten by the
 *  projection a moment later, so the tokens buy nothing and every extra block in the reply is
 *  another chance for the whole response to fail validation. The value it displays still updates
 *  every check — through its metric, which the same call fetches as a plain number. */
export function isProjectedWidget(w: Widget): boolean {
  const type = w.block.type;
  if (DASHBOARD_WIDGET_TYPES.has(type)) return true;
  return !!w.metricId && type === 'insight';
}

/** The block to actually render for a widget: bespoke chrome gets fresh props projected from `d`;
 *  everything else passes through unchanged (its values were refreshed in place on the widget). */
export function projectWidgetBlock(d: Dashboard, w: Widget): Block {
  const type = w.block.type;
  if (!DASHBOARD_WIDGET_TYPES.has(type)) {
    // A metric card reflects its MetricSpec's live value (single source of truth) — so a refresh
    // that updates the metric updates the card too, with an honest "—" until a real value lands.
    if (w.metricId && type === 'insight') {
      const m = d.metrics.find((x) => x.id === w.metricId);
      if (m) {
        const stat =
          m.lastValue === null ? '—' : (m.lastRaw ?? valueWithUnit(String(m.lastValue), m.unit));
        // Built as 'inferred' before the metric ever had a real value (extract.ts's placeholder
        // card) — re-derive every render instead of freezing that badge, so a metric that's since
        // fetched a real number earns 'strong' without needing a rebuild.
        const conf = m.lastValue === null ? 'inferred' : 'strong';
        const props = (w.block as unknown as { props: Record<string, unknown> }).props;
        return { ...w.block, props: { ...props, stat, conf } } as Block;
      }
    }
    return w.block;
  }

  const origin = d.sources.find((s) => s.kind === 'ORIGIN');

  if (type === 'thesis') {
    const guard = d.tripwires[0];
    const props: ThesisProps = {
      reasoning: d.thesis.text,
      ...(origin ? { asOf: origin.title } : {}),
      ...(guard ? { reconsiderIf: guard.label, tripwireState: STATE_TO_ALERT[guard.state] } : {}),
    };
    return { ...w.block, props } as Block;
  }

  if (type === 'alignmentgauge') {
    const pct = alignmentPct(d);
    const props: AlignmentGaugeProps = { pct, band: alignmentBand(pct) };
    return { ...w.block, props } as Block;
  }

  if (type === 'standingalerts') {
    const props: StandingAlertsProps = {
      alerts: d.tripwires.map((t) => ({ label: t.label, state: STATE_TO_ALERT[t.state] })),
    };
    return { ...w.block, props } as Block;
  }

  // sourceslineage
  const props: SourcesLineageProps = {
    rows: d.sources.map((s) => ({
      kind: KIND_TO_LINEAGE[s.kind],
      label: s.title,
      ...(s.contributed ? { contributed: s.contributed } : {}),
    })),
  };
  return { ...w.block, props } as Block;
}
