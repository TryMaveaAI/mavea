// status family block types — 10 premium, heavily-interactive status/progress components.
// Prop shapes are realistic & sample-friendly (the data agent fills them later).
import type { BlockBase, AccentVar, HtmlString } from '../../../data/conversation';
// IconKey re-export from `conversation` is missing in the current scaffold (a shared
// file we must not edit), so import it from its canonical source — same type, identical
// to what `conversation` itself imports.
import type { IconKey } from '../../../types/mavea';

/* ── progressbar ── multi-segment milestone bar (hover a segment → label/%) ── */
export interface ProgressSegment {
  /** segment label, e.g. "Discovery" */
  label: string;
  /** relative weight of this segment (summed to compute %) */
  value: number;
  color?: AccentVar;
  /** optional sub-detail revealed on hover */
  detail?: string;
  /** mark as already complete (filled) */
  done?: boolean;
}
export interface ProgressbarProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** big caption above the bar, e.g. "68% complete" */
  caption?: string;
  segments: ProgressSegment[];
  footer?: HtmlString;
}

/* ── stepindicator ── done/active/locked steps (click a step → set active) ── */
export type StepState = 'done' | 'active' | 'locked';
export interface StepItem {
  label: string;
  /** optional sub-caption shown under the label */
  sub?: string;
  state?: StepState;
  icon?: IconKey;
  /** body revealed when the step is the active one */
  detail?: HtmlString;
}
export interface StepindicatorProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** 'horizontal' (default) or 'vertical' rail */
  orientation?: 'horizontal' | 'vertical';
  steps: StepItem[];
  color?: AccentVar;
  footer?: HtmlString;
}

/* ── statustimeline ── events colored by status (filter chips by status) ── */
export type EventStatus = 'pending' | 'progress' | 'done' | 'failed';
export interface StatusEvent {
  time: string;
  label: string;
  status: EventStatus;
  /** optional longer description */
  detail?: string;
}
export interface StatustimelineProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  events: StatusEvent[];
  footer?: HtmlString;
}

/* ── healthgrid ── grid of system statuses (hover a cell → detail) ── */
export type HealthLevel = 'ok' | 'warn' | 'down';
export interface HealthCell {
  label: string;
  level: HealthLevel;
  /** display value, e.g. "99.98%" or "212ms" */
  value?: string;
  /** detail revealed on hover */
  detail?: string;
}
export interface HealthgridProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  cols?: number;
  cells: HealthCell[];
  footer?: HtmlString;
}

/* ── emptystate ── SVG illustration + headline + copy + action button ── */
export interface EmptystateProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** which built-in illustration to draw */
  art?: 'box' | 'search' | 'inbox' | 'spark';
  headline: string;
  copy?: HtmlString;
  /** primary action label (click → confirmed state) */
  action?: string;
  actionIcon?: IconKey;
  /** secondary / ghost action label */
  secondary?: string;
  color?: AccentVar;
  footer?: HtmlString;
}

/* ── skeleton ── loading skeleton matching a card layout (shimmer) ── */
export interface SkeletonProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** which skeleton layout to render */
  variant?: 'list' | 'chart' | 'profile' | 'media';
  /** number of repeated rows/items (default 4) */
  rows?: number;
  /** toggle button label to flip between shimmer & "loaded" preview */
  loadedLabel?: string;
  footer?: HtmlString;
}

/* ── sliderinput ── draggable range slider → live value + derived output ── */
export interface SliderMark {
  /** value at this labeled tick */
  at: number;
  label: string;
}
export interface SliderinputProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** prompt above the slider */
  prompt?: string;
  min: number;
  max: number;
  step?: number;
  /** initial value (defaults to mid-range) */
  value?: number;
  /** affixes for the live display */
  prefix?: string;
  suffix?: string;
  /** optional named ticks under the track */
  marks?: SliderMark[];
  /** label for the derived-output line under the value */
  outputLabel?: string;
  /** multiplier applied to value to produce the derived output */
  outputFactor?: number;
  outputPrefix?: string;
  outputSuffix?: string;
  color?: AccentVar;
  footer?: HtmlString;
}

/* ── segmented ── segmented radio control (select → switch preview) ── */
export interface SegmentOption {
  label: string;
  icon?: IconKey;
  /** big value shown when selected */
  value?: string;
  /** caption shown when selected */
  caption?: HtmlString;
}
export interface SegmentedProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  options: SegmentOption[];
  /** index of the default-selected option (default 0) */
  selected?: number;
  color?: AccentVar;
  footer?: HtmlString;
}

