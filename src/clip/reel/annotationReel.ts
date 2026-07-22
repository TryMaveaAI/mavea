// Build a reel directly from Prism's recorded pen annotations — no model director. Each annotation
// becomes a `markup` beat (the page raster + the stroke + the explanation), wrapped with the usual
// title/outro bookends. It mirrors the director's `makeSlide` (the spoken-text resolution + duration
// pacing + budget clamps) without depending on it, so director.ts stays untouched.
import type { ClipTheme } from '../types';
import {
  type ReelScript,
  type ReelSlide,
  type SlotKey,
  type VibeId,
  clampText,
  SLOT_BUDGET,
  SLIDE_MS,
} from './reelScript';
import { coerceSlots, type CoerceCtx } from './templates/registry';
import { forSpeech } from '../../lib/spokenText';
import type { AnnotationStep } from '../../live/prism/annotation/steps';

/** Cap the number of marked-up pages so the reel stays a sensible length. */
const MAX_BEATS = 8;

interface BuildOpts {
  fileName: string;
  palette?: ClipTheme;
  vibe?: VibeId;
}

let seq = 0;

/** A slide built the director's way: voiceover clamped, duration paced to the speech. */
function makeSlide<C extends SlotKey>(
  content: C,
  template: ReelSlide<C>['template'],
  raw: Record<string, unknown>,
  meta: { voiceover: string; ms: number },
  ctx: CoerceCtx,
): ReelSlide<C> {
  const voiceover = clampText(forSpeech(meta.voiceover), SLOT_BUDGET.voiceover);
  return {
    id: `a${seq++}`,
    content,
    template,
    slots: coerceSlots(content, raw, ctx),
    voiceover,
    durationMs: Math.max(meta.ms, voiceover ? Math.round((voiceover.length / 13) * 1000) + 500 : 0),
  };
}

/** Strip a trailing file extension for the intro line ("Inside Q1 report"). */
function stripExt(name: string): string {
  return name.replace(/\.[a-z0-9]+$/i, '').trim() || name;
}

/**
 * Turn a sequence of recorded annotations into a ready-to-play/record `ReelScript`. Bookended by the
 * usual title (the document) and outro; one `markup` beat per annotation, capped at {@link MAX_BEATS}.
 */
export function buildAnnotationReel(steps: readonly AnnotationStep[], opts: BuildOpts): ReelScript {
  const question = `Inside ${stripExt(opts.fileName)}`;
  const ctx: CoerceCtx = { topic: opts.fileName, question };

  const intro = makeSlide(
    'title',
    'title',
    { question },
    { voiceover: question, ms: SLIDE_MS.intro },
    ctx,
  );

  const beats = steps.slice(0, MAX_BEATS).map((s) => {
    const line = s.explanation || s.title;
    // Spoken line leads with the headline (shown on screen as the title), then the framing — unless
    // the explanation already restates the headline (live claim marks use claimExplain, which does).
    const say = s.title && !line.includes(s.title) ? `${s.title}. ${line}` : line;
    return makeSlide(
      'markup',
      'documentMarkup',
      { ...s },
      { voiceover: say, ms: SLIDE_MS.default },
      ctx,
    );
  });

  const outro = makeSlide(
    'outro',
    'outro',
    { wordmark: 'Mavéa', tagline: 'See what it means.' },
    { voiceover: 'Made with Mavéa.', ms: SLIDE_MS.outro },
    ctx,
  );

  const slides = [intro, ...beats, outro];
  return {
    topic: opts.fileName,
    question,
    palette: opts.palette ?? 'aurora',
    vibe: opts.vibe ?? 'clean',
    seed: 0,
    slides,
    durationMs: slides.reduce((acc, s) => acc + s.durationMs, 0),
  };
}
