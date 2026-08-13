// The registry ties the content-type model together:
//  • COERCE turns loose director JSON for a CONTENT TYPE into typed, budget-clamped slots (the fit
//    guarantee + robustness to whatever a model returns).
//  • FINISH maps each visual finish → its content type + component. Many finishes share a content type
//    (a dozen ways to show a `concept`), which is how one cheap director call yields ~50 looks.
//  • assignFinish deterministically dresses a beat in a finish, varying by the reel's seed so Remix
//    re-rolls finishes for FREE (no extra model call). Seed 0 = the clean canonical finishes.
// Adding a finish is one entry in FINISH plus its component file — no other code changes.
import { lazy, Suspense, type ComponentType, type ReactElement } from 'react';
import type { ContentType, ReelSlide, SlotKey, SlotsFor, TemplateId } from '../reelScript';
import { clampText, clampToken, SLOT_BUDGET } from '../reelScript';
import type { SlideProps } from './types';
import { TitleSlide, OutroSlide } from './frameSlides';
import { BigStatSlide, ProgressRingsSlide, ScoreboardSlide, RecapBentoSlide } from './dataSlides';
import { KnowledgeGraphSlide, BlueprintSlide, StepsSlide, ConceptSlide } from './conceptSlides';
import {
  TakeawaysSlide,
  FlashcardSlide,
  ChatTranscriptSlide,
  SpotlightQuoteSlide,
} from './talkSlides';
import { preloadAlternateFinishes, type AlternateFinishes } from './alternateLoader';

/** A finish proxy that preserves the synchronous registry contract while its visual module stays
 *  outside the first-preview graph. The small in-frame placeholder avoids blanking the whole modal
 *  on a slow connection; canonical seed-0 slides never take this path. */
function alternate<K extends SlotKey>(
  exportName: keyof AlternateFinishes,
): (props: SlideProps<K>) => ReactElement {
  const Loaded = lazy(() =>
    preloadAlternateFinishes().then((module) => ({
      default: module[exportName] as unknown as ComponentType<SlideProps<K>>,
    })),
  );
  const Render = Loaded as unknown as ComponentType<{ slots: unknown }>;
  return function AlternateFinish(props: SlideProps<K>): ReactElement {
    return (
      <Suspense fallback={<div className="reel-finish-loading" aria-label="Loading visual" />}>
        <Render slots={props.slots} />
      </Suspense>
    );
  };
}

export interface CoerceCtx {
  topic: string;
  question: string;
}

// ---- tiny coercion helpers (robust to whatever loose JSON a model returns) ----
const S = (v: unknown, max: number, fallback = ''): string => {
  const s = typeof v === 'string' ? v : v == null ? '' : String(v);
  // clampToken runs AFTER the budget clamp on purpose: a spaceless run (a URL) that's already inside
  // budget survives clampText untouched, and one that overflows gets an ellipsis glued straight onto
  // the cut with no space to break at — either way the result can still be one long unbroken run.
  return clampToken(clampText(s, max)) || fallback;
};
const numberValue = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
};
const percentValue = (v: unknown): number => Math.max(0, Math.min(100, Math.round(numberValue(v))));
const arrayValue = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const objectValue = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' ? (v as Record<string, unknown>) : {};

type Raw = Record<string, unknown>;

