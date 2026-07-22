// dashboards/templates/types.ts — a dashboard template is a small, self-contained recipe: one
// question ("what's the ticker?") that expands into a full living dashboard (thesis + metrics +
// tripwires + widgets) without a conversation ever happening. Every string-producing field is a
// function of the one input value the user actually typed, so nothing here is ever a fabricated
// fact — it's copy, not data. Real numbers only ever arrive later, from a real fetch.
import type { Cadence, Comparator, WidgetSpan } from '../types';

export interface TemplateInput {
  key: string;
  label: string;
  placeholder: string;
}

export interface TemplateMetric {
  label: (inputValue: string) => string;
  query: (inputValue: string) => string;
  unit?: string;
}

export interface TemplateTripwire {
  label: (inputValue: string) => string;
  comparator: Comparator;
  threshold: number;
  unit?: string;
  /** Whether a freshly-created dashboard arms this tripwire out of the gate — only true when the
   *  threshold is a broadly reasonable universal default, never a guess at what THIS user wants. */
  enabledByDefault: boolean;
  /** Index into the template's own `metrics` array — which number this tripwire watches. */
  metricIndex: number;
}

export interface TemplateWidget {
  blockType: string;
  span: WidgetSpan;
  /** Set only for a per-metric card (an 'insight' tile mirroring the metric it's bound to); a rich,
   *  non-numeric widget (chart/scoreboard/forecast/list/…) leaves this unset. */
  metricIndex?: number;
  /** The re-ask that keeps a rich widget's whole block current on refresh (see Widget.refreshQuery). */
  refreshQuery?: (inputValue: string) => string;
  /** Honest-empty starter props for the widget's block, beyond whatever title a refresh would add —
   *  arrays are empty, never a guessed row. */
  seedProps?: (inputValue: string) => Record<string, unknown>;
}

export interface DashboardTemplate {
  id: string;
  label: string;
  blurb: string;
  input: TemplateInput;
  title: (inputValue: string) => string;
  thesis: (inputValue: string) => string;
  metrics: TemplateMetric[];
  tripwires: TemplateTripwire[];
  widgets: TemplateWidget[];
  cadence: Cadence;
  topic?: string;
}
