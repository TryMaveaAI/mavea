// flows family block types — process/structure/timeline visualizations.
import type { BlockBase, AccentVar, HtmlString } from '../../../data/conversation';
import type { IconKey } from '../../../icons/icons';

/* ---------- shared bits ---------- */
export type FlowStatus = 'done' | 'active' | 'todo' | 'blocked' | 'risk';

/* ---------- kanban ---------- */
export interface KanbanCard {
  id: string;
  title: string;
  tag?: string;
  tagColor?: AccentVar;
  assignee?: string;
  points?: number;
}
export interface KanbanStage {
  name: string;
  accent?: AccentVar;
  cards: KanbanCard[];
}
export interface KanbanBoardProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  stages: KanbanStage[];
  footer?: string;
}

/* ---------- wizard ---------- */
export interface WizardStep {
  label: string;
  caption?: string;
  body: string;
  bullets?: string[];
  status?: FlowStatus;
}
export interface WizardStepperProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  steps: WizardStep[];
  activeStep?: number;
  footer?: string;
}

/* ---------- decisiontree ---------- */
/** One class's share of the samples reaching a node — the "value=[…]" box a scikit-learn tree
 *  diagram shows at every split AND leaf. */
export interface ClassCount {
  className: string;
  count: number;
  color?: AccentVar;
}
export interface DecisionNode {
  id: string;
  question: string;
  detail?: string;
  yes?: string; // id of next node when yes
  no?: string; // id of next node when no
  outcome?: string; // leaf result text
  outcomeColor?: AccentVar;
  /* ---- optional ML-classifier-tree fields (all additive; a node using none of these renders
     exactly as the generic yes/no tree always has) ---- */
  /** Feature this node splits on, e.g. "petal_length_cm". Paired with `threshold`, replaces the
   *  generic `question` label with the learned split condition "feature ≤ threshold". */
  splitFeature?: string;
  /** The learned split point: samples with `splitFeature` ≤ this follow `yes`, the rest `no`. */
  threshold?: number;
  /** This node's impurity under `impurityMetric` — lower means a purer class mix. */
  impurity?: number;
  impurityMetric?: 'gini' | 'entropy';
  /** Class counts for the samples that reached this node. Real trees show this at split nodes
   *  too, not just leaves, so it's independent of `isLeaf`. */
  classDistribution?: ClassCount[];
  /** Explicit leaf flag for an ML tree, where a split node can also carry a
   *  `classDistribution` — so leaf-ness can't be inferred from that field alone. Falls back to
   *  the original outcome-based inference (`outcome` set, no `yes`/`no`) when omitted. */
  isLeaf?: boolean;
}
export interface DecisionTreeProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  rootId: string;
  nodes: DecisionNode[];
  footer?: string;
}

/* ---------- goaltree ---------- */
export interface KeyResult {
  label: string;
  progress: number; // 0..100
  target?: string;
  color?: AccentVar;
}
export interface Objective {
  name: string;
  owner?: string;
  progress: number; // 0..100
  keyResults: KeyResult[];
}
export interface GoalTreeProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  objectives: Objective[];
  footer?: string;
}

/* ---------- plandag ---------- */
export interface DagNode {
  id: string;
  label: string;
  col: number; // x lane (0-based)
  row: number; // y lane (0-based)
  status?: FlowStatus;
  meta?: string;
}
export interface DagEdge {
  from: string;
  to: string;
}
export interface PlanDagProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  nodes: DagNode[];
  edges: DagEdge[];
  footer?: string;
}

/* ---------- milestones ---------- */
export interface Milestone {
  label: string;
  date: string;
  status?: FlowStatus;
  detail?: string;
  owner?: string;
}
export interface MilestoneTrackProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  milestones: Milestone[];
  footer?: string;
}

/* ---------- processflow ---------- */
export interface ProcessStep {
  label: string;
  detail?: string;
  icon?: IconKey;
  branch?: string; // optional side note / alternate path
}
export interface ProcessFlowProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  steps: ProcessStep[];
  footer?: string;
}