/** One coercer per content type — the data contract, clamped to budgets so a finish can't overflow. */
export const COERCE: { [K in SlotKey]: (r: Raw, ctx: CoerceCtx) => SlotsFor<K> } = {
  title: (r, ctx) => {
    const part = objectValue(r.part);
    const hasPart = Number.isFinite(numberValue(part.count)) && numberValue(part.count) > 0;
    return {
      question: S(r.question, SLOT_BUDGET.title, ctx.question),
      kicker: r.kicker ? S(r.kicker, SLOT_BUDGET.heading) : undefined,
      part: hasPart
        ? {
            index: Math.max(1, Math.round(numberValue(part.index))),
            count: Math.max(1, Math.round(numberValue(part.count))),
          }
        : undefined,
    };
  },
  outro: (r) => ({
    wordmark: r.wordmark ? S(r.wordmark, 16) : 'Mavéa',
    tagline: r.tagline ? S(r.tagline, 48) : undefined,
    statline: r.statline ? S(r.statline, 40) : undefined,
  }),
  stat: (r) => {
    const spark = arrayValue(r.spark).map(numberValue);
    return {
      value: S(r.value, 12, '—'),
      unit: r.unit ? S(r.unit, 8) : undefined,
      label: S(r.label, SLOT_BUDGET.label, 'Stat'),
      prior: r.prior ? S(r.prior, 64) : undefined,
      spark: spark.length >= 2 ? spark.slice(0, 16) : undefined,
    };
  },
  metrics: (r) => ({
    items: arrayValue(r.items)
      .slice(0, 4)
      .map((it) => ({
        label: S(objectValue(it).label, SLOT_BUDGET.label, '—'),
        pct: percentValue(objectValue(it).pct),
      })),
    next: r.next ? S(r.next, 80) : undefined,
  }),
  ranked: (r) => ({
    title: r.title ? S(r.title, SLOT_BUDGET.label) : undefined,
    items: arrayValue(r.items)
      .slice(0, 5)
      .map((it) => ({
        label: S(objectValue(it).label, SLOT_BUDGET.label, '—'),
        score: S(objectValue(it).score, 12, ''),
        pct: percentValue(objectValue(it).pct),
      })),
  }),
  quote: (r, ctx) => {
    const quote = S(r.quote, SLOT_BUDGET.quote, ctx.question);
    const hl = r.highlight ? S(r.highlight, 40) : undefined;
    return {
      quote,
      highlight: hl && quote.includes(hl) ? hl : undefined,
      attribution: r.attribution ? S(r.attribution, 32) : undefined,
    };
  },
  list: (r) => ({
    title: r.title ? S(r.title, SLOT_BUDGET.label) : undefined,
    items: arrayValue(r.items)
      .map((x) => S(x, SLOT_BUDGET.takeaway))
      .filter(Boolean)
      .slice(0, 4),
  }),
  concept: (r, ctx) => ({
    title: S(r.title, SLOT_BUDGET.title, ctx.topic),
    subtitle: r.subtitle ? S(r.subtitle, SLOT_BUDGET.subtitle) : undefined,
    tag: r.tag ? S(r.tag, SLOT_BUDGET.label) : undefined,
  }),
  conceptmap: (r, ctx) => ({
    center: S(r.center, 16, ctx.topic),
    nodes: arrayValue(r.nodes)
      .slice(0, 5)
      .map((n) => ({
        label: S(objectValue(n).label, 18, '—'),
        kind: objectValue(n).kind ? S(objectValue(n).kind, 12) : undefined,
      })),
  }),
  qa: (r, ctx) => ({
    question: S(r.question, 96, ctx.question),
    answer: S(r.answer, SLOT_BUDGET.answer, '—'),
  }),
  chat: (r) => ({
    messages: arrayValue(r.messages)
      .slice(0, 4)
      .map((m) => ({
        role: (objectValue(m).role === 'user' ? 'user' : 'mavea') as 'user' | 'mavea',
        text: S(objectValue(m).text, SLOT_BUDGET.message),
      }))
      .filter((m) => m.text),
  }),
  diagram: (r) => ({
    label: S(r.label, SLOT_BUDGET.label, 'Diagram'),
    equation: r.equation ? S(r.equation, 40) : undefined,
    vectors: arrayValue(r.vectors)
      .slice(0, 2)
      .map((x) => ({ label: S(objectValue(x).label, 8, 'v') })),
    note: r.note ? S(r.note, 80) : undefined,
  }),
  steps: (r) => ({
    stops: arrayValue(r.stops)
      .slice(0, 5)
      .map((s) => {
        const state = objectValue(s).state;
        return {
          label: S(objectValue(s).label, SLOT_BUDGET.label, '—'),
          state: (state === 'done' || state === 'active' || state === 'todo' ? state : 'todo') as
            'done' | 'active' | 'todo',
        };
      }),
  }),
  recap: (r, ctx) => ({
    topic: S(r.topic, SLOT_BUDGET.label, ctx.topic),
    metrics: arrayValue(r.metrics)
      .slice(0, 4)
      .map((m) => ({
        label: S(objectValue(m).label, SLOT_BUDGET.label, '—'),
        value: S(objectValue(m).value, 12, '—'),
      })),
  }),
  // markup is built directly from recorded annotations, not by the model — but it still passes through
  // here so the contract is uniform. Only the TEXT fields are clamped; pageImage (a long dataURL),
  // color (a concrete hex), and seed must survive verbatim, so they bypass the S() clamp.
  markup: (r) => {
    const box = (v: unknown): { x: number; y: number; w: number; h: number } => {
      const o = objectValue(v);
      return { x: numberValue(o.x), y: numberValue(o.y), w: numberValue(o.w), h: numberValue(o.h) };
    };
    const figure = r.figure && objectValue(r.figure).w ? box(r.figure) : undefined;
    return {
      pageImage: typeof r.pageImage === 'string' ? r.pageImage : '',
      imgW: Math.max(1, Math.round(numberValue(r.imgW))),
      imgH: Math.max(1, Math.round(numberValue(r.imgH))),
      rects: arrayValue(r.rects)
        .slice(0, 16)
        .map(box)
        .filter((q) => q.w > 0 && q.h > 0),
      figure,
      isFigure: r.isFigure === true,
      seed: typeof r.seed === 'string' ? r.seed : '',
      // The recorded judgment ink survives as plain booleans — replay must match the live pen.
      ...(objectValue(r.accent).star === true || objectValue(r.accent).question === true
        ? {
            accent: {
              ...(objectValue(r.accent).star === true ? { star: true } : {}),
              ...(objectValue(r.accent).question === true ? { question: true } : {}),
            },
          }
        : {}),
      color: typeof r.color === 'string' ? r.color : 'var(--reel-accent)',
      title: S(r.title, 80, ''),
      explanation: S(r.explanation, 240, ''),
    };
  },
};

