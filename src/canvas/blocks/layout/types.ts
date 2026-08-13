// layout family block types — 10 premium, interactive layout/narrative components.
// Prop shapes are realistic & sample-friendly (the data agent fills them later).
import type { BlockBase, AccentVar, HtmlString } from '../../../data/conversation';
// IconKey re-export from `conversation` is missing in the current scaffold (a shared
// file we must not edit), so import it from its canonical source — same type, identical
// to what `conversation` itself imports.
import type { IconKey } from '../../../types/mavea';

/** tone → accent token mapping used across the family (callout, pullquote, …) */
export type LayoutTone = 'info' | 'success' | 'warn' | 'danger' | 'neutral';

/* ── callout ── emphasized aside; tone via accent; collapsible body ── */
export interface CalloutProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** colored emphasis tone */
  tone?: LayoutTone;
  /** short label shown in the header band, e.g. "Note", "Heads up" */
  kicker?: string;
  /** the rich body (may include simple inline html) */
  body: HtmlString;
  /** optional bullet points under the body */
  points?: HtmlString[];
  /** start collapsed? (default false — looks good revealed open) */
  collapsed?: boolean;
  footer?: HtmlString;
}

/* ── proscons ── two columns (✓ pros / ✗ cons) with weights; hover emphasizes ── */
export interface ProsConsItem {
  /** the argument text */
  text: HtmlString;
  /** 1–5 strength used for the weight pip bar (default 3) */
  weight?: number;
  /** optional sub note revealed under the row */
  note?: HtmlString;
}
export interface ProsConsProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  prosLabel?: string;
  consLabel?: string;
  pros: ProsConsItem[];
  cons: ProsConsItem[];
  /** show a verdict tally bar comparing total weights */
  verdict?: HtmlString;
  footer?: HtmlString;
}

/* ── takeaways ── numbered "key takeaways" sidebar list; click marks done ── */
export interface TakeawayItem {
  /** the takeaway line */
  text: HtmlString;
  /** optional accent for this item's number chip */
  color?: AccentVar;
  /** optional one-line supporting detail */
  detail?: HtmlString;
}
export interface TakeawaysProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** small heading above the list, e.g. "What to remember" */
  heading?: string;
  items: TakeawayItem[];
  footer?: HtmlString;
}

/* ── faq ── accordion of Q&A; click a question to expand/collapse its answer ── */
export interface FaqItem {
  q: HtmlString;
  a: HtmlString;
  /** optional tag chip (e.g. "Billing") */
  tag?: string;
}
export interface FaqProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  items: FaqItem[];
  /** which item is open by default (default 0); -1 = all collapsed */
  defaultOpen?: number;
  /** allow multiple open at once (default false — classic accordion) */
  multi?: boolean;
  footer?: HtmlString;
}

/* ── tabs ── tabbed panel; click tabs to switch the shown content section ── */
export interface TabItem {
  label: string;
  icon?: IconKey;
  /** the panel body html */
  body: HtmlString;
  /** optional small count badge on the tab */
  badge?: string | number;
}
export interface TabsProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  tabs: TabItem[];
  /** index selected by default (default 0) */
  defaultTab?: number;
  /** accent for the active tab underline/marker */
  accent?: AccentVar;
  footer?: HtmlString;
}

/* ── divider ── section divider: heading + optional eyebrow + count/badge ── */
export interface DividerProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** small uppercase eyebrow above the heading */
  eyebrow?: string;
  /** big section heading */
  heading: string;
  /** optional supporting subline */
  sub?: HtmlString;
  /** count/badge pill on the right, e.g. "12 items" */
  badge?: string;
  badgeColor?: AccentVar;
  /** clickable jump chips under the divider */
  chips?: { label: string; color?: AccentVar }[];
  footer?: HtmlString;
}

/* ── pullquote ── large quote + attribution + tone accent bar ── */
export interface PullquoteProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  quote: HtmlString;
  /** who said it */
  author?: string;
  /** role / source under the author */
  role?: string;
  /** colored accent bar tone */
  tone?: LayoutTone;
  /** optional alternate quotes to cycle through */
  variants?: { quote: HtmlString; author?: string; role?: string }[];
  footer?: HtmlString;
}

