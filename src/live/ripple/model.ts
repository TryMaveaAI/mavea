// model.ts — the ShipModel: one structured artifact describing a change's whole chain of
// consequence. Forward now (this change → what it touches, what breaks, the safe ship order); the
// same nodes/edges are built to also support the reverse, incident direction later (a live signal →
// its cause). Produced once (a hand-authored hero example today, a real diff/repo later) and rendered
// three ways — the immersive RippleOverlay, inline Live blocks (shipToBlocks), and the gate.
//
// The whole product rests on every claim being grounded: each carries an evidence tier, and a
// citation points at a real file:line / contract / trace. Nothing here is ever meant to be fabricated
// — a value Mavéa can't ground is dropped or marked unknown, never invented.
import type { DiffViewProps } from '../../data/conversation';

/** How sure Mavéa is of a claim — mirrors the Live `conf` tiers and the grounding contract.
 *  `verified` is in fetched bytes / a parsed contract; `static` is a deterministic parse; `inferred`
 *  is a semantic read (kept, labelled, never shown as bare fact). */
export type Evidence = 'verified' | 'static' | 'inferred';

/** A claim's risk, in the concepts' vocabulary → tokens: safe → --insight, watch → --warning,
 *  breaks → --danger. */
export type RiskLevel = 'safe' | 'watch' | 'breaks';

/** A system-map node/edge's status — the five-way vocabulary the impact map reads by: `breaks`
 *  (coral), `migration` (amber), `untested` (muted), `affected` (blue/presence), `safe` (green). */
export type NodeStatus = 'breaks' | 'migration' | 'untested' | 'affected' | 'safe';

/** The kind of a single change in a diff (concept 07's taxonomy). */
export type ChangeKind = 'interface' | 'behavior' | 'perf' | 'breaking' | 'config' | 'test';

/** The kind of work a whole PR represents (concept 08 §6). */
export type WorkType = 'security' | 'feature' | 'fix' | 'refactor' | 'migration' | 'dependency';

/** Where an affected site sits relative to this change. The cross-repo ones are the moat — the
 *  breakage a diff can't see. */
export type Scope = 'in-pr' | 'downstream' | 'cross-repo' | 'untouched';

/** Severity if this paged in prod. */
export type Severity = 'P0' | 'P1' | 'P2' | 'P3';

/** Reading level for an explanation — one artifact that meets a new grad and a principal alike. */
export type Altitude = 'newgrad' | 'working' | 'principal';

/** The status of a caller relative to a changed contract (concept 07 §5). */
export type CallerStatus = 'updated' | 'breaks' | 'untested' | 'affected';

/** A pointer Mavéa can cite. The product is only trustworthy because these are real. */
export interface SourceRef {
  /** e.g. "auth/token.ts:42" or a contract id "POST /v1/token/legacy". */
  ref: string;
  /** Repo when the ref lives in another repo; omit for this one. */
  repo?: string;
  evidence: Evidence;
}

/** A node on the system impact map — a subsystem, service, contract, datastore, client, or job. */
export interface ShipNode {
  id: string;
  label: string;
  /** A second line: a path, a contract, a count. */
  sub?: string;
  type: 'service' | 'contract' | 'datastore' | 'client' | 'job' | 'module' | 'pr';
  status: NodeStatus;
  scope: Scope;
  owner?: string;
  team?: string;
  /** 0..1 prod-traffic weight (drives the traffic lens + node size). `undefined` = unknown — and
   *  unknown is rendered honestly, never as a fabricated number. */
  traffic?: number;
  /** Human-readable traffic, e.g. "4.2M req/day · p99 12ms", or "traffic unknown". */
  trafficLabel?: string;
  severity?: Severity;
  crossRepo?: boolean;
  /** The contract this node owns / speaks. */
  contract?: string;
  /** What goes wrong here. */
  problem?: string;
  /** Mavéa's call — the fix. */
  fix?: string;
  cite?: SourceRef;
  /** The same node explained at each reading level (concept 08 §7). */
  altitudeNotes?: Partial<Record<Altitude, string>>;
  /** Optional manual placement on a 0..1 unit world; omit to radial-place from the change. */
  x?: number;
  y?: number;
}

