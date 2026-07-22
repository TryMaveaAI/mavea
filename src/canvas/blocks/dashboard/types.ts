// dashboard family block types — the four bespoke widgets a living dashboard needs that the rest of
// the library doesn't already cover: the THESIS block (your verbatim reasoning + its tripwire), the
// ALIGNMENT GAUGE ("is my reasoning still holding?"), STANDING ALERTS (each watching/clear/triggered),
// and the SOURCES lineage (which conversations built this). Every prop shape is self-contained and
// renders honestly when empty — a gauge with no value shows "awaiting", never a fabricated number.
//
// These are rendered by the Dashboards surface from a dashboard's own data; they're deliberately kept
// out of the model's selection catalog (see tests/component-protocol.test.ts META_OPTIONAL) so a
// normal Live answer never sprouts a "thesis" card.
import type { AccentVar, BlockBase, HtmlString } from '../../../data/conversation';
import type { IconKey } from '../../../types/mavea';

/** Lowercase, render-local twin of the surface's TripwireState — keeps this family decoupled from
 *  the live/dashboards module (the surface lowercases when it projects props). */
export type AlertState = 'watching' | 'clear' | 'triggered' | 'awaiting';

/* ── thesis ── your stated reasoning, verbatim, with its date + the "reconsider if…" tripwire ── */
export interface ThesisProps {
  /** Eyebrow label; defaults to "Why you’re tracking this". */
  title?: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** The verbatim reasoning — rendered as PLAIN TEXT (never HTML): these are the user's own words. */
  reasoning: string;
  /** "Jan 14 · Live session". */
  asOf?: string;
  /** The "reconsider if…" prose. */
  reconsiderIf?: string;
  /** State of the tripwire that guards this thesis, shown as a chip. */
  tripwireState?: AlertState;
  footer?: HtmlString;
}

/* ── alignmentgauge ── one % answering "is my reasoning still holding?" ── */
export interface AlignmentGaugeProps {
  /** Defaults to "Thesis alignment". */
  title?: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** 0..100, or null when never computed → renders "awaiting your data", never a guess. */
  pct: number | null;
  /** "Tracking well" / "Slipping". */
  band?: string;
  note?: string;
  color?: AccentVar;
  footer?: HtmlString;
}

/* ── standingalerts ── the tripwires, each watching / clear / triggered ── */
export interface AlertRowSpec {
  label: string;
  state: AlertState;
  /** Short status word shown on the right ("watching", "2 days", "12d no contact"). */
  status?: string;
  note?: string;
}
export interface StandingAlertsProps {
  /** Defaults to "Standing alerts". */
  title?: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  alerts: AlertRowSpec[];
  footer?: HtmlString;
}

/* ── sourceslineage ── the conversations that built this dashboard (ORIGIN / ADDED / LINKED) ── */
export type LineageKind = 'origin' | 'added' | 'linked';
export interface LineageRowSpec {
  kind: LineageKind;
  /** "Jan 14 · Live session". */
  label: string;
  /** What it contributed ("Created: thesis block, 10Y alert"). */
  contributed?: string;
}
export interface SourcesLineageProps {
  /** Defaults to "Sources". */
  title?: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  rows: LineageRowSpec[];
  footer?: HtmlString;
}

export type DashboardBlock =
  | (BlockBase & { type: 'thesis'; props: ThesisProps })
  | (BlockBase & { type: 'alignmentgauge'; props: AlignmentGaugeProps })
  | (BlockBase & { type: 'standingalerts'; props: StandingAlertsProps })
  | (BlockBase & { type: 'sourceslineage'; props: SourcesLineageProps });
