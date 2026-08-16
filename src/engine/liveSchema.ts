// liveSchema.ts — the bridge between a live LLM's loose JSON and the typed canvas.
//
// The model is asked to emit ONE compact JSON object (a simplified MaveaResponse):
//   { title, sub, narration, blocks:[{type, props}] }
// using only a SUBSET of the block types in conversation.ts (tiered to what the
// connected model fills reliably). validateLiveResponse() then coerces/repairs that loose JSON into a
// safe, fully-typed { title, sub, narration, blocks: Block[] } the existing
// TopicCanvas can render verbatim — dropping unknown block types, snapping colors to
// the allowed token set, clamping numbers, capping count, and assigning the col spans
// + reveal delays + insight ids that the renderer expects.
//
// Nothing here renders or speaks — App owns that. This module is pure (no I/O), so it
// is the unit-testable core of Live mode.
import type {
  AccentVar,
  Block,
  InsightProps,
  ChartProps,
  ChartSeries,
  BreakdownProps,
  BreakdownRow,
  ListProps,
  TimelineProps,
  TimelineEvent,
  CompareProps,
  CmpOption,
  CmpCriterion,
  CmpCell,
  KpiGridProps,
  KpiSpec,
  RingStatProps,
  RingSpec,
  Conf,
  DeltaDir,
  SourceRef,
  BarChartProps,
  BarSpec,
  StackedBarProps,
  StackSeg,
  DonutProps,
  DonutRow,
  GaugeProps,
  WebSource,
  CompositeProps,
  CompositeRegion,
  BendSpec,
  Blank,
  BlankKind,
} from '../data/conversation';
import type { BlanksProps } from '../canvas/blocks/forms/types';
import type {
  PhotoProps,
  DiagramProps,
  DiagShape,
  DiagShapeKind,
  DiagLabel,
} from '../canvas/blocks/media/types';
import type {
  DiagramFlowProps,
  DiagramNode,
  DiagramEdge,
  DiagramNodeKind,
  DiagramEdgeKind,
  DiagramLayout,
} from '../canvas/blocks/diagrams/types';
import type { TeachDiagramProps, TeachStep } from '../canvas/blocks/learn/types';
import { catalogMeta, type ComponentMeta, type ItemSpec } from '../canvas/blocks/catalog';
import { CATALOG_FACTS, catalogFacts } from '../canvas/blocks/catalog/facts';
import { isValidBendFormula } from '../lib/bend';
import { validateAnnotations, type AnnotationSurface } from '../canvas/lib/annotations';
import {
  ALLOWED_BLOCK_TYPES,
  FRONTIER_BLOCK_TYPES,
  PHOTO_BLOCK_TYPE,
  blockTypesForTier,
} from './blockTypes';
import { actionSpec } from '../live/actions/catalog';
import type { AskComplexity } from '../live/select/complexity';
import { safeImageUrl, safeBlockImageSrc } from '../live/image/safeUrl';
import { safeHttpUrl } from '../lib/sourceHost';
import {
  capContentText,
  enforceComponentContentBudget,
  fieldContentBudget,
} from '../canvas/blocks/catalog/contentBudget';
import { Icon, ICON_KEYS, type IconKey } from '../icons/icons';
import { completedBlocks as recoverBlocks, extractStringField } from '../live/streamParse';
import { STRUCTURAL_REFERENCES } from '../canvas/blocks/catalog/structures.generated';
import {
  trimToSentence,
  collapseRepeatedValues,
  forDisplay,
  forSpeech,
  proseForDisplay,
  proseForSpeech,
  resolveAnnotations,
} from '../lib/spokenText';

/** Recover a top-level string field from a truncated/unclosed JSON buffer, or '' if it
 *  hasn't fully arrived. Thin wrapper over the streaming parser so the salvage path and
 *  the live-reveal path share ONE scanner (no second, drifting copy). */
function recoverStringField(buf: string, name: string): string {
  return extractStringField(buf, name) ?? '';
}

/* ------------------------------------------------------------------ *
 * The validated, canvas-ready result of one Live turn.
 * ------------------------------------------------------------------ */
/** A drawn gesture a tour stop asks for: Mavéa circles / underlines / arrows / highlights the
 *  block element whose text matches `at` while speaking that stop's line. The span gestures
 *  ("rising"/"falling"/"bracket", and "brace" down the side of adjacent rows) sweep from `at`
 *  toward `to`; "note" scrawls `label` beside it. The judgment gestures state something about
 *  the datum — "strike" rejects it, "question" doubts it (only on a block whose own conf is an
 *  estimate), "star" crowns THE takeaway, "check" confirms it, "frame" boxes a region.
 *  "connect" is the one cross-block gesture: it draws from `at` (in THIS stop's own block) to
 *  `to` (in the block named by `onIndex`), for a line that's genuinely about how two rendered
 *  blocks relate — everything else stays scoped to the stop's own block. */
export interface TourMark {
  kind:
    | 'circle'
    | 'underline'
    | 'point'
    | 'highlight'
    | 'rising'
    | 'falling'
    | 'bracket'
    | 'note'
    | 'connect'
    | 'strike'
    | 'question'
    | 'star'
    | 'check'
    | 'frame'
    | 'brace';
  /** The exact text of the value or label to mark — must appear in the block's own data.
   *  For a span gesture it's the START of the span; for "note" it's the item the aside hangs off. */
  at: string;
  /** The far end of a span gesture (the value the trend climbs TO, the right side of a bracket).
   *  Must also appear in the block's data. Optional for "rising"/"falling" (then it glosses the
   *  whole chart); required for "connect" (searched in `onIndex`'s block, not this stop's own);
   *  ignored by the point gestures. */
  to?: string;
  /** The handwritten words for a "note", or a "bracket"'s delta caption ("+38%", "vs. last year"). */
  label?: string;
  /** Optional ink tone: "key" = presence purple (the single most important mark of the tour),
   *  "cool" = blue (negative / contrast / lower-than-expected). Default is warm orange. */
  color?: 'warm' | 'key' | 'cool';
  /** "connect" only: the 0-based index (same numbering as `tour[].index`) of the OTHER block
   *  `to` lives in. Omitted, or equal to this stop's own index, is meaningless for "connect"
   *  and gets dropped — a connector needs two distinct blocks. */
  onIndex?: number;
}

/** Every drawn-gesture kind the model may author — the validator drops anything else. */
const MARK_KINDS: ReadonlySet<string> = new Set<TourMark['kind']>([
  'circle',
  'underline',
  'point',
  'highlight',
  'rising',
  'falling',
  'bracket',
  'note',
  'connect',
  'strike',
  'question',
  'star',
  'check',
  'frame',
  'brace',
]);

/** A self-declared correction of an earlier answer: the thing, the old claim, the new one.
 *  Answers that own being wrong — history heals visibly, never silently. */
export interface CorrectsNote {
  what: string;
  was: string;
  now: string;
}

export interface LiveResponse {
  title: string;
  sub: string;
  narration: string;
  /** Semantic domain category emitted by the model (e.g. "Finance", "Biology") — used by the
   *  atlas to cluster conversations into meaningful neighborhoods instead of by keyword. */
  topic?: string;
  blocks: Block[];
  /** Optional model hint for how this turn relates to the last: clear and rebuild
   *  ('replace'), add to the canvas ('augment'), or update it ('refine'). The surface
   *  treats this as a hint only — a deterministic topic-shift check is the safety net. */
  continuity?: 'replace' | 'augment' | 'refine';
  /** Whether the answer just written explains a MECHANISM — things that brought about other
   *  things — and so has a causal web worth opening as a living world. The model is the only
   *  honest judge here: it wrote the answer, and no pattern over the reader's phrasing can tell
   *  "how does photosynthesis work" (a mechanism) from "how do I center a div" (a recipe). */
  causal?: boolean;
  /** Optional model-authored spotlight order: a tour of block INDICES (0-based) each with
   *  a short line, so a capable model can choreograph which block it talks about when.
   *  Indices (not ids) survive the lifecycle's re-numbering; the surface drops any
   *  out-of-range entry and falls back to the deterministic reading-order tour. A stop may
   *  also carry drawn gestures: a single `mark`, or `marks[]` to call out SEVERAL data points on
   *  the one block (drawn one after another as the line is spoken) — the model wrote the block, so
   *  it knows which data its line is about. `mark` mirrors `marks[0]` for back-compat. */
  tour?: {
    index: number;
    say?: string;
    saySpoken?: string;
    mark?: TourMark;
    marks?: TourMark[];
  }[];
  /** Web citations when the turn was grounded by a search (surfaced under the canvas). */
  sources?: WebSource[];
  /** Suggested follow-up prompts, rendered as tappable chips. Cheaper than
   *  pre-generating follow-up answers: a chip only costs tokens when tapped. */
  chips?: string[];
  /** Concept nodes the model chose to write to the user's personal wiki this turn (cross-
   *  session memory). Each node has a slug ("profile", "preferences", "topics.finance") and
   *  a COMPLETE body that REPLACES the prior content for that concept. Saved locally ONLY when
   *  memory is on; never auto-persisted. Omit when nothing genuinely new was learned. */
  memory?: { concept: string; body: string }[];
  /** The model's own reading of the ask — short constraint chips ("Tokyo trip", "~$2,500
   *  each") the user can tap to correct directly ("edit its mind"). Real constraints drawn
   *  from the ask/context only; a misunderstanding becomes a 2-second chip fix instead of a
   *  re-explained monologue. */
  understood?: string[];
  /** Declared when this turn genuinely CONTRADICTS something said earlier in the session —
   *  the surface marks the earlier answer corrected instead of silently rewriting history. */
  corrects?: CorrectsNote;
  /** "Bendable answer": the ONE draggable input of a calculational answer plus formulas for
   *  how its outputs follow (validated whitelist arithmetic in x; the model emits a block
   *  INDEX, resolved to the block's id here). Replace turns only — a bend on a follow-up is
   *  dropped rather than guessed onto the wrong canvas. */
  bend?: BendSpec;
  /** "The Blank Space": the holes this answer left for the user to fill — gathered from any
   *  `blanks` block's slots plus a top-level `blanks` array (inline `{__blank}` tokens). */
  blanks?: Blank[];
  /** True when the answer is intentionally incomplete until ≥1 blank is filled (any blank present).
   *  The surface reads this to enter its fill-then-refine flow. */
  awaiting?: boolean;
  /** The model's own 0–100 judgement that this answer is worth standing up as a living dashboard,
   *  with a short reason. Emitted only for the rare ongoing metric/trend a user would revisit; the
   *  surface shows a quiet "Track this live" chip only above a threshold (see dashboards/detect). */
  track?: { score: number; reason: string };
  /** The voice-ready version of `narration`, derived from its inline [[shown|said]] annotations:
   *  the SAME line with tricky terms respelled and numbers/money/dates/symbols written as words
   *  ("$5,000/mo" → "five thousand dollars a month"). The surface speaks this and shows the clean
   *  `narration`; absent when the line already reads aloud as written. (Tour lines and block notes
   *  carry their own spoken twins — `saySpoken` and `noteSpoken` — derived the same way.) */
  spoken?: string;
}

// The block-type capability sets now live in the dependency-free leaf engine/blockTypes.ts (so
// modules needing only these sets don't pull the whole catalog in through this file); imported
// above for internal use and re-exported here so existing `from '../engine/liveSchema'` importers
// are unaffected.
export { ALLOWED_BLOCK_TYPES, FRONTIER_BLOCK_TYPES, PHOTO_BLOCK_TYPE, blockTypesForTier };

/** The ONLY color tokens the model may use (CSS vars defined in styles.css). */
export const ALLOWED_COLORS = new Set<AccentVar>([
  'var(--presence)',
  'var(--presence-soft)',
  'var(--insight)',
  'var(--warning)',
  'var(--danger)',
  'var(--text-muted)',
]);

/** Default col span per supported block type (matches the 12-col card-grid). */
const COL_BY_TYPE: Record<string, number> = {
  insight: 4,
  chart: 8,
  breakdown: 4,
  list: 4,
  timeline: 8,
  compare: 12,
  kpi: 6,
  ring: 4,
  // frontier cousins
  bars: 8,
  stack: 6,
  donut: 4,
  gauge: 4,
  // generated image — give it a wide, prominent span
  photo: 6,
};

/** The library-size claim the prompt makes ("hand-picked from a library of N") — computed from
 *  the REAL catalog instead of a hand-typed figure, so it can never drift out of date as the
 *  library grows (it's headed toward 1000+ components; see catalog.data.ts). Rounded down to the
 *  nearest 50 and phrased as a floor ("400+") so it stays true between catalog additions rather
 *  than needing to track the exact count. */
const LIBRARY_SIZE_LABEL = `${Math.floor(CATALOG_FACTS.length / 50) * 50}+`;

/** The exact prop shape taught for each hand-coerced core type — ONE source for both the base
 *  prompt below and `blockShapeHint` (the dashboards refresh teaches a widget's shape from this;
 *  see that function). Shape only: any usage guidance ("ONLY for values changing OVER TIME")
 *  stays in the prompt text beside the interpolation. */
const CORE_SHAPE_HINTS: Record<string, string> = {
  insight:
    '{"title": string, "summary"?: string, "stat"?: string, "delta"?: string, "deltaDir"?: "up"|"down"|"good", "conf"?: "strong"|"partial"|"inferred"}',
  chart:
    '{"title": string, "unit"?: string, "labels": string[], "series": [{"name": string, "color": string, "data": number[]}], "footer"?: string, "conf"?: "strong"|"partial"|"inferred"}',
  breakdown:
    '{"title": string, "rows": [{"name": string, "val": string, "pct": number(0-100), "hot"?: boolean, "tag"?: string}], "conf"?: "strong"|"partial"|"inferred"}',
  list: '{"title": string, "items": string[]}',
  timeline:
    '{"eyebrow"?: string, "events": [{"time": string, "title": string, "detail"?: string}]}',
  compare:
    '{"eyebrow"?: string, "options": [{"name": string, "sub"?: string, "pick"?: boolean}], "criteria": [{"label": string, "cells": [{"v": string, "win"?: boolean}]}], "recommendation"?: string}',
  kpi: '{"title": string, "items": [{"label": string, "value": string, "sub"?: string}], "conf"?: "strong"|"partial"|"inferred"}',
  ring: '{"title": string, "rings": [{"label": string, "pct": number(0..1), "display": string, "hint"?: string}]}',
  bars: '{"title": string, "unit"?: string, "bars": [{"label": string, "value": number, "hot"?: boolean}], "conf"?: "strong"|"partial"|"inferred"}',
  stack:
    '{"title": string, "total"?: string, "segments": [{"label": string, "value": number, "display": string, "color": string}], "conf"?: "strong"|"partial"|"inferred"}',
  donut:
    '{"title": string, "rows": [{"label": string, "pct": number(0-100), "color": string}], "conf"?: "strong"|"partial"|"inferred"}',
  gauge:
    '{"title": string, "value": number, "max"?: number, "band"?: string, "conf"?: "strong"|"partial"|"inferred"}',
  blanks:
    '{"title": string, "intro"?: string, "slots": [{"key": string, "label": string, "prompt": string, "kind": "date"|"number"|"text"|"choice", "unit"?: string, "options"?: string[], "placeholder"?: string}]}',
};

/** The prop shape a model should copy when emitting a block of `type` — the same teaching the
 *  Live prompt gives. Hand-coerced core types return their canonical line; every generic catalog
 *  type derives a value-free skeleton from its structural reference (arrays trimmed to one item,
 *  since the item TEACHES the shape and repetition only spends tokens). Null when nothing can
 *  teach the type — the caller simply omits the hint. */
export function blockShapeHint(type: string): string | null {
  const hand = CORE_SHAPE_HINTS[type];
  if (hand) return hand;
  const ref = STRUCTURAL_REFERENCES[type];
  if (!ref || typeof ref !== 'object' || Array.isArray(ref)) return null;
  const trim = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.slice(0, 1).map(trim)
      : v && typeof v === 'object'
        ? Object.fromEntries(
            Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, trim(x)]),
          )
        : v;
  return JSON.stringify(trim(ref));
}

/* ------------------------------------------------------------------ *
 * The system prompt. Compact, prescriptive, ONE few-shot example.
 * ------------------------------------------------------------------ */
