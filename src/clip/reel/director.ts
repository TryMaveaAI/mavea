// The "reel director": turns a conversation into a ReelScript. It works in CONTENT TYPES (a stat, a
// quote, a concept…), not in the ~50 visual finishes — so the single model call stays small, accurate
// and real-data-only, while a deterministic selector dresses each beat in a finish and Remix re-rolls
// finishes for free. Two paths, same output:
//  • generateReel() recuts via the user's BYOK model; any failure falls back so it never hard-depends.
//  • buildReelFallback() composes a clean, real reel from the turns alone (no model).
// The model returns content beats only; the intro (the question) and outro are always added here.
import type { TurnFrame } from '../../live/history';
import type { Block } from '../../data/conversation';
import type { ModelConfig } from '../../types/mavea';
import type { ClipTheme } from '../types';
import {
  type ReelScript,
  type ReelSlide,
  type ContentType,
  type SlotKey,
  type VibeId,
  CONTENT_TYPES,
  SLIDE_MS,
  SLOT_BUDGET,
  CHAR_BUDGET,
  clampText,
} from './reelScript';
import { coerceSlots, assignFinish, heroLenOf, type CoerceCtx } from './templates/registry';
import { forDisplay, forSpeech } from '../../lib/spokenText';
import { sectionFrames, deriveHeading } from './sections';

export interface DirectorOpts {
  palette?: ClipTheme;
  vibe?: VibeId;
  /** Hard ceiling on total slides (incl. intro + outro). */
  maxSlides?: number;
}

const DEFAULTS = { palette: 'aurora' as ClipTheme, vibe: 'clean' as VibeId, maxSlides: 6 };

// ---- shared shaping helpers ----
function firstQuestion(frames: TurnFrame[]): string {
  return clampText(frames[0]?.question || frames[0]?.spec?.title || 'Mavéa', SLOT_BUDGET.title);
}
function topicOf(frames: TurnFrame[]): string {
  return frames[0]?.spec?.topic || frames[0]?.spec?.title || firstQuestion(frames);
}
function sentences(text: string): string[] {
  return (text || '')
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 1);
}
function answerLine(f: TurnFrame): string {
  return (f.narration || f.spec?.found || f.spec?.sub || '').trim();
}
function answerSpokenLine(f: TurnFrame): string {
  return (f.spoken || f.narration || f.spec?.found || f.spec?.sub || '').trim();
}

let slideSeq = 0;
function makeSlide<C extends SlotKey>(
  content: C,
  template: ReelSlide<C>['template'],
  raw: Record<string, unknown>,
  meta: { voiceover: string; ms: number; sourceBlockId?: string },
  ctx: CoerceCtx,
): ReelSlide<C> {
  const voiceover = clampText(forSpeech(meta.voiceover), SLOT_BUDGET.voiceover);
  return {
    id: `s${slideSeq++}`,
    content,
    template,
    slots: coerceSlots(content, raw, ctx),
    voiceover,
    // Hold the slide at least as long as its line takes to speak (~13 chars/s + a breath), so the
    // silent preview is paced like the narrated export and the "N-second" estimate is honest. The
    // audio renderer still fine-tunes this to the real synthesized length at export time.
    durationMs: Math.max(meta.ms, voiceover ? Math.round((voiceover.length / 13) * 1000) + 500 : 0),
    sourceBlockId: meta.sourceBlockId,
  };
}

/** A content beat: coerced, then dressed in a finish for the current seed (Remix re-rolls the finish). */
function contentSlide(
  content: ContentType,
  raw: Record<string, unknown>,
  meta: { voiceover: string; ms: number; sourceBlockId?: string },
  ctx: CoerceCtx,
  seed: number,
  index: number,
): ReelSlide {
  return makeSlide(
    content,
    assignFinish(content, seed, index, heroLenOf(content, raw)),
    raw,
    meta,
    ctx,
  );
}

/** One topic run, ready to stitch into the whole reel: the frames it covers, its content beats, and
 *  (when a model directed it) the heading it returned — falling back to `deriveHeading` when absent. */
interface SectionCut {
  frames: TurnFrame[];
  content: ReelSlide[];
  heading?: string;
}

/**
 * How many topic sections a reel of `maxSlides` slides can actually carry. Every section costs a title
 * slide plus at least one content beat, and the outro costs one more — so the ceiling is what it is.
 * A long, many-topic session used to recut into one slide per topic PLUS two beats each with no regard
 * for the ceiling (ten topics → thirty-one slides, a three-minute "reel" no social format would take,
 * and minutes of rasterizing to export). A reel is a highlight, so we cover the sections we can and
 * take them from the END of the session — the topic the user just explored is the one they're sharing.
 */