/** Coerce loose slot JSON for a content type into typed, budget-clamped slots. */
export function coerceSlots<K extends SlotKey>(content: K, raw: Raw, ctx: CoerceCtx): SlotsFor<K> {
  return COERCE[content](raw, ctx);
}

interface FinishDef {
  content: SlotKey;
  label: string;
  Slide: (p: { slots: unknown }) => ReactElement;
  /** 'dark' → the player lays a dark wash behind this finish so its glow/outline/starlight reads
   *  (the board's default DATA surface is light). Card-based finishes leave this off. */
  surface?: 'dark';
  /** true → a full-bleed finish that owns the whole frame (its own hero visual). The player hides its
   *  chrome orb (no double orb) and gives the finish the full board instead of the small card band. */
  bleed?: boolean;
  /** The longest headline this finish sets BEAUTIFULLY — narrow frames (a periodic tile, a gilt
   *  card) physically can't seat a 140-char title at a legible size. `assignFinish` skips a finish
   *  whose cap is under the beat's headline, so these looks keep their design and long text lands
   *  on a roomier sibling; the finish's own tier + clamp stays the never-overflow last resort. */
  heroCap?: number;
}
// Register a finish with its content type; the helper enforces the component matches that content.
function finish<K extends SlotKey>(
  content: K,
  label: string,
  Slide: (p: SlideProps<K>) => ReactElement,
  opts?: { surface?: 'dark'; bleed?: boolean; heroCap?: number },
): FinishDef {
  return {
    content,
    label,
    Slide: Slide as (p: { slots: unknown }) => ReactElement,
    surface: opts?.surface,
    bleed: opts?.bleed,
    heroCap: opts?.heroCap,
  };
}

/** The text that lands in a finish's headline slot — what `heroCap` is measured against. */
export function heroLenOf(content: SlotKey, slots: unknown): number {
  const o = objectValue(slots);
  const hero = content === 'quote' ? o.quote : content === 'title' ? o.question : o.title;
  return typeof hero === 'string' ? hero.length : 0;
}

/** Whether a finish wants the dark wash behind it (the player reads this per slide). */
export function finishSurface(template: TemplateId): 'dark' | 'light' {
  return FINISH[template]?.surface === 'dark' ? 'dark' : 'light';
}

/** Whether a finish owns the whole frame (player hides its orb + gives the finish the full board). */
export function finishBleed(template: TemplateId): boolean {
  return FINISH[template]?.bleed === true;
}

/**
 * Every finish that currently has a component. The CANONICAL finish for a content type is listed FIRST
 * (so the default reel, seed 0, wears the clean look); the rest are remixable alternates. Adding a
 * landed finish is one line here.
 */
const BLEED = { bleed: true };
const DARK_BLEED = { surface: 'dark' as const, bleed: true };