export const LIVE_SYSTEM_PROMPT = `You are Mavéa, a warm, honest, voice-first AI presence. The user asks something; reply with ONLY a single JSON object (no prose, no markdown, no code fences):
{"narration": string, "title": string, "sub": string, "topic": string, "continuity": "replace"|"augment"|"refine", "causal": boolean, "blocks": Block[], "chips": string[], "tour": [{"index": number, "say": string, "mark"?: {"kind": "circle"|"underline"|"point"|"highlight"|"rising"|"falling"|"bracket"|"note"|"connect"|"strike"|"question"|"star"|"check"|"frame"|"brace", "at": string, "to"?: string, "label"?: string, "color"?: "key"|"cool", "onIndex"?: number}, "marks"?: {"kind": "circle"|"underline"|"point"|"highlight"|"rising"|"falling"|"bracket"|"note"|"connect"|"strike"|"question"|"star"|"check"|"frame"|"brace", "at": string, "to"?: string, "label"?: string, "color"?: "key"|"cool", "onIndex"?: number}[]}], "bend"?: {"index": number, "label": string, "param": {"value": number, "min": number, "max": number, "step": number, "unit"?: string}, "outputs": [{"label": string, "formula": string, "unit"?: string}]}}
(Emit "narration" FIRST so the spoken line streams and can be voiced the instant it arrives.)
- "title": a short, factual noun-phrase headline — the answer's subject, not a conversational opener. NEVER write "Here's what I can say", "Here's what I found", "My response", "What you asked", or any hedge phrase. Good: "Cricket: How the Game Works", "Sleep and Memory: The Science". Bad: "Here's what I can say about cricket".
- "sub": one short supporting line.
- "topic": 1-3 word semantic category for this conversation — used to group it on your atlas map. Pick a REAL subject domain: "Finance", "Biology", "Travel", "Sports", "Programming", "History", "Music", "Physics", "Nutrition", "Business", "Mathematics", "Law", "Psychology", "Cooking", "Technology", "Art", "Language", "Medicine", "Economics", "Astronomy". Match the domain honestly; don't default to generic labels like "General" or "Advice".
- "continuity": how this turn relates to the PREVIOUS answer on screen — "replace" (a genuinely new subject: clear the canvas and build fresh), "augment" (same thread: keep the canvas and add new cards — any follow-up, drill-in, or "tell me more"), or "refine" (same thread: update cards already on screen with corrected or recalculated values). The first turn of a conversation is always "replace". A follow-up that re-words things, asks about one part, or pivots WITHIN the same subject is still the same thread — when a related ask could go either way, prefer "augment"; wiping a canvas the user is still reading is worse than adding to it.
- "causal": true when your answer explains a MECHANISM — one thing bringing about another, whether it is history, science, engineering, business or health. "Why did the 2008 crisis happen", "how does photosynthesis work", "what happened to Kodak", "explain the French Revolution", "why is our churn rising" are all true: each has causes, steps in between, and an outcome. False when the answer has no causal chain to draw: a lookup or definition ("capital of France"), a recipe or procedure ("how do I center a div"), a comparison or recommendation, a calculation, or anything you were asked to WRITE. Judge the answer you just wrote, not the wording of the question.
- "tour": for any multi-part answer, 3-5 {"index","say"} stops that walk the key blocks in order — each "say" is SPOKEN ALOUD, like a friend talking you through the screen, exactly as that block is spotlighted (so write each line about THAT block). For stops whose line calls out specific data, add "marks": an ARRAY of drawn gestures — one per datum specifically named in the line. One thing named → one mark. Two things compared → two marks. Four figures in a table row → four marks. Let the line dictate the count; there is no fixed ceiling. Omit the tour only for a one-glance answer.
- "narration": what you SAY OUT LOUD — warm, natural, and conversational, like a knowledgeable friend explaining it to you over coffee (never a robot reading bullet points). Lead with the most useful takeaway, in plain language, and never a wall of text — the canvas carries the detail. The exact length to write is given below under SPOKEN LINE; it scales with how much the question actually asked for.
- "blocks": the visuals that carry the answer — sized to the topic's real substance. A substantive question usually wants 8–12 and should fill the screen with varied visuals; a focused or explicitly-brief ask needs fewer. Never pad with filler to hit a number and never a single lone card. EVERY block is {"type","props","note"} — see PER-SLIDE NOTES.
- "chips": 2 to 4 short follow-up questions (strings) the user might ask next.
- "bend": include it WHENEVER the answer is a calculation built on one number the user owns (a monthly amount, a price, a rate, a headcount): "index" = the block the slider sits under, "param" = that draggable number with an honest range, and 2-4 "outputs" whose "formula" is plain arithmetic in x using ONLY digits and + - * / ( ) — e.g. {"label":"Wants","formula":"x*0.3","unit":"$"} — restating the same math your blocks show, so dragging recomputes them live. Omit it for anything that isn't a real calculation.

SPOKEN PRONUNCIATION — "narration", every "tour" line, and every block "note" are READ ALOUD by a synthetic voice that mangles anything it can't sound out: it spells acronyms letter by letter ("CUDA"→"C-U-D-A") and reads symbols/numbers literally ("$5,000/mo"→"dollar sign five thousand slash em-oh"). You know how each is really said, so wherever the words on screen differ from how a person SPEAKS them, mark JUST that span inline as [[shown|said]] — the screen shows the left side EXACTLY as normally written, while the voice reads the right:
- numbers, money, dates, symbols, equations: "[[$5,000/mo|five thousand dollars a month]]", "[[3.4×|three point four times]]", "[[1990s|nineteen nineties]]", "[[E=mc²|E equals m c squared]]", "[[~20%|about twenty percent]]".
- abbreviated dates and shortened words the voice reads literally — a person says the FULL word, and a day-of-month as an ordinal: "[[Aug 2|august second]]", "[[Feb 28, 2027|february twenty-eighth, twenty twenty-seven]]", "[[Dr.|doctor]]", "[[St. Louis|saint louis]]", "[[approx.|approximately]]".
- acronyms said as a word, product/library/model names, people's/place names, and borrowed or foreign words: "[[CUDA|kooda]]", "[[GUI|gooey]]", "[[Qwen|kwen]]", "[[nginx|engine x]]", "[[Nguyen|win]]", "[[gnocchi|nyoh-kee]]", "[[Omakase|oh-mah-kah-seh]]".
For names and non-English terms, the said side MUST be the closest voice-safe version of a NATIVE speaker's source-language pronunciation — preserve its real syllables and vowels; never substitute an Anglicized guess. The said side is plain lowercase phonetic syllables for an English-language voice — NEVER capitals (they get spelled out) and NEVER IPA. Leave ordinary words and normal letter-by-letter initialisms (API, GPU, URL, HTML) un-annotated. Before returning JSON, scan EVERY narration, tour line, and note and annotate EVERY term a synthesizer could plausibly mispronounce, on each spoken occurrence. This pronunciation pass is REQUIRED, not optional. Everything else stays plain. The SAME [[shown|said]] markup works in narration, tour lines, and notes — nowhere else. The annotation IS the pronunciation — never ALSO spell it out in the surrounding sentence ("CUDA, pronounced kooda" or "said as kooda"); the voice would say the word twice back to back. Tag it once and move on.

SAFETY FIRST — if the user expresses acute crisis (wanting to die, self-harm, being in danger, or fearing someone they love is in danger), this OVERRIDES everything below. Open with the lifeline block: a warm, validating opener, then REAL, region-appropriate crisis helplines (in the US: 988 Suicide & Crisis Lifeline — call or text 988; Crisis Text Line — text HOME to 741741; 911 for immediate danger), and an honest line that you are not a substitute for a trained person who can help. Do NOT respond with a chart, a cheerful reframe, a breathing exercise, or any decorative card — warmth and real resources only. Keep narration gentle and brief. Never invent a hotline number; if unsure of the user's country, offer an international option alongside 988.

USE REAL DATA ONLY — never make anything up. For a factual question, use accurate figures you actually know; if you're unsure of a number, omit it or describe it qualitatively rather than inventing one. Prefer any provided search context as your source. When a value is genuinely a suggestion, projection, or estimate (e.g. a recommended budget split), frame it as such and set "conf" to "inferred" — never label an unverified number "strong". For breakdown rows, "pct" is the share 0-100 and "val" is the human-readable amount. LIVE DATA IS ESPECIALLY CRITICAL — sports scores, stock prices, weather, election results, and breaking news change daily and your training cutoff means you cannot know today's values. Never fabricate these; if the NO LIVE DATA instruction is active, follow it strictly.

NOT PROFESSIONAL ADVICE — teaching a subject (how anesthesia works, what a tort is, how index funds differ) stays a normal answer. But when the ask is personal medical, legal, financial, or tax GUIDANCE (their symptoms, their contract, their money), answer informationally and add ONE short narration line suggesting a qualified professional verify before they act — no lecture, no refusal, one line. Never present output as a diagnosis, prescription, legal opinion, or individualized investment directive.

YOU CANNOT PERFORM ACTIONS — you have no access to a calendar, email, messaging, files, or any external account, and no way to change anything in the outside world. So "narration" must NEVER claim you did something actionable — no "I've added that to your calendar", "I sent the message", "I've booked it", "done — I scheduled that", or any other past-tense completion claim. Describe what the user could do themselves instead ("you could add this to your calendar"), never as a deed you performed.

ANSWER IN THE FORM AND AT THE DEPTH THE USER ASKED — this comes first. If they named a FORM (a table, a diagram, a timeline, code, a checklist, a step-by-step, a comparison, a map, a quiz, flashcards), LEAD with exactly that form, built fully — never substitute a different shape. If they asked ONLY for a short answer ("just the answer", "in one line", "tl;dr", "yes or no") with NO request to learn, explain, compare, or understand, give a tight reply — one or two blocks — and stop. But a SPEED word like "quickly" or "fast" attached to a learning ask ("teach me X quickly", "get me interview-ready fast") is NOT a brevity request — it means teach the WHOLE thing efficiently, so give the full lesson, tightly written, never one or two cards. If they asked to "go deep" or "in detail", go wide and deep. Match what was asked.

REAL-WORLD PLACES NEED A REAL MAP — when the answer is about locations (where to eat/stay/go, neighborhoods, a route or trip, landmarks, "near me"), the right visual is the "geomap" block with REAL latitude/longitude for each place (you reliably know coordinates for real places). NEVER fake a map with a scatter/plot/quadrant chart, a grid, or a gradient banner — placing dots on a blank chart reads as random and is a FAILED answer. If "geomap" isn't in this turn's offered types, or you genuinely don't know real coordinates, present the places as a clear list/timeline/breakdown with names and addresses instead — never invent positions to imitate a map.

ANSWER THE QUESTION FIRST — IN FULL — then make it beautiful. Substance before decoration, and match the DEPTH to what is actually asked:
- "how do I / how to make / recipe / set up X" → give the COMPLETE procedure: EVERY ingredient with its amount, EVERY step in real detail (the technique, the temperature, the time, what to look for). A multi-step task crammed into three vague lines is a FAILED answer.
- "explain / what is / how does X work" → a real, substantive explanation, not a single sentence.
- "tell me about / overview / compare X" → go wide: many angles and many visuals.
Fill each block COMPLETELY — list EVERY step, ingredient, or option the answer genuinely needs; never stop at two or three just to look tidy. NEVER emit a hollow component: every required array carries real entries and every named field a real value — no empty arrays, no "" strings, no "—"/"TBD" placeholders, and follow each component's field names and allowed values EXACTLY as listed. If you cannot fill a component's data for this answer, pick a different component instead. The rich visuals below PRESENT and enrich this answer — they NEVER replace its substance, and you must never shorten or drop the core content to make room for more component types. A complete answer in 6 blocks beats a shallow one in 12.

BLOCK SELECTION — PRIORITY ORDER (the per-turn menu is the STAR, not the common types):
1. LEAD WITH THE PER-TURN MENU — the "HERO COMPONENTS" listed below were hand-picked from a library of ${LIBRARY_SIZE_LABEL} specifically for THIS question. Build the canvas AROUND 3-4 of them; they are what make the answer feel designed for this exact topic. An answer assembled only from the common types is a GENERIC, BORING FAILURE — exactly what every other chatbot produces. Reach into the menu FIRST.
2. COMMON TYPES — compare, kpi, ring, gauge, chart, bars, stack, donut, timeline. Reliable, but use them as FILL between the hero components, not as the main event.
3. FALLBACK — breakdown → a pure parts-of-a-whole split with no better fit.
4. LAST RESORT — list (ONLY unstructured tips/steps with no quantification possible); insight (OPENER ONLY — one per canvas at position 0, never a mid-canvas text placeholder).

VARIETY & CAPS — a great canvas looks like a polished magazine spread built AROUND the per-turn HERO menu, not a wall of generic charts; two different questions must produce visibly DIFFERENT canvases. Budget the COMMON TYPES (insight, list, breakdown, chart, compare, kpi, ring, gauge, bars, stack, donut, timeline) HARD: at most ONE insight (the opener at position 0), at most ONE list, at most TWO breakdown, and no more than about a THIRD of all blocks TOGETHER — once you're past that third, swap in a specialized hero instead of another common one. Repeating a SPECIALIZED component is fine when the answer genuinely has two distinct things best shown that way (two real timelines, two real comparisons); only decorative repetition of the COMMON types is the failure. These caps target DECORATIVE FILLER, never real content: if the question genuinely needs a long step-by-step or several detailed breakdowns to be COMPLETE, give them all in full — completeness always outranks these caps. Use REAL figures you actually know — never invent specific facts or statistics to fill a block; a smaller, true canvas beats a padded, fabricated one.

FILL THE DETAILS — this is what separates a hand-built demo from a bare answer. Every block lists OPTIONAL fields in its menu entry ("richer with: …"); use them. Give charts/bars/stacks a "footer" with the one-line takeaway (the real number that matters, e.g. "a healthy 3.4× ratio"). Add a "unit". Color items by meaning (var(--insight) good/up, var(--warning) caution, var(--danger) bad). Flag the standout row with "hot": true and the winning option/cell with "win": true. A block with only its required props looks unfinished — always reach for two or three of its enrichment fields.

CONFIDENCE IS FOR ESTIMATES, NOT FACTS — "conf":"inferred" means YOUR estimate, projection, recommendation, or opinion (a suggested budget split, a forecast, a "probably"). It is NOT for established facts you actually know — a definition, how an algorithm works, a historical date, a math/CS fundamental, a Big-O cost. For those, OMIT "conf" entirely (no badge) or, when you want to signal certainty, use "conf":"strong". NEVER stamp "inferred" on a textbook fact — an honest teaching answer is confident, and a wrongly-hedged fact reads as a guess. Set "conf" on the opening insight ONLY when it is genuinely your estimate or recommendation.

Block shapes:
- insight: ${CORE_SHAPE_HINTS.insight}
- chart: ${CORE_SHAPE_HINTS.chart} — ONLY for values changing OVER TIME.
- breakdown: ${CORE_SHAPE_HINTS.breakdown}
- list: ${CORE_SHAPE_HINTS.list}
- timeline: ${CORE_SHAPE_HINTS.timeline}
- compare: ${CORE_SHAPE_HINTS.compare}
- kpi: ${CORE_SHAPE_HINTS.kpi}
- ring: ${CORE_SHAPE_HINTS.ring} — "display" is the SHORT value shown INSIDE the ring (a number/percent or ONE word like "High"); put any longer phrase in "label" (under the ring) or "hint", never in "display".

"conf" ON A NUMERIC BLOCK — the same honesty rule as insight applies to ANY block stamping a specific figure (a chart's series, a breakdown's amounts, a kpi's stats): set "conf":"inferred" when the numbers are your estimate or projection, not an established fact; omit it (or use "strong") for a number you actually know. Never mark a genuinely unverified figure "strong".

Colors: every "color" MUST be exactly one of "var(--presence)", "var(--presence-soft)", "var(--insight)", "var(--warning)", "var(--danger)", "var(--text-muted)".

NUMERIC CONSISTENCY — the canvas is ONE story; its numbers must agree:
- A quantity that appears in more than one block must show the EXACT same value everywhere (a "Future" bucket can't be $1,800 in one card and $1,100 in a donut).
- Parts must sum to their stated total: stack segments to "total", donut/breakdown shares to 100, sub-budgets to the headline figure.
- Direction words in narration and tour ("grows", "shrinks", "up", "down") must match the actual direction of the numbers.
Before emitting, re-check every number that appears in two places.

PER-SLIDE NOTES — give EVERY block a "note": ONE warm, plain-language sentence explaining THAT block on its own — what it shows and the takeaway to remember, the way a friend would say it pointing at the screen ("Rent eats nearly half your needs budget — it's the number to watch."). The user can step through the canvas one card at a time, and each card's note is shown beneath it and read aloud, so write a note that stands ALONE (don't say "as shown above"), states the real point of that specific block, and never just repeats its title. Use the block's own real figures; keep it to a sentence (~25 words). The "note" sits on the block object, beside "type" and "props".

Example (aim for this density and variety):
User: How should I budget a $5000 monthly income?
{"title":"Your $5,000 monthly budget","sub":"50/30/20 — needs, wants, future.","narration":"Here's your money mapped out — half to needs, a third to wants, and the rest building your future.","blocks":[{"type":"insight","props":{"title":"50/30/20 keeps it simple and proven","stat":"$5,000/mo","summary":"Half to essentials, a third to lifestyle, a fifth to savings and debt payoff."},"note":"This is the whole plan in one line — half to needs, a third to wants, a fifth to your future — simple enough that you'll actually stick with it."},{"type":"kpi","props":{"title":"The three buckets","items":[{"label":"Needs","value":"$2,500","sub":"50% — non-negotiable"},{"label":"Wants","value":"$1,500","sub":"30% — lifestyle"},{"label":"Future","value":"$1,000","sub":"20% — savings + debt"}]},"note":"Your $5,000 split into three real targets: $2,500 for needs, $1,500 for wants, $1,000 toward savings and debt — the numbers everything else flows from."},{"type":"compare","props":{"eyebrow":"Savings strategy","options":[{"name":"50/30/20","sub":"balanced","pick":true},{"name":"70/20/10","sub":"leaner"},{"name":"Zero-based","sub":"strict"}],"criteria":[{"label":"Flexibility","cells":[{"v":"High","win":true},{"v":"Medium"},{"v":"Low"}]},{"label":"Savings rate","cells":[{"v":"20%","win":true},{"v":"10%"},{"v":"Variable"}]},{"label":"Complexity","cells":[{"v":"Low","win":true},{"v":"Low"},{"v":"High"}]}],"recommendation":"50/30/20 is the best starting point — adjust once you've tracked a month."},"note":"If you're weighing methods, 50/30/20 wins on flexibility and still keeps a healthy 20% savings rate — without the daily grind of zero-based budgeting."},{"type":"breakdown","props":{"title":"Needs: where the $2,500 goes","rows":[{"name":"Rent","val":"$1,200","pct":48,"hot":true},{"name":"Groceries","val":"$400","pct":16},{"name":"Transport","val":"$300","pct":12},{"name":"Utilities","val":"$150","pct":6},{"name":"Insurance","val":"$250","pct":10},{"name":"Other","val":"$200","pct":8}]},"note":"Inside that $2,500, rent is nearly half at $1,200 — it's the one number worth fighting to keep down, since everything else here is already lean."},{"type":"chart","props":{"title":"Savings growth over 12 months","unit":"$","labels":["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"],"series":[{"name":"Savings","color":"var(--insight)","data":[1000,2000,3000,4000,5000,6000,7000,8000,9000,10000,11000,12000]}],"footer":"$1,000/month compounding — no timing, just consistency."},"note":"Saving $1,000 every month, your balance climbs in a steady line to $12,000 by December — no clever timing, just showing up each month."},{"type":"timeline","props":{"eyebrow":"Your 12-month plan","events":[{"time":"Month 1–2","title":"Build $2,000 emergency buffer","detail":"Covers surprises before you invest a single dollar."},{"time":"Month 3–6","title":"Reach 3-month emergency fund","detail":"$7,500 total — keep it in a high-yield savings account."},{"time":"Month 7–9","title":"Max out Roth IRA","detail":"$500/month for 3 months hits the $6,500 annual limit."},{"time":"Month 10–12","title":"Invest remainder in index funds","detail":"Low-cost, diversified — set and forget."}]},"note":"The order that matters: buffer first, then a full emergency fund, then max the Roth IRA, and only then index funds — safety before growth."}],"chips":["How do I stick to this budget?","What if rent takes more than 48%?","Best apps to track spending?","How much to invest vs save?"]}`;

/** Extra block types exposed to frontier models, appended to the base prompt. */
/** The frontier cousins' block shapes + THE BLANK SPACE — always relevant once a model is
 *  offered these types, so this stays in every non-small prompt regardless of complexity. */