function sectionsShown(maxSlides: number, sectionCount: number): number {
  return Math.max(1, Math.min(sectionCount, Math.floor((maxSlides - 1) / 2)));
}

/** Content-beat budget for section `index` of `count`, spread so that titles + beats + the outro land
 *  exactly on `maxSlides`; a remainder goes to the earlier sections. A single-topic conversation (the
 *  common case) gets exactly the original `maxSlides - 2`. */
function sectionBudget(maxSlides: number, count: number, index = 0): number {
  const beats = Math.max(count, maxSlides - 1 - count); // ≥1 beat per section, even at a tiny ceiling
  return Math.max(1, Math.floor(beats / count) + (index < beats % count ? 1 : 0));
}

/** The title slide opening a section: its own quoted question, its own derived heading, and — only
 *  when the reel actually has more than one section — a "part N of M" chip so it reads as one
 *  continuous reel rather than several unrelated ones stitched together. */
function sectionTitle(cut: SectionCut, index: number, count: number, ctx: CoerceCtx): ReelSlide {
  const question = firstQuestion(cut.frames);
  const heading = cut.heading || deriveHeading(cut.frames);
  return makeSlide(
    'title',
    'title',
    {
      question,
      kicker: heading || undefined,
      part: count > 1 ? { index: index + 1, count } : undefined,
    },
    { voiceover: question, ms: SLIDE_MS.intro },
    ctx,
  );
}

function assemble(sections: SectionCut[], opts: Required<DirectorOpts>, seed: number): ReelScript {
  // Read the reel's own question/topic from the frames it actually COVERS, not from the whole session:
  // when the ceiling trims older topics away, the reel must be about what's in it.
  const covered = sections.flatMap((s) => s.frames);
  const q = firstQuestion(covered);
  const topic = topicOf(covered);
  const slides: ReelSlide[] = [];
  sections.forEach((cut, i) => {
    const ctx: CoerceCtx = { topic: topicOf(cut.frames), question: firstQuestion(cut.frames) };
    slides.push(sectionTitle(cut, i, sections.length, ctx));
    slides.push(...cut.content);
  });
  const outroCtx: CoerceCtx = { topic, question: q };
  slides.push(
    makeSlide(
      'outro',
      'outro',
      { wordmark: 'Mavéa', tagline: 'Talk to AI. See what it means.' },
      { voiceover: 'Made with Mavéa.', ms: SLIDE_MS.outro },
      outroCtx,
    ),
  );
  return {
    topic,
    question: q,
    palette: opts.palette,
    vibe: opts.vibe,
    seed,
    slides,
    durationMs: slides.reduce((a, s) => a + s.durationMs, 0),
  };
}

/** Re-roll which finish each content beat wears, WITHOUT re-calling the model. This is Remix. */
export function reseedFinishes(script: ReelScript, seed: number): ReelScript {
  return {
    ...script,
    seed,
    slides: script.slides.map((s, i) =>
      s.content === 'title' || s.content === 'outro'
        ? s
        : {
            ...s,
            template: assignFinish(
              s.content as ContentType,
              seed,
              i,
              heroLenOf(s.content, s.slots),
              s.template,
            ),
          },
    ),
  };
}

// ---- deterministic fallback (no model) ----
/** A beat the fallback could cut, before the budget decides which ones survive. `speaksFor` is the turn
 *  it represents; a beat that carries a turn's OWN answer is that turn's coverage, a takeaways list
 *  drawn from its cards is a bonus on top of it. */
interface FallbackBeat {
  speaksFor: number;
  covers: boolean;
  content: ContentType;
  raw: Record<string, unknown>;
  voiceover: string;
}

/** The content beats for ONE topic run: a quote drawn from each turn's own narration, plus the card
 *  captions distilled into honest, already-short takeaways. Real text only, capped to `cap`.
 *
 *  When the cap can't hold them all, it trims by REDUNDANCY, not by recency: every turn gets its own
 *  beat before any turn gets a second one. Cutting the list in beat order instead (what this used to
 *  do) meant a two-turn section with room for two beats showed the FIRST turn's quote and the first
 *  turn's takeaways, and said nothing at all about the second turn — the reel silently dropped the
 *  tail of the conversation while repeating its head. */