/* ── rangefilter ── dual-handle min/max range → live-filtered list/count ── */
export interface RangeItem {
  label: string;
  /** the numeric value this item is filtered by */
  value: number;
  /** optional formatted display, e.g. "$1,299" */
  display?: string;
  meta?: string;
}
export interface RangefilterProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  min: number;
  max: number;
  step?: number;
  /** initial low handle (defaults near min) */
  low?: number;
  /** initial high handle (defaults near max) */
  high?: number;
  prefix?: string;
  suffix?: string;
  /** noun for the count line, e.g. "results" */
  unitLabel?: string;
  items: RangeItem[];
  color?: AccentVar;
  footer?: HtmlString;
}

/* ── ratinginput ── interactive star/heart rating (hover preview → click set) ── */
export interface RatingFacet {
  label: string;
  /** 0..max contribution shown as a mini bar */
  value: number;
}
export interface RatinginputProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** glyph to draw, default 'star' */
  shape?: 'star' | 'heart';
  /** number of icons (default 5) */
  max?: number;
  /** initial rating (default ~4) */
  value?: number;
  /** caption shown next to the value */
  caption?: string;
  /** optional per-facet breakdown bars */
  facets?: RatingFacet[];
  color?: AccentVar;
  footer?: HtmlString;
}

/* ── a11yaudit ── accessibility audit: a checklist of a11y checks each with pass/warn/fail + an optional note, and an optional overall score ── */
export type A11yStatus = 'pass' | 'warn' | 'fail';
export interface A11yCheck {
  /** the check name, e.g. "Keyboard navigation" or "Colour contrast" */
  label: string;
  /** outcome → coloured badge (pass=insight, warn=warning, fail=danger) */
  status: A11yStatus;
  /** optional one-line finding / remediation note */
  note?: string;
}
export interface A11yAuditProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  checks: A11yCheck[];
  /** optional overall score, e.g. "82/100" or "AA" */
  score?: string;
  footer?: HtmlString;
}

/* ── painscale ── clinical pain rating: Wong-Baker FACES or visual-analog 0..10 ── */
export interface PainscaleProps {
  title?: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** the reported pain, 0 (none) .. 10 (worst) */
  value: number;
  /** 'faces' = six Wong-Baker face glyphs (default); 'vas' = a 0..10 visual-analog bar */
  kind?: 'faces' | 'vas';
  /** verbal anchors along the scale; defaults to clinical "No pain" … "Worst pain" */
  anchors?: string[];
  /** caption shown beside the reading */
  caption?: string;
  footer?: HtmlString;
}

/* ── habittracker ── forward-looking multi-habit weekly grid (cells × per-habit rings) ── */
export interface HabitRow {
  /** habit name, e.g. "Morning run" */
  name: string;
  /** one boolean per day, aligned to `days` (extra/missing cells are tolerated) */
  done: boolean[];
}
export interface HabittrackerProps {
  title?: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** day column labels; defaults to Mon..Sun */
  days?: string[];
  habits: HabitRow[];
  caption?: string;
  footer?: HtmlString;
}

/* ── streakgrid ── "don't break the chain" habit-streak card (recent days + counters) ── */
export interface StreakDay {
  /** optional date label, e.g. "Jun 3" — shown in the hover/title */
  date?: string;
  /** whether the habit was kept that day */
  done: boolean;
}
export interface StreakgridProps {
  title?: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** the habit being tracked, e.g. "Run" */
  habit?: string;
  /** recent days, oldest → newest */
  days: StreakDay[];
  /** current run length; computed from the tail of `days` when omitted */
  current?: number;
  /** best run length on record */
  best?: number;
  caption?: string;
  footer?: HtmlString;
}

/* ── litigationtimeline ── court-filing rail (urgency-colored nodes, deadline countdown) ── */
export type LitigationKind = 'filing' | 'motion' | 'hearing' | 'order' | 'deadline';
export type LitigationUrgency = 'routine' | 'soon' | 'critical';
export interface LitigationEvent {
  date: string;
  kind: LitigationKind;
  /** the court or tribunal, e.g. "D. Del." */
  court?: string;
  /** the filing/moving party, e.g. "Plaintiff" */
  party?: string;
  urgency?: LitigationUrgency;
  detail?: string;
}
export interface LitigationtimelineProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  events: LitigationEvent[];
  footer?: HtmlString;
}

/* ── billtracker ── legislative bill status (fixed stage rail + vote tallies) ── */
export type BillStageStatus = 'done' | 'current' | 'pending' | 'failed';
export interface BillVoteTally {
  yea: number;
  nay: number;
}
export interface BillStage {
  /** e.g. "Introduced", "Committee", "Floor Vote", "Other Chamber", "Signed" */
  name: string;
  status: BillStageStatus;
  voteTally?: BillVoteTally;
}
export interface BilltrackerProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** the bill number + short name, e.g. "H.R. 1284 — Data Broker Registration Act" */
  bill: string;
  stages: BillStage[];
  footer?: HtmlString;
}