/* ---------- journeymap ---------- */
export interface JourneyStage {
  name: string;
  action: string;
  emotion: number; // -2..2
  touchpoints: string[];
  opportunity?: string;
}
export interface JourneyMapProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  persona?: string;
  stages: JourneyStage[];
  footer?: string;
}

/* ---------- orgchart ---------- */
export interface OrgNode {
  id: string;
  name: string;
  role?: string;
  accent?: AccentVar;
  children?: string[];
}
export interface OrgChartProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  rootId: string;
  nodes: OrgNode[];
  footer?: string;
}

/* ---------- roadmap ---------- */
export interface RoadmapItem {
  label: string;
  startQ: number; // 0-based quarter index
  spanQ: number; // number of quarters
  status?: FlowStatus;
  detail?: string;
}
export interface RoadmapLane {
  name: string;
  accent?: AccentVar;
  items: RoadmapItem[];
}
export interface RoadmapProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  quarters: string[];
  lanes: RoadmapLane[];
  footer?: string;
}

/* ---------- headcountplan ---------- */
export interface HeadcountDept {
  name: string;
  budgeted: number;
  filled: number;
  openReqs?: number;
}
export interface HeadcountPlanProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  depts: HeadcountDept[];
  footer?: string;
}

/* ---------- issuetree ---------- */
/** A MECE issue-tree node. `children` holds the ids of its sub-branches — the same flat
 *  array + id-reference shape OrgChart uses, rather than nesting node objects, so the whole
 *  tree stays one lookup table the recursive renderer walks (and can cycle-guard). There is
 *  no separate `rootId`: whichever nodes no other node claims as a child ARE the tree's
 *  top-level branches off `rootQuestion`. */
export interface IssueNode {
  id: string;
  label: string;
  children?: string[];
  /** Explicit leaf flag; falls back to "has no children" when omitted. */
  isLeaf?: boolean;
  /** Short finding/evidence caption shown under a leaf box. */
  finding?: string;
}
export interface IssueTreeProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  rootQuestion: string;
  nodes: IssueNode[];
  footer?: string;
}

/* ---------- logicmodel ---------- */
/** A program logic model's five locked stages, always laid out left to right in this exact
 *  order regardless of how the model orders `columns`. */
export type LogicStage = 'inputs' | 'activities' | 'outputs' | 'outcomes' | 'impact';
export interface LogicColumn {
  stage: LogicStage;
  items: string[];
}
export interface LogicModelProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** Up to one entry per stage; a stage with no authored column renders empty rather than
   *  collapsing the five-column grid. */
  columns: LogicColumn[];
  footer?: string;
}

/* ---------- contentcalendar ---------- */
export type ContentStatus = 'idea' | 'drafted' | 'scheduled' | 'posted';
export interface ContentCell {
  platform: string;
  week: string;
  status: ContentStatus;
  title?: string;
  format?: string;
}
export interface ContentCalendarProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** Grid rows, top to bottom. */
  platforms: string[];
  /** Grid columns, left to right (date labels). */
  weeks: string[];
  /** One tile per (platform, week) that has something planned; an unlisted pair renders as
   *  an empty slot rather than an invented "idea" placeholder. */
  cells: ContentCell[];
  footer?: string;
}

/* ---------- businesscanvas ---------- */
/** Which nine-box strategy canvas the labels come from. Maurya's Lean Canvas kept Osterwalder's
 *  geometry and relabeled five boxes — keyPartners→Problem, keyActivities→Solution,
 *  keyResources→Key Metrics, valueProposition→Unique Value Proposition,
 *  customerRelationships→Unfair Advantage (channels, segments, costs, revenue keep their names) —
 *  so ONE prop set serves both variants, slot for slot. */
export type BusinessCanvasVariant = 'bmc' | 'lean';
export interface BusinessCanvasProps {
  title?: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  variant?: BusinessCanvasVariant;
  /** The nine regions, each a short bullet list. All optional: a region nobody filled in still
   *  renders (dimmed, label only) so the canvas shape never collapses. */
  keyPartners?: string[];
  keyActivities?: string[];
  keyResources?: string[];
  valueProposition?: string[];
  customerRelationships?: string[];
  channels?: string[];
  customerSegments?: string[];
  costStructure?: string[];
  revenueStreams?: string[];
  footer?: string;
}

