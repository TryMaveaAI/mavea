// The local reel director turns a conversation into content beats (a stat, a quote, a concept…) and
// deterministically dresses each beat in one of the visual finishes. Remix only re-rolls those
// finishes. The intro question and outro are always added here; no model or hosted service directs
// the cut.
import type { TurnFrame } from '../../live/history';
import type { ClipTheme } from '../types';
import {
  type ReelScript,
  type ReelSlide,
  type ContentType,
  type SlotKey,
  type VibeId,
  SLIDE_MS,
  SLOT_BUDGET,
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