/* ── storystrip ── sequential narrative panels (comic strip); stepper advances ── */
export interface StoryPanel {
  /** panel heading */
  heading: string;
  icon?: IconKey;
  /** panel body */
  body: HtmlString;
  /** accent for this panel */
  color?: AccentVar;
  /** optional short caption shown under the panel number */
  caption?: string;
}
export interface StorystripProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  panels: StoryPanel[];
  /** which panel is shown first (default 0) */
  start?: number;
  footer?: HtmlString;
}

/* ── casestudy ── setup → action → result → lesson; expand each section ── */
export interface CaseSection {
  /** body html for the section */
  body: HtmlString;
  /** optional metric chip, e.g. "+38% retention" */
  metric?: string;
}
export interface CasestudyProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** the case subject / headline */
  subject: string;
  setup: CaseSection;
  action: CaseSection;
  result: CaseSection;
  lesson: CaseSection;
  /** which stage is expanded by default (default 'result') */
  defaultStage?: 'setup' | 'action' | 'result' | 'lesson';
  footer?: HtmlString;
}

/* ── deflist ── definition/glossary list; live search box filters terms ── */
export interface DefItem {
  term: string;
  def: HtmlString;
  /** optional category tag */
  tag?: string;
  /** optional accent for the term */
  color?: AccentVar;
}
export interface DeflistProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** search placeholder, default "Filter terms…" */
  placeholder?: string;
  items: DefItem[];
  footer?: HtmlString;
}

/* ── accordion ── expand/collapse content sections (settings, details, docs); each
   section carries rich body html plus an optional leading icon, meta hint, and tag ── */
export interface AccordionSection {
  /** the section header label */
  label: string;
  /** rich body revealed on expand */
  body: HtmlString;
  /** optional leading icon on the header row */
  icon?: IconKey;
  /** small right-aligned hint, e.g. "3 items", "Updated May" */
  meta?: string;
  /** optional badge chip on the header */
  tag?: string;
  tagColor?: AccentVar;
}
export interface AccordionProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  sections: AccordionSection[];
  /** which section is open by default (default 0); -1 = all collapsed */
  defaultOpen?: number;
  /** allow multiple open at once (default false — classic single-open accordion) */
  multi?: boolean;
  footer?: HtmlString;
}

/* ── verdictcard ── the opening call: a bold verdict + the one reason + an honest caveat ── */
export type VerdictStance = 'yes' | 'no' | 'maybe' | 'caution';
export type VerdictConfidence = 'high' | 'medium' | 'low';
export interface VerdictcardProps {
  /** eyebrow label, e.g. "The verdict" */
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** the headline judgment, e.g. "Bet on the search rewrite first" */
  verdict: HtmlString;
  /** stance drives the badge word, icon, and accent */
  stance?: VerdictStance;
  /** override the badge word (defaults from the stance) */
  label?: string;
  /** the single most important reason behind the call */
  reason?: HtmlString;
  /** the honest caveat / "unless…" that keeps the verdict trustworthy */
  caveat?: HtmlString;
  /** qualitative confidence — never a fabricated percentage */
  confidence?: VerdictConfidence;
  footer?: HtmlString;
}

/* ── scenarioset ── best / likely / worst outcomes side by side, one metric in focus ── */
export type ScenarioKind = 'best' | 'likely' | 'worst';
export interface ScenarioPanel {
  /** outcome flavor — drives the accent + default label */
  kind?: ScenarioKind;
  /** override the label, e.g. "Optimistic" */
  label?: string;
  /** the headline outcome, e.g. "+40% faster", "6 months", "High" */
  value: string;
  /** one-line description of this outcome */
  detail?: HtmlString;
  /** a couple of drivers / notes under the value */
  points?: HtmlString[];
}
export interface ScenariosetProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** what the values measure, e.g. "Search latency after the rewrite" */
  metric?: string;
  scenarios: ScenarioPanel[];
  /** index of the panel to emphasize (defaults to the 'likely' one) */
  highlight?: number;
  footer?: HtmlString;
}