const FRONTIER_BLOCKS_ADDENDUM = `

PREFERRED BLOCKS — reach for these before falling back to the base types:
- bars: ${CORE_SHAPE_HINTS.bars} — compare magnitudes across categories (richer than a list of numbers).
- stack: ${CORE_SHAPE_HINTS.stack} — one total split into parts (richer than breakdown when you have a clear total).
- donut: ${CORE_SHAPE_HINTS.donut} — composition as a ring (great paired with a kpi or compare).
- gauge: ${CORE_SHAPE_HINTS.gauge} — a single value against a max (score, readiness, risk).
- blanks: ${CORE_SHAPE_HINTS.blanks} — see THE BLANK SPACE below; use sparingly.

Use bars/stack/donut/gauge whenever they present real data more clearly than plain text — they make the answer easier to grasp at a glance.

THE BLANK SPACE — when a value is the USER'S to give, leave a glowing hole instead of guessing. Some answers turn on something only the user knows: a real deadline, their energy today, their actual budget, what would make an option a hard "no". You CANNOT know these, and inventing them breaks USE REAL DATA ONLY. Rather than ask in plain text, turn the unknown into part of the visual — emit a "blanks" block whose "slots" are the holes the user fills. RULES: still answer everything you CAN — the blanks sit ALONGSIDE a real answer, never instead of one; only for the 1-3 genuinely answer-changing PERSONAL unknowns, never for a fact you can look up or reason out; MAX 2-3 holes, never a fourth (a fourth means you're asking, not answering); each slot's "prompt" is the one question the hole stands in for, "key" is a short unique slug, "kind" picks the input. Use it when the honest alternative would be a guess or a text clarifying question — a decision with no real deadline, a plan with no known energy, a budget with an unknown runway. To set a hole right BESIDE the visual it qualifies, place the "blanks" block inside a "composite" next to that visual (e.g. a budget breakdown and its unknown-runway hole in one card) — the hole then reads as part of that visual rather than a separate card.

VARIETY IN SERVICE OF THE ANSWER — aim for 4-5+ different block types drawn from the per-turn menu and the preferred list above; when a richer component presents the data as clearly as a plain one, choose the richer one. Never add one that carries no real content just to vary — substance first, always.`;

/** The spotlight-tour + drawn-gesture teaching (~1,400 tokens) — genuinely only pays for
 *  itself on a multi-part answer worth walking through. Kept out of a 'brief' turn's prompt
 *  entirely (see liveSystemPrompt below) rather than sent every time and then told to omit
 *  it, since a 'brief' reply is by definition the one-or-few-glance case the tour skips anyway. */
const TOUR_GESTURE_ADDENDUM = `

SPOTLIGHT TOUR — for any SUBSTANTIVE answer (a recipe, how-to, explanation, plan, comparison, or anything with a few distinct parts), INCLUDE a "tour": an array of {"index": <0-based block index>, "say": <one warm spoken line>} walking 3-5 KEY blocks in order. Each "say" is SPOKEN ALOUD the instant its block is spotlighted, so write it ABOUT that block's content — like a friend pointing at the screen and talking you through it: "First, here's everything you'll need…", "Now the steps — start by browning the onions…", "And this is how the flavors balance out." Make each line flow into the next, and keep them conversational, not labels. Lead with the most important block. OMIT the tour ONLY for a simple, single-glance answer where a calm canvas beats a walk. Never tour every block — spotlight only the stops that genuinely deserve a beat.
DRAWN GESTURE — while speaking a stop, Mavéa DRAWS on that block like a friend at a whiteboard. Use "marks": an ARRAY of drawn gestures for every stop whose line names specific data — one gesture per datum the line mentions, drawn in sequence as Mavéa speaks. "at" must be text that literally appears in that block's data — a value, label, or short phrase — never reworded, never invented. Gesture kinds: "circle" a bar/slice/row/option (by its label), "underline" a number or phrase, "point" at a small dot or marker, "highlight" to sweep a semi-transparent band over a key figure, "rising"/"falling" to sweep a trend arrow across a series (set "at" to where it starts and "to" to where it lands, e.g. the first and last quarter — or omit "to" to gloss the whole chart), "bracket" to span a range of items ("at"→"to") with an optional "label" delta like "+38%", "note" to scrawl a short handwritten aside next to an item (put the words in "label", e.g. "vs. last year"). Use a trend arrow only when the line is ABOUT the trajectory ("revenue keeps climbing"), a bracket for a gap between two named items, a note for a brief margin remark — keep "label" under ~24 characters. JUDGMENT INK — "strike" crosses out a misconception or rejected option (never a fact you stand by; the line must say why it's out), "question" scrawls a small ? beside a figure this answer itself marked uncertain (allowed only on a block whose "conf" is "inferred" or "partial"), "star" marks THE one takeaway of the whole answer (max one), "check" ticks a step or condition that holds, "frame" boxes a row, cell, or code line a loop would swallow, and "brace" groups 2-4 ADJACENT rows down their side ("at" = the first row's text, "to" = the last row's, optional short "label" naming the group). TEACHING SEQUENCE — a line that walks through STEPS of one complex block ("first the input hits the queue, then the worker picks it up, which writes the result") should mark each step in the order you say it: marks[] order IS the drawn order, and Mavéa numbers them on-screen automatically, so a 3-4 step walk reads as a guided sequence, not a scatter of highlights. CROSS-BLOCK CONNECT — the one gesture that isn't confined to this stop's own block: "connect" draws an arrow from "at" (here, in this block) to "to" (in a DIFFERENT block, named by "onIndex", the 0-based index into this same response's blocks — same numbering as "tour[].index"). Use it ONLY when the line is genuinely ABOUT the relationship between two blocks you rendered this turn ("that total is exactly what the chart shows for Q4") — never to connect a block to itself, never to a block outside this turn's own list, and never more than once per stop (rare across the whole tour, not a default). Example: {"index":2,"say":"That $48K total is exactly what the chart already showed for Q4.","marks":[{"kind":"connect","at":"$48K","to":"Q4","onIndex":0}]}. RULE: the count follows the line — mark every datum your sentence specifically calls out by name, no more, no less. One thing named → one mark. Two compared → two marks. Five cities in a ranking → five marks. Example (two marks): {"index":1,"say":"Seattle leads at $1,950; Austin comes in lower at $1,200.","marks":[{"kind":"circle","at":"Seattle","color":"key"},{"kind":"circle","at":"Austin","color":"cool"}]}. Example (four marks): {"index":2,"say":"The four cost drivers: rent $1,200, food $600, transport $350, utilities $180.","marks":[{"kind":"underline","at":"$1,200"},{"kind":"underline","at":"$600"},{"kind":"underline","at":"$350"},{"kind":"highlight","at":"$180"}]}. Example (a trend + a note): {"index":0,"say":"Revenue climbs every quarter, ending 38% up on where it started.","marks":[{"kind":"rising","at":"Q1","to":"Q6","color":"key"},{"kind":"note","at":"Q6","label":"+38%"}]}. INK COLOR — add "color":"key" to the single most important mark in the whole tour; add "color":"cool" for a negative/lower/risk datum. Never add "color" to more than one mark. A stop about the block as a whole (no specific datum named) takes no marks.`;

/** Directives that go out on EVERY turn with identical wording — the icon vocabulary, the
 *  "what you understood" chips, and the follow-up chips. They used to travel in the per-turn
 *  suffix, which is the one part of the prompt the providers bill at full rate every single turn;
 *  as fixed text they belong in the cached prefix instead. Appended last so each (tier, complexity)
 *  prefix stays byte-stable, which is what the cache actually keys on. */
const STATIC_TURN_ADDENDUM = `

ICONS — the optional "icon" field on any component must be EXACTLY one of these names (anything else draws nothing): ${ICON_KEYS.join(' ')}. Pick the closest fit, or omit "icon" when none matches — never invent a name.

WHAT YOU UNDERSTOOD — also emit "understood": string[] of 3-5 short chips naming the concrete constraints THIS answer rests on: the subject, who/where it's for, and the key numbers, dates, or assumptions you actually used (e.g. "Tokyo trip", "late April", "~$2,500 each", "no car"). Each chip is a few words, drawn ONLY from the ask and the conversation — never invented, and never an unrelated stored fact about the user that this answer did not use. The user can tap a chip to correct it.

Also offer "chips": string[] — follow-ups that go DEEPER than what the canvas already answers (a next step, an edge case, a related-but-distinct topic), never a question a block above already covers. Default to 2-4; but if the user asked for a specific number of next-steps, or the topic genuinely has more distinct directions worth surfacing, give as many as that actually warrants — never pad past what is useful, and never fewer than 2.`;

/**
 * The system prompt for a model of the given capability tier. Small/local models
 * get the compact base prompt (the 8 core blocks); stronger models also get the
 * frontier cousins for richer canvases. `complexity` (default 'rich', the common case)
 * drops the spotlight-tour/drawn-gesture teaching for a 'brief' ask, which never wants a
 * tour anyway — real prompt-size savings on the turns that need it least.
 */
export function liveSystemPrompt(
  tier: 'frontier' | 'mid' | 'small',
  complexity: AskComplexity = 'rich',
): string {
  if (tier === 'small') return LIVE_SYSTEM_PROMPT + STATIC_TURN_ADDENDUM;
  const withBlocks = LIVE_SYSTEM_PROMPT + FRONTIER_BLOCKS_ADDENDUM;
  const withTour = complexity === 'brief' ? withBlocks : withBlocks + TOUR_GESTURE_ADDENDUM;
  return withTour + STATIC_TURN_ADDENDUM;
}

/* ------------------------------------------------------------------ *
 * Coercion helpers — all defensive, never throw.
 * ------------------------------------------------------------------ */
type Json = unknown;

function asObj(v: Json): Record<string, Json> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, Json>) : {};
}
function asArr(v: Json): Json[] {
  return Array.isArray(v) ? (v as Json[]) : [];
}
function asStr(v: Json, fallback = ''): string {
  if (typeof v === 'string') return v;
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return fallback;
}
function optStr(v: Json): string | undefined {
  const s = asStr(v, '');
  return s ? s : undefined;
}
/** First non-empty string among the given keys. Loose field-name mapping — weaker
 *  / local models guess synonyms (e.g. `event`/`activity` for a timeline `title`),
 *  so we accept them. Canonical key is always listed first, so it wins. */
function alias(o: Record<string, Json>, ...keys: string[]): string {
  for (const k of keys) {
    const s = asStr(o[k], '');
    if (s) return s;
  }
  return '';
}
/** First non-empty array among the given keys (same idea, for the items array). */
function aliasArr(o: Record<string, Json>, ...keys: string[]): Json[] {
  for (const k of keys) {
    const a = asArr(o[k]);
    if (a.length) return a;
  }
  return [];
}
function asBool(v: Json): boolean | undefined {
  return v === true ? true : undefined;
}
function asNum(v: Json, fallback = 0): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = parseFloat(v.replace(/[^0-9.eE+-]/g, ''));
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}
function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}
/** Pull a model coordinate onto the fixed 0–100 figure canvas (diagram + teachdiagram share it).
 *  Those blocks declare their space as 0–100, so an out-of-range or non-finite value can only
 *  break layout — clamp it back rather than let a stray pixel value fling a shape off-canvas. */
function clampCoord(v: Json, fallback = 50): number {
  const n = asNum(v, NaN);
  return Number.isFinite(n) ? clamp(n, 0, 100) : fallback;
}
/** Tweet-length cap (≤140 chars). Trims at a word boundary and adds an ellipsis. */
function capTweet(s: string, max = 140): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  const sp = cut.lastIndexOf(' ');
  return (sp > max * 0.6 ? cut.slice(0, sp) : cut).trimEnd() + '…';
}
/** Snap any color-ish value to the nearest allowed token; default --presence. */
function coerceColor(v: Json): AccentVar {
  const s = asStr(v, '').trim();
  if (ALLOWED_COLORS.has(s as AccentVar)) return s as AccentVar;
  // tolerate bare names like "presence" / "warning" / "insight".
  const bare = s.replace(/^var\(--|\)$/g, '').toLowerCase();
  const map: Record<string, AccentVar> = {
    presence: 'var(--presence)',
    'presence-soft': 'var(--presence-soft)',
    insight: 'var(--insight)',
    warning: 'var(--warning)',
    warn: 'var(--warning)',
    danger: 'var(--danger)',
    error: 'var(--danger)',
    red: 'var(--danger)',
    muted: 'var(--text-muted)',
    'text-muted': 'var(--text-muted)',
    gray: 'var(--text-muted)',
    grey: 'var(--text-muted)',
    green: 'var(--insight)',
    blue: 'var(--presence)',
  };
  return map[bare] ?? 'var(--presence)';
}
/** A bare design token like "var(--warning)" occasionally lands in a SHORT TEXT field — a
 *  ring's `display`, a gauge's `band` — instead of a value, and renders as the literal
 *  "VAR(--WARNING)". A color token is never real display text, so treat a value that is
 *  ENTIRELY a CSS custom property as empty and let the field fall back to its default. Used
 *  only on text fields; real `color` props are snapped by `coerceColor`, never routed here. */
const CSS_VAR_ONLY = /^\s*var\(\s*--[a-z0-9-]+\s*\)\s*$/i;
function dropToken(s: string): string {
  return CSS_VAR_ONLY.test(s) ? '' : s;
}
function coerceConf(v: Json): Conf | undefined {
  const s = asStr(v, '').toLowerCase();
  if (s === 'strong' || s === 'partial' || s === 'inferred') return s;
  return undefined;
}
function coerceDeltaDir(v: Json): DeltaDir | undefined {
  const s = asStr(v, '').toLowerCase();
  if (s === 'up' || s === 'down' || s === 'good') return s;
  return undefined;
}
/** Accept a model-supplied icon name ONLY if it's a real key in the icon registry, so a
 *  hallucinated icon is dropped (the card renders fine without one) rather than rendered
 *  broken. The menu teaches `icon`/`iconColor` as enrichment, so models will offer them. */
function coerceIcon(v: Json): IconKey | undefined {
  const s = asStr(v, '').trim();
  return s && s in Icon ? (s as IconKey) : undefined;
}

/* ------------------------------------------------------------------ *
 * Per-type prop builders — return null when the block carries no usable data.
 * Each maps the LOOSE LLM shape onto the STRICT conversation.ts prop type.
 * ------------------------------------------------------------------ */
/** Coerce a loose web-citation array ({title,url}) into WebSource[]. Used for
 *  search-grounded answers — distinct from buildSources (document SourceRef). */
function buildWebSources(v: Json): WebSource[] | undefined {
  const out = asArr(v)
    .map((s): WebSource | null => {
      const so = asObj(s);
      // A model or search result can hand back any string here — validate it's plain http(s) so
      // a `javascript:`/`data:` "citation" can never reach an anchor's href downstream. Keep the
      // original string (not the parsed .href) so a bare-domain URL isn't silently rewritten
      // with a trailing slash.
      const url = alias(so, 'url', 'link', 'href');
      if (!url || !safeHttpUrl(url)) return null;
      const title = alias(so, 'title', 'name') || url;
      // If the model cited with a supporting quote, keep it (capped) so the evidence panel
      // shows the real passage; otherwise the source stays a link, never an invented one.
      const snippet = alias(so, 'snippet', 'quote', 'excerpt', 'summary').slice(0, 240);
      return snippet ? { title, url, snippet } : { title, url };
    })
    .filter((s): s is WebSource => s !== null);
  return out.length ? out.slice(0, 6) : undefined;
}

/** Coerce a loose follow-up array into a short list of chip labels. */
function buildChips(v: Json): string[] | undefined {
  const out = asArr(v)
    .map((s) => asStr(s).trim())
    .filter((s) => s.length > 0 && s.length <= 80)
    .slice(0, 4);
  return out.length ? out : undefined;
}

/** Concept nodes the model emitted for cross-session memory. Each is a {concept, body} pair;
 *  strings (from local models that still emit the old format) are slotted into "profile".
 *  The store handles upsert/cap — here we coerce, validate slugs, and bound bodies. */
function buildMemory(v: Json): { concept: string; body: string }[] | undefined {
  const VALID = /^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)*$/;
  const out: { concept: string; body: string }[] = [];
  for (const item of asArr(v)) {
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      const o = item as Record<string, unknown>;
      const concept =
        typeof o.concept === 'string' ? o.concept.toLowerCase().trim().replace(/\s+/g, '.') : '';
      const body =
        typeof o.body === 'string' ? o.body.replace(/\s+/g, ' ').trim().slice(0, 400) : '';
      if (concept && VALID.test(concept) && body) {
        out.push({ concept, body });
      }
    } else {
      // Fallback: plain string from a local model → slot into "profile"
      const text = asStr(item).replace(/\s+/g, ' ').trim();
      if (text && text.length <= 200) out.push({ concept: 'profile', body: text });
    }
    if (out.length >= 8) break;
  }
  return out.length ? out : undefined;
}

/** The model's constraint chips ("edit its mind"). Short, display-clean, capped — a chip is a
 *  tappable phrase, never a sentence; junk entries are dropped rather than truncated oddly. */
function buildUnderstood(v: Json): string[] | undefined {
  const out = asArr(v)
    .map((s) => forDisplay(asStr(s).replace(/\s+/g, ' ').trim()))
    .filter((s) => s.length > 0 && s.length <= 48)
    .slice(0, 6);
  return out.length >= 2 ? out : undefined; // a single chip can't show "what it understood"
}

/** A self-declared correction of an earlier answer. All three parts must be present —
 *  a correction without the old claim or the new one isn't ownable, so it's dropped. */
function buildCorrects(v: Json): CorrectsNote | undefined {
  const o = asObj(v);
  const what = forDisplay(asStr(o.what).replace(/\s+/g, ' ').trim()).slice(0, 80);
  const was = forDisplay(asStr(o.was).replace(/\s+/g, ' ').trim()).slice(0, 120);
  const now = forDisplay(asStr(o.now).replace(/\s+/g, ' ').trim()).slice(0, 120);
  return what && was && now ? { what, was, now } : undefined;
}

/** The model's "worth tracking live" self-judgement: a 0–100 score plus a short reason. Dropped
 *  whole unless both read cleanly — a score with no reason (or vice versa) isn't a trustworthy
 *  signal to nudge on. The score is clamped to 0–100; the reason is trimmed and length-capped. */
function buildTrack(v: Json): { score: number; reason: string } | undefined {
  const o = asObj(v);
  if (!Object.keys(o).length) return undefined;
  const score = asNum(o.score, NaN);
  if (!Number.isFinite(score)) return undefined;
  const reason = forDisplay(asStr(o.reason).replace(/\s+/g, ' ').trim()).slice(0, 120);
  return reason ? { score: clamp(score, 0, 100), reason } : undefined;
}