export const FINISH: Partial<Record<TemplateId, FinishDef>> = {
  // bookends (keep the brand orb)
  title: finish('title', 'Prompt', TitleSlide),
  outro: finish('outro', 'Outro', OutroSlide),
  // canonical content finishes — orb above a glass card
  bigStat: finish('stat', 'Big stat', BigStatSlide),
  progressRings: finish('metrics', 'Progress rings', ProgressRingsSlide),
  bentoBoard: finish('metrics', 'Bento board', alternate('BentoBoardSlide'), BLEED),
  equalizer: finish('metrics', 'Equalizer', alternate('EqualizerSlide'), DARK_BLEED),
  scoreboard: finish('ranked', 'Scoreboard', ScoreboardSlide),
  podium: finish('ranked', 'Podium', alternate('PodiumSlide'), BLEED),
  departures: finish('ranked', 'Departures', alternate('DeparturesSlide'), DARK_BLEED),
  spotlightQuote: finish('quote', 'Spotlight quote', SpotlightQuoteSlide),
  takeaways: finish('list', 'Takeaways', TakeawaysSlide),
  conceptCard: finish('concept', 'Concept', ConceptSlide),
  knowledgeGraph: finish('conceptmap', 'Knowledge graph', KnowledgeGraphSlide),
  flashcard: finish('qa', 'Flashcard', FlashcardSlide),
  chatTranscript: finish('chat', 'Chat', ChatTranscriptSlide),
  blueprint: finish('diagram', 'Blueprint', BlueprintSlide),
  steps: finish('steps', 'Steps', StepsSlide),
  recapBento: finish('recap', 'Recap', RecapBentoSlide),
  // alternate finishes — full-bleed compositions (player hides its orb + gives them the whole board).
  // concept
  glowOutline: finish('concept', 'Glow outline', alternate('GlowOutlineSlide'), DARK_BLEED),
  neon: finish('concept', 'Neon', alternate('NeonSlide'), DARK_BLEED),
  neonSign: finish('concept', 'Neon sign', alternate('NeonSignSlide'), DARK_BLEED),
  cosmic: finish('concept', 'Cosmic', alternate('CosmicSlide'), DARK_BLEED),
  massiveType: finish('concept', 'Massive type', alternate('MassiveTypeSlide'), DARK_BLEED),
  magazine: finish('concept', 'Magazine', alternate('MagazineSlide'), BLEED),
  mysticCard: finish('concept', 'Mystic card', alternate('MysticCardSlide'), {
    ...DARK_BLEED,
    heroCap: 96,
  }),
  periodicTile: finish('concept', 'Periodic tile', alternate('PeriodicTileSlide'), {
    ...DARK_BLEED,
    heroCap: 88,
  }),
  dictionary: finish('concept', 'Dictionary', alternate('DictionarySlide'), BLEED),
  swiss: finish('concept', 'Swiss', alternate('SwissSlide'), BLEED),
  auroraGlass: finish('concept', 'Aurora glass', alternate('AuroraGlassSlide'), BLEED),
  lockScreen: finish('concept', 'Lock screen', alternate('LockScreenSlide'), DARK_BLEED),
  spotlightStage: finish(
    'concept',
    'Spotlight stage',
    alternate('SpotlightStageSlide'),
    DARK_BLEED,
  ),
  polaroid: finish('concept', 'Polaroid', alternate('PolaroidSlide'), {
    ...DARK_BLEED,
    heroCap: 96,
  }),
  metaball: finish('concept', 'Metaball', alternate('MetaballSlide'), DARK_BLEED),
  markerDoodle: finish('concept', 'Marker doodle', alternate('MarkerDoodleSlide'), BLEED),
  chalkboard: finish('concept', 'Chalkboard', alternate('ChalkboardSlide'), {
    ...BLEED,
    heroCap: 88,
  }),
  whiteboard: finish('concept', 'Whiteboard', alternate('WhiteboardSlide'), BLEED),
  sunsetTape: finish('concept', 'Sunset tape', alternate('SunsetTapeSlide'), DARK_BLEED),
  searchBar: finish('concept', 'Search', alternate('SearchBarSlide'), DARK_BLEED),
  // stat
  wrapped: finish('stat', 'Wrapped', alternate('WrappedSlide'), DARK_BLEED),
  // levelUp + streak render the LIGHT card primitive, so they must stay on the light board surface —
  // a dark surface flips --reel-ink near-white, which then vanishes on their white card (per the
  // FinishDef contract: "Card-based finishes leave this off"). Guarded by reel.test.ts.
  levelUp: finish('stat', 'Level up', alternate('LevelUpSlide')),
  countdown: finish('stat', 'Countdown', alternate('CountdownSlide'), DARK_BLEED),
  streak: finish('stat', 'Streak', alternate('StreakSlide')),
  ticker: finish('stat', 'Ticker', alternate('TickerSlide'), DARK_BLEED),
  tradingCard: finish('stat', 'Trading card', alternate('TradingCardSlide'), DARK_BLEED),
  particleStorm: finish('stat', 'Particle storm', alternate('ParticleStormSlide'), DARK_BLEED),
  // quote
  billboard: finish('quote', 'Billboard', alternate('BillboardSlide'), DARK_BLEED),
  comicPanel: finish('quote', 'Comic panel', alternate('ComicPanelSlide'), BLEED),
  captionMeme: finish('quote', 'Caption meme', alternate('CaptionMemeSlide'), BLEED),
  kineticStack: finish('quote', 'Kinetic stack', alternate('KineticStackSlide'), DARK_BLEED),
  // list
  stickyNotes: finish('list', 'Sticky notes', alternate('StickyNotesSlide'), DARK_BLEED),
  marquee: finish('list', 'Marquee', alternate('MarqueeSlide'), DARK_BLEED),
  notebook: finish('list', 'Notebook', alternate('NotebookSlide'), BLEED),
  // diagram
  graphPlot: finish('diagram', 'Graph plot', alternate('GraphPlotSlide')),
  codeEditor: finish('diagram', 'Code editor', alternate('CodeEditorSlide'), DARK_BLEED),
  // conceptmap
  constellation: finish('conceptmap', 'Constellation', alternate('ConstellationSlide'), DARK_BLEED),
  chipCloud: finish('conceptmap', 'Chip cloud', alternate('ChipCloudSlide'), BLEED),
  branchTree: finish('conceptmap', 'Branch tree', alternate('BranchTreeSlide'), BLEED),
  orbitMap: finish('conceptmap', 'Orbit map', alternate('OrbitMapSlide'), DARK_BLEED),
  // qa
  quizCard: finish('qa', 'Quiz card', alternate('QuizCardSlide'), BLEED),
  revealCard: finish('qa', 'Reveal', alternate('RevealCardSlide'), DARK_BLEED),
  faqRow: finish('qa', 'FAQ', alternate('FaqRowSlide'), BLEED),
  // chat
  textThread: finish('chat', 'Text thread', alternate('TextThreadSlide'), BLEED),
  terminalChat: finish('chat', 'Terminal', alternate('TerminalChatSlide'), DARK_BLEED),
  captionStack: finish('chat', 'Captions', alternate('CaptionStackSlide'), DARK_BLEED),
  voiceMemo: finish('chat', 'Voice memo', alternate('VoiceMemoSlide'), BLEED),
  // steps
  checklist: finish('steps', 'Checklist', alternate('ChecklistSlide'), BLEED),
  progressTrack: finish('steps', 'Progress track', alternate('ProgressTrackSlide'), DARK_BLEED),
  stepStack: finish('steps', 'Step stack', alternate('StepStackSlide'), BLEED),
  // recap
  widgets: finish('recap', 'Widgets', alternate('WidgetsSlide'), DARK_BLEED),
  sessionPass: finish('recap', 'Session pass', alternate('SessionPassSlide'), DARK_BLEED),
  finder: finish('recap', 'Finder', alternate('FinderSlide'), DARK_BLEED),
  receiptTape: finish('recap', 'Receipt tape', alternate('ReceiptTapeSlide'), BLEED),
  // markup — the real page raster is light, so this is BLEED (owns the board) but NOT a dark surface.
  documentMarkup: finish('markup', 'Document markup', alternate('DocumentMarkupSlide'), BLEED),
};