/* ── worthit ── single-product "is it worth it for you" value verdict ── */
export type WorthVerdict = 'worth-it' | 'skip' | 'depends';
export interface WorthItProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  product?: string; // the item being judged, shown as a subtitle
  verdict: WorthVerdict;
  price?: string; // "$249"
  priceNote?: string; // honest context: "vs ~$180 typical" — or that no reliable price was found
  worthItIf?: string[]; // conditions where buying is the right call
  skipIf?: string[]; // conditions to pass
  dealBreaker?: string; // the single biggest catch
  forWho?: string; // who it is for
  bottomLine?: HtmlString; // one-line summary
  footer?: HtmlString;
}

/* ── companionnote ── low-chrome "I'm here with you" reflection (emotional support) ── */
export interface CompanionNoteProps {
  reflection: string; // one warm second-person reflection of the user's feeling, from their words
  follow?: string; // an optional gentle follow line
  chip?: string; // ONE soft cue, e.g. "I'm here" / "take your time"
}

/* ── positioncard ── where a situation falls on a calibrated normal→concerning scale ──
   Merges triage-ladder + normal-spectrum + reassure-watch: a graded scale with the current
   position marked, an honest read, and concrete escalation triggers. */
export type PositionTone = 'good' | 'caution' | 'bad';
export interface PositionLevel {
  label: string; // "Usually normal" | "Worth watching" | "Get it checked"
  detail?: string; // what this level means
  tone?: PositionTone; // colour (good→caution→bad)
}
export interface PositionCardProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  levels: PositionLevel[]; // ordered low→high (2–5)
  atLevel?: number; // 0-based index of where the situation currently falls
  marker?: string; // short label for the marker, e.g. "Where this falls"
  reason?: string; // why it sits there
  watchFor?: string[]; // concrete escalation triggers ("get help if…")
  caveat?: string; // honest "context matters / not a diagnosis"
  footer?: HtmlString;
}

/* ── differential ── ranked plausible explanations/causes with honest likelihood ── */
export type DiffLikelihood = 'common' | 'less-common' | 'rare';
export interface DifferentialCause {
  name: string;
  likelihood?: DiffLikelihood; // honest odds band
  tell?: string; // the tell-tale feature that fits
  pointsAway?: string; // what would point elsewhere
  serious?: boolean; // a can't-miss serious possibility to flag even if rare
}
export interface DifferentialProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  causes: DifferentialCause[];
  prompt?: string; // one concrete way to narrow it down
  caveat?: string; // honest "possibilities, not a diagnosis"
  footer?: HtmlString;
}

/* ── reframecard ── a cognitive reframe of ONE stuck thought: harsh thought verbatim → warmer truth ── */
export interface ReframeCardProps {
  /** eyebrow label, e.g. "A gentler take" */
  title?: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** the harsh thought, VERBATIM in the user's own words — shown under "What you're telling yourself" */
  thought: HtmlString;
  /** gentle name for the thinking pattern, shown as a small chip, e.g. "catastrophizing", "mind-reading" */
  distortion?: string;
  /** the warmer, truer counter-thought, shown under "What's also true" — the emphasized payoff */
  reframe: HtmlString;
  footer?: HtmlString;
}

/* ── breathpacer ── a paced calming breath done WITH the canvas: a soft orb that scales on the
   inhale, holds, and settles on the exhale in a pure-CSS loop (no JS timer, leak-free), with a
   phase caption. Domain-neutral affective surface; honours prefers-reduced-motion with a still
   instruction. A named pattern OR explicit inhale/hold/exhale seconds drives the cycle. */
export type BreathPattern = '478' | 'box' | 'calm';
export interface BreathPacerProps {
  title?: string; // gentle heading, defaults to "Breathe with me"
  icon?: IconKey;
  iconColor?: AccentVar;
  pattern?: BreathPattern; // '478' = 4-7-8, 'box' = 4-4-4, 'calm' = even 4-in/6-out (default)
  inhale?: number; // explicit seconds, overrides the pattern's inhale
  hold?: number; // explicit hold seconds (0 = no hold), overrides the pattern's hold
  exhale?: number; // explicit seconds, overrides the pattern's exhale
  note?: HtmlString; // one soft line of context, e.g. why this helps right now
}