export interface ShipEdge {
  from: string;
  to: string;
  /** The relationship verb drawn on the connector: "calls" / "reads" / "emits". */
  verb: string;
  status: NodeStatus;
  /** This edge is where it breaks → animated dashed coral (the most important mark on the map). */
  breaking?: boolean;
  dashed?: boolean;
  crossRepo?: boolean;
}

/** One caller / affected site of a change (concept 07 cause-&-effect panel). */
export interface ChangeLink {
  name: string;
  ref: string;
  scope: Scope;
  status: CallerStatus;
}

export interface ShipChange {
  id: string;
  subsystem: string;
  file: string;
  kind: ChangeKind;
  risk: RiskLevel;
  title: string;
  /** Mavéa's plain-language read of what the change does. */
  intent: string;
  /** Why it's in this PR. */
  why: string;
  /** The annotated diff — reuses the verified DiffView prop shape. */
  diff: DiffViewProps;
  /** Node ids this change touches (its blast radius on the map). */
  blastRadius?: string[];
  blastFiles?: number;
  blastOutside?: number;
  links: ChangeLink[];
  risks?: { level: RiskLevel; text: string }[];
  altitudeNotes?: Partial<Record<Altitude, string>>;
  /** Symbols this change defines/reshapes (functions, exports). Used to find real callers in the
   *  repo when a connected source lets Ripple read beyond the diff. */
  symbols?: string[];
}

export interface CascadeHop {
  /** Short label for the hop, e.g. "gateway still calls the old shape". */
  label: string;
  /** Who owns it / how far out, e.g. "2 HOPS OUT · Edge team". */
  context: string;
  severity: RiskLevel;
}
export interface ShipCascade {
  /** The originating change, e.g. "validateToken() gets a new arg". */
  trigger: string;
  triggerRef?: SourceRef;
  hops: CascadeHop[];
  /** The incident at the end of the chain. */
  incident: string;
  incidentSeverity: Severity;
  /** The resolution: ship X first, so the chain never starts. */
  caughtBeforeMerge: string;
}

export interface MigrationStep {
  title: string;
  detail: string;
}
export interface ShipMigration {
  file: string;
  /** The deceptively-small SQL. */
  sql?: string[];
  /** The fact that makes it expensive, e.g. "2.1B". */
  rows?: string;
  /** The real cost, e.g. "~40 min writes blocked on prod". */
  lockCost: string;
  /** The expand/contract steps that ship it safely. */
  expand: MigrationStep[];
  /** A downstream-readers warning (a nightly job that reads the changed column). */
  note?: string;
}

export interface ShipRolloutStep {
  order: number;
  team: string;
  deploy: string;
  note: string;
  /** The deploy you instinctively do first that actually breaks things. */
  trap?: boolean;
}

export interface DecisionEvent {
  date: string;
  kind: 'incident' | 'pr' | 'review' | 'experiment' | 'state';
  label: string;
}
export interface ShipHotspot {
  id: string;
  symbol: string;
  file: string;
  /** "haunted" (load-bearing fix), "hot" (high churn), "tuned" (set by an experiment). */
  cls: 'haunted' | 'hot' | 'tuned';
  whyExists: string;
  incident?: { id: string; severity: string; text: string };
  decisionTrail?: DecisionEvent[];
  ask?: { name: string; team: string; why: string; note?: string };
  riskSignals?: { k: string; v: string }[];
}

export interface ShipSuggestion {
  id: string;
  /** CONCURRENCY / COMPATIBILITY / RESILIENCE / OBSERVABILITY / DATA — the lens it raises. */
  category: string;
  title: string;
  gist: string;
  why: string;
  /** The grounding — why you're seeing this, cited to real refs. */
  evidence: string;
  fix: string;
}

/** Onboarding (no PR): the service as a set of modules you can learn (concept 08 §8). */
export interface ShipModule {
  id: string;
  name: string;
  purpose: string;
  entry: string;
  owner: string;
  health: string;
  explain: string;
  startHere: string[];
  depends: string[];
  usedBy: string[];
}

/** One lesson of an onboarding course — a single sitting that builds on the last. Everyone does every
 *  lesson; the altitude only changes HOW it's explained, not WHICH lessons you get. */