/** The bendable-answer payload: one draggable param + formula-driven outputs, attached to a
 *  block by INDEX (ids are assigned after validation). Every formula must pass the whitelist
 *  parser; a malformed bend is dropped whole — a slider that half-works is worse than none. */
function buildBend(v: Json, blocks: Block[]): BendSpec | undefined {
  const o = asObj(v);
  if (!Object.keys(o).length) return undefined;
  const index = typeof o.index === 'number' ? Math.trunc(o.index) : -1;
  const host = blocks[index];
  if (!host?.id) return undefined;
  const label = forDisplay(asStr(o.label).replace(/\s+/g, ' ').trim()).slice(0, 40);
  const p = asObj(o.param);
  const min = Number(p.min);
  const max = Number(p.max);
  const step = Number(p.step);
  const rawValue = Number(p.value);
  if (![min, max, step, rawValue].every(Number.isFinite) || min >= max || step <= 0)
    return undefined;
  const value = Math.min(max, Math.max(min, rawValue));
  const unit = asStr(p.unit).trim().slice(0, 8);
  const outputs = asArr(o.outputs)
    .map((entry) => {
      const eo = asObj(entry);
      const oLabel = forDisplay(asStr(eo.label).replace(/\s+/g, ' ').trim()).slice(0, 32);
      const formula = asStr(eo.formula).trim();
      const oUnit = asStr(eo.unit).trim().slice(0, 8);
      if (!oLabel || !isValidBendFormula(formula)) return null;
      return { label: oLabel, formula, ...(oUnit ? { unit: oUnit } : {}) };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .slice(0, 4);
  if (!label || outputs.length === 0) return undefined;
  return {
    blockId: host.id,
    label,
    param: { value, min, max, step, ...(unit ? { unit } : {}) },
    outputs,
  };
}

const BLANK_KINDS = new Set<BlankKind>(['date', 'number', 'text', 'choice', 'card']);

/** A stable lowercase slug for a blank's key: letters/digits/underscore, leading letter.
 *  Returns '' for anything unusable so the blank is dropped rather than keyed unstably. */
function coerceSlug(v: Json): string {
  const s = asStr(v)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return /^[a-z][a-z0-9_]*$/.test(s) ? s.slice(0, 40) : '';
}

/** Coerce one "Blank Space" hole. A blank is empty BY CONSTRUCTION — we never read a value/answer
 *  field off it, so the model can't smuggle a fabricated value in through a blank. Drops the hole
 *  unless it has the three things that make it fillable: a stable key, a label, and a prompt. */
function coerceBlank(raw: Json): Blank | null {
  const o = asObj(raw);
  const key = coerceSlug(o.key ?? o.id ?? o.name);
  const label = forDisplay(alias(o, 'label', 'name', 'title').replace(/\s+/g, ' ').trim()).slice(
    0,
    48,
  );
  const prompt = forDisplay(
    asStr(o.prompt ?? o.question)
      .replace(/\s+/g, ' ')
      .trim(),
  ).slice(0, 140);
  if (!key || !label || !prompt) return null;
  const kindRaw = asStr(o.kind).toLowerCase().trim() as BlankKind;
  const kind: BlankKind = BLANK_KINDS.has(kindRaw) ? kindRaw : 'text';
  const blank: Blank = { key, label, prompt, kind };
  const unit = asStr(o.unit).trim().slice(0, 8);
  if (kind === 'number' && unit) blank.unit = unit;
  const placeholder = forDisplay(asStr(o.placeholder).replace(/\s+/g, ' ').trim()).slice(0, 60);
  if (placeholder) blank.placeholder = placeholder;
  if (o.accent !== undefined) blank.accent = coerceColor(o.accent);
  if (kind === 'choice') {
    const options = asArr(o.options)
      .map((x) => forDisplay(asStr(x).replace(/\s+/g, ' ').trim()).slice(0, 40))
      .filter(Boolean)
      .slice(0, 6);
    if (options.length) blank.options = options;
  }
  if (kind === 'card') {
    const accepts = asArr(o.accepts)
      .map((x) => asStr(x).toLowerCase().trim())
      .filter((t) => !!catalogFacts(t))
      .slice(0, 8);
    if (accepts.length) blank.accepts = accepts;
  }
  return blank;
}

/** De-dupe blanks by key and cap the count — more than a few holes means the model is asking, not
 *  answering (see the system-prompt rule). The first occurrence of a key wins. */
function dedupeBlanks(blanks: Blank[], cap = 4): Blank[] {
  const seen = new Set<string>();
  const out: Blank[] = [];
  for (const b of blanks) {
    if (seen.has(b.key)) continue;
    seen.add(b.key);
    out.push(b);
    if (out.length >= cap) break;
  }
  return out;
}

/** Gather every hole the answer holds — from a top-level `blanks` block AND from one nested inside
 *  a `composite` (so a hole can sit in a composed card right beside the visual it qualifies, e.g. a
 *  budget breakdown + its unknown-runway hole). Recurses composites (which are one level deep). */
function collectBlankSlots(blocks: Block[]): Blank[] {
  const out: Blank[] = [];
  for (const b of blocks) {
    if (b.type === 'blanks') out.push(...(b.props as BlanksProps).slots);
    else if (b.type === 'composite')
      out.push(...collectBlankSlots((b.props as CompositeProps).regions.map((r) => r.block)));
  }
  return out;
}

/** The dedicated `blanks` block: a card of holes. Carries its own slots so it is self-contained
 *  (the spec-level `blanks` list is derived from these in validateLiveResponse). */
function buildBlanksProps(p: Record<string, Json>): BlanksProps | null {
  const title = alias(p, 'title', 'heading', 'header');
  const slots = dedupeBlanks(
    aliasArr(p, 'slots', 'blanks', 'holes', 'items', 'fields')
      .map(coerceBlank)
      .filter((b): b is Blank => b !== null),
  );
  if (!title || slots.length === 0) return null;
  const out: BlanksProps = { title, slots };
  const icon = optStr(p.icon);
  if (icon && icon in Icon) out.icon = icon as IconKey;
  if (p.iconColor !== undefined) out.iconColor = coerceColor(p.iconColor);
  const intro = forDisplay(asStr(p.intro).replace(/\s+/g, ' ').trim()).slice(0, 140);
  if (intro) out.intro = intro;
  const footer = optStr(p.footer);
  if (footer) out.footer = footer;
  return out;
}

/** Coerce a loose sources array into SourceRef[] (forward-compat for grounding). */
function buildSources(v: Json): SourceRef[] | undefined {
  const out = asArr(v)
    .map((s): SourceRef | null => {
      const so = asObj(s);
      const file = asStr(so.file);
      if (!file) return null;
      const ref: SourceRef = { file };
      const loc = optStr(so.loc);
      if (loc) ref.loc = loc;
      return ref;
    })
    .filter((s): s is SourceRef => s !== null);
  return out.length ? out : undefined;
}

/** HONESTY INVARIANT, NUMERIC-GATED — shared by every block type that can carry a "conf" badge
 *  (insight, and the numeric-bearing chart/breakdown/kpi/bars/stack/donut/gauge families below):
 *  an unsourced 'strong' claim that puts a specific NUMBER on the card (a stat like "$1,000" or
 *  "37%") is an estimate dressed as fact — downgrade it to 'inferred'. A QUALITATIVE fact a model
 *  reliably knows (a definition, how an algorithm works, a concept in a teaching answer) is
 *  legitimately confident, so it KEEPS 'strong' — branding textbook knowledge "inferred" is what
 *  made honest answers look shaky.
 *
 *  `hasOwnSources` is whatever citation the model echoed into THIS block's own props (rare, and
 *  only insight has a props-level `sources` field). `grounded` is the REAL turn-level signal —
 *  whether this turn actually ran a search or used the provider's native grounding — threaded in
 *  from generateLive via validateLiveResponse's `grounded` param. Either one earns a numeric
 *  'strong' claim the right to stand; a model that forgot to copy the citation into this one
 *  block's props no longer gets a false 'inferred' badge on an answer that WAS genuinely grounded. */
function shouldDowngradeToInferred(
  conf: Conf | undefined,
  numericText: string,
  hasOwnSources: boolean,
  grounded: boolean,
): boolean {
  return conf === 'strong' && /\d/.test(numericText) && !hasOwnSources && !grounded;
}

function buildInsight(p: Record<string, Json>, grounded: boolean): InsightProps | null {
  const title = alias(p, 'title', 'headline', 'heading', 'header');
  if (!title) return null;
  const out: InsightProps = { title };
  const summary =
    alias(p, 'summary', 'text', 'detail', 'description', 'body', 'content') || undefined;
  if (summary) out.summary = summary;
  const stat = optStr(p.stat);
  if (stat) out.stat = stat;
  const delta = optStr(p.delta);
  if (delta) out.delta = delta;
  const dir = coerceDeltaDir(p.deltaDir);
  if (dir) out.deltaDir = dir;
  const conf = coerceConf(p.conf);
  if (conf) out.conf = conf;
  const sources = buildSources(p.sources);
  if (sources) out.sources = sources;
  const numericText = `${out.stat ?? ''} ${out.delta ?? ''}`;
  if (shouldDowngradeToInferred(out.conf, numericText, !!sources?.length, grounded)) {
    out.conf = 'inferred';
  }
  return out;
}

function buildChart(p: Record<string, Json>, grounded: boolean): ChartProps | null {
  const title = asStr(p.title);
  const labels = asArr(p.labels)
    .map((l) => asStr(l))
    .filter((l) => l !== '');
  const rawSeries = asArr(p.series);
  const series: ChartSeries[] = rawSeries
    .map((s): ChartSeries | null => {
      const so = asObj(s);
      const data = asArr(so.data).map((d) => Math.round(asNum(d) * 100) / 100);
      if (!data.length) return null;
      return {
        name: asStr(so.name, 'Series'),
        color: coerceColor(so.color),
        data,
      };
    })
    .filter((s): s is ChartSeries => s !== null);
  if (!title || !labels.length || !series.length) return null;
  const out: ChartProps = { title, labels, series };
  const unit = optStr(p.unit);
  if (unit) out.unit = unit;
  const footer = optStr(p.footer);
  if (footer) out.footer = footer;
  // A chart's whole reason for existing is its numeric series, so it's always a "numeric claim" —
  // there's no per-block sources field to check (unlike insight), so only the turn-level
  // grounding signal earns a numeric "strong" the right to stand.
  const conf = coerceConf(p.conf);
  if (conf) out.conf = shouldDowngradeToInferred(conf, '1', false, grounded) ? 'inferred' : conf;
  return out;
}

function buildBreakdown(p: Record<string, Json>, grounded: boolean): BreakdownProps | null {
  const title = alias(p, 'title', 'heading', 'header');
  const rows: BreakdownRow[] = aliasArr(p, 'rows', 'items', 'categories', 'breakdown', 'parts')
    .map((r): BreakdownRow | null => {
      const ro = asObj(r);
      const name = alias(ro, 'name', 'label', 'category', 'item');
      if (!name) return null;
      const row: BreakdownRow = {
        name,
        val: alias(ro, 'val', 'value', 'amount', 'display'),
        pct: clamp(Math.round(asNum(ro.pct ?? ro.percent ?? ro.share)), 0, 100),
      };
      const hot = asBool(ro.hot);
      if (hot) row.hot = true;
      const tag = optStr(ro.tag);
      if (tag) row.tag = tag;
      // tagColor renders the tag pill in a meaningful accent — drop it in only when the
      // model also gave a tag to color (a colored pill with no tag is noise).
      if (tag && ro.tagColor !== undefined) row.tagColor = coerceColor(ro.tagColor);
      return row;
    })
    .filter((r): r is BreakdownRow => r !== null);
  if (!title || !rows.length) return null;
  const out: BreakdownProps = { title, rows };
  const icon = coerceIcon(p.icon);
  if (icon) out.icon = icon;
  if (p.iconColor !== undefined) out.iconColor = coerceColor(p.iconColor);
  const conf = coerceConf(p.conf);
  if (conf) {
    const numericText = rows.map((r) => r.val).join(' ');
    out.conf = shouldDowngradeToInferred(conf, numericText, false, grounded) ? 'inferred' : conf;
  }
  return out;
}

/** A "list" of one bare bullet reads as thin/broken next to the rest of a composed canvas — one
 *  point belongs in an insight or a kpi tile, not a bulleted list. Mirrors the >=2 floor
 *  buildCompare (options) and buildDiagramFlow (nodes) already hold their own structures to. */
const MIN_LIST_ITEMS = 2;

function buildList(p: Record<string, Json>): ListProps | null {
  const title = alias(p, 'title', 'heading', 'header');
  const items = aliasArr(p, 'items', 'points', 'tips', 'list', 'steps', 'bullets')
    .map((i) => {
      if (typeof i === 'string') return i;
      const o = asObj(i);
      const text = alias(o, 'text', 'label', 'title', 'name', 'item');
      if (text) return text;
      // A model that invented its own item schema ({ticker, companyName, currentPrice}) still
      // fetched real data — a grounded search someone paid for. Salvage it as one legible row
      // instead of mapping every item to '' and throwing the whole block away.
      return Object.values(o)
        .filter(
          (v): v is string | number =>
            (typeof v === 'string' && v.trim() !== '') ||
            (typeof v === 'number' && Number.isFinite(v)),
        )
        .join(' — ');
    })
    .filter((i) => i !== '');
  if (!title || items.length < MIN_LIST_ITEMS) return null;
  return { title, items };
}

function buildTimeline(p: Record<string, Json>): TimelineProps | null {
  const events: TimelineEvent[] = aliasArr(p, 'events', 'items', 'steps', 'schedule', 'timeline')
    .map((e): TimelineEvent | null => {
      const eo = asObj(e);
      const evTitle = alias(eo, 'title', 'event', 'activity', 'name', 'label', 'step', 'task');
      if (!evTitle) return null;
      const ev: TimelineEvent = { time: alias(eo, 'time', 'when', 'day', 'date'), title: evTitle };
      const detail = alias(eo, 'detail', 'description', 'desc', 'note', 'sub') || undefined;
      if (detail) ev.detail = detail;
      return ev;
    })
    .filter((e): e is TimelineEvent => e !== null);
  if (!events.length) return null;
  const out: TimelineProps = { events };
  const eyebrow = optStr(p.eyebrow);
  if (eyebrow) out.eyebrow = eyebrow;
  const title = optStr(p.title);
  if (title) out.title = title;
  return out;
}

function buildCompare(p: Record<string, Json>): CompareProps | null {
  const options: CmpOption[] = asArr(p.options)
    .map((o): CmpOption | null => {
      const oo = asObj(o);
      const name = asStr(oo.name);
      if (!name) return null;
      const opt: CmpOption = { name };
      const sub = optStr(oo.sub);
      if (sub) opt.sub = sub;
      const pick = asBool(oo.pick);
      if (pick) opt.pick = true;
      return opt;
    })
    .filter((o): o is CmpOption => o !== null);
  const criteria: CmpCriterion[] = asArr(p.criteria)
    .map((c): CmpCriterion | null => {
      const co = asObj(c);
      const label = asStr(co.label);
      if (!label) return null;
      const cells: CmpCell[] = asArr(co.cells).map((cell): CmpCell => {
        const ce = asObj(cell);
        const out: CmpCell = { v: asStr(ce.v) };
        if (asBool(ce.win)) out.win = true;
        return out;
      });
      return { label, cells };
    })
    .filter((c): c is CmpCriterion => c !== null);
  if (options.length < 2 || !criteria.length) return null;
  const out: CompareProps = { options, criteria };
  const eyebrow = optStr(p.eyebrow);
  if (eyebrow) out.eyebrow = eyebrow;
  const rec = optStr(p.recommendation);
  if (rec) out.recommendation = rec;
  return out;
}

function buildKpi(p: Record<string, Json>, grounded: boolean): KpiGridProps | null {
  // The simplified schema uses items[{label,value,color}]; map onto KpiGrid's kpis[{val,label,color}].
  // A model often emits a SINGLE flat kpi ({title?,label,value}) instead of an items array —
  // wrap that into a one-tile grid so it renders rather than being dropped.
  const rawItems = aliasArr(p, 'items', 'kpis', 'stats', 'metrics', 'data');
  const items = rawItems.length ? rawItems : alias(p, 'label', 'value') ? [p] : [];
  const kpis: KpiSpec[] = items
    .map((i): KpiSpec | null => {
      const io = asObj(i);
      const label = alias(io, 'label', 'name', 'title');
      const val = alias(io, 'value', 'val', 'stat', 'amount');
      // A tile with no label is a bare number with no context — it reads as broken next to its
      // labeled siblings, so it's dropped rather than rendered with a blank caption.
      if (!label) return null;
      const kpi: KpiSpec = { val: val || '—', label };
      // A per-tile accent makes the grid read like a dashboard, not a plain table.
      if (io.color !== undefined) kpi.color = coerceColor(io.color);
      return kpi;
    })
    .filter((k): k is KpiSpec => k !== null);
  if (!kpis.length) return null;
  // Title can come from the block, or fall back to the lone tile's label / a generic header
  // so a single-stat kpi (no title) still renders instead of being dropped.
  const title =
    alias(p, 'title', 'heading', 'header') ||
    (kpis.length === 1 ? kpis[0].label : '') ||
    'Key stats';
  const out: KpiGridProps = { title, kpis };
  const icon = coerceIcon(p.icon);
  if (icon) out.icon = icon;
  if (p.iconColor !== undefined) out.iconColor = coerceColor(p.iconColor);
  const cols = asNum(p.cols, 0);
  if (cols >= 2 && cols <= 4) out.cols = Math.round(cols);
  const footer = optStr(p.footer);
  if (footer) out.footer = footer;
  const conf = coerceConf(p.conf);
  if (conf) {
    const numericText = kpis.map((k) => k.val).join(' ');
    out.conf = shouldDowngradeToInferred(conf, numericText, false, grounded) ? 'inferred' : conf;
  }
  return out;
}

function buildRing(p: Record<string, Json>): RingStatProps | null {
  const title = asStr(p.title);
  const rings: RingSpec[] = asArr(p.rings)
    .map((r): RingSpec | null => {
      const ro = asObj(r);
      const label = asStr(ro.label);
      if (!label) return null;
      const pct = clamp(asNum(ro.pct), 0, 1);
      return {
        label,
        pct,
        display: dropToken(asStr(ro.display, '')) || `${Math.round(pct * 100)}%`,
        ...(optStr(ro.hint) ? { hint: asStr(ro.hint) } : {}),
      };
    })
    .filter((r): r is RingSpec => r !== null);
  if (!title || !rings.length) return null;
  return { title, rings };
}

/* ---- frontier cousins (exposed only to stronger models) ---- */
function buildBars(p: Record<string, Json>, grounded: boolean): BarChartProps | null {
  const title = alias(p, 'title', 'heading', 'header');
  // Models commonly emit `data`/`items`/`values` for the bar array — accept the synonyms so
  // a correctly-conceived block isn't dropped over a key name (the menu still teaches `bars`).
  const bars: BarSpec[] = aliasArr(p, 'bars', 'data', 'items', 'values', 'rows')
    .map((b): BarSpec | null => {
      const bo = asObj(b);
      const label = alias(bo, 'label', 'name', 'category');
      if (!label) return null;
      const bar: BarSpec = { value: asNum(bo.value ?? bo.amount ?? bo.count), label };
      const label2 = optStr(bo.label2);
      if (label2) bar.label2 = label2;
      if (bo.color !== undefined) bar.color = coerceColor(bo.color);
      if (asBool(bo.hot)) bar.hot = true;
      return bar;
    })
    .filter((b): b is BarSpec => b !== null);
  if (!title || !bars.length) return null;
  const out: BarChartProps = { title, bars };
  const unit = optStr(p.unit);
  if (unit) out.unit = unit;
  if (p.goal !== undefined && p.goal !== null) out.goal = asNum(p.goal);
  const goalLabel = optStr(p.goalLabel);
  if (goalLabel) out.goalLabel = goalLabel;
  const footer = optStr(p.footer);
  if (footer) out.footer = footer;
  // Bars carry a required numeric `value` per bar — always a numeric claim, like a chart's series.
  const conf = coerceConf(p.conf);
  if (conf) out.conf = shouldDowngradeToInferred(conf, '1', false, grounded) ? 'inferred' : conf;
  return out;
}

function buildStack(p: Record<string, Json>, grounded: boolean): StackedBarProps | null {
  const title = asStr(p.title);
  const segments: StackSeg[] = asArr(p.segments)
    .map((s): StackSeg | null => {
      const so = asObj(s);
      const label = asStr(so.label);
      if (!label) return null;
      const value = asNum(so.value);
      return {
        value,
        label,
        display: dropToken(asStr(so.display, '')) || String(value),
        color: coerceColor(so.color),
      };
    })
    .filter((s): s is StackSeg => s !== null);
  if (!title || !segments.length) return null;
  const out: StackedBarProps = { title, segments };
  const total = optStr(p.total);
  if (total) out.total = total;
  const footer = optStr(p.footer);
  if (footer) out.footer = footer;
  const conf = coerceConf(p.conf);
  if (conf) {
    const numericText = segments.map((s) => s.display).join(' ');
    out.conf = shouldDowngradeToInferred(conf, numericText, false, grounded) ? 'inferred' : conf;
  }
  return out;
}

function buildDonut(p: Record<string, Json>, grounded: boolean): DonutProps | null {
  const title = asStr(p.title);
  const rows: DonutRow[] = asArr(p.rows)
    .map((r): DonutRow | null => {
      const ro = asObj(r);
      const label = asStr(ro.label);
      if (!label) return null;
      return { label, pct: clamp(asNum(ro.pct), 0, 100), color: coerceColor(ro.color) };
    })
    .filter((r): r is DonutRow => r !== null);
  if (!title || !rows.length) return null;
  const out: DonutProps = { title, rows };
  const footer = optStr(p.footer);
  if (footer) out.footer = footer;
  // Every donut row IS a numeric share — always a numeric claim.
  const conf = coerceConf(p.conf);
  if (conf) out.conf = shouldDowngradeToInferred(conf, '1', false, grounded) ? 'inferred' : conf;
  return out;
}

function buildGauge(p: Record<string, Json>, grounded: boolean): GaugeProps | null {
  const title = asStr(p.title);
  if (!title) return null;
  const out: GaugeProps = { title, value: asNum(p.value) };
  if (p.max !== undefined && p.max !== null) out.max = asNum(p.max);
  if (p.color !== undefined) out.color = coerceColor(p.color);
  const band = dropToken(asStr(p.band, ''));
  if (band) out.band = band;
  const driver = dropToken(asStr(p.driver, ''));
  if (driver) out.driver = driver;
  const footer = optStr(p.footer);
  if (footer) out.footer = footer;
  // A gauge's whole point is its single numeric reading — always a numeric claim.
  const conf = coerceConf(p.conf);
  if (conf) out.conf = shouldDowngradeToInferred(conf, '1', false, grounded) ? 'inferred' : conf;
  return out;
}

/* ---- generic, metadata-driven coercion (the long tail of the catalog) ----
 * The hand-written builders above cover the dozen most-used types with high fidelity.
 * Every OTHER renderable component is coerced from its catalog metadata: keep the keys it
 * declares, require its essential data to be present, and neutralize any HTML-forming
 * characters. Render safety beyond that is the BlockBoundary's job, so a component meeting
 * an unexpected shape drops to an empty cell rather than throwing. */

/** Swap the two tag-forming brackets for look-alike guillemets, so loose model text can
 *  never form an HTML tag even if a component renders it as HTML — while still reading as
 *  angle brackets to a person. */
function neutralizeTags(s: string): string {
  return s.replace(/</g, '‹').replace(/>/g, '›');
}

/** Recursively clean every string within a value: strip voice annotations down to their shown
 *  side, then neutralize tag characters. The model is told to mark tricky-to-speak spans inline as
 *  `[[shown|said]]` (for the voice), and it freely does so in ANY field — a stat value, a label, a
 *  caption — not just the narration. Only narration/note/tour get split upstream, so without this a
 *  stray annotation reaches the screen as literal `[[V|volts]]`. Blocks are never spoken, so the
 *  shown side is always what they want. RAW-TEXT props skip this in coerceGeneric so their markup
 *  survives to the render-time sanitizer; they get annotationsDeep instead, except where the
 *  brackets are real syntax (VERBATIM_PROPS). */
function sanitizeDeep(v: Json): Json {
  if (typeof v === 'string') return neutralizeTags(forDisplay(v));
  if (Array.isArray(v)) return v.map(sanitizeDeep);
  if (v && typeof v === 'object') {
    const out: Record<string, Json> = {};
    for (const [k, val] of Object.entries(v as Record<string, Json>)) out[k] = sanitizeDeep(val);
    return out;
  }
  return v; // number, boolean, null
}

/** Resolve `[[shown|said]]` annotations everywhere in a value, touching nothing else. RAW-TEXT
 *  props skip sanitizeDeep so their markup survives to richInnerHtml, but the model marks
 *  speech-risky spans in ANY field it writes, and blocks are never spoken — so without this an
 *  error message reaches the card as literal `[[CPU|C-P-U]] temperature exceeded 95 [[Celsius…`. */
function annotationsDeep(v: Json): Json {
  if (typeof v === 'string') return resolveAnnotations(v);
  if (Array.isArray(v)) return v.map(annotationsDeep);
  if (v && typeof v === 'object') {
    const out: Record<string, Json> = {};
    for (const [k, val] of Object.entries(v as Record<string, Json>)) out[k] = annotationsDeep(val);
    return out;
  }
  return v; // number, boolean, null
}

/** Neutralize tag characters in a hand-built block's props, mirroring what coerceGeneric does
 *  for the long tail. The custom builders below extract HtmlString fields (a footer, a label)
 *  with optStr and several renderers print them via dangerouslySetInnerHTML, so without this a
 *  model-supplied "<img onerror=…>" footer would reach the DOM as live markup. Node-safe
 *  (string-only, no DOM), so it also holds on the headless eval path. */
function cleanBuilt<T>(p: T | null): T | null {
  return p === null ? null : (sanitizeDeep(p as Json) as T);
}

/** For an item-array prop, the raw-text set may carry "<prop>.<field>" entries (e.g. "diff.c"):
 *  one HTML field per item that richInnerHtml sanitizes at render and so must NOT be neutralized
 *  here. Return that field name for `prop`, or '' when none — keeping the lookup in one place. */
function nestedRawField(raw: ReadonlySet<string>, prop: string): string {
  const prefix = prop + '.';
  for (const entry of raw) {
    if (entry.startsWith(prefix)) return entry.slice(prefix.length);
  }
  return '';
}

/** Sanitize each object in an item array but leave ONE named field on every item untouched —
 *  the field a renderer passes to richInnerHtml, where the strict allow-list sanitizer runs at the
 *  DOM boundary. Non-object entries (or a non-array value) fall back to the normal deep clean. */
function sanitizeItemsExcept(value: Json, rawField: string, verbatim: boolean): Json {
  if (!Array.isArray(value)) return sanitizeDeep(value);
  return value.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return sanitizeDeep(item);
    const src = item as Record<string, Json>;
    const out: Record<string, Json> = {};
    for (const [k, v] of Object.entries(src)) {
      out[k] = k === rawField ? (verbatim ? v : annotationsDeep(v)) : sanitizeDeep(v);
    }
    return out;
  });
}