/* ── copingmenu ── permission-giving menu of doable-now coping options, each tagged by capacity ── */
export type CopingEffort = 'low' | 'medium' | 'high';
export interface CopingOption {
  label: string; // the doable-now action, in plain words
  detail?: string; // one gentle line on how/why it helps
  effort?: CopingEffort; // how much it asks of them (low→high)
  time?: string; // a small commitment, e.g. "2 min"
  icon?: IconKey; // optional cue icon for the option
}
export interface CopingMenuProps {
  title?: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  intro?: string; // gentle "pick whatever feels possible — you don't have to do all of them"
  options: CopingOption[]; // capacity-tagged, choose-one coping options
  footer?: HtmlString;
}

/* ── subtextdecode ── decode a received message the user is unsure about ──
   Pins the verbatim message, then ranks 2–3 honest interpretations (each on its textual cue),
   an "you can't know for sure" line, and one clarifying reply. The 'caution' flavor reframes it
   as red-flag/scam screening without a second component. Affective surface; reflects the user's words. */
export type SubtextLikelihood = 'most likely' | 'possible' | 'less likely';
export interface SubtextReading {
  interpretation: string; // what the sender might actually mean
  likelihood?: SubtextLikelihood; // honest odds band
  cue?: string; // the exact word/phrasing in the message this reading rests on (or the red flag)
}
export interface SubtextDecodeProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** 'tone' decodes intent/feeling; 'caution' reframes the readings as red flags / scam screening */
  flavor?: 'tone' | 'caution';
  message: string; // the received message, verbatim — pinned at the top
  readings: SubtextReading[]; // ranked interpretations, most likely first (2–3)
  cantKnow?: string; // honest "you can't be certain from text alone" line
  reply?: string; // one clarifying reply the user could send
  footer?: HtmlString;
}

/* ── rehearsal ── branching conversation playbook for a hard talk ──
   A quotable opener, then likely reactions as branches (each with a coached
   response + why it works) and a graceful exit line. Framed as rehearsal, not
   prediction. Distinct from dialogue (a scripted exchange) and decisiontree. */
export interface RehearsalBranch {
  reaction: string; // how they might react, completing "If they …" (e.g. "get defensive")
  say: HtmlString; // the coached, quotable response to that reaction
  why?: HtmlString; // a short note on why this response works
}
export interface RehearsalProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  opener: HtmlString; // the quotable line to start the conversation
  branches: RehearsalBranch[]; // 2–3 likely reactions, each with a coached reply
  exit?: HtmlString; // a graceful line to wrap things up if needed
  footer?: HtmlString;
}

/* ── messagescriptset ── one bundle of ready-to-send messages aimed at SEVERAL targets at once ──
   "Here is what to say to cancel / dispute / ask X across these N places." Each target is its own
   card: a channel chip, the exact line to send, and an optional rebuttal for when they push back.
   Distinct from compose's messagedraft, which polishes ONE message to ONE recipient. */
export type ScriptChannel = 'email' | 'phone' | 'in-app' | 'chat';
export interface MessageScript {
  target: string; // who this line is for: the recipient, vendor, or service
  channel?: ScriptChannel; // how it is meant to be sent (shown as a chip)
  message: string; // the exact line to send — copy-friendly, the user's own ask in their words
  rebuttal?: string; // what to say if they push back or counter-offer
}
export interface MessageScriptSetProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  intro?: string; // one short framing line above the bundle
  scripts: MessageScript[]; // one entry per target (1–many)
  footer?: HtmlString;
}

/* ── talktrack ── a speakable, word-for-word talk-track / teleprompter ── */
export interface TalkTrackLine {
  say: string; // the literal words to say, one sentence/beat at a time
  beat?: string; // a delivery/timing note, e.g. "pause here" or "~15s"
  note?: string; // an optional quiet aside (tone, why this line lands)
}
export interface TalkTrackProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  lines: TalkTrackLine[]; // the sentences to say, in order
  totalTime?: string; // honest overall length, e.g. "~90s"
  footer?: HtmlString;
}

/* ── lifeline ── a calm crisis-support surface: warm opener + REAL helplines, led with on an
   acute self-harm / abuse / emergency turn (the selector forces it and suppresses reflective cards) ── */
export interface LifelineResource {
  name: string; // "988 Suicide & Crisis Lifeline"
  contact: string; // how to reach them, e.g. "Call or text 988"
  href?: string; // a tel:/sms: link, e.g. "tel:988"
  note?: string; // "24/7 · free · confidential"
}
export interface LifelineProps {
  title?: string; // warm heading; defaults to a supportive line
  message?: string; // a validating opener in the user's situation — never clinical
  safetyQuestion?: string; // e.g. "Are you safe right now?"
  resources: LifelineResource[]; // REAL, verified helplines for the user's region
  grounding?: string; // an optional grounding offer
  reassurance?: string; // honest "I'm here, but not a substitute for a person who can help"
}

