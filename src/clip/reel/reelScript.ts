// The "Mavéa Reel" data model. The key idea that keeps the AI cheap AND the look rich: the director
// works in CONTENT TYPES (a stat, a quote, a concept, a list…), not in the ~50 visual "finishes". One
// small, real-data-only model call fills a content type; a deterministic selector then dresses it in
// one of the many finishes for that type, and Remix re-rolls the finish for free. So a slide carries
// both its content type (what it is) and its template (the finish it's wearing).
import type { ClipTheme } from '../types';

/** The shapes the director fills — one per kind of thing a turn can say. Plus the two fixed bookends. */
export interface SlotMap {
  // bookends (added by the director, not model-selectable)
  title: {
    question: string;
    /** The sharp, derived heading shown above the quoted question (≤32 chars). */
    kicker?: string;
    /** Set only when the conversation was sectioned by topic — renders as a "part N of M" chip. */
    part?: { index: number; count: number };
  };
  outro: { wordmark?: string; tagline?: string; statline?: string };
  // content types
  stat: { value: string; unit?: string; label: string; prior?: string; spark?: number[] };
  metrics: { items: { label: string; pct: number }[]; next?: string };
  ranked: { title?: string; items: { label: string; score: string; pct: number }[] };
  quote: { quote: string; highlight?: string; attribution?: string };
  list: { title?: string; items: string[] };
  concept: { title: string; subtitle?: string; tag?: string };
  conceptmap: { center: string; nodes: { label: string; kind?: string }[] };
  qa: { question: string; answer: string };
  chat: { messages: { role: 'user' | 'mavea'; text: string }[] };
  diagram: { label: string; equation?: string; vectors?: { label: string }[]; note?: string };
  steps: { stops: { label: string; state?: 'done' | 'active' | 'todo' }[] };
  recap: { topic: string; metrics: { label: string; value: string }[] };
  // A document page with a pen mark drawn over a cited passage — Prism's annotation reel. Built
  // directly from recorded annotations (never by the model director), so it's intentionally absent
  // from CONTENT_TYPES: the director's schema enum + allow-set derive from that array, so the model
  // can never author it. The page raster + rects let the finish replay the exact stroke.
  markup: {
    pageImage: string;
    imgW: number;
    imgH: number;
    rects: { x: number; y: number; w: number; h: number }[];
    figure?: { x: number; y: number; w: number; h: number };
    isFigure: boolean;
    seed: string;
    /** Claim-derived judgment ink (a load-bearing star, a forecast's "?") — replayed verbatim. */
    accent?: { star?: boolean; question?: boolean };
    color: string;
    title: string;
    explanation: string;
  };
}

/** A content type the director can choose (every SlotMap key except the bookends). */
export type ContentType = Exclude<keyof SlotMap, 'title' | 'outro'>;
export type SlotKey = keyof SlotMap;
export type SlotsFor<K extends SlotKey> = SlotMap[K];

export const CONTENT_TYPES: ContentType[] = [
  'stat',
  'metrics',
  'ranked',
  'quote',
  'list',
  'concept',
  'conceptmap',
  'qa',
  'chat',
  'diagram',
  'steps',
  'recap',
];

/**
 * Every visual "finish" the reel can wear. Many finishes render the SAME content type (e.g. a dozen
 * ways to show a `concept`), which is how one cheap director call yields ~50 looks. The registry maps
 * each finish to its content type and component.
 */
export type TemplateId =
  // bookends
  | 'title'
  | 'outro'
  // stat
  | 'bigStat'
  | 'wrapped'
  | 'levelUp'
  | 'countdown'
  | 'streak'
  | 'ticker'
  | 'tradingCard'
  | 'particleStorm'
  // metrics / ranked
  | 'progressRings'
  | 'scoreboard'
  | 'bentoBoard'
  | 'equalizer'
  | 'podium'
  | 'departures'
  // quote
  | 'spotlightQuote'
  | 'billboard'
  | 'comicPanel'
  | 'captionMeme'
  | 'kineticStack'
  // list
  | 'takeaways'
  | 'stickyNotes'
  | 'marquee'
  | 'notebook'
  // concept (headline / term)
  | 'conceptCard'
  | 'glowOutline'
  | 'neon'
  | 'neonSign'
  | 'cosmic'
  | 'massiveType'
  | 'magazine'
  | 'mysticCard'
  | 'periodicTile'
  | 'dictionary'
  | 'swiss'
  | 'auroraGlass'
  | 'lockScreen'
  | 'spotlightStage'
  | 'polaroid'
  | 'metaball'
  | 'markerDoodle'
  | 'whiteboard'
  | 'chalkboard'
  | 'sunsetTape'
  | 'searchBar'
  // conceptmap
  | 'knowledgeGraph'
  | 'constellation'
  | 'chipCloud'
  | 'branchTree'
  | 'orbitMap'
  // qa
  | 'flashcard'
  | 'quizCard'
  | 'revealCard'
  | 'faqRow'
  // chat
  | 'chatTranscript'
  | 'textThread'
  | 'terminalChat'
  | 'captionStack'
  | 'voiceMemo'
  // diagram
  | 'blueprint'
  | 'graphPlot'
  | 'codeEditor'
  // steps
  | 'steps'
  | 'checklist'
  | 'progressTrack'
  | 'stepStack'
  // recap
  | 'recapBento'
  | 'widgets'
  | 'sessionPass'
  | 'finder'
  | 'receiptTape'
  // markup (Prism annotation reel)
  | 'documentMarkup';