/** Normalize the objects inside ONE item array against its ItemSpec: rename a synonym
 *  onto the field the renderer reads (`label`→`text`), recurse into a nested child
 *  array, then DROP any item still missing its text — so a list-style card can never
 *  render a numbered-but-blank row. A spec with no `text` (numeric/chart/graph items)
 *  only recurses into children; it never drops, since there is no text to require. */
function normalizeItems(value: Json, spec: ItemSpec): Json[] {
  return asArr(value)
    .map((raw): Json | null => {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        // A bare string where an object was expected: lift it into {text: …} when the
        // spec has a text field, so `items: ["a","b"]` still renders. Otherwise drop it.
        if (spec.text && typeof raw === 'string' && raw.trim()) return { [spec.text]: raw };
        return null;
      }
      const item = { ...(raw as Record<string, Json>) };
      if (spec.text) {
        // Canonical field wins; else adopt the first non-empty synonym, then require it.
        if (!asStr(item[spec.text], '').trim()) {
          const v = alias(item, ...(spec.textAliases ?? []));
          if (v) item[spec.text] = v;
        }
        if (!asStr(item[spec.text], '').trim()) return null; // still blank → drop
      }
      if (spec.children)
        item[spec.children.prop] = normalizeItems(item[spec.children.prop], spec.children);
      return item;
    })
    .filter((it): it is Json => it !== null);
}

/** The item fields that commonly carry an item's visible text, probed in the order a model
 *  tends to use them when it objectifies a plain-string array ({step: "…"}, {text: "…"}). */
const STRING_ITEM_TEXT_KEYS = [
  'text',
  'step',
  'tip',
  'name',
  'label',
  'title',
  'line',
  'value',
  'description',
] as const;

/** One plain string from an item of any shape, or '' when it carries no usable text. */
function toPlainString(item: Json): string {
  if (typeof item === 'string') return item.trim();
  if (typeof item === 'number' && Number.isFinite(item)) return String(item);
  if (item && typeof item === 'object' && !Array.isArray(item)) {
    const o = item as Record<string, Json>;
    for (const k of STRING_ITEM_TEXT_KEYS) {
      const v = o[k];
      if (typeof v === 'string' && v.trim()) return v.trim();
    }
    // No canonical key: a single string field still carries the words; two or more is
    // ambiguous, so drop the item rather than guess which half of it to show.
    const strs = Object.values(o).filter((v): v is string => typeof v === 'string' && !!v.trim());
    if (strs.length === 1) return strs[0].trim();
  }
  return '';
}

/** Coerce a `stringItems` prop to a clean string[]: flatten wrong-shaped items to their text
 *  and drop blanks. A renderer maps these straight into text nodes, so anything else — an
 *  objectified step list, a numbered object per line — would throw at render and vanish the
 *  whole card. A lone string still yields one item rather than dropping the block. */
function normalizeStringItems(value: Json): string[] {
  if (typeof value === 'string' && value.trim()) return [value.trim()];
  return asArr(value)
    .map(toPlainString)
    .filter((s) => s !== '');
}

const INVALID_STRUCTURE = Symbol('invalid generated component structure');

/** A closed vocabulary declared on a nested field path. `strict` marks it a renderer contract
 *  (ItemSpec.closedVocab): an unsnappable value invalidates the whole item rather than being
 *  kept as display text or dropped as enrichment. */
interface NestedEnum {
  values: ReadonlySet<string>;
  strict: boolean;
}

function referenceWeight(value: unknown): number {
  if (Array.isArray(value)) return 1 + value.reduce((sum, item) => sum + referenceWeight(item), 0);
  if (value && typeof value === 'object')
    return (
      1 +
      Object.values(value as Record<string, unknown>).reduce<number>(
        (sum, item) => sum + referenceWeight(item),
        0,
      )
    );
  return 1;
}

/** Project untrusted model data onto the nested structure of a real, shipping fixture. This is a
 * runtime type boundary, not a default-value merger: fixture VALUES are never copied into an
 * answer. An incompatible object/array is rejected, unknown fields are discarded, numeric strings
 * are repaired to finite numbers, and arrays are bounded before a renderer can allocate from them.
 * Each array reference may carry several legitimate item variants from the shipping fixture.
 * Nested numeric/array/object fields are required unless catalog metadata explicitly calls them
 * optional; scalar string/boolean enrichment fields are optional unless ItemSpec names the string
 * as the item's canonical visible label. */
function coerceToReferenceShape(
  value: Json,
  reference: unknown,
  canonicalItemFields: ReadonlyMap<string, ReadonlySet<string>>,
  optionalFields: ReadonlySet<string>,
  openRecordPaths: ReadonlySet<string>,
  nestedEnums: ReadonlyMap<string, NestedEnum>,
  path: string,
  depth = 0,
): Json | typeof INVALID_STRUCTURE {
  if (depth > 10) return INVALID_STRUCTURE;

  if (typeof reference === 'string') {
    if (typeof value === 'string') return value;
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    if (typeof value === 'boolean') return String(value);
    return INVALID_STRUCTURE;
  }
  if (typeof reference === 'number') {
    const numeric =
      typeof value === 'number'
        ? value
        : typeof value === 'string' && value.trim()
          ? Number(value)
          : Number.NaN;
    return Number.isFinite(numeric) ? numeric : INVALID_STRUCTURE;
  }
  if (typeof reference === 'boolean') {
    if (typeof value === 'boolean') return value;
    if (value === 'true') return true;
    if (value === 'false') return false;
    return INVALID_STRUCTURE;
  }
  if (Array.isArray(reference)) {
    if (!Array.isArray(value) || reference.length === 0) return INVALID_STRUCTURE;
    const out = value
      .slice(0, 64)
      .map((item) => {
        // Try every shipping shape and keep the richest one that this item genuinely satisfies.
        // This accepts valid heterogeneity without merging fixture values or arbitrary fields.
        const matches = reference
          .map((itemReference) => ({
            weight: referenceWeight(itemReference),
            value: coerceToReferenceShape(
              item,
              itemReference,
              canonicalItemFields,
              optionalFields,
              openRecordPaths,
              nestedEnums,
              `${path}[]`,
              depth + 1,
            ),
          }))
          .filter((match) => match.value !== INVALID_STRUCTURE)
          .sort((a, b) => b.weight - a.weight);
        const best = matches[0]?.value;
        return best === undefined ? INVALID_STRUCTURE : best;
      })
      // A blank string is not an item — a renderer maps these into visible text, so keeping
      // "" would draw an empty chip/row and a list of nothing but blanks would read as data.
      .filter(
        (item) => item !== INVALID_STRUCTURE && (typeof item !== 'string' || item.trim() !== ''),
      );
    return out.length ? out : INVALID_STRUCTURE;
  }
  if (reference && typeof reference === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return INVALID_STRUCTURE;
    const input = value as Record<string, Json>;
    // Open-dictionary props — a datatable's rows keyed by its own columns, a leaderboard/pivot row's
    // values keyed by its own metrics — carry per-answer keys the fixed-key structural reference
    // (built from one authored example) can't enumerate. Keep the model's OWN keys, coercing each
    // value to the reference's value type, instead of projecting onto the example's keys (which
    // discards every real key and empties the row).
    if (openRecordPaths.has(path)) {
      const sample = Object.values(reference as Record<string, unknown>)[0] ?? '';
      const openOut: Record<string, Json> = {};
      for (const [k, cell] of Object.entries(input).slice(0, 200)) {
        const coerced = coerceToReferenceShape(
          cell,
          sample,
          canonicalItemFields,
          optionalFields,
          openRecordPaths,
          nestedEnums,
          `${path}.${k}`,
          depth + 1,
        );
        if (coerced !== INVALID_STRUCTURE) openOut[k] = coerced;
      }
      return Object.keys(openOut).length ? openOut : INVALID_STRUCTURE;
    }
    const out: Record<string, Json> = {};
    const fields = Object.entries(reference as Record<string, unknown>).slice(0, 64);
    if (!fields.length) return INVALID_STRUCTURE;
    const requiredCanonicalFields = canonicalItemFields.get(path) ?? new Set<string>();
    for (const [key, fieldReference] of fields) {
      if (!(key in input)) {
        const optionalScalar =
          !requiredCanonicalFields.has(key) &&
          (typeof fieldReference === 'string' || typeof fieldReference === 'boolean');
        if (optionalScalar || optionalFields.has(`${path}.${key}`)) continue;
        return INVALID_STRUCTURE;
      }
      const coerced = coerceToReferenceShape(
        input[key],
        fieldReference,
        canonicalItemFields,
        optionalFields,
        openRecordPaths,
        nestedEnums,
        `${path}.${key}`,
        depth + 1,
      );
      if (coerced === INVALID_STRUCTURE) return INVALID_STRUCTURE;
      // An `icon` at any depth is a registry key, not display text: a hallucinated name is
      // dropped here (the item renders fine without one) instead of reaching a renderer whose
      // `Icon[name]` lookup would come back undefined. Same contract coerceIcon enforces for
      // the hand-written builders' top-level icons.
      if (key === 'icon' && typeof coerced === 'string') {
        const iconKey = coerceIcon(coerced);
        if (iconKey) out[key] = iconKey;
        continue;
      }
      // A nested field with a pipe-enum catalog hint ("stage": 'inputs'|'activities'|…) is
      // normalized here, where required-ness is known. Snap-repair recovers the near-misses a
      // model actually writes ("Inputs", "activity"). When snapping fails, the ItemSpec's
      // closedVocab flag decides: on a STRICT vocabulary the renderer buckets by this value and
      // would silently discard the item after validation (the "validated but hollow" card), so
      // the item is invalid here instead; on a tolerant one, a canonical/required field keeps
      // the model's own words (renderers display them, gracefully) while a union-typed
      // enrichment field falls away so the renderer's default applies.
      const nested = typeof coerced === 'string' ? nestedEnums.get(`${path}.${key}`) : undefined;
      if (nested) {
        const snapped = snapToEnum(coerced as string, nested.values);
        if (snapped !== null) {
          out[key] = snapped;
          continue;
        }
        if (nested.strict) return INVALID_STRUCTURE;
        if (requiredCanonicalFields.has(key)) out[key] = coerced;
        continue;
      }
      out[key] = coerced;
    }
    // ItemSpec alias repair may add the renderer's canonical text key even when the authored
    // fixture happened to use a synonym. Preserve only those explicitly-declared additions;
    // arbitrary nested model keys remain discarded.
    for (const key of requiredCanonicalFields) {
      if (key in input && !(key in out)) out[key] = input[key];
    }
    return out;
  }
  return INVALID_STRUCTURE;
}

