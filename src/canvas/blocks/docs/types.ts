// docs family block types — 10 premium, interactive document / evidence / citation components.
// Prop shapes are realistic & sample-friendly (the data agent fills them later).
import type { BlockBase, AccentVar, HtmlString } from '../../../data/conversation';
// `conversation` does not re-export IconKey, so import it from its canonical source
// (the icons barrel) — identical type, used the same way across families.
import type { IconKey } from '../../../icons/icons';

/* ── annotateddoc ── prose with highlighted passages + margin notes (hover/click a
   highlight to reveal its note) ── */
export interface DocHighlight {
  /** the verbatim phrase inside `body` to wrap as a highlight (first match) */
  phrase: string;
  /** the margin note text shown when the highlight is active */
  note: HtmlString;
  /** highlight tint accent */
  color?: AccentVar;
  /** short marginal label/author, e.g. "Legal", "AM" */
  author?: string;
}
export interface AnnotateddocProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** optional document name/eyebrow sub-line */
  docName?: string;
  /** paragraphs of plain text; highlights are matched against the joined body */
  paragraphs: string[];
  highlights: DocHighlight[];
  footer?: HtmlString;
}

/* ── redline ── tracked changes (insert / delete / edit) with accept-reject styling
   and a "show changes" toggle ── */
export interface RedlineToken {
  /** unchanged run of text */
  text?: string;
  /** inserted run (rendered green/underline when changes shown) */
  ins?: string;
  /** deleted run (rendered struck-through red when changes shown) */
  del?: string;
  /** optional author/reviewer initials for the change */
  by?: string;
}
export interface RedlineProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  docName?: string;
  tokens: RedlineToken[];
  /** count summary, e.g. "3 insertions · 2 deletions" (auto-derived if omitted) */
  footer?: HtmlString;
}

/* ── citationchain ── claim → source → sub-evidence as an expandable tree ── */
export interface CitationNode {
  /** node label / claim text */
  label: HtmlString;
  /** source domain or short cite shown as a chip */
  cite?: string;
  /** accent for the node rail */
  color?: AccentVar;
  /** strength tag */
  strength?: 'strong' | 'partial' | 'weak';
  children?: CitationNode[];
}
export interface CitationchainProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  root: CitationNode;
  footer?: HtmlString;
}

/* ── factcheck ── list of claims each with a verdict + sources + confidence
   (expand a claim for detail) ── */
export type Verdict = 'true' | 'partly' | 'false' | 'unverified';
export interface FactClaim {
  claim: HtmlString;
  verdict: Verdict;
  /** 0–100 confidence */
  confidence: number;
  /** source domains backing the verdict */
  sources?: string[];
  /** expanded explanation */
  detail?: HtmlString;
}
export interface FactcheckProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  claims: FactClaim[];
  footer?: HtmlString;
}

/* ── confidencemeter ── per-claim confidence segments (hover a segment to see what
   the confidence is based on) ── */
export interface ConfidenceSegment {
  label: string;
  /** relative weight of this segment */
  weight: number;
  /** strength band drives the color */
  band?: 'strong' | 'partial' | 'weak' | 'none';
  /** what this segment is based on (revealed on hover) */
  basis?: HtmlString;
}
export interface ConfidencemeterProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** the claim the meter scores */
  claim?: HtmlString;
  /** overall headline percentage (0–100); derived from segments if omitted */
  overall?: number;
  segments: ConfidenceSegment[];
  footer?: HtmlString;
}

/* ── highlightsnippet ── a quoted source excerpt with the key phrase <mark>ed +
   a source chip ── */
export interface HighlightsnippetProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** the excerpt; the `phrase` substring is marked */
  quote: string;
  /** the key phrase to highlight inside `quote` */
  phrase: string;
  /** source domain / publication */
  source?: string;
  /** locator, e.g. "p. 14" or "00:42" */
  locator?: string;
  /** mark tint */
  color?: AccentVar;
  footer?: HtmlString;
}

/* ── annotcallouts ── a panel/image surface with numbered callout pins (click a pin
   to read its note) ── */