/* ── scansionmark ── poetry scansion / prosody markup ──
   Marks each syllable's stress (´ stressed / ˘ unstressed) above the line, draws foot-divider
   bars between metrical feet, and shows the rhyme letter in the right margin under a named meter.
   Stress + foot data are authored per syllable; the component COMPUTES the mark glyphs, the
   foot-boundary bars from `feet` indices, and the rhyme-letter palette from the data. */
export type ScansionStress = 'stressed' | 'unstressed';
export interface ScansionSyllable {
  /** the syllable text as it appears in the line (a word may span several syllables) */
  text: string;
  /** which mark sits above it — drives ´ (stressed) vs ˘ (unstressed) */
  stress: ScansionStress;
}
export interface ScansionLine {
  /** the line's syllables, left→right, each tagged with its stress */
  syllables: ScansionSyllable[];
  /** syllable indices where a foot boundary falls (a bar is drawn before each index) */
  feet?: number[];
  /** the rhyme-scheme letter shown in the right margin, e.g. "a", "b" */
  rhyme?: string;
}
export interface ScansionMarkProps {
  title?: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** the scanned lines, in order */
  lines: ScansionLine[];
  /** the named meter, e.g. "iambic pentameter" — shown as a heading chip */
  meter?: string;
  /** a short note under the lines, e.g. what the scansion reveals */
  caption?: string;
  footer?: HtmlString;
}

/* ── typespec ── a typography specimen / type-scale sheet ──
   Each style row renders AT ITS REAL pixel size (a display head down to a caption) beside its
   spec chips (typeface, weight, size, line-height, tracking), so the sheet IS the type scale.
   The shown size is the authored `sizePx`, clamped only so an outsized display never overflows
   the card; an optional heading/body pairing demonstrates the two faces working together. */
export interface TypeStyle {
  /** the role name, e.g. "Display", "H1", "Body", "Caption" */
  name: string;
  /** the sample text rendered at this style; defaults to a pangram-ish specimen line */
  sample?: string;
  /** the authored size in px — the row renders at this size (clamped to fit the card) */
  sizePx: number;
  /** CSS font-weight, e.g. 400, 600, 700 (default 500) */
  weight?: number;
  /** unitless line-height shown in the spec chips, e.g. 1.2 */
  lineHeight?: number;
  /** letter-spacing as a CSS length, e.g. "-0.02em" — shown verbatim and applied */
  tracking?: string;
  /** the typeface name shown in the spec chips (and applied if it resolves) */
  family?: string;
  /** optional accent for the role label */
  color?: AccentVar;
}
export interface TypeSpecProps {
  title?: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** the type scale, largest → smallest (display → caption) */
  styles: TypeStyle[];
  /** an optional font-pairing showcase: a heading face over a body face */
  pairing?: { heading: string; body: string };
  /** a short note under the specimen */
  caption?: string;
  footer?: HtmlString;
}

/* ── shotlist ── a film / video shot breakdown ──
   One row per shot: a small framed thumbnail placeholder carrying the shot-size label (its
   composition cue), the movement / lens / duration metadata, and the action + optional dialogue
   line. The framing aspect and the size badge are derived from the named shot size. */
export type ShotSize = 'WS' | 'MS' | 'CU' | 'ECU' | 'OTS';
export interface Shot {
  /** the shot number, in sequence */
  n: number;
  /** the framing — drives the thumbnail's subject scale and the size badge */
  size?: ShotSize;
  /** camera movement, e.g. "Slow push-in", "Static", "Handheld pan" */
  movement?: string;
  /** the lens, e.g. "24mm", "85mm" */
  lens?: string;
  /** on-screen duration, e.g. "4s" */
  duration?: string;
  /** what happens in frame — the action line */
  action: string;
  /** an optional spoken line under the action */
  dialogue?: string;
}
export interface ShotListProps {
  title?: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** the shots, in sequence */
  shots: Shot[];
  /** a short note under the list */
  caption?: string;
  footer?: HtmlString;
}