export interface CourseLesson {
  title: string;
  /** Rough time to do it, in minutes. */
  minutes?: number;
  /** What you'll understand once you've done it (the level-neutral fallback). */
  goal: string;
  /** The same lesson explained at each altitude — new grad gets more orientation, a principal the
   *  crux/tradeoffs. The section shows the one for the current "Explain for" level, else `goal`. */
  explainFor?: Partial<Record<Altitude, string>>;
  /** The real files/areas to open and read for this lesson. */
  read: string[];
  /** The handful of ideas to take away. */
  concepts: string[];
  /** The gotcha for this lesson: a place to be careful, the cause-and-effect of changing it, and the
   *  downstream blast — stated WITH the reason, so the reader understands it instead of fearing it. */
  caution?: string;
  /** A question to check you got it — with the answer, revealed on demand. */
  checkpoint?: { question: string; answer: string };
  /** The in-depth content — generated ON DEMAND when the lesson is opened (it's expensive: it reads the
   *  real code), so the outline stays cheap. Absent until the reader opens the lesson. */
  detail?: LessonDetail;
}

/** One step of a lesson's code SPOTLIGHT — a real part of the codebase the lesson walks you through.
 *  Each carries the actual excerpt (quoted from the real file, never invented) and why it matters. */
export interface WalkStep {
  /** The real file this part lives in, e.g. "src/canvas/blocks/catalog/index.ts". */
  file: string;
  /** What to look at — a function/symbol/line range, e.g. "registerBlock()" or "L20-48". */
  focus?: string;
  /** The actual code excerpt, quoted verbatim from the file (so the spotlight shows real code). */
  code?: string;
  /** What this part does and why it matters — the teaching for this step. */
  explain: string;
}

/** A lesson's deep, in-depth content. The overview teaches the idea; the walkthrough is the spotlight
 *  through the real code; concepts/pitfalls/exercise make it a genuine lesson, not a blurb. Grounded in
 *  the actual files — nothing invented. */
export interface LessonDetail {
  /** The real teaching — several paragraphs that actually explain the idea and how it works HERE. */
  overview: string;
  /** The spotlight: an ordered walk through the important parts of the real code. */
  walkthrough: WalkStep[];
  /** Key ideas, each properly explained (not just named). */
  concepts: { term: string; explain: string }[];
  /** Common mistakes / things that bite people in this area. */
  pitfalls?: string[];
  /** A hands-on task to cement it, with an optional hint and a self-verifiable check — "day-1
   *  first-change" energy: a safe, real, tiny change with an observable outcome. */
  exercise?: { task: string; hint?: string; check?: string };
}

/** Where a course sits in the progression — a college-style ladder everyone climbs in order. */
export type CourseLevel = 'beginner' | 'intermediate' | 'expert';

/** One question of an end-of-course quiz. `answer` is always the canonical text — usable on its own
 *  as a plain reveal-then-self-grade question. When `choices` (3-4 options) and `correct` (the index
 *  into them) are ALSO present, the question renders as an interactive multiple-choice pick instead,
 *  with `explain` shown once the learner answers. Older data that only ever had
 *  `{ question, answer }` still parses and plays fine — it just stays a plain reveal. */
export interface QuizQuestion {
  question: string;
  answer: string;
  /** 3-4 options; when present (with a valid `correct`), rendered as an interactive multiple-choice. */
  choices?: string[];
  /** Index into `choices` of the right one. */
  correct?: number;
  /** Shown after the learner answers, explaining why. */
  explain?: string;
}

/** A small, self-contained sample project — the course's closing challenge, grounded in this repo's
 *  real files and patterns (or, when a safe standalone exercise fits better, a tiny companion exercise
 *  using the same patterns). `acceptance` are checks a newcomer can verify themselves, unassisted. */
export interface CourseCapstone {
  title: string;
  brief: string;
  steps: string[];
  acceptance: string[];
}

/** A guided course in the onboarding curriculum. Model-authored. The courses form ONE progression
 *  (beginner → intermediate → expert) that everyone works through in order to understand the codebase
 *  deeply — not three difficulty tracks you pick between. */
export interface ShipCourse {
  title: string;
  subtitle?: string;
  /** Its rung on the beginner → intermediate → expert ladder. */
  level?: CourseLevel;
  lessons: CourseLesson[];
  /** An end-of-course quiz — questions with answers, to check real understanding. */
  quiz?: QuizQuestion[];
  /** The course's closing sample-project task, when the model wrote one. */
  capstone?: CourseCapstone;
}