/* ---------- family union ---------- */
/* ── chronologicaltimeline: dated events along a horizontal axis, optionally grouped into eras.
   Distinct from `statustimeline` (event status) — this is real chronology for history, product
   history, a person's life, a project's actual dates. ── */
export interface TimelineEra {
  label: string;
  /** Start/end as positions 0..100 along the axis. */
  from: number;
  to: number;
  color?: AccentVar;
}
export interface ChronoEvent {
  /** Position 0..100 along the axis. */
  at: number;
  /** Date/era label shown under the marker, e.g. "1969" or "Q3". */
  date: string;
  title: string;
  detail?: string;
  color?: AccentVar;
}
export interface ChronologicalTimelineProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** Axis end labels, e.g. ["1900", "2000"]. */
  startLabel?: string;
  endLabel?: string;
  eras?: TimelineEra[];
  events: ChronoEvent[];
  footer?: string;
}

/* ---------- trustmap ---------- */
export interface TrustFlow {
  /** What kind of data this is, e.g. "Email address" or "Voice recordings". */
  data: string;
  /** Where it is stored, e.g. "On your device" or "Encrypted in EU servers". */
  location: string;
  /** Who can see it, e.g. "Only you" or "Your team + admins". */
  access: string;
  /** Optional retention — how long it is kept, e.g. "30 days" or "Until you delete it". */
  retention?: string;
}
export interface TrustCheck {
  label: string;
  /** True / omitted = satisfied (green check); false = a gap (amber alert). */
  ok?: boolean;
}
export interface TrustMapProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  flows: TrustFlow[];
  /** Optional security checklist rendered below the flows. */
  checklist?: TrustCheck[];
  /** Optional plain-text reassurance / caveat line above the footer. */
  note?: string;
  footer?: HtmlString;
}

/* ---------- skilltree ---------- */
/** A node's mastery state — drives its color and whether prerequisites are met. */
export type SkillState = 'locked' | 'available' | 'unlocked' | 'maxed';
export interface SkillNode {
  id: string;
  label: string;
  /** Tier band, 0-based; nodes sharing a tier sit in the same horizontal row. */
  tier: number;
  state?: SkillState;
  /** Point / time cost to unlock, e.g. "3 pts" or "2 wk". */
  cost?: string;
  /** ids of nodes that must be unlocked first — drawn as prerequisite edges. */
  requires?: string[];
}
export interface SkillTreeProps {
  title?: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  nodes: SkillNode[];
  /** Short line under the title (e.g. "12 of 18 skills unlocked"). */
  caption?: string;
  footer?: HtmlString;
}

export type FlowsBlock =
  | (BlockBase & { type: 'chronologicaltimeline'; props: ChronologicalTimelineProps })
  | (BlockBase & { type: 'skilltree'; props: SkillTreeProps })
  | (BlockBase & { type: 'kanban'; props: KanbanBoardProps })
  | (BlockBase & { type: 'wizard'; props: WizardStepperProps })
  | (BlockBase & { type: 'decisiontree'; props: DecisionTreeProps })
  | (BlockBase & { type: 'goaltree'; props: GoalTreeProps })
  | (BlockBase & { type: 'plandag'; props: PlanDagProps })
  | (BlockBase & { type: 'milestones'; props: MilestoneTrackProps })
  | (BlockBase & { type: 'processflow'; props: ProcessFlowProps })
  | (BlockBase & { type: 'journeymap'; props: JourneyMapProps })
  | (BlockBase & { type: 'orgchart'; props: OrgChartProps })
  | (BlockBase & { type: 'roadmap'; props: RoadmapProps })
  | (BlockBase & { type: 'trustmap'; props: TrustMapProps })
  | (BlockBase & { type: 'headcountplan'; props: HeadcountPlanProps })
  | (BlockBase & { type: 'issuetree'; props: IssueTreeProps })
  | (BlockBase & { type: 'logicmodel'; props: LogicModelProps })
  | (BlockBase & { type: 'contentcalendar'; props: ContentCalendarProps })
  | (BlockBase & { type: 'businesscanvas'; props: BusinessCanvasProps });