export interface Callout {
  /** 0–100 position within the surface */
  x: number;
  y: number;
  /** short title of the callout */
  label: string;
  /** the note revealed when the pin is active */
  note: HtmlString;
  color?: AccentVar;
}
export interface AnnotcalloutsProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** caption under the surface */
  caption?: string;
  /** aspect ratio of the surface (w/h), default 16/9 */
  ratio?: number;
  callouts: Callout[];
  footer?: HtmlString;
}

/* ── sourcelist ── ranked sources (domain / favicon glyph / relevance) — expand a row
   for the snippet ── */
export interface SourceRow {
  domain: string;
  /** page / article title */
  titleText: string;
  /** 0–100 relevance score */
  relevance: number;
  /** single-letter favicon glyph (defaults to first letter of domain) */
  glyph?: string;
  /** brand tint for the favicon chip */
  color?: AccentVar;
  /** excerpt revealed on expand */
  snippet?: HtmlString;
  /** freshness, e.g. "2d ago" */
  date?: string;
}
export interface SourcelistProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  sources: SourceRow[];
  footer?: HtmlString;
}

/* ── claimgrid ── claims × evidence grid with check / cross / partial cells (hover a
   cell for detail) ── */
export type CellState = 'yes' | 'no' | 'partial' | 'na';
export interface ClaimCell {
  state: CellState;
  /** tooltip detail for the cell */
  note?: HtmlString;
}
export interface ClaimRow {
  claim: string;
  /** one cell per evidence column (length should match `columns`) */
  cells: ClaimCell[];
}
export interface ClaimgridProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** evidence column headers */
  columns: string[];
  rows: ClaimRow[];
  footer?: HtmlString;
}

/* ── docoutline ── collapsible document outline / TOC (click a section to "jump" —
   highlights the active section) ── */
export interface OutlineNode {
  /** section heading */
  heading: string;
  /** optional page / location label */
  loc?: string;
  /** optional reading-progress / word-count weight (drives mini bar) */
  weight?: number;
  children?: OutlineNode[];
}
export interface DocoutlineProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  docName?: string;
  sections: OutlineNode[];
  /** flattened index of the section active by default (0) */
  activeIndex?: number;
  footer?: HtmlString;
}

/* ── docview ── a PDF/page-style document VIEWER (the uploaded-file experience): a paper
   surface with structured content (headings / paragraphs / figure captions / equations)
   and IN-DOCUMENT SPOTLIGHT — focus one passage while the rest dims, with a margin note.
   This is "spotlight within a PDF": Mavéa showing you exactly the part that matters. ── */
export type DocBlockKind = 'h1' | 'h2' | 'p' | 'caption' | 'eq';
export interface DocBlock {
  kind: DocBlockKind;
  text: HtmlString;
  /** the spotlighted passage — when any block sets this, the rest dim */
  spot?: boolean;
}
export interface DocViewProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** filename / provenance line, e.g. "Smith et al. · uploaded · 14 pp" */
  source?: string;
  /** page indicator */
  page?: { n: number; of: number };
  blocks: DocBlock[];
  /** margin note shown beside the spotlighted passage */
  note?: HtmlString;
  footer?: HtmlString;
}

/* ── pdfreader ── a plain SCROLLABLE multi-page document reader: real PDF-viewer UI you page
   through (stacked paper sheets in a scroll area, a live page counter). Distinct from docview,
   which spotlights ONE passage; this one just lets you read/scroll the whole thing. ── */
export interface PdfPage {
  blocks: DocBlock[];
}
export interface PdfreaderProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** filename / provenance, e.g. "Acme_MSA_v3.pdf · 18 pp" */
  source?: string;
  /** real PDF file URL; when set, embeds the actual document instead of the synthetic pages */
  file?: string;
  /** the URL the <object> actually embeds — a same-origin proxy URL for an external PDF whose
   *  host blocks framing, so it previews inline; the visible "Open" link still uses `file`.
   *  Defaults to `file` when absent (local/same-origin PDFs need no proxy). */
  embedSrc?: string;
  pages?: PdfPage[];
  footer?: HtmlString;
}