function fallbackContent(frames: TurnFrame[], ctx: CoerceCtx, cap: number): ReelSlide[] {
  // The card captions across this section make honest, already-short takeaways.
  const noteBlocks = frames
    .flatMap((f) => f.spec?.blocks ?? [])
    .map((b) => ({
      shown: forDisplay((b.note || '').trim()),
      spoken: forSpeech((b.noteSpoken || b.note || '').trim()),
    }))
    .filter((note) => note.shown.length > 8);
  const notes = noteBlocks.map((note) => note.shown);
  const notesSpoken = noteBlocks.map((note) => note.spoken || note.shown);

  const beats: FallbackBeat[] = [];
  frames.forEach((f, fi) => {
    const line = answerLine(f);
    const rawSents = sentences(answerSpokenLine(f));
    const dispSents = sentences(forDisplay(line));
    if (dispSents.length) {
      beats.push({
        speaksFor: fi,
        covers: true,
        content: 'quote',
        raw: { quote: dispSents[0] },
        voiceover: rawSents.slice(0, 2).join(' '),
      });
    }
    if (fi === 0 && notes.length >= 2) {
      beats.push({
        speaksFor: fi,
        covers: false,
        content: 'list',
        raw: { items: notes.slice(0, 4) },
        voiceover: notesSpoken.slice(0, 3).join('. '),
      });
    }
  });

  if (!beats.length) {
    const q = ctx.question;
    beats.push({ speaksFor: 0, covers: true, content: 'quote', raw: { quote: q }, voiceover: q });
  }

  // Coverage first (one beat per turn, in order), then the extras fill whatever room is left — and the
  // survivors are replayed in conversation order so the reel still reads chronologically.
  const chosen = new Set<FallbackBeat>();
  for (const pass of [true, false]) {
    for (const beat of beats) {
      if (chosen.size >= cap) break;
      if (beat.covers === pass && !chosen.has(beat)) chosen.add(beat);
    }
  }
  return beats
    .filter((b) => chosen.has(b))
    .map((b, i) =>
      contentSlide(
        b.content,
        b.raw,
        { voiceover: b.voiceover, ms: SLIDE_MS.default },
        ctx,
        0,
        i + 1,
      ),
    );
}

/** The topic runs a reel of this budget can carry, newest last — see `sectionsShown`. */
function coveredSections(frames: TurnFrame[], maxSlides: number): TurnFrame[][] {
  const sections = sectionFrames(frames);
  return sections.slice(-sectionsShown(maxSlides, sections.length));
}

export function buildReelFallback(frames: TurnFrame[], opts: DirectorOpts = {}): ReelScript {
  const o = { ...DEFAULTS, ...opts };
  const sections = coveredSections(frames, o.maxSlides);
  const cuts: SectionCut[] = sections.map((secFrames, i) => {
    const ctx: CoerceCtx = { topic: topicOf(secFrames), question: firstQuestion(secFrames) };
    return {
      frames: secFrames,
      content: fallbackContent(secFrames, ctx, sectionBudget(o.maxSlides, sections.length, i)),
    };
  });
  return assemble(cuts, o, 0);
}

// ---- model-directed recut (BYOK) ----
// The per-slot character limits the model must hit, GENERATED from CHAR_BUDGET so the prompt always
// states the real budgets (the most that fits the tightest finish of each type). Every number is a max
// CHARACTER count — precise and matched to what each slide can hold — so one call yields slides that
// fit with no truncation or overflow.
const B = CHAR_BUDGET;
const SLOT_LIMITS = [
  `stat — value ≤${B.stat.value}, label ≤${B.stat.label}, unit ≤${B.stat.unit}, prior ≤${B.stat.prior}.`,
  `metrics — ≤${B.metrics.items} items, each label ≤${B.metrics.label}; next ≤${B.metrics.next}.`,
  `ranked — ≤${B.ranked.items} items, label ≤${B.ranked.label}, score ≤${B.ranked.score}; title ≤${B.ranked.title}.`,
  `quote — quote ≤${B.quote.quote}, highlight ≤${B.quote.highlight}, attribution ≤${B.quote.attribution}.`,
  `list — ≤${B.list.items} items, each ≤${B.list.item}.`,
  `concept — title ≤${B.concept.title} (1–2 words), subtitle ≤${B.concept.subtitle}, tag ≤${B.concept.tag}.`,
  `conceptmap — center ≤${B.conceptmap.center}, ≤${B.conceptmap.nodes} nodes, each label ≤${B.conceptmap.node}.`,
  `qa — question ≤${B.qa.question}, answer ≤${B.qa.answer}.`,
  `chat — ≤${B.chat.messages} messages, each ≤${B.chat.message}.`,
  `diagram — label ≤${B.diagram.label}, equation ≤${B.diagram.equation}, note ≤${B.diagram.note}.`,
  `steps — ≤${B.steps.stops} stops, each label ≤${B.steps.label}.`,
  `recap — topic ≤${B.recap.topic}, ≤${B.recap.metrics} metrics, label ≤${B.recap.label}, value ≤${B.recap.value}.`,
]
  .map((l) => `  · ${l}`)
  .join('\n');