/** A whole-reel look. The palette recolors; the vibe biases finish selection (clean is the default). */
export type VibeId = 'clean' | 'bold' | 'editorial' | 'playful' | 'neon';

/** One beat: a content type, the finish it wears, the content filling it, and what's shown/said. */
export interface ReelSlide<C extends SlotKey = SlotKey> {
  id: string;
  /** What this beat is (drives the data contract + which finishes are eligible). */
  content: C;
  /** The visual finish it's wearing (a deterministic, remixable choice). */
  template: TemplateId;
  slots: SlotsFor<C>;
  /** Spoken line; supports the `[[shown|said]]` pronunciation convention. */
  voiceover: string;
  /** Target on-screen time; the audio renderer co-times this to the synthesized voiceover. */
  durationMs: number;
  /** Provenance: the source block this beat was recut from (real-data-only; bookends omit). */
  sourceBlockId?: string;
}

/** A complete recut, ready to play, restyle or render. */
export interface ReelScript {
  topic: string;
  question: string;
  palette: ClipTheme;
  vibe: VibeId;
  /** The finish-selection seed — bumped by Remix to re-roll finishes without re-calling the model. */
  seed: number;
  slides: ReelSlide[];
  durationMs: number;
}

/** Length budgets the director condenses to (and coercion enforces) so a finish never overflows. */
export const SLOT_BUDGET = {
  voiceover: 150,
  // The derived heading above a title slide's quoted question — a headline, not a sentence, so it
  // gets its own tighter budget rather than sharing the eyebrow/label size.
  heading: 32,
  // A quote (≤140) can be bridged into a concept finish's title on Remix, so the title budget matches
  // it — otherwise a max-length quote would be re-clamped (and ellipsized) when it becomes a headline.
  title: 140,
  quote: 140,
  answer: 150,
  takeaway: 64,
  label: 24,
  message: 110,
  // Long enough for a real one-sentence gloss; the finishes' fitText tiers step the type down for
  // the tail rather than truncating it.
  subtitle: 120,
} as const;

/**
 * The character budget the DIRECTOR writes to — per content type + field, the most text that still
 * READS WELL on the TIGHTEST finish of that type, across all three formats (9:16/1:1/16:9). A beat can
 * be Remixed into ANY finish of its type, so it must fit the smallest. The model prompt is generated
 * from this (so the "up to X characters" guidance can never drift from reality), and one model call
 * returns every slide already within budget → no truncation, no overflow. `SLOT_BUDGET` is the looser
 * hard-clamp safety net beneath this (always ≥ these), and every finish carries a fitText tier ladder
 * (templates/fitText.ts) calibrated to render its CLAMP ceiling cleanly — so even over-budget model
 * output lands well; FitScale is the last resort. tests/reel-fit.test.ts renders that worst case.
 */
export const CHAR_BUDGET = {
  stat: { value: 9, unit: 6, label: 24, prior: 56 },
  metrics: { items: 4, label: 22, next: 80 },
  ranked: { items: 5, title: 24, label: 20, score: 10 },
  quote: { quote: 130, highlight: 24, attribution: 24 },
  list: { items: 4, item: 64 },
  concept: { title: 64, subtitle: 110, tag: 22 },
  conceptmap: { center: 16, nodes: 5, node: 18 },
  qa: { question: 84, answer: 150 },
  chat: { messages: 4, message: 110 },
  diagram: { label: 24, equation: 36, note: 80 },
  steps: { stops: 5, label: 24 },
  recap: { topic: 24, metrics: 4, label: 20, value: 12 },
} as const;

/** Default per-slide on-screen time; the audio renderer stretches a slide to fit a longer voiceover. */
export const SLIDE_MS = { min: 2600, default: 3400, intro: 3000, outro: 3200 } as const;

/** Clamp free text to a budget without cutting mid-word, adding an ellipsis only when it actually trims. */
export function clampText(s: string, max: number): string {
  const t = (s ?? '').trim().replace(/\s+/g, ' ');
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/**
 * Cap any single unbroken run of characters (a URL, a hash, a hyphen-less compound — the one shape
 * `clampText`'s word-boundary trim can't help, since there's no space to trim AT) to `maxRun`, so it
 * can never be long enough to force fitText's tier ladders down to their `clampStyle` last resort
 * (`overflow-wrap: anywhere`) into a vertical, one-letter-per-line tower. 24 is just past where the
 * tightest multi-line ladders in templates/fitText.ts (HERO/QUOTE at their smallest tier, ~78rw
 * measure) still seat a whole word on one line unaided (~20-22 chars) — a small margin past
 * "comfortable", not a hard guarantee, but it turns "the raw URL prints sideways" into "one ellipsis
 * mid-token", which is the actual fix.
 */
export function clampToken(text: string, maxRun = 24): string {
  return text.replace(/\S+/g, (run) => {
    if (run.length <= maxRun) return run;
    const head = Math.max(0, Math.floor(maxRun / 2) - 1);
    const tail = Math.max(0, maxRun - head - 1);
    return `${run.slice(0, head)}…${run.slice(run.length - tail)}`;
  });
}