/* ── beatsheet ── a narrative-structure beat sheet ──
   The story's beats laid along it (positioned by their page/percent marker), each with its name,
   position, and a one-line summary, under an optional tension curve. The curve is plotted from
   the `tension` numbers; the beat dots are placed from each beat's parsed `at` position (evenly
   spaced when no position is given), so both read off the authored data — no invented shape. */
export interface StoryBeat {
  /** the beat's name, e.g. "Catalyst", "Midpoint", "Finale" */
  name: string;
  /** where it falls in the story — a page or percent, e.g. "12", "50%", "p.45" */
  at?: string;
  /** the one-line description of the beat */
  line: string;
}
export interface BeatSheetProps {
  title?: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** the structure model the beats follow, e.g. "Save the Cat", "3-act", "hero journey" */
  framework?: string;
  /** the beats, in story order */
  beats: StoryBeat[];
  /** an optional tension level per beat (any scale) — plotted as a curve under the beats */
  tension?: number[];
  /** a short note under the sheet */
  caption?: string;
  footer?: HtmlString;
}

/* ── promptset ── a calm set of open reflection / journaling prompts ──
   Each prompt is an open question with a gentle one-line guidance, grouped under an optional theme.
   Low-chrome by design (no checkboxes, no scores): an invitation to think, not a task to clear.
   Distinct from a checklist (things to do) and a quiz (questions with answers). */
export interface ReflectionPrompt {
  /** the open question to sit with — never yes/no, never a task */
  question: string;
  /** an optional gentle line on how to approach it, e.g. "no need to be profound" */
  guidance?: string;
}
export interface PromptSetProps {
  title?: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** an optional theme the prompts gather under, e.g. "Evening wind-down" */
  theme?: string;
  prompts: ReflectionPrompt[];
  /** a short steadying note under the set */
  caption?: string;
  footer?: HtmlString;
}

/* ── zoneladder ── a training intensity-zone ladder (easy → VO2max) ──
   Stacked bands, Zone 1 at the bottom and the hardest at the top, each with its range,
   felt-effort, and training purpose under a cool→hot gradient, with a "you are here" marker
   on the current zone. The band height/colour scaffold is fixed; the marker position is COMPUTED
   from `current` (the zone index). Distinct from a generic gauge — these are named training zones. */
export interface TrainingZone {
  /** the zone name, e.g. "Zone 2 · Endurance" */
  name: string;
  /** the measured range for the chosen metric, e.g. "133–151 bpm", "5:30–6:00 /km", "RPE 4–5" */
  range: string;
  /** the felt effort, e.g. "Comfortable, can hold a conversation" */
  effort: string;
  /** what training in this zone builds, e.g. "Aerobic base & fat metabolism" */
  purpose: string;
}
export interface ZoneLadderProps {
  title?: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** what the ranges are measured in — drives the metric chip; defaults to "HR" */
  metric?: 'HR' | 'pace' | 'RPE';
  /** the zones, ordered easiest → hardest (Zone 1 → 5); rendered bottom-up */
  zones: TrainingZone[];
  /** 0-based index of the zone the athlete is currently in — drives the "you are here" marker */
  current?: number;
  /** a short note under the ladder */
  caption?: string;
  footer?: HtmlString;
}

/* ── picturesequence ── an order-the-events picture strip (first → then → next → last) ──
   3–6 illustrated panels left-to-right, each a simple symbolic placeholder carrying a sequence
   marker (first/then/next/last) and a caption, with arrows between them. The marker word and its
   accent are DERIVED from the panel's position when not given, so the strip always reads in order.
   A language / early-learning surface; distinct from a film shotlist (camera framings, not steps). */
export type SequenceMarker = 'first' | 'then' | 'next' | 'last';
export interface SequencePanel {
  /** the short label naming the step, e.g. "Get the bread" */
  label: string;
  /** the ordinal cue; derived from position (first → then… → last) when omitted */
  marker?: SequenceMarker;
  /** an optional one-line caption under the panel */
  caption?: string;
}
export interface PictureSequenceProps {
  title?: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** the steps in order, left → right (3–6) */
  panels: SequencePanel[];
  /** a short note under the strip */
  caption?: string;
  footer?: HtmlString;
}