/* ── diffviewer: side-by-side or unified text/code diff with add/remove/context lines ── */
export interface DiffLine {
  kind: 'add' | 'del' | 'ctx';
  /** Line content (plain text; rendered monospace, not HTML, to stay code-safe). */
  text: string;
  /** Old-file line number (absent on added lines). */
  oldNo?: number;
  /** New-file line number (absent on removed lines). */
  newNo?: number;
}
export interface DiffViewerProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** Labels for the two sides, e.g. ["before", "after"] or filenames. */
  leftLabel?: string;
  rightLabel?: string;
  lines: DiffLine[];
  /** Unified (single column) vs split (default unified — denser, reads top-to-bottom). */
  split?: boolean;
  footer?: HtmlString;
}

/* ── eligibilitycheck ── rules applied to MY situation: each requirement gets a
   pass / fail / needs-info verdict vs the user's stated facts, with the specific gap
   named and how to confirm it, then an honest overall verdict and a "verify with the
   official source" caveat. Distinct from a checklist: this JUDGES each rule against
   real facts rather than just listing what to tick off. ── */
export type EligibilityStatus = 'pass' | 'fail' | 'needs-info';
export type EligibilityOverall = 'likely' | 'not-yet' | 'depends';
export interface EligibilityRequirement {
  /** the rule / requirement stated plainly, e.g. "Earned income under $80,000" */
  rule: string;
  /** verdict for this rule vs the user's stated facts */
  status: EligibilityStatus;
  /** how this rule was judged against the situation, e.g. "You stated $74k — under the cap" */
  detail?: string;
  /** for a fail: what would make it qualify; for needs-info: how to confirm the missing fact */
  fix?: string;
}
export interface EligibilityCheckProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  requirements: EligibilityRequirement[];
  /** the honest bottom-line call across all requirements */
  overall?: EligibilityOverall;
  /** the "verify with the official source" reminder — this is guidance, not a ruling */
  caveat?: string;
  footer?: HtmlString;
}

/* ── evidencetrace ── the "how do you KNOW that?" surface: a claim/number shown with the
   RAW records underneath that support it (real verbatims/rows, never invented), each with a
   source and timing, plus an honest provenance line. Distinct from sourcelist (ranked links)
   and citationchain (a tree) — this enumerates the literal underlying data behind one claim. ── */
export interface EvidenceRecord {
  /** the verbatim record/row/quote that supports the claim — shown as-given, never paraphrased */
  text: string;
  /** where this record came from, e.g. "ticket #4821", "Survey Q3", "ledger row 14" */
  source?: string;
  /** when the record is from, e.g. "Apr 12", "2 weeks ago" */
  when?: string;
}
export interface EvidenceTraceProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** the headline claim or number this trace backs, e.g. "Onboarding is the top churn driver" */
  claim: HtmlString;
  /** short provenance summary of the count, e.g. "12 of 240 customers" or "from 18 tickets" */
  summary?: string;
  /** the real underlying records that support the claim (verbatim) */
  items: EvidenceRecord[];
  /** honest limitation, e.g. "self-reported; not a representative sample" */
  caveat?: string;
  footer?: HtmlString;
}

/* ── reviewsynth ── distilled reviews from MANY real customers: an aggregate rating + a 5→1 star
   distribution mini-bar, then a what-people-love vs complaints split (each theme tagged with a
   rough frequency + one verbatim quote), plus the single biggest dealbreaker. Themes and quotes
   must come from REAL reviews only — distinct from worthit (one reviewer's verdict). ── */
export interface ReviewTheme {
  /** the recurring theme, e.g. "Battery life", "Customer support" */
  theme: string;
  /** rough frequency of this theme across reviews, e.g. "62% mention", "common", "1 in 4" */
  freq?: string;
  /** one verbatim quote from a real review that captures the theme */
  quote?: string;
}
export interface ReviewSynthProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** aggregate star rating 0–5; derived from `distribution` if omitted */
  rating?: number;
  /** total number of reviews summarized; derived from `distribution` if omitted */
  count?: number;
  /** star counts [5★, 4★, 3★, 2★, 1★] for the distribution mini-bar */
  distribution?: number[];
  /** what people consistently praise */
  loves?: ReviewTheme[];
  /** what people consistently complain about */
  complaints?: ReviewTheme[];
  /** the single biggest dealbreaker to know before buying */
  dealbreaker?: string;
  footer?: HtmlString;
}

/* ── paralleltext ── two+ texts aligned LINE BY LINE in parallel columns: the original beside
   one or more translations/renderings, so you read across a row and see how each version handles
   the same line. A per-row note explains a choice and a subtle highlight flags where the versions
   genuinely diverge. Distinct from diffviewer (add/remove of ONE text) — this aligns DISTINCT
   parallel renderings of the same source. ── */