const REEL_SYSTEM = `You are Mavéa's reel director. You recut a finished conversation into a short, vertical (9:16) social video — a sequence of card "beats" for TikTok/Reels/Shorts. Each beat is ONE card with very little room.

Return ONLY JSON: {"heading": <string>, "slides":[{ "type": <content-type>, "slots": {…}, "voiceover": <string> }]}. Give 3 to 5 content beats (the intro question and the outro are added for you — do NOT include them).

"heading" is a short, punchy title for this reel — a headline that sums up what it's about, at most 32 characters. It sits ABOVE the literal question (which is quoted verbatim elsewhere), so it must NOT just restate the question — it's the sharper, sub-editor's version of it.

Choose a "type" per beat — the kind of thing it says — and fill its slots:
- stat {value,label,unit?,prior?} — one headline number.
- metrics {items:[{label,pct}],next?} — a few labelled percentages.
- ranked {title?,items:[{label,score,pct}]} — a ranked comparison.
- quote {quote,highlight?,attribution?} — one strong sentence.
- list {items:[string],title?} — up to 4 short points.
- concept {title,subtitle?,tag?} — a concept/term and a one-line gloss.
- conceptmap {center,nodes:[{label}]} — a concept and what connects to it.
- qa {question,answer} — a question and its answer.
- chat {messages:[{role:"user"|"mavea",text}]} — a short exchange.
- diagram {label,equation?,vectors?:[{label}],note?} — a formula / diagram idea.
- steps {stops:[{label,state:"done"|"active"|"todo"}]} — a path or milestones.
- recap {topic,metrics:[{label,value}]} — a tidy summary of figures.

Rules:
- REAL DATA ONLY. Use only facts, numbers and wording present in the conversation. Never invent a number, label or statistic. If a type needs data the conversation doesn't have, choose a different type.
- IT MUST FIT THE CARD — write to these MAX CHARACTER limits so every value fits its slide with nothing cut. A beat may be re-styled into any look for its type, so write to the tightest. Counts are characters incl. spaces:
${SLOT_LIMITS}
- Match each beat to the type that fits it best; vary the types across the reel.
- "voiceover" is what's spoken over the slide — one natural, conversational sentence. Condense hard — trim filler, keep the punchy core.
- In every voiceover, preserve normal spelling on the left and provide native/source-language pronunciation for every name, place, brand, or non-English term a voice might misread as [[shown|said]], for example "[[Omakase|oh-mah-kah-seh]]". The said side must be lowercase voice-safe phonetic syllables, never IPA or an Anglicized guess. This is required and does not change the visible slot text.`;

const REEL_FORMAT = {
  type: 'object',
  properties: {
    heading: { type: 'string' },
    slides: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: CONTENT_TYPES },
          slots: { type: 'object' },
          voiceover: { type: 'string' },
        },
        required: ['type', 'slots', 'voiceover'],
      },
    },
  },
  required: ['slides'],
} as const;

function digestBlock(b: Block): string {
  const note = (b.note || '').trim();
  let propHint = '';
  try {
    const json = JSON.stringify(b.props);
    if (json && json !== '{}') propHint = ` data=${clampText(json, 220)}`;
  } catch {
    /* unserializable props — skip */
  }
  return `- [${b.type}]${note ? ` ${clampText(note, 120)}` : ''}${propHint}`;
}

function corpus(frames: TurnFrame[]): string {
  return frames
    .slice(0, 4)
    .map((f) => {
      const cards = (f.spec?.blocks ?? []).slice(0, 8).map(digestBlock).join('\n');
      return `Q: ${f.question}\nMavea: ${clampText(answerLine(f), 400)}\nCards:\n${cards}`;
    })
    .join('\n\n');
}

function parseReel(raw: string | object): { slides: unknown[]; heading: string } {
  let obj: unknown = raw;
  if (typeof raw === 'string') {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start < 0 || end < 0) return { slides: [], heading: '' };
    try {
      obj = JSON.parse(raw.slice(start, end + 1));
    } catch {
      return { slides: [], heading: '' };
    }
  }
  const o = obj as { slides?: unknown; heading?: unknown };
  return {
    slides: Array.isArray(o?.slides) ? o.slides : [],
    heading: typeof o?.heading === 'string' ? o.heading : '',
  };
}