/* ── storyarc ── a named narrative framework rendered as its canonical visual shape ──
   Freytag: tension pyramid. Three-act: proportioned phase bands. Hero's Journey: circular arc.
   Save the Cat: 15-beat horizontal timeline. Supplied beats are pinned to their stage as markers. */
export type StoryFramework = 'freytag' | 'threeact' | 'herojourney' | 'savethecat';

export interface ArcBeat {
  /** stage name matched case-insensitively against the framework's stage list */
  stage: string;
  /** short label shown as a marker on the arc */
  label: string;
}

export interface StoryArcProps {
  title?: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  framework: StoryFramework | string;
  beats?: ArcBeat[];
  caption?: string;
  footer?: HtmlString;
}

/* ── devicemark ── a text passage with rhetorical/literary devices highlighted ──
   Each annotated phrase is wrapped in a styled span coloured by device class.
   Use for AP-English/IB analysis, debate rhetoric, speechwriting tuition. */
export interface DeviceMarkItem {
  /** the exact phrase to annotate (matched case-insensitively, first occurrence) */
  phrase: string;
  /** the rhetorical/literary device, e.g. "metaphor", "simile", "alliteration" */
  device: string;
  /** optional short note shown in the tooltip */
  note?: string;
}

export interface DeviceMarkProps {
  title?: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** the full passage text to annotate */
  text: string;
  /** the phrases to highlight and the device each represents */
  marks?: DeviceMarkItem[];
  /** a short caption under the passage */
  caption?: string;
  footer?: HtmlString;
}

/* ── thoughtrecord ── a full CBT thought record: the moment, the automatic thought, the felt
   emotion, the evidence for/against weighed side by side, and the alternative thought that
   comes out the other side — with an honest before/after on how much the feeling shifted.
   Distinct from reframecard (ONE thought, no evidence-weighing) and proscons (a decision, not
   a belief under examination): this is the full CBT worksheet, laid out as a vertical stack of
   warm cards rather than the traditional 7-column table, which never survives a phone width. */
export interface ThoughtrecordProps {
  title?: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** the situation/trigger that set the thought off, in plain words — HTML-safe */
  situation: HtmlString;
  /** the automatic thought, as close to verbatim as possible */
  automaticThought: HtmlString;
  /** the felt emotion, e.g. "Anxious", "Ashamed" */
  emotion: string;
  /** how strong the emotion felt at the time, 0–100 (the standard CBT worksheet scale) */
  emotionIntensity?: number;
  /** facts that seem to support the automatic thought */
  evidenceFor?: HtmlString[];
  /** facts that complicate or contradict it */
  evidenceAgainst?: HtmlString[];
  /** the balanced thought that weighs both columns — the payoff of the worksheet */
  alternativeThought?: HtmlString;
  /** the emotion after weighing the evidence, if it shifted from `emotion` */
  outcomeEmotion?: string;
  /** the emotion's intensity after the reframe, 0–100, same scale as `emotionIntensity` */
  outcomeIntensity?: number;
  footer?: HtmlString;
}

/* ── dosdonts ── paired guidance: what TO do next to the thing it replaces, so the contrast
   reads ACROSS each row. Distinct from proscons, which weighs a decision the user actually
   posed (PROS/CONS headers over two independent columns, plus a for/against tally) — advice
   under those headers reads as a verdict on a choice nobody asked about. Also distinct from
   takeaways, a flat numbered checklist with no counterpart per line. Pairs are deliberately
   the unit: real guidance is rarely evenly matched, so either side of a pair may be absent
   and the surviving side then spans the row on its own. */
export interface DosDontsPair {
  /** the thing to do — the recommended move */
  do?: HtmlString;
  /** the thing it replaces — what to avoid doing instead */
  dont?: HtmlString;
  /** one short line on why the contrast matters */
  why?: HtmlString;
  /** a genuine hazard (safety, legal, irreversible) rather than ordinary bad form —
   *  raises the don't side from `--warning` to `--danger` with an alert mark */
  hazard?: boolean;
  /** short label for what this pair is about, e.g. "Opening line" */
  topic?: string;
}
export interface DosDontsProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** context line above the pairs, e.g. "In the first five minutes" */
  heading?: string;
  /** column header for the do side (default "Do") */
  doLabel?: string;
  /** column header for the don't side (default "Don't") */
  dontLabel?: string;
  pairs: DosDontsPair[];
  footer?: HtmlString;
}