export interface ParallelColumn {
  /** column heading, e.g. "Original (Latin)" or "Fitzgerald, 1859" */
  label: string;
  /** optional language / script tag shown under the label, e.g. "la", "Old English" */
  lang?: string;
}
export interface ParallelRow {
  /** one cell per column (length should match `columns`); read across to compare renderings */
  cells: string[];
  /** an optional note for this aligned line, e.g. why two translations differ here */
  note?: string;
  /** flags an aligned line where the renderings meaningfully diverge (gets a subtle highlight) */
  diverge?: boolean;
}
export interface ParallelTextProps {
  title?: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** the parallel columns — column 0 is conventionally the source, the rest are renderings */
  columns: ParallelColumn[];
  /** the aligned lines; each row's `cells` line up with `columns` index-for-index */
  rows: ParallelRow[];
  /** a line under the header, e.g. provenance of the source text */
  caption?: string;
  footer?: HtmlString;
}

/* ── resume ── a formatted CV: paper-surface shell, a name/title letterhead, then
   Experience / Education / Skills as labeled sections. Static — no spotlight interactivity. ── */
export interface ResumeExperience {
  role: string;
  org: string;
  start: string;
  /** omit (or leave blank) for a current role — renders as "Present" */
  end?: string;
  bullets?: string[];
  location?: string;
}
export interface ResumeEducation {
  school: string;
  credential: string;
  start?: string;
  end?: string;
  /** honors, focus area, GPA — a short trailing detail line */
  detail?: string;
}
export interface ResumeProps {
  /** the person's name — doubles as the card's identity (there is no separate `title` heading) */
  name: string;
  /** professional headline, e.g. "Senior Product Designer" */
  title?: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** email, location, phone, a link — shown as a wrapped inline row under the name */
  contact?: string[];
  summary?: string;
  experience: ResumeExperience[];
  education?: ResumeEducation[];
  skills?: string[];
  footer?: HtmlString;
}

/* ── changelog ── versioned release notes: one section per version (version + date),
   each entry badge-tagged by kind (added/changed/fixed/removed/deprecated/security) along a
   color-coded rail, reusing ClinicalTimeline's event-type→color pattern for release kinds. ── */
export type ChangelogEntryKind =
  | 'added'
  | 'changed'
  | 'fixed'
  | 'removed'
  | 'deprecated'
  | 'security';
export interface ChangelogEntry {
  kind: ChangelogEntryKind;
  text: string;
}
export interface ChangelogVersion {
  version: string;
  date?: string;
  entries: ChangelogEntry[];
}
export interface ChangelogProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  versions: ChangelogVersion[];
  footer?: HtmlString;
}

/* ── lessonplan ── a teacher's lesson plan: Docview shell with clearly labeled sections
   (Objectives / Materials / Procedure / Assessment); the procedure is a numbered step list
   with an optional per-step minute badge. ── */
export interface LessonPlanStep {
  step: string;
  detail?: string;
  /** time budget for this step, in minutes */
  minutes?: number;
}
export interface LessonplanProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  subject?: string;
  gradeLevel?: string;
  /** overall class length, e.g. "50 min" — derived from the procedure's minutes when omitted */
  duration?: string;
  objectives: string[];
  materials?: string[];
  procedure: LessonPlanStep[];
  assessment?: string;
  footer?: HtmlString;
}

/* ── casebrief ── a legal case brief: Docoutline-style labeled sections (Parties / Facts /
   Issue / Holding / Reasoning), with the citation shown as a small caption under the title. ── */
export interface CasebriefParties {
  plaintiff: string;
  defendant: string;
}
export interface CasebriefProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** reporter citation, e.g. "410 U.S. 113 (1973)" */
  citation?: string;
  parties: CasebriefParties;
  facts: string;
  issue: string;
  holding: string;
  reasoning: string;
  footer?: HtmlString;
}