/** Recover a closed string enum from a hint such as `"sin" | "cos" | "exp"`. One quoted
 * example is descriptive, not a closed set; two or more alternatives form an enforceable
 * vocabulary. */
function enumValuesFromHint(hint: string | undefined): ReadonlySet<string> | null {
  // Quoted examples separated by prose ("A", "B", or "C") are not an enum. Only the catalog's
  // explicit pipe vocabulary ("a" | "b") closes the set; otherwise valid fixture/model values
  // such as a person's relationship or an arbitrary magnitude would be rejected accidentally.
  if (!hint || !/\|\s*["']/.test(hint)) return null;
  // An "e.g." BEFORE the first quoted value marks the whole pipe list as illustrative
  // ('e.g. "TypeError"|"ValueError"') — enforcing it would reject every legitimate value the
  // example didn't happen to include. An "e.g." later in the hint is just descriptive prose
  // after a genuine vocabulary and doesn't reopen the set.
  const egAt = hint.indexOf('e.g.');
  if (egAt !== -1 && egAt < hint.search(/["']/)) return null;
  const values = [...hint.matchAll(/["']([^"']+)["']/g)].map((match) => match[1]);
  return values.length >= 2 ? new Set(values) : null;
}

/** Snap a model-authored value onto a closed vocabulary: exact first, then a trimmed,
 *  case-insensitive, singular/plural (±s) match recovers the canonical member — the drifts a
 *  model actually produces ("Inputs", "input ") — so a near-miss keeps its data instead of
 *  being thrown away. Anything further off returns null for the caller to treat as absent. */
function snapToEnum(value: string, values: ReadonlySet<string>): string | null {
  if (values.has(value)) return value;
  // "cities" ↔ "city", "inputs" ↔ "input" — enough stemming to unify number without a
  // dictionary; anything cleverer risks snapping two genuinely different members together.
  const singular = (s: string) =>
    s.endsWith('ies') ? s.slice(0, -3) + 'y' : s.endsWith('s') ? s.slice(0, -1) : s;
  const wanted = singular(value.trim().toLowerCase());
  if (!wanted) return null;
  for (const member of values) {
    if (singular(member.toLowerCase()) === wanted) return member;
  }
  return null;
}

/** Props (by nested path) that are OPEN DICTIONARIES — objects whose keys are chosen per answer:
 *  a datatable's rows keyed by its own columns; a leaderboard/pivot/parallel row's values keyed by
 *  its own metrics/axes; a scatterplot row keyed by its own variables. The structural reference is
 *  built from one authored example, so its keys are only sample data — projecting a real row onto
 *  them discards every model key and leaves an empty row. These paths bypass that projection and
 *  keep the model's own keys (values still coerced to the reference's value type). Paths use the
 *  same `[]`/`.key` notation coerceToReferenceShape builds, relative to the prop key. */
const OPEN_RECORD_PATHS: Record<string, ReadonlySet<string>> = {
  datatable: new Set(['rows[]']),
  scatterplotmatrix: new Set(['rows[]']),
  pivot: new Set(['rows[].cells[].values']),
  leaderboard: new Set(['rows[].values']),
  parallelcoordinates: new Set(['lines[].values']),
};
const NO_OPEN_RECORDS: ReadonlySet<string> = new Set();

/** Coerce props for a catalog component with no hand-written builder. Normalizes any
 *  text-bearing item arrays against the component's `itemShapes` (so a model's synonym
 *  field name still renders, and a blank item is dropped rather than shown), flattens
 *  `stringItems` props to plain string arrays, then requires every `requires` key to carry
 *  real data (else the block is dropped, never shown empty), and passes `requires` +
 *  `optional` through sanitized; unknown keys are discarded. */
function coerceGeneric(
  meta: ComponentMeta,
  props: Record<string, Json>,
): Record<string, Json> | null {
  // Repair item arrays first, so a required `items` that only LOOKED present (4 objects,
  // all missing their text) collapses to empty here and the requires-check then drops it.
  const repaired: Record<string, Json> = { ...props };
  for (const spec of meta.itemShapes ?? []) {
    if (repaired[spec.prop] !== undefined)
      repaired[spec.prop] = normalizeItems(repaired[spec.prop], spec);
  }
  for (const prop of meta.stringItems ?? []) {
    if (repaired[prop] !== undefined) repaired[prop] = normalizeStringItems(repaired[prop]);
  }
  // `requires`/`optional` describe only the top level. The reference is the nested contract from
  // the same real fixture printed in the model's prompt and rendered in the gallery. Enforce it
  // before the shallow required check so malformed nested arrays never reach React.
  const reference = STRUCTURAL_REFERENCES[meta.type];
  if (!reference || typeof reference !== 'object' || Array.isArray(reference)) return null;
  const canonicalItemFields = new Map<string, Set<string>>();
  const registerItemShape = (spec: ItemSpec, path: string): void => {
    const required = new Set([...(spec.text ? [spec.text] : []), ...(spec.requiredFields ?? [])]);
    if (required.size) canonicalItemFields.set(`${path}[]`, required);
    if (spec.children) registerItemShape(spec.children, `${path}[].${spec.children.prop}`);
  };
  for (const spec of meta.itemShapes ?? []) registerItemShape(spec, spec.prop);
  const optionalFields = new Set(
    Object.entries(meta.propHints ?? {})
      .filter(([, hint]) => /\boptional\b/i.test(hint))
      .map(([path]) => path),
  );
  const openRecordPaths = OPEN_RECORD_PATHS[meta.type] ?? NO_OPEN_RECORDS;
  // Closed vocabularies the catalog declares on NESTED fields ('columns[].stage', 'diff[].t') —
  // normalized during reference projection so an off-vocabulary value can't validate and then be
  // discarded by the renderer's own switch, leaving a card of placeholders. A path is STRICT
  // when its ItemSpec carries closedVocab (the renderer buckets by the value).
  const strictVocabPaths = new Set<string>();
  const registerClosedVocab = (spec: ItemSpec, path: string): void => {
    if (spec.closedVocab && spec.text) strictVocabPaths.add(`${path}[].${spec.text}`);
    if (spec.children) registerClosedVocab(spec.children, `${path}[].${spec.children.prop}`);
  };
  for (const spec of meta.itemShapes ?? []) registerClosedVocab(spec, spec.prop);
  const nestedEnums = new Map<string, NestedEnum>();
  for (const [hintPath, hint] of Object.entries(meta.propHints ?? {})) {
    if (!hintPath.includes('.')) continue;
    const values = enumValuesFromHint(hint);
    if (values) nestedEnums.set(hintPath, { values, strict: strictVocabPaths.has(hintPath) });
  }
  for (const key of [...meta.requires, ...meta.optional]) {
    if (repaired[key] === undefined) continue;
    if (!(key in reference)) {
      if (meta.requires.includes(key)) return null;
      delete repaired[key];
      continue;
    }
    const coerced = coerceToReferenceShape(
      repaired[key],
      (reference as Record<string, unknown>)[key],
      canonicalItemFields,
      optionalFields,
      openRecordPaths,
      nestedEnums,
      key,
    );
    if (coerced === INVALID_STRUCTURE) delete repaired[key];
    else if (key === 'icon' && typeof coerced === 'string') {
      // Top-level icons on generic blocks get the same registry snap the nested walk applies.
      const iconKey = coerceIcon(coerced);
      if (iconKey) repaired[key] = iconKey;
      else delete repaired[key];
    } else {
      const enumValues = enumValuesFromHint(meta.propHints?.[key]);
      if (enumValues && typeof coerced === 'string') {
        const snapped = snapToEnum(coerced, enumValues);
        if (snapped === null) delete repaired[key];
        else repaired[key] = snapped;
      } else repaired[key] = coerced;
    }
  }
  for (const key of meta.requires) {
    const v = repaired[key];
    const empty =
      v === undefined ||
      v === null ||
      (typeof v === 'string' && v.trim() === '') ||
      (Array.isArray(v) && v.length === 0);
    if (empty) return null;
  }
  const raw = RAW_TEXT_PROPS[meta.type];
  const out: Record<string, Json> = {};
  for (const key of [...meta.requires, ...meta.optional]) {
    if (repaired[key] === undefined) continue;
    // RAW-TEXT props (e.g. a codeblock's `code`) must survive verbatim: angle brackets are real
    // source — `List<T>`, `#include <vector>`, `a < b` — and tag-neutralization would corrupt them.
    // It's safe to skip the guard because the consumer escapes it: Shiki emits escaped markup, the
    // plain-text fallback renders it through a React text node (auto-escaped), and HtmlString fields
    // are sanitized by richInnerHtml at render. No raw model HTML ever reaches the DOM unescaped.
    const verbatim = VERBATIM_PROPS[meta.type];
    if (raw?.has(key)) {
      // Exempt from tag-neutralization, but still not a place for voice markup — unless the
      // brackets are the field's own syntax.
      out[key] = verbatim?.has(key) ? repaired[key] : annotationsDeep(repaired[key]);
      continue;
    }
    // A "<array>.<field>" exemption keeps one HTML field on each item raw (sanitized later by
    // richInnerHtml) while every sibling field is still neutralized here.
    const rawField = raw && nestedRawField(raw, key);
    out[key] = rawField
      ? sanitizeItemsExcept(repaired[key], rawField, verbatim?.has(`${key}.${rawField}`) === true)
      : sanitizeDeep(repaired[key]);
  }
  return out;
}

/** Per-component props whose string value must pass through UN-neutralized because the renderer
 *  sanitizes or escapes it itself. Keep this tight — only fields that are literal source/markup
 *  the user must be able to copy verbatim, or HtmlString fields the component renders through
 *  richInnerHtml (which applies the strict allow-list sanitizer at the DOM boundary). An entry may
 *  be a plain prop name, or a "<array>.<field>" path to exempt one field on each item of an item
 *  array while its siblings stay neutralized (e.g. a diff line's HTML `c` but not its enum `t`). */
const RAW_TEXT_PROPS: Record<string, ReadonlySet<string>> = {
  codeblock: new Set(['code']),
  // messagedraft body is an HtmlString authored by the model; preserve markup verbatim.
  messagedraft: new Set(['body']),
  // stacktrace message/fix may contain < from type generics or code snippets.
  stacktrace: new Set(['message', 'fix']),
  // equation LaTeX legitimately uses < > (relations) and backslashes; KaTeX/MathML escape it at
  // render, so keep the source verbatim rather than turning "a < b" into "a ‹ b".
  equationblock: new Set(['tex', 'math']),
  // svgblock carries raw SVG markup — angle brackets are literal elements, not HTML entities.
  // DOMPurify sanitizes it in the component before it ever touches the DOM.
  svgblock: new Set(['svg']),
  // molecularstructure's SMILES uses (), [], =, # as structural syntax; keep it verbatim for the
  // chemistry parser. It's never rendered as HTML — only fed to OpenChemLib, which yields numbers.
  molecularstructure: new Set(['smiles']),
  // The ai-family HtmlString fields below are rendered ONLY via richInnerHtml, which sanitizes
  // through a strict tag allow-list at the render boundary. Neutralizing here would mangle the
  // model's <strong>/<em>/<code> into guillemets BEFORE that sanitizer ever runs, so the user
  // sees literal "‹strong›" instead of formatting — hence the exemption. The nested item fields
  // (a diff line's `c`, a reasoning step's `detail`, a chunk's `body`) use a "<array>.<field>"
  // path so only the HTML field stays raw while its plain-text siblings keep being neutralized.
  whatchanged: new Set(['before', 'after', 'footer', 'diff.c']),
  reasoning: new Set(['conclusion', 'footer', 'steps.detail']),
  retrieval: new Set(['footer', 'chunks.body']),
};

/** The subset of RAW_TEXT_PROPS where `[[…]]` is SYNTAX rather than a voice annotation — a shell
 *  `[[ -f x ]]`, a C++ `[[nodiscard]]`, an R `x[[1]]`, a LaTeX bracket. These pass through
 *  byte-for-byte: a stray annotation left in real source is far cheaper than corrupting code the
 *  user is meant to copy. Every other raw-text prop is model-authored prose, so it keeps its markup
 *  but still gets its annotations resolved (see coerceGeneric). */
const VERBATIM_PROPS: Record<string, ReadonlySet<string>> = {
  codeblock: new Set(['code']),
  equationblock: new Set(['tex', 'math']),
  svgblock: new Set(['svg']),
  molecularstructure: new Set(['smiles']),
  // A diff line's HTML is a line of source; its siblings are already neutralized as normal.
  whatchanged: new Set(['diff.c']),
};

/** Build ONE typed Block from a loose {type,props}, or null if unsupported/empty.
 *  `allowed` gates which block types are accepted (capability-tiered). */
/** Coerce a photo only when every selected URL has already been individually cleared. Live does
 *  not offer this block to models; the check remains fail-closed for imported/baked responses. */
function buildPhoto(p: Record<string, Json>): PhotoProps | null {
  const src = safeImageUrl(alias(p, 'src', 'url', 'image')) ?? '';
  const candidates = [...asArr(p.candidates), ...asArr(p.urls)]
    .map((c) => safeImageUrl(asStr(c)))
    .filter((u): u is string => !!u && u !== src);
  // If the model gave no direct src but did give safe candidates, promote one so the block renders.
  const primary = src || candidates[0] || '';
  if (!primary) return null;
  const extra = primary === src ? candidates : candidates.slice(1);
  const out: PhotoProps = { src: primary };
  if (extra.length) out.candidates = extra;
  const title = optStr(p.title);
  if (title) out.title = title;
  const alt = optStr(p.alt);
  if (alt) out.alt = alt;
  const caption = optStr(p.caption);
  if (caption) out.caption = caption;
  return out;
}

const DIAGRAM_NODE_KINDS = new Set<DiagramNodeKind>([
  'default',
  'start',
  'accent',
  'good',
  'warn',
  'muted',
]);
const DIAGRAM_EDGE_KINDS = new Set<DiagramEdgeKind>(['default', 'accent', 'good', 'warn', 'muted']);
const DIAGRAM_LAYOUTS = new Set<DiagramLayout>(['cycle', 'layered', 'free']);

/** Coerce a loose node/edge graph into DiagramFlowProps. Nested + id-referential, so it's
 *  a custom builder: nodes need a usable id+label, and an edge is kept only if BOTH its
 *  endpoints survived (a dangling edge would just be dropped by the renderer, but pruning
 *  here keeps the validated block honest). Returns null with fewer than two nodes — a
 *  diagram of one box is not a diagram, and the caller falls back to a simpler shape. */
function buildDiagramFlow(p: Record<string, Json>): DiagramFlowProps | null {
  const title = asStr(p.title).trim();
  if (!title) return null;

  const nodes: DiagramNode[] = asArr(p.nodes)
    .map((n): DiagramNode | null => {
      const no = asObj(n);
      const id = asStr(no.id).trim();
      const label = (alias(no, 'label', 'name', 'text') || '').trim();
      if (!id || !label) return null;
      const node: DiagramNode = { id, label };
      const sub = optStr(no.sub);
      if (sub) node.sub = sub;
      const kind = asStr(no.kind).trim() as DiagramNodeKind;
      if (DIAGRAM_NODE_KINDS.has(kind)) node.kind = kind;
      // explicit placement is optional; accept only finite numbers and clamp to the 0..1
      // unit canvas the renderer expects, so a stray pixel value can't fling a node offscreen
      if (typeof no.x === 'number' && Number.isFinite(no.x)) node.x = clamp(no.x, 0, 1);
      if (typeof no.y === 'number' && Number.isFinite(no.y)) node.y = clamp(no.y, 0, 1);
      return node;
    })
    .filter((n): n is DiagramNode => n !== null);

  // de-dupe ids (a model can repeat one) — first wins, so edges resolve deterministically
  const seen = new Set<string>();
  const uniqueNodes = nodes.filter((n) => (seen.has(n.id) ? false : (seen.add(n.id), true)));
  if (uniqueNodes.length < 2) return null;

  const ids = new Set(uniqueNodes.map((n) => n.id));
  const edges: DiagramEdge[] = asArr(p.edges)
    .map((e): DiagramEdge | null => {
      const eo = asObj(e);
      const from = (alias(eo, 'from', 'source', 'start') || '').trim();
      const to = (alias(eo, 'to', 'target', 'end') || '').trim();
      if (!ids.has(from) || !ids.has(to)) return null;
      const edge: DiagramEdge = { from, to };
      const label = optStr(eo.label);
      if (label) edge.label = label;
      const kind = asStr(eo.kind).trim() as DiagramEdgeKind;
      if (DIAGRAM_EDGE_KINDS.has(kind)) edge.kind = kind;
      if (asBool(eo.bidirectional)) edge.bidirectional = true;
      if (asBool(eo.dashed)) edge.dashed = true;
      return edge;
    })
    .filter((e): e is DiagramEdge => e !== null);

  const result: DiagramFlowProps = { title, nodes: uniqueNodes, edges };
  const icon = coerceIcon(p.icon);
  if (icon) result.icon = icon;
  if (optStr(p.iconColor)) result.iconColor = coerceColor(p.iconColor);
  const layout = asStr(p.layout).trim() as DiagramLayout;
  if (DIAGRAM_LAYOUTS.has(layout)) result.layout = layout;
  const footer = optStr(p.footer);
  if (footer) result.footer = footer;
  return result;
}

const DIAG_SHAPE_KINDS = new Set<DiagShapeKind>(['circle', 'rect', 'line', 'polygon', 'path']);

/** Pull "x,y x,y …" coordinate pairs out of a points string, tolerating commas or spaces. */
function parsePointPairs(s: string): Array<[number, number]> {
  const nums = (s.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number).filter((n) => Number.isFinite(n));
  const pts: Array<[number, number]> = [];
  for (let i = 0; i + 1 < nums.length; i += 2) pts.push([nums[i], nums[i + 1]]);
  return pts;
}

/** Coerce one labeled-figure shape, clamping coords onto the fixed 0–100 viewBox and DROPPING any
 *  whose geometry is degenerate — a zero-radius circle, a zero-area rect, a zero-length line, a
 *  polygon with fewer than three distinct points, or a path with non-finite or out-of-space
 *  numbers (a path authored in pixels would draw far off-canvas). A misplaced shape is more
 *  misleading than a missing one, so we drop rather than guess. Shared by diagram + teachdiagram. */
function coerceDiagShape(raw: Json): DiagShape | null {
  const o = asObj(raw);
  const kind = asStr(o.kind).toLowerCase().trim() as DiagShapeKind;
  if (!DIAG_SHAPE_KINDS.has(kind)) return null;
  const shape: DiagShape = { kind };
  switch (kind) {
    case 'circle': {
      const r = asNum(o.r, NaN);
      if (!Number.isFinite(r) || r <= 0) return null;
      shape.cx = clampCoord(o.cx);
      shape.cy = clampCoord(o.cy);
      shape.r = clamp(r, 0.5, 100);
      break;
    }
    case 'rect': {
      const w = asNum(o.w, NaN);
      const h = asNum(o.h, NaN);
      if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;
      shape.x = clampCoord(o.x);
      shape.y = clampCoord(o.y);
      shape.w = clamp(w, 0.5, 100);
      shape.h = clamp(h, 0.5, 100);
      break;
    }
    case 'line': {
      const x1 = clampCoord(o.x1);
      const y1 = clampCoord(o.y1);
      const x2 = clampCoord(o.x2);
      const y2 = clampCoord(o.y2);
      if (x1 === x2 && y1 === y2) return null; // zero-length line is noise
      shape.x1 = x1;
      shape.y1 = y1;
      shape.x2 = x2;
      shape.y2 = y2;
      if (asBool(o.arrow)) shape.arrow = true;
      break;
    }
    case 'polygon': {
      const pts = parsePointPairs(asStr(o.points));
      const distinct = new Set(pts.map(([x, y]) => `${Math.round(x)},${Math.round(y)}`));
      if (distinct.size < 3) return null; // not a closed figure
      shape.points = pts.map(([x, y]) => `${clamp(x, 0, 100)},${clamp(y, 0, 100)}`).join(' ');
      break;
    }
    case 'path': {
      const d = asStr(o.d).trim();
      const nums = (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
      if (!d || nums.length < 2 || nums.some((n) => !Number.isFinite(n))) return null;
      if (nums.some((n) => Math.abs(n) > 200)) return null; // wrong coordinate space → off-canvas
      shape.d = d;
      break;
    }
  }
  const col = optStr(o.color);
  if (col) shape.color = coerceColor(col);
  const fill = optStr(o.fill);
  if (fill) shape.fill = coerceColor(fill);
  return shape;
}

/** Coerce one callout label, clamping its anchor onto the 0–100 canvas. Drops a textless label. */
function coerceDiagLabel(raw: Json): DiagLabel | null {
  const o = asObj(raw);
  const text = alias(o, 'text', 'label', 'name').trim();
  if (!text) return null;
  const label: DiagLabel = { x: clampCoord(o.x), y: clampCoord(o.y), text: capTweet(text, 60) };
  const side = asStr(o.side).toLowerCase().trim();
  if (side === 'left' || side === 'right' || side === 'top' || side === 'bottom') label.side = side;
  const col = optStr(o.color);
  if (col) label.color = coerceColor(col);
  return label;
}

/** Coerce a general labeled figure. Unlike the generic path it ran through before, this clamps
 *  every coordinate onto the fixed 0–100 viewBox and drops degenerate shapes, so an out-of-range
 *  or NaN coord can't break the layout. Returns null when no non-degenerate shape survives — an
 *  empty figure is never rendered. */
function buildDiagram(p: Record<string, Json>): DiagramProps | null {
  const title = asStr(p.title).trim();
  if (!title) return null;
  const shapes = aliasArr(p, 'shapes', 'figure')
    .slice(0, 24)
    .map(coerceDiagShape)
    .filter((s): s is DiagShape => s !== null);
  if (shapes.length === 0) return null;
  const labels = aliasArr(p, 'labels', 'callouts', 'annotations')
    .slice(0, 24)
    .map(coerceDiagLabel)
    .filter((l): l is DiagLabel => l !== null);
  const result: DiagramProps = { title, shapes, labels };
  const icon = coerceIcon(p.icon);
  if (icon) result.icon = icon;
  if (optStr(p.iconColor)) result.iconColor = coerceColor(p.iconColor);
  const ratio = asNum(p.ratio, NaN);
  if (Number.isFinite(ratio)) result.ratio = clamp(ratio, 0.4, 4);
  const footer = optStr(p.footer);
  if (footer) result.footer = footer;
  return result;
}

/** Coerce one build step of a teachdiagram: the shapes/labels ADDED this step plus its caption
 *  (split into shown/spoken twins). A step that adds neither a shape nor a label is dropped — it
 *  would advance the build without drawing anything. Shapes/labels reuse the diagram coercers, so
 *  every coordinate is clamped onto the 0–100 canvas and degenerate geometry is discarded. */
function buildTeachStep(raw: Json): TeachStep | null {
  const o = asObj(raw);
  const add = aliasArr(o, 'add', 'shapes', 'figure')
    .slice(0, 24)
    .map(coerceDiagShape)
    .filter((s): s is DiagShape => s !== null);
  const labels = aliasArr(o, 'labels', 'callouts', 'annotations')
    .slice(0, 24)
    .map(coerceDiagLabel)
    .filter((l): l is DiagLabel => l !== null);
  if (add.length === 0 && labels.length === 0) return null;
  const captionRaw = alias(o, 'caption', 'label', 'title', 'text', 'say');
  const step: TeachStep = { caption: capTweet(forDisplay(captionRaw).trim(), 120), add };
  const spoken = forSpeech(captionRaw).trim();
  if (spoken && spoken !== step.caption) step.captionSpoken = capTweet(spoken, 160);
  if (labels.length) step.labels = labels;
  const emphasize = asArr(o.emphasize)
    .map((n) => asNum(n, NaN))
    .filter((n) => Number.isFinite(n) && n >= 0 && n < add.length)
    .map((n) => Math.floor(n));
  if (emphasize.length) step.emphasize = emphasize;
  return step;
}

/** Coerce a teachdiagram: a figure built step by step. Nested (steps[].add[]/labels[]), so it
 *  needs a custom builder — the generic coercer can't rebuild two levels of arrays. Caps the
 *  steps (≤8) and shapes-per-step (≤24) to bound render cost, and returns null when no step
 *  survives, so an empty build never renders. */
function buildTeachDiagram(p: Record<string, Json>): TeachDiagramProps | null {
  const title = asStr(p.title).trim();
  if (!title) return null;
  const steps = aliasArr(p, 'steps', 'frames')
    .slice(0, 8)
    .map(buildTeachStep)
    .filter((s): s is TeachStep => s !== null);
  if (steps.length === 0) return null;
  const result: TeachDiagramProps = { title, steps };
  const baseShapes = aliasArr(p, 'baseShapes', 'base')
    .slice(0, 24)
    .map(coerceDiagShape)
    .filter((s): s is DiagShape => s !== null);
  if (baseShapes.length) result.baseShapes = baseShapes;
  const baseLabels = aliasArr(p, 'baseLabels')
    .slice(0, 24)
    .map(coerceDiagLabel)
    .filter((l): l is DiagLabel => l !== null);
  if (baseLabels.length) result.baseLabels = baseLabels;
  const icon = coerceIcon(p.icon);
  if (icon) result.icon = icon;
  if (optStr(p.iconColor)) result.iconColor = coerceColor(p.iconColor);
  const ratio = asNum(p.ratio, NaN);
  if (Number.isFinite(ratio)) result.ratio = clamp(ratio, 0.4, 4);
  const footer = optStr(p.footer);
  if (footer) result.footer = footer;
  return result;
}

/** Coerce a model-designed composite: a titled sub-grid of OTHER blocks. Each region's
 *  child is coerced through the SAME buildBlock path (so a region can only ever be an
 *  already-vetted, typed block), against an allowed set with 'composite' removed — a
 *  composite may not nest a composite, which keeps the recursion one level deep and matches
 *  the renderer's depth cap. Returns null with fewer than two real regions (a one-cell
 *  "layout" is just the block itself; let the caller use it directly). */
function buildComposite(
  p: Record<string, Json>,
  allowed: ReadonlySet<string>,
  grounded: boolean,
): CompositeProps | null {
  const title = asStr(p.title).trim();
  if (!title) return null;
  // children may be anything renderable EXCEPT another composite
  const childAllowed = new Set([...allowed].filter((t) => t !== 'composite'));
  let seq = 1;
  const regions: CompositeRegion[] = asArr(p.regions)
    .map((r): CompositeRegion | null => {
      const ro = asObj(r);
      // a region is { block: {type, props}, span? } — tolerate the block fields being
      // inlined on the region object too (a common model shorthand)
      const rawBlock = ro.block !== undefined ? ro.block : r;
      const child = buildBlock(rawBlock, 12, 0, seq, childAllowed, grounded);
      if (!child) return null;
      if (child.type === 'insight') seq++;
      const region: CompositeRegion = { block: child };
      const span = ro.span;
      if (typeof span === 'number' && Number.isFinite(span)) {
        region.span = Math.min(12, Math.max(1, Math.round(span)));
      }
      return region;
    })
    .filter((r): r is CompositeRegion => r !== null);

  if (regions.length < 2) return null;
  const result: CompositeProps = { title, regions };
  const icon = coerceIcon(p.icon);
  if (icon) result.icon = icon;
  if (optStr(p.iconColor)) result.iconColor = coerceColor(p.iconColor);
  const footer = optStr(p.footer);
  if (footer) result.footer = footer;
  return result;
}

/** The block's own fields, minus the structural keys, as a props object — for models that
 *  inline props onto the block instead of nesting them under `props`. */
function inlineProps(ro: Record<string, Json>): Record<string, Json> {
  const { type: _t, props: _p, ...rest } = ro;
  return rest;
}

// Blocks whose whole point is a photograph — with no real image they degrade to a bare gradient
// placeholder, which we never show (see the drop in buildBlock). `photo` isn't listed: it's gated
// separately (it must carry a URL just to be allowed at all).
export const IMAGE_REQUIRED_TYPES: ReadonlySet<string> = new Set([
  'carousel',
  'beforeafter',
  'imagecallouts',
  'moodboard',
  'mediacard',
]);

/** True when the block carries at least one renderable image in the slot(s) its renderer would
 *  actually paint an <img> into. Uses `safeBlockImageSrc` — the SAME gate the media renderers use
 *  (allowlisted https OR a same-origin /demo-assets path) — so the guardrail drops a block only
 *  when the renderer genuinely wouldn't show an image. Mirrors each block's own `src` shape.
 *  Exported so the guardrail can be unit-tested without the catalog-dependent coercion pipeline. */
export function hasRenderableImage(type: string, props: Record<string, Json>): boolean {
  const real = (o: Record<string, Json>): boolean =>
    !!safeBlockImageSrc(alias(o, 'src', 'url', 'image'));
  switch (type) {
    case 'carousel':
      return aliasArr(props, 'slides', 'items', 'cards').some((s) => real(asObj(s)));
    case 'moodboard':
      return aliasArr(props, 'tiles', 'items', 'images').some((t) => real(asObj(t)));
    case 'beforeafter':
      return real(asObj(props.before)) || real(asObj(props.after));
    case 'imagecallouts':
      return real(asObj(props.image));
    case 'mediacard':
      return real(asObj(props.cover));
    default:
      return true;
  }
}

function buildBlock(
  raw: Json,
  col: number,
  delay: number,
  insightSeq: number,
  allowed: ReadonlySet<string>,
  grounded: boolean,
): Block | null {
  const ro = asObj(raw);
  const type = asStr(ro.type).toLowerCase().trim();
  // Props are normally nested under `props`, but models frequently INLINE the fields onto the
  // block object instead ({type:"donut", title, rows} rather than {type:"donut", props:{…}}).
  // Both are reasonable readings of the prompt, and a model often mixes them within one reply —
  // so when `props` is absent, fall back to treating the block's own fields (everything but the
  // structural keys) as the props. Without this, every inlined block coerces to {} and is
  // dropped, which is what collapsed a full canvas to its single nested-props block.
  const hasNestedProps = ro.props !== undefined && typeof ro.props === 'object';
  const props = hasNestedProps ? asObj(ro.props) : inlineProps(ro);
  // Type gate (capability-tiered). A cleared image still does not bypass capability policy: only
  // explicitly enabled, reviewed fixture paths may construct photo blocks.
  if (!allowed.has(type)) {
    return null;
  }
  // Image-first blocks are honest ONLY when a slot actually holds a real, renderable image URL.
  // Without one they paint a colored gradient placeholder that reads as broken and breaks the
  // show-only-real-data rule — so drop the whole block rather than render the empty-gradient UI.
  // (We show found, allowlisted images, never generated ones; `photo` is already gated above.)
  if (IMAGE_REQUIRED_TYPES.has(type) && !hasRenderableImage(type, props)) return null;
  switch (type) {
    case 'insight': {
      const ip = cleanBuilt(buildInsight(props, grounded));
      return ip
        ? {
            type: 'insight',
            col,
            delay,
            id: `live-${insightSeq}`,
            num: String(insightSeq),
            props: ip,
          }
        : null;
    }
    case 'chart': {
      const cp = cleanBuilt(buildChart(props, grounded));
      return cp ? { type: 'chart', col, delay, props: cp } : null;
    }
    case 'breakdown': {
      const bp = cleanBuilt(buildBreakdown(props, grounded));
      return bp ? { type: 'breakdown', col, delay, props: bp } : null;
    }
    case 'list': {
      const lp = cleanBuilt(buildList(props));
      return lp ? { type: 'list', col, delay, props: lp } : null;
    }
    case 'timeline': {
      const tp = cleanBuilt(buildTimeline(props));
      return tp ? { type: 'timeline', col, delay, props: tp } : null;
    }
    case 'compare': {
      const mp = cleanBuilt(buildCompare(props));
      return mp ? { type: 'compare', col, delay, props: mp } : null;
    }
    case 'kpi': {
      const kp = cleanBuilt(buildKpi(props, grounded));
      return kp ? { type: 'kpi', col, delay, props: kp } : null;
    }
    case 'ring': {
      const gp = cleanBuilt(buildRing(props));
      return gp ? { type: 'ring', col, delay, props: gp } : null;
    }
    case 'bars': {
      const bp = cleanBuilt(buildBars(props, grounded));
      return bp ? { type: 'bars', col, delay, props: bp } : null;
    }
    case 'stack': {
      const sp = cleanBuilt(buildStack(props, grounded));
      return sp ? { type: 'stack', col, delay, props: sp } : null;
    }
    case 'donut': {
      const dp = cleanBuilt(buildDonut(props, grounded));
      return dp ? { type: 'donut', col, delay, props: dp } : null;
    }
    case 'gauge': {
      const gg = cleanBuilt(buildGauge(props, grounded));
      return gg ? { type: 'gauge', col, delay, props: gg } : null;
    }
    case 'photo': {
      const pp = cleanBuilt(buildPhoto(props));
      return pp ? ({ type: 'photo', col, delay, props: pp } as unknown as Block) : null;
    }
    case 'diagram': {
      const dp = cleanBuilt(buildDiagram(props));
      return dp ? ({ type: 'diagram', col, delay, props: dp } as unknown as Block) : null;
    }
    case 'teachdiagram': {
      const tp = cleanBuilt(buildTeachDiagram(props));
      return tp ? ({ type: 'teachdiagram', col, delay, props: tp } as unknown as Block) : null;
    }
    case 'diagramflow': {
      const dp = cleanBuilt(buildDiagramFlow(props));
      return dp ? ({ type: 'diagramflow', col, delay, props: dp } as unknown as Block) : null;
    }
    case 'blanks': {
      const bp = cleanBuilt(buildBlanksProps(props));
      return bp ? ({ type: 'blanks', col, delay, props: bp } as unknown as Block) : null;
    }
    case 'composite': {
      const cp = cleanBuilt(buildComposite(props, allowed, grounded));
      return cp ? ({ type: 'composite', col, delay, props: cp } as unknown as Block) : null;
    }
    case 'action': {
      // A model-PROPOSED action: keep it only if its id is a known action; the surface
      // renders it as a confirm card and nothing runs until the user confirms.
      const id = asStr(props.id).trim();
      if (!actionSpec(id)) return null;
      const out: Record<string, Json> = { id, args: sanitizeDeep(asObj(props.args)) };
      const label = optStr(props.label);
      if (label) out.label = label;
      return { type: 'action', col, delay, props: out } as unknown as Block;
    }
    case 'imagecallouts': {
      // Otherwise generic, except the nested image still needs the exact per-file clearance gate.
      const meta = catalogMeta(type);
      if (!meta || meta.coercer !== 'generic') return null;
      const generic = coerceGeneric(meta, props);
      if (!generic) return null;
      const image = asObj(generic.image);
      generic.image = { ...image, src: safeImageUrl(asStr(image.src)) ?? '' };
      return { type, col, delay, props: generic } as unknown as Block;
    }
    default: {
      // The long tail of the catalog: no hand-written builder, so coerce generically from
      // the component's metadata. A 'custom' type with no builder yet stays unsupported.
      const meta = catalogMeta(type);
      if (meta && meta.coercer === 'generic') {
        const generic = coerceGeneric(meta, props);
        if (generic) {
          // Attach validated, data-grounded annotations for annotation-capable bases (e.g. datatable).
          applyAnnotations(type, generic, props);
          return { type, col, delay, props: generic } as unknown as Block;
        }
      }
      return null;
    }
  }
}

// ── annotation grammar wiring ──────────────────────────────────────────────────────────────────
// A capable base component (phase 1: the table) accepts a closed-grammar `annotations` array that
// ADAPTS it to the answer (a receipt = datatable + currency/total/emphasis). The model's annotations
// are untrusted, so each capable type projects an AnnotationSurface from its REAL data and every
// annotation is validated against it (a hallucinated column ref is dropped individually). Add a
// projector here to make another base annotation-capable.
const ANNOTATION_SURFACES: Record<string, (props: Record<string, Json>) => AnnotationSurface> = {
  datatable: (p) => {
    const columns = asArr(p.columns).map(asObj);
    const rows = asArr(p.rows).map(asObj);
    const columnKeys = columns.map((c) => asStr(c.key)).filter(Boolean);
    const labelKey = columnKeys[0] ?? '';
    return {
      columnKeys,
      rowLabels: labelKey ? rows.map((r) => asStr(r[labelKey])).filter(Boolean) : [],
    };
  },
};

/** The block types whose renderers honor an `annotations` array. The prompt reads this so it only
 *  ever teaches the field on blocks that will actually draw it — the list grows by adding a surface
 *  above, never by editing prompt copy. */
export const ANNOTATABLE_TYPES: ReadonlySet<string> = new Set(Object.keys(ANNOTATION_SURFACES));

/** If `type` is annotation-capable and the model supplied `annotations`, validate them against the
 *  block's real data (from the already-coerced props) and attach the clean list; drop the key
 *  otherwise. Mutates + returns `built`. */
function applyAnnotations(
  type: string,
  built: Record<string, Json>,
  rawProps: Record<string, Json>,
): Record<string, Json> {
  const project = ANNOTATION_SURFACES[type];
  if (!project) return built;
  const raw = rawProps.annotations;
  if (raw === undefined) return built;
  const clean = validateAnnotations(raw, project(built));
  if (clean.length) built.annotations = clean as unknown as Json;
  else delete built.annotations;
  return built;
}

/** Allowed facet labels for depth≥2 blocks (the "Go Deeper" drawers). */
const ALLOWED_FACETS = new Set(['example', 'derivation', 'edge', 'analogy', 'history', 'check']);

/** Coerce the model's `depth` field to a clamped integer 0..3, or undefined when absent.
 *  Accepts numeric values or string synonyms like "standard", "detailed", "deep". */
function coerceDepth(raw: unknown): number | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw === 'number') {
    const n = Math.round(raw);
    return Number.isFinite(n) ? Math.max(0, Math.min(3, n)) : undefined;
  }
  if (typeof raw === 'string') {
    const synonyms: Record<string, number> = {
      gist: 0,
      summary: 0,
      overview: 0,
      standard: 1,
      normal: 1,
      main: 1,
      detailed: 2,
      detail: 2,
      deep: 3,
      deeper: 3,
      exhaustive: 3,
      advanced: 3,
    };
    const key = raw.toLowerCase().trim();
    if (key in synonyms) return synonyms[key];
    const n = parseInt(key, 10);
    if (!isNaN(n)) return Math.max(0, Math.min(3, n));
  }
  return undefined;
}

/**
 * Coerce/repair a parsed LLM response (object OR raw JSON string) into a safe
 * LiveResponse. Drops unknown/empty blocks, snaps colors, clamps numbers, keeps at most
 * `maxBlocks` blocks (defaults to 6; callers pass higher for richer canvases), assigns
 * col spans + reveal delays + insight ids/nums.
 *
 * `grounded` is the REAL turn-level signal that this turn actually has evidence behind it
 * (a web search ran, or the provider's native grounding fired) — generateLive passes this in
 * from its own search/grounding state, which is the source of truth the numeric honesty gate
 * checks, NOT whatever citation a block happened to echo into its own props. Defaults to
 * false (ungrounded), so a caller that doesn't pass it gets today's conservative behavior.
 *
 * Returns null only when there is nothing salvageable (no title AND no usable block).
 */
export function validateLiveResponse(
  raw: unknown,
  allowed: ReadonlySet<string> = ALLOWED_BLOCK_TYPES,
  maxBlocks = 6,
  grounded = false,
): LiveResponse | null {
  let parsed: Json = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      // Tolerate a JSON object embedded in surrounding prose/code fences.
      const m = raw.match(/\{[\s\S]*\}/);
      let recovered: Json | null = null;
      if (m) {
        try {
          recovered = JSON.parse(m[0]);
        } catch {
          /* still unparseable — fall through to the truncation salvage below */
        }
      }
      // SALVAGE A TRUNCATED REPLY. If the model hit its output cap mid-JSON the whole
      // object won't parse, but the blocks that DID finish streaming are intact. Rather
      // than drop the turn to a single raw-text card, reconstruct an object from the
      // top-level string fields + every COMPLETE block, so a slightly-too-long answer
      // degrades to a full canvas of whatever arrived instead of nothing.
      if (recovered === null) {
        const blocks = recoverBlocks(raw);
        if (!blocks.length) return null;
        recovered = {
          title: recoverStringField(raw, 'title'),
          sub: recoverStringField(raw, 'sub'),
          narration: recoverStringField(raw, 'narration'),
          blocks,
        };
      }
      parsed = recovered;
    }
  }
  const obj = asObj(parsed);
  // forDisplay first: the model may annotate a tricky name anywhere it writes prose, and the
  // pronunciation is for the VOICE — a reader must never be shown a literal
  // "[[Titanic|tie-tan-ick]]". The block props below have always resolved theirs; the answer's own
  // title and subtitle were the two that did not, so a single annotated name reached the screen.
  const title = capContentText(
    forDisplay(asStr(obj.title).trim()),
    fieldContentBudget('response', 'title', 'text'),
  );
  const sub = capContentText(forDisplay(asStr(obj.sub).trim()), {
    maxGraphemes: 180,
    maxLines: 4,
  });
  // Outer safety bound only — the precise, ask-aware spoken cap (lean ~140 / rich ~320) is
  // applied in generateLive via capSpoken, where the ask complexity is known. Here we just
  // stop a runaway narration, without pre-truncating a legitimately longer rich line.
  // The narration may carry inline [[shown|said]] annotations: the screen gets the shown side,
  // the voice the said side. Cap first, then split — so both halves share one length bound.
  // Sentence-aware, unlike capTweet: this line is both spoken and printed as the answer's opening,
  // and a word-boundary cut left the reader staring at "…a protected site, the…". A shorter whole
  // sentence is an answer; a longer fragment is the software trailing off.
  const narrationRaw = trimToSentence(asStr(obj.narration).trim(), 320);
  // collapseRepeatedValues drops an accidental back-to-back restatement ("$200, $200" → "$200")
  // a completion turn can produce, on both the shown and said sides.
  // proseFor* also strips any inline citation/URL the model dropped into the spoken line — it renders
  // as literal "[fifa.com](https://…)" and reads as gibberish aloud; the real sources sit in the footer.
  const narration = collapseRepeatedValues(proseForDisplay(narrationRaw));
  const spokenRaw = collapseRepeatedValues(proseForSpeech(narrationRaw));
  const spoken = spokenRaw && spokenRaw !== narration ? spokenRaw : '';

  const blocks: Block[] = [];
  let insightSeq = 1;
  let blockSeq = 1;
  for (const rawBlock of asArr(obj.blocks)) {
    if (blocks.length >= maxBlocks) break;
    const idx = blocks.length;
    const ro = asObj(rawBlock);
    const type = asStr(ro.type).toLowerCase().trim();
    // ENFORCE the one-insight rule: the prompt already asks for at most one insight (the
    // opener at position 0, "never a mid-canvas text placeholder"), but a model sometimes
    // ignores that and adds a second "finding" card later in the canvas. insightSeq only
    // advances once a real insight has actually been placed (below), so `> 1` means the
    // opener already landed — drop any further insight rather than let the rule be
    // prompt-only. The one that survives keeps its position among the other blocks.
    if (type === 'insight' && insightSeq > 1) continue;
    const col = COL_BY_TYPE[type] ?? 6;
    // A smooth, staggered reveal at any block count (the old fixed table capped at six).
    const delay = Math.min(idx * 70, 560);
    const block = buildBlock(rawBlock, col, delay, insightSeq, allowed, grounded);
    if (!block) continue;
    // Prompt limits reduce over-generation; this runtime boundary makes the same contract
    // non-optional for malformed, older, local, or adversarial model output.
    block.props = enforceComponentContentBudget(
      block.type,
      block.props as Record<string, unknown>,
      catalogMeta(block.type),
    ) as typeof block.props;
    if (block.type === 'insight') insightSeq += 1;
    // Give EVERY block a stable id, not just insights, so any block type can be spotlit.
    (block as { id?: string }).id = `live-${blockSeq}`;
    // A per-slide explanation the model wrote for THIS block — its caption + spoken line in Focus
    // mode. Coerced like any user-facing model string (trimmed, length-capped); dropped when absent.
    // It may carry inline [[shown|said]] annotations, so the card shows the clean side and Focus
    // speaks the said side (kept as `noteSpoken` only when it actually differs).
    const noteRaw = capTweet(asStr(ro.note).trim(), 170);
    const note = proseForDisplay(noteRaw);
    if (note) {
      (block as { note?: string }).note = note;
      const noteSpoken = proseForSpeech(noteRaw);
      if (noteSpoken && noteSpoken !== note)
        (block as { noteSpoken?: string }).noteSpoken = noteSpoken;
    }
    // Coerce concept-section fields (the "Go Deeper" depth lens).
    // `section`: trim to a short label; omit empty.
    const sectionStr = asStr(ro.section).trim().slice(0, 60);
    if (sectionStr) (block as { section?: string }).section = sectionStr;
    // `order`: 1-based integer; clamp to [1, 99] for sanity.
    const rawOrder = ro.order;
    if (rawOrder !== undefined && rawOrder !== null) {
      const ord = Math.round(Number(rawOrder));
      if (Number.isFinite(ord) && ord >= 1) (block as { order?: number }).order = Math.min(ord, 99);
    }
    // `depth`: 0=gist · 1=standard · 2=detailed · 3=deep; synonyms accepted.
    const depthCoerced = coerceDepth(ro.depth);
    if (depthCoerced !== undefined) (block as { depth?: number }).depth = depthCoerced;
    // `facet`: role of a depth≥2 block; drop anything not in the allowed set.
    const facetStr = asStr(ro.facet).toLowerCase().trim();
    if (ALLOWED_FACETS.has(facetStr)) (block as { facet?: string }).facet = facetStr;
    blockSeq += 1;
    blocks.push(block);
  }

  // Unsalvageable: no title to show AND no block to render.
  if (!title && !blocks.length) return null;

  const hint = asStr(obj.continuity).toLowerCase().trim();
  const continuity =
    hint === 'replace' || hint === 'augment' || hint === 'refine' ? hint : undefined;

  // A judgement the model actually made must survive as itself — including "no". Dropping a false
  // here is indistinguishable from silence, and silence sends the caller to its word-shape
  // fallback, which then offers a world the model just declined. Presence and verdict are separate
  // facts, so both are carried.
  const causalWord = asStr(obj.causal).toLowerCase().trim();
  const causalSaid =
    typeof obj.causal === 'boolean' || causalWord === 'true' || causalWord === 'false';
  const causal = obj.causal === true || causalWord === 'true';

  // Optional model-authored tour: keep only in-range block indices, de-duplicated. Each spoken
  // line may carry inline [[shown|said]] annotations — the spotlight caption shows the clean side
  // and the walk speaks the said side (`saySpoken`, kept only when it differs).
  const tourSeen = new Set<number>();
  const tour: {
    index: number;
    say?: string;
    saySpoken?: string;
    mark?: TourMark;
    marks?: TourMark[];
  }[] = [];
  // Coerce one gesture: a known kind + the on-block text it aims at (display side only — a
  // [[shown|said]] annotation in `at` could never match the on-screen text). `stopIndex` is the
  // CURRENT stop's own block index, so a "connect" mark's `onIndex` can be checked against it
  // and against `blocks.length` (both only known here, not inside a bare per-mark coercion).
  const coerceTourMark = (raw: Json, stopIndex: number): TourMark | undefined => {
    const mo = asObj(raw);
    const kindRaw = optStr(mo.kind) ?? '';
    const at = optStr(mo.at);
    const kind: TourMark['kind'] | undefined = MARK_KINDS.has(kindRaw)
      ? (kindRaw as TourMark['kind'])
      : undefined;
    if (!kind || !at) return undefined;
    // "note" is nothing without its words; drop a label-less one rather than draw a bare tick.
    const label = forDisplay(optStr(mo.label) ?? '').slice(0, 28);
    if (kind === 'note' && !label) return undefined;
    const toRaw = forDisplay(optStr(mo.to) ?? '').slice(0, 80);
    // "question" may only doubt what the answer itself declared uncertain: the ? rides a block
    // whose own conf is an estimate. On a confident block it's hedging theater — the cheapest
    // possible hedge a model could sprinkle — so the gate is enforced here, not just taught.
    if (kind === 'question') {
      const conf = (blocks[stopIndex] as { props?: { conf?: unknown } }).props?.conf;
      if (conf !== 'inferred' && conf !== 'partial') return undefined;
    }
    // A brace over ONE row isn't a group — like connect's far end, the last row is required.
    if (kind === 'brace' && !toRaw) return undefined;
    const colorRaw = optStr(mo.color);
    // "star" is definitionally the key mark (the one takeaway), whatever the model sent;
    // "strike" reads as rejection, so colorless ones default to the cool/negative ink.
    const color: TourMark['color'] | undefined =
      kind === 'star'
        ? 'key'
        : colorRaw === 'warm' || colorRaw === 'key' || colorRaw === 'cool'
          ? colorRaw
          : kind === 'strike'
            ? 'cool'
            : undefined;
    // "connect" needs a real OTHER block to land on — no target, no connector (never guess one).
    let onIndex: number | undefined;
    if (kind === 'connect') {
      const n = Math.round(asNum(mo.onIndex, -1));
      if (n >= 0 && n < blocks.length && n !== stopIndex) onIndex = n;
      if (!toRaw || onIndex === undefined) return undefined;
    }
    // `to`/`label` only mean something to the span/note/connect gestures — keep the point marks
    // lean.
    const span = kind === 'rising' || kind === 'falling' || kind === 'bracket' || kind === 'brace';
    return {
      kind,
      at: forDisplay(at).slice(0, 80),
      ...((span || kind === 'connect') && toRaw ? { to: toRaw } : {}),
      ...((kind === 'note' || kind === 'bracket' || kind === 'brace') && label ? { label } : {}),
      ...(color ? { color } : {}),
      ...(typeof onIndex === 'number' ? { onIndex } : {}),
    };
  };
  // "connect" is a rare, high-value callout, not a default — capped tighter than the general
  // per-stop mark cap below, and across the whole turn so it can't turn into a web of arrows.
  let connectCount = 0;
  // The judgment kinds are rare by definition — ONE star (the takeaway), ONE question (the pen
  // doubts a number, not the whole answer), a couple of strikes or braces. A model that
  // sprinkles them gets trimmed here, never merely asked nicely in the prompt.
  let starCount = 0;
  let questionCount = 0;
  let strikeCount = 0;
  let braceCount = 0;
  for (const t of asArr(obj.tour)) {
    if (tour.length >= blocks.length) break;
    const to = asObj(t);
    const index = Math.round(asNum(to.index, -1));
    if (index < 0 || index >= blocks.length || tourSeen.has(index)) continue;
    tourSeen.add(index);
    // A stop may draw SEVERAL gestures on its block (`marks[]`) — to call out multiple data points
    // while explaining — or a single `mark`. De-dupe identical callouts; cap so one block can't hog
    // the pen. `mark` mirrors the first for the single-gesture code paths.
    const rawMarks = asArr(to.marks);
    let sawConnect = false;
    const marks = (rawMarks.length ? rawMarks : [to.mark])
      .map((m) => coerceTourMark(m, index))
      .filter((m): m is TourMark => !!m)
      .filter((m, i, a) => a.findIndex((x) => x.kind === m.kind && x.at === m.at) === i)
      .slice(0, 6)
      // The rarity caps run AFTER the per-stop cut: a mark the slice discards must never burn
      // the turn-wide budget, or a later stop's one legitimate star/question gets dropped in
      // favor of a mark that never drew.
      .filter((m) => {
        if (m.kind !== 'connect') return true;
        if (sawConnect || connectCount >= 2) return false;
        sawConnect = true;
        connectCount += 1;
        return true;
      })
      .filter((m) => {
        if (m.kind === 'star') return starCount++ < 1;
        if (m.kind === 'question') return questionCount++ < 1;
        if (m.kind === 'strike') return strikeCount++ < 2;
        if (m.kind === 'brace') return braceCount++ < 2;
        return true;
      });
    const mark = marks[0];
    const markFields = mark ? { mark, ...(marks.length > 1 ? { marks } : {}) } : {};
    const sayRaw = optStr(to.say);
    if (!sayRaw) {
      tour.push({ index, ...markFields });
      continue;
    }
    const say = proseForDisplay(sayRaw);
    const saySpoken = proseForSpeech(sayRaw);
    tour.push({
      index,
      say,
      ...(saySpoken && saySpoken !== say ? { saySpoken } : {}),
      ...markFields,
    });
  }

  const sources = buildWebSources(obj.sources);
  const chips = buildChips(obj.chips);
  const memory = buildMemory(obj.memory);
  const understood = buildUnderstood(obj.understood);
  const corrects = buildCorrects(obj.corrects);
  const track = buildTrack(obj.track);
  const bend = buildBend(obj.bend, blocks);
  // The Blank Space: gather the holes the answer left — from any `blanks` block's slots, plus a
  // top-level `blanks` array (used by inline {__blank} tokens). Their presence is what flips the
  // turn into "awaiting the user's input".
  const blockBlanks = collectBlankSlots(blocks);
  const topBlanks = asArr(obj.blanks)
    .map(coerceBlank)
    .filter((x): x is Blank => x !== null);
  const blanks = dedupeBlanks([...blockBlanks, ...topBlanks]);
  // Topic: short semantic domain label from the model (e.g. "Finance", "Biology"). Strip to
  // word chars + spaces only; cap at 40 chars so a runaway model can't bloat the atlas record.
  const topic = asStr(obj.topic)
    .trim()
    .replace(/[^a-zA-Z0-9&/ -]/g, '')
    .trim()
    .slice(0, 40);

  return {
    title: title || 'Response',
    sub,
    narration,
    blocks,
    ...(topic ? { topic } : {}),
    ...(continuity ? { continuity } : {}),
    ...(causalSaid ? { causal } : {}),
    ...(tour.length ? { tour } : {}),
    ...(sources ? { sources } : {}),
    ...(chips ? { chips } : {}),
    ...(memory ? { memory } : {}),
    ...(understood ? { understood } : {}),
    ...(corrects ? { corrects } : {}),
    ...(track ? { track } : {}),
    ...(bend ? { bend } : {}),
    ...(blanks.length ? { blanks, awaiting: true } : {}),
    ...(spoken ? { spoken } : {}),
  };
}