/* ── variantswitch ── ONE answer re-framed along ONE axis (tone, length, audience), switched
   between rather than stacked. compose/variants renders every variant at once as a single
   run of text apiece — right for three subject lines, unreadable for three multi-paragraph
   rewrites — and tabs is a navigation control whose panels are different SECTIONS, not the
   same content said differently. Scoped to text on purpose: the body is paragraphs, never
   nested blocks. */
export interface SwitchVariant {
  /** the switch label, e.g. "Firm", "One paragraph", "For an exec" */
  label: string;
  /** the body of this framing, one entry per paragraph */
  paragraphs: string[];
  /** one line on when to reach for this framing */
  when?: string;
  /** optional icon on this variant's switch chip */
  icon?: IconKey;
}
export interface VariantSwitchProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** what the variants vary ALONG, e.g. "Tone", "Length", "Audience" */
  axis?: string;
  /** the shared thing being re-framed, quoted above the switch */
  subject?: string;
  variants: SwitchVariant[];
  /** which variant is shown first (default 0) */
  defaultVariant?: number;
  /** accent for the active chip and the axis rail */
  accent?: AccentVar;
  footer?: HtmlString;
}

export type LayoutBlock =
  | (BlockBase & { type: 'callout'; props: CalloutProps })
  | (BlockBase & { type: 'verdictcard'; props: VerdictcardProps })
  | (BlockBase & { type: 'scenarioset'; props: ScenariosetProps })
  | (BlockBase & { type: 'accordion'; props: AccordionProps })
  | (BlockBase & { type: 'proscons'; props: ProsConsProps })
  | (BlockBase & { type: 'takeaways'; props: TakeawaysProps })
  | (BlockBase & { type: 'faq'; props: FaqProps })
  | (BlockBase & { type: 'tabs'; props: TabsProps })
  | (BlockBase & { type: 'divider'; props: DividerProps })
  | (BlockBase & { type: 'pullquote'; props: PullquoteProps })
  | (BlockBase & { type: 'storystrip'; props: StorystripProps })
  | (BlockBase & { type: 'casestudy'; props: CasestudyProps })
  | (BlockBase & { type: 'deflist'; props: DeflistProps })
  | (BlockBase & { type: 'worthit'; props: WorthItProps })
  | (BlockBase & { type: 'companionnote'; props: CompanionNoteProps })
  | (BlockBase & { type: 'positioncard'; props: PositionCardProps })
  | (BlockBase & { type: 'differential'; props: DifferentialProps })
  | (BlockBase & { type: 'reframecard'; props: ReframeCardProps })
  | (BlockBase & { type: 'breathpacer'; props: BreathPacerProps })
  | (BlockBase & { type: 'copingmenu'; props: CopingMenuProps })
  | (BlockBase & { type: 'subtextdecode'; props: SubtextDecodeProps })
  | (BlockBase & { type: 'rehearsal'; props: RehearsalProps })
  | (BlockBase & { type: 'messagescriptset'; props: MessageScriptSetProps })
  | (BlockBase & { type: 'talktrack'; props: TalkTrackProps })
  | (BlockBase & { type: 'lifeline'; props: LifelineProps })
  | (BlockBase & { type: 'scansionmark'; props: ScansionMarkProps })
  | (BlockBase & { type: 'typespec'; props: TypeSpecProps })
  | (BlockBase & { type: 'shotlist'; props: ShotListProps })
  | (BlockBase & { type: 'beatsheet'; props: BeatSheetProps })
  | (BlockBase & { type: 'promptset'; props: PromptSetProps })
  | (BlockBase & { type: 'zoneladder'; props: ZoneLadderProps })
  | (BlockBase & { type: 'picturesequence'; props: PictureSequenceProps })
  | (BlockBase & { type: 'storyarc'; props: StoryArcProps })
  | (BlockBase & { type: 'devicemark'; props: DeviceMarkProps })
  | (BlockBase & { type: 'thoughtrecord'; props: ThoughtrecordProps })
  | (BlockBase & { type: 'dosdonts'; props: DosDontsProps })
  | (BlockBase & { type: 'variantswitch'; props: VariantSwitchProps });