/** One model call recutting a SINGLE topic run into its content beats + its own heading. Null on any
 *  failure (bad response, timeout, empty content) — the caller degrades to the deterministic fallback. */
async function callDirector(
  frames: TurnFrame[],
  cfg: ModelConfig,
  ctx: CoerceCtx,
  cap: number,
): Promise<SectionCut | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 18000);
  try {
    // Provider adapters are director-only. The deterministic first preview never downloads them.
    const { getAdapter } = await import('../../live/providers');
    const adapter = getAdapter(cfg.provider);
    const result = await adapter.generate(
      {
        system: REEL_SYSTEM,
        history: [],
        user: `Recut this conversation into ${cap} or fewer content beats.\n\n${corpus(frames)}`,
        // Size the ceiling to the beat count: a full 5-beat cut of heavy types (chat/qa/list) plus
        // each beat's voiceover brushes ~1100, so a flat 1100 truncates the JSON and drops the whole
        // section back to the deterministic fallback — a silent quality loss on a paid call. The 18s
        // abort timer above stays the real stream guard.
        maxTokens: Math.min(2200, 350 + cap * 260),
        temperature: 0.6,
        format: REEL_FORMAT,
        signal: ctrl.signal,
      },
      cfg,
    );
    const { slides: raw, heading } = parseReel(result.raw);
    const valid = new Set<string>(CONTENT_TYPES);
    const content: ReelSlide[] = [];
    for (const s of raw) {
      const row = s as { type?: string; slots?: unknown; caption?: string; voiceover?: string };
      const type = row.type as ContentType | undefined;
      if (!type || !valid.has(type)) continue;
      const slots = (row.slots && typeof row.slots === 'object' ? row.slots : {}) as Record<
        string,
        unknown
      >;
      content.push(
        contentSlide(
          type,
          slots,
          // A model (or old cached data) may still emit a "caption" field even though the prompt no
          // longer asks for one — treat it as an alternate voiceover source rather than dropping it,
          // so loosely-formatted output still gets narrated.
          { voiceover: row.voiceover || row.caption || '', ms: SLIDE_MS.default },
          ctx,
          0,
          content.length + 1,
        ),
      );
      if (content.length >= cap) break;
    }
    if (!content.length) return null;
    return {
      frames,
      content,
      heading: heading ? clampText(heading, SLOT_BUDGET.heading) : undefined,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// A genuinely multi-topic share (sectionFrames splits on a real subject change) recuts each topic with
// its OWN call, since one call blending unrelated subjects reads as a single confused reel — but never
// more than this many, so a long, many-topic session can't run away the user's spend. Any covered
// section beyond the cap still gets a real, free, deterministic cut (never silently dropped).
const MAX_SECTION_CALLS = 3;

export async function generateReel(
  frames: TurnFrame[],
  cfg: ModelConfig,
  opts: DirectorOpts = {},
): Promise<ReelScript> {
  const o = { ...DEFAULTS, ...opts };
  // The reel only carries the sections its slide ceiling can hold (see `sectionsShown`), so a long
  // session neither runs away in length nor pays for model calls on topics that wouldn't make the cut.
  const sections = coveredSections(frames, o.maxSlides);
  const capOf = (i: number): number => sectionBudget(o.maxSlides, sections.length, i);
  // Cost shape: a single-topic share (the common case) makes exactly one model call, same as before
  // this feature. A multi-topic share makes one call per topic, up to MAX_SECTION_CALLS — never more,
  // and never fewer than the deterministic pass it protects against: any call failing anywhere still
  // degrades the WHOLE reel to the free fallback rather than shipping a half-directed cut.
  try {
    const cuts: SectionCut[] = [];
    for (const [i, secFrames] of sections.entries()) {
      const ctx: CoerceCtx = { topic: topicOf(secFrames), question: firstQuestion(secFrames) };
      if (i < MAX_SECTION_CALLS) {
        const cut = await callDirector(secFrames, cfg, ctx, capOf(i));
        if (!cut) return buildReelFallback(frames, opts);
        cuts.push(cut);
      } else {
        cuts.push({ frames: secFrames, content: fallbackContent(secFrames, ctx, capOf(i)) });
      }
    }
    return assemble(cuts, o, 0);
  } catch {
    return buildReelFallback(frames, opts);
  }
}