export type DocsBlock =
  | (BlockBase & { type: 'patentclaimchart'; props: PatentclaimchartProps })
  | (BlockBase & { type: 'storystructure'; props: StorystructureProps })
  | (BlockBase & { type: 'vetpatientchart'; props: VetpatientchartProps })
  | (BlockBase & { type: 'scoutingreport'; props: ScoutingreportProps })
  | (BlockBase & { type: 'hypothesiscard'; props: HypothesiscardProps })
  | (BlockBase & { type: 'diffviewer'; props: DiffViewerProps })
  | (BlockBase & { type: 'paralleltext'; props: ParallelTextProps })
  | (BlockBase & { type: 'docview'; props: DocViewProps })
  | (BlockBase & { type: 'pdfreader'; props: PdfreaderProps })
  | (BlockBase & { type: 'annotateddoc'; props: AnnotateddocProps })
  | (BlockBase & { type: 'redline'; props: RedlineProps })
  | (BlockBase & { type: 'citationchain'; props: CitationchainProps })
  | (BlockBase & { type: 'factcheck'; props: FactcheckProps })
  | (BlockBase & { type: 'confidencemeter'; props: ConfidencemeterProps })
  | (BlockBase & { type: 'highlightsnippet'; props: HighlightsnippetProps })
  | (BlockBase & { type: 'annotcallouts'; props: AnnotcalloutsProps })
  | (BlockBase & { type: 'sourcelist'; props: SourcelistProps })
  | (BlockBase & { type: 'claimgrid'; props: ClaimgridProps })
  | (BlockBase & { type: 'docoutline'; props: DocoutlineProps })
  | (BlockBase & { type: 'clinicaltimeline'; props: ClinicalTimelineProps })
  | (BlockBase & { type: 'researchsummary'; props: ResearchSummaryProps })
  | (BlockBase & { type: 'eligibilitycheck'; props: EligibilityCheckProps })
  | (BlockBase & { type: 'evidencetrace'; props: EvidenceTraceProps })
  | (BlockBase & { type: 'reviewsynth'; props: ReviewSynthProps })
  | (BlockBase & { type: 'resume'; props: ResumeProps })
  | (BlockBase & { type: 'changelog'; props: ChangelogProps })
  | (BlockBase & { type: 'lessonplan'; props: LessonplanProps })
  | (BlockBase & { type: 'casebrief'; props: CasebriefProps });

/* ── clinicaltimeline: a health/medical event timeline with color-coded event types.
   Use for: "my diagnosis timeline", "treatment history", "symptom progression". ── */

export type ClinicalEventType = 'symptom' | 'diagnosis' | 'treatment' | 'test' | 'result' | 'visit';

export interface ClinicalEvent {
  date: string; // "June 3, 2026" or "2026-06-03"
  type: ClinicalEventType;
  label: string;
  note?: string;
}

export interface ClinicalTimelineProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  events: ClinicalEvent[];
  footer?: HtmlString;
}

/* ── researchsummary: a structured summary of a research paper, study, or investigation.
   Use for: "summarize this study", "what did the research find", "research on X". ── */

export interface ResearchSummaryProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** The core research question or topic. */
  question: string;
  /** Brief description of method/design. */
  method?: string;
  /** Sample size or scope, e.g. "n = 1,200 adults". */
  sampleSize?: string;
  /** Key findings as bullet points. */
  findings: string[];
  /** Main takeaway or conclusion. */
  conclusion: string;
  /** Caveats, limitations, or open questions. */
  limitations?: string;
  /** Citation or source reference. */
  source?: string;
  year?: string | number;
  footer?: HtmlString;
}

/* ── hypothesiscard: a formal research hypothesis statement — the null (H0) and
   alternative (H1) hypotheses stated precisely, plus (once a test has actually run) which
   one the evidence supports. Distinct from researchsummary, whose `question` field is loose
   free text — this is the formal H0/H1 structure a real significance test is built on. ── */
export interface HypothesisVariables {
  /** the manipulated/predictor variable, e.g. "dosage (mg)" */
  iv?: string;
  /** the measured/outcome variable, e.g. "systolic blood pressure" */
  dv?: string;
}
export interface HypothesiscardProps {
  title?: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** the null hypothesis, stated precisely, e.g. "There is no difference in mean recovery
   *  time between the two treatments." */
  h0: string;
  /** the alternative hypothesis, e.g. "Treatment B reduces mean recovery time versus
   *  Treatment A." */
  h1: string;
  /** which tail(s) of the test the alternative claims; omit when the test doesn't specify one */
  direction?: 'two-tailed' | 'greater' | 'less';
  /** significance threshold the test was run against, e.g. 0.05 */
  alpha?: number;
  variables?: HypothesisVariables;
  /** the test's actual outcome: true = the null was rejected (evidence supports H1); false =
   *  failed to reject the null; omit when no test has been run yet and the card is just
   *  stating the hypotheses */
  rejected?: boolean;
  footer?: HtmlString;
}