/** Finishes available per content type, canonical first (registration order). */
export const FINISHES_BY_CONTENT: Partial<Record<SlotKey, TemplateId[]>> = (() => {
  const by: Partial<Record<SlotKey, TemplateId[]>> = {};
  for (const id of Object.keys(FINISH) as TemplateId[]) {
    const def = FINISH[id]!;
    (by[def.content] ??= []).push(id);
  }
  return by;
})();

/**
 * Cross-content "bridges": a beat of one content type can also wear finishes built for ANOTHER type
 * when its data carries over cleanly through an adapter. This is what gives Remix real variety — most
 * reels are quote/list-heavy, and without bridges a quote beat could only ever cycle its own 4 finishes
 * while the big headline (concept) and talk libraries sat unreachable. The adapter reshapes the slots at
 * render time; the slide keeps its own semantic content type. Bridges are only reached on Remix
 * (seed > 0) — seed 0 always wears the content's clean canonical finish, so the default reel is unchanged.
 */
interface Bridge {
  to: ContentType;
  finishes: TemplateId[];
  adapt: (slots: Raw) => Raw;
}
const BRIDGES: Partial<Record<ContentType, Bridge[]>> = {
  // A quote is a hero line — it reads naturally as the headline of these "big statement" finishes.
  // (Excludes the single-word/no-wrap concept finishes like massiveType/neon/swiss, where a sentence
  // would look wrong.)
  quote: [
    {
      to: 'concept',
      finishes: [
        'spotlightStage',
        'magazine',
        'sunsetTape',
        'lockScreen',
        'auroraGlass',
        'whiteboard',
        'chalkboard',
        'markerDoodle',
      ],
      adapt: (s) => ({ title: s.quote, subtitle: s.attribution, tag: 'Quote' }),
    },
  ],
  // A concept's gloss is a sentence, so it can be shown as a pull-quote.
  concept: [
    {
      to: 'quote',
      finishes: ['spotlightQuote', 'billboard', 'comicPanel', 'captionMeme'],
      adapt: (s) => ({ quote: s.subtitle ?? s.title, attribution: s.tag }),
    },
  ],
  // A list of points and a sequence of steps are the same shape — a few short lines.
  list: [
    {
      to: 'steps',
      finishes: ['steps'],
      adapt: (s) => ({ stops: arrayValue(s.items).map((label) => ({ label, state: 'todo' })) }),
    },
  ],
  steps: [
    {
      to: 'list',
      finishes: ['takeaways', 'stickyNotes', 'notebook', 'marquee'],
      adapt: (s) => ({ items: arrayValue(s.stops).map((x) => objectValue(x).label) }),
    },
  ],
};