export interface GateCondition {
  id: string;
  label: string;
  status: 'met' | 'pending' | 'failed';
  /** Who must clear it — a human, or an agent's structured check. */
  actor: 'human' | 'agent';
}
/** The humans + agents gate: a picture for people, a machine-readable contract for agents. */
export interface ShipGate {
  decision: 'pass' | 'watch' | 'block';
  shipSafe: boolean;
  unackedP0: number;
  /** What must happen first, e.g. ["gateway@v2", "mobile_release"]. */
  requires: string[];
  deployOrder: 'enforced' | 'unset';
  conditions: GateCondition[];
  rationale: string;
}

/** What produced this model + what it's honestly blind to. Surfaced so the user always knows what
 *  the picture can and can't see. */
export interface ShipProvenance {
  source: 'seed' | 'pasted-diff' | 'folder' | 'github' | 'gitlab' | 'bitbucket' | 'git';
  /** True when this is a labelled showcase example, not a live analysis of the user's code. */
  example?: boolean;
  /** Honest notes: what was skipped, what's unknown (no callers fetched, no traces connected, …). */
  notes?: string[];
}

export interface ShipPr {
  repo: string;
  number?: string;
  branch?: string;
  base?: string;
  added?: number;
  removed?: number;
  files?: number;
  title: string;
  /** Mavéa's read — the whole PR in ~2 sentences. */
  summary: string;
  /** "Before you merge" — risks pulled to the top, worst first. */
  risks: { level: RiskLevel; text: string }[];
  /** The headline count, e.g. "2 ways to cause a P0". */
  p0Ways?: number;
  /** Read from N changes across M subsystems. */
  readScope?: string;
}

/** One of the six "every kind of change" cards (concept 08 §6). */
export interface ShipWorkType {
  type: WorkType;
  label: string;
  blurb: string;
  surfaces: string;
}

/** Incident mode — the REVERSE direction. The same picture of consequence, run backwards from a live
 *  symptom (a paged alert / error / log line) to its likely cause, the rollback, and who to wake.
 *  Read-only: the rollback is a draft to copy, never an action Ripple takes. */
export interface IncidentHop {
  /** A step on the chain back from the symptom toward the cause. */
  label: string;
  /** Where/when, e.g. "2 min before the page · auth-service deploy". */
  context: string;
}
export interface ShipIncident {
  /** The symptom as reported — the alert/error headline. */
  symptom: string;
  severity?: Severity;
  /** The service/surface that paged, if the alert named one. */
  service?: string;
  /** The chain from symptom back to cause (read top-down: closest effect → root cause). */
  chain: IncidentHop[];
  /** Mavéa's read of the likely root cause — inferred, and honest about being so. */
  rootCause: string;
  /** The rollback, as steps you can copy and run yourself. Ripple never executes it. */
  rollback: string[];
  /** Who actually holds the context to fix it. */
  whoToWake: { name: string; team: string; why: string }[];
  /** The war-room timeline, writing itself as the incident unfolds. */
  timeline: { time: string; label: string }[];
  /** What this read is grounded in, and what to connect to confirm the exact cause. */
  evidence?: string;
}

export interface ShipModel {
  pr: ShipPr;
  nodes: ShipNode[];
  edges: ShipEdge[];
  changes: ShipChange[];
  cascades: ShipCascade[];
  migration?: ShipMigration;
  rollout: ShipRolloutStep[];
  workTypes: ShipWorkType[];
  hotspots: ShipHotspot[];
  suggestions: ShipSuggestion[];
  /** How many shallow nits Mavéa suppressed to show only what's worth your attention. */
  suppressedNits: number;
  modules: ShipModule[];
  onboarding?: {
    firstWeek: { team: string; title: string; sub: string; file: string }[];
    requestLife: string[];
  };
  gate: ShipGate;
  /** Present only in Incident mode — the reverse read, from a live symptom back to its cause. */
  incident?: ShipIncident;
  /** A curriculum of guided onboarding courses (the explore path) — progressive, by level. */
  courses?: ShipCourse[];
  provenance: ShipProvenance;
}