/* ── patentclaimchart: a patent claim chart, the standard IP-litigation/licensing exhibit —
   the claim's own numbered elements as rows, the prior-art or accused-product references as
   columns, and each intersection marked whether that reference discloses the element (with
   the supporting passage on hover). Distinct from claimgrid (a general claims × evidence
   support grid with no per-element numbering or patent-specific disclosure vocabulary). ── */
export type ClaimDisclosure = 'disclosed' | 'not-disclosed' | 'disputed';
export interface PatentClaimElement {
  /** the element's own number/letter as it appears in the claim, e.g. "1.1", "[a]" */
  id: string;
  /** the claim element's language, e.g. "a housing defining an interior cavity" */
  text: string;
}
export interface PatentClaimCell {
  state: ClaimDisclosure;
  /** the supporting passage from the reference, shown on hover; omit when not-disclosed */
  quote?: HtmlString;
}
export interface PatentclaimchartProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  claimElements: PatentClaimElement[];
  /** the references charted against the claim — prior art, an accused product, a standard */
  references: string[];
  /** cells[elementIndex][referenceIndex] — one verdict per element × reference pairing */
  cells: PatentClaimCell[][];
  footer?: HtmlString;
}

/* ── storystructure: a journalism inverted-pyramid draft — the lede and nut graf called out
   in a highlighted block up top (the two sentences that carry the whole story), the body
   paragraphs in reading order below, and any secondary background/history held behind a
   collapsible tail section so the most newsworthy material always reads first. ── */
export interface StorystructureProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** the opening sentence — the single most newsworthy fact, stated first */
  lede: string;
  /** the paragraph right after the lede supplying the essential who/what/why/so-what context */
  nutGraf: string;
  /** body paragraphs, in reading order, after the lede and nut graf */
  body: string[];
  /** secondary context held behind a "background" toggle — history, prior coverage, etc. */
  background?: string[];
  /** the target length for this draft, in words */
  wordCountBudget?: number;
  /** the draft's actual word count; derived from lede + nutGraf + body when omitted */
  wordCount?: number;
  footer?: HtmlString;
}

/* ── vetpatientchart: a veterinary patient chart — the signalment (species/breed/sex/age/
   weight) as identity chips, a vitals strip for the visit's readings, and the active problem
   list. The exam-room counterpart to clinicaltimeline's human medical record. ── */
export interface VetVital {
  label: string;
  /** a reading is free-form on purpose — most are numeric ("101.5") but some are qualitative
   *  ("Pink", "CRT <2s"); the caller supplies whichever the reading actually is */
  value: string | number;
  unit?: string;
  /** flags a reading outside normal range — set by the caller from the real chart, never
   *  inferred here (there is no universal normal range across species/breed/age) */
  abnormal?: boolean;
}
export interface VetpatientchartProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  species: string;
  name: string;
  breed?: string;
  sex?: string;
  ageYears?: number;
  weightKg?: number;
  vitals?: VetVital[];
  problems?: string[];
  footer?: HtmlString;
}

/* ── scoutingreport: a sports opponent scouting report — the opponent's tendencies as a
   prose list, per-matchup notes, and the key players to game-plan around. The pre-game
   counterpart to a live box score: what to expect before the ball is snapped/tipped. ── */
export interface ScoutingMatchupNote {
  /** the matchup dimension this note covers, e.g. "Pace", "3-point defense" */
  label: string;
  note: string;
}
export interface ScoutingKeyPlayer {
  name: string;
  /** position/role, e.g. "PG", "closer", "left tackle" */
  role: string;
  note: string;
}
export interface ScoutingreportProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  opponent: string;
  tendencies: string[];
  matchupNotes?: ScoutingMatchupNote[];
  keyPlayers?: ScoutingKeyPlayer[];
  footer?: HtmlString;
}