const bridgesOf = (content: ContentType): Bridge[] => BRIDGES[content] ?? [];

/** Pick the finish a beat wears. Seed 0 → the canonical (clean) finish; Remix bumps the seed to re-roll
 *  a different finish — from the content's own family AND any bridged families, for free. `heroLen`
 *  (the beat's headline length) keeps narrow finishes out of the draw when the text outruns their
 *  `heroCap` — the long-title cut is a roomy layout, never a squeezed one. `exclude` (the beat's
 *  CURRENT finish, passed by Remix) is kept out of the draw when anything else qualifies — otherwise
 *  a seed step of exactly +1 can land back on the same index whenever it happens to divide the pool
 *  evenly (a pool of 7 is a no-op every time), making a Remix click look like it did nothing. */
export function assignFinish(
  content: ContentType,
  seed: number,
  index: number,
  heroLen = 0,
  exclude?: TemplateId,
): TemplateId {
  const own = FINISHES_BY_CONTENT[content];
  if (!own || !own.length) return 'conceptCard'; // never happens for real content (canonical exists)
  if (seed <= 0) return own[0];
  const all = [...own, ...bridgesOf(content).flatMap((b) => b.finishes)];
  const roomy = all.filter((id) => (FINISH[id]?.heroCap ?? Infinity) >= heroLen);
  let pool = roomy.length ? roomy : all;
  if (exclude !== undefined) {
    const withoutCurrent = pool.filter((id) => id !== exclude);
    if (withoutCurrent.length) pool = withoutCurrent;
  }
  return pool[(seed * 7 + index * 3) % pool.length];
}

/** Reshape a slide's slots to whatever its chosen finish expects — identity when the finish matches the
 *  slide's own content type, otherwise via the bridge adapter (re-coerced so it stays within budget). */
function slotsForFinish(slide: ReelSlide, finishContent: SlotKey): unknown {
  if (finishContent === slide.content) return slide.slots;
  const bridge = bridgesOf(slide.content as ContentType).find((b) => b.to === finishContent);
  if (!bridge) return slide.slots;
  return coerceSlots(finishContent, bridge.adapt(slide.slots as Raw), { topic: '', question: '' });
}

/** Resolve a slide's visual and adapted slots, falling back to its canonical finish. */
export function resolveSlideFinish(slide: ReelSlide): {
  Slide: (props: { slots: unknown }) => ReactElement;
  slots: unknown;
} {
  let def = FINISH[slide.template];
  const reachable =
    def &&
    (def.content === slide.content ||
      bridgesOf(slide.content as ContentType).some((b) => b.to === def!.content));
  if (!reachable) def = FINISH[(FINISHES_BY_CONTENT[slide.content] ?? [])[0]];
  const chosen = def ?? FINISH.conceptCard!;
  return { Slide: chosen.Slide, slots: slotsForFinish(slide, chosen.content) };
}