/* ── triageboard ── ER acuity board (ESI-sorted rows, big colored badge) ── */
export type EsiLevel = 1 | 2 | 3 | 4 | 5;
export interface TriageVital {
  label: string;
  value?: string;
  abnormal?: boolean;
}
export interface TriagePatient {
  chiefComplaint: string;
  /** Emergency Severity Index, 1 (resuscitation) .. 5 (non-urgent) */
  esiLevel: EsiLevel;
  vitals?: TriageVital[];
  waitTime?: string;
}
export interface TriageboardProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  patients: TriagePatient[];
  footer?: HtmlString;
}

/* ── mentalhealthscreen ── scored screening instrument (PHQ-9/GAD-7 style) ── */
export interface ScreenItem {
  prompt: string;
  /** 0 (not at all) .. 3 (nearly every day) */
  score: number;
  anchor?: string;
}
export type ScreenBandTone = 'ok' | 'mild' | 'moderate' | 'severe';
export interface ScreenBand {
  label: string;
  /** [low, high] inclusive score range this band covers */
  range: [number, number];
  tone: ScreenBandTone;
}
export interface MentalhealthscreenProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** the instrument name, e.g. "PHQ-9" */
  instrument: string;
  items: ScreenItem[];
  total: number;
  maxTotal: number;
  bands: ScreenBand[];
  footer?: HtmlString;
}

/* ── usabilityfindings ── UX research test summary (reuses a11yaudit's checks technique) ── */
export type UsabilitySeverity = 'critical' | 'major' | 'minor';
export interface UsabilityIssue {
  label: string;
  severity: UsabilitySeverity;
  /** how many participants hit this issue */
  affectedUsers?: number;
  note?: string;
}
export interface UsabilityfindingsProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** 0-100, percent of participants who completed the task */
  taskSuccessRate?: number;
  /** pre-formatted, e.g. "3m 42s" */
  avgTimeOnTask?: string;
  issues: UsabilityIssue[];
  footer?: HtmlString;
}

/* ── roomblockdashboard ── event/hotel room-block occupancy (reuses healthgrid's grid+banner) ── */
export type RoomLevel = 'held' | 'booked' | 'checked-in' | 'open';
export interface RoomCell {
  label: string;
  level: RoomLevel;
  /** display value, e.g. "King · 2 guests" */
  value?: string;
  detail?: string;
}
export interface RoomblockdashboardProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  cols?: number;
  cells: RoomCell[];
  footer?: HtmlString;
}

/* ── immigrationcase ── visa/petition case status (reuses statustimeline's rail) ── */
export type ImmigrationStatus = 'done' | 'current' | 'pending' | 'failed';
export interface ImmigrationStage {
  name: string;
  status: ImmigrationStatus;
  date?: string;
}
export interface ImmigrationcaseProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** e.g. "H-1B", "I-485 Adjustment of Status" */
  visaCategory: string;
  stages: ImmigrationStage[];
  /** the USCIS priority date establishing queue position */
  priorityDate?: string;
  /** Request for Evidence response deadline, if one is outstanding */
  rfeDeadline?: string;
  footer?: HtmlString;
}

export type StatusBlock =
  | (BlockBase & { type: 'progressbar'; props: ProgressbarProps })
  | (BlockBase & { type: 'stepindicator'; props: StepindicatorProps })
  | (BlockBase & { type: 'statustimeline'; props: StatustimelineProps })
  | (BlockBase & { type: 'healthgrid'; props: HealthgridProps })
  | (BlockBase & { type: 'emptystate'; props: EmptystateProps })
  | (BlockBase & { type: 'skeleton'; props: SkeletonProps })
  | (BlockBase & { type: 'sliderinput'; props: SliderinputProps })
  | (BlockBase & { type: 'segmented'; props: SegmentedProps })
  | (BlockBase & { type: 'rangefilter'; props: RangefilterProps })
  | (BlockBase & { type: 'ratinginput'; props: RatinginputProps })
  | (BlockBase & { type: 'a11yaudit'; props: A11yAuditProps })
  | (BlockBase & { type: 'painscale'; props: PainscaleProps })
  | (BlockBase & { type: 'habittracker'; props: HabittrackerProps })
  | (BlockBase & { type: 'streakgrid'; props: StreakgridProps })
  | (BlockBase & { type: 'litigationtimeline'; props: LitigationtimelineProps })
  | (BlockBase & { type: 'billtracker'; props: BilltrackerProps })
  | (BlockBase & { type: 'triageboard'; props: TriageboardProps })
  | (BlockBase & { type: 'mentalhealthscreen'; props: MentalhealthscreenProps })
  | (BlockBase & { type: 'usabilityfindings'; props: UsabilityfindingsProps })
  | (BlockBase & { type: 'roomblockdashboard'; props: RoomblockdashboardProps })
  | (BlockBase & { type: 'immigrationcase'; props: ImmigrationcaseProps });
