// annotate.ts — the Study's margin notes, bought once, when a reader opens the desk.
//
// These used to ride the answer turn. Measured on live turns they were 52% of every answer's
// JSON — 161 output tokens per block — for a surface that is not the default view, so most turns
// paid a doubled generation time for annotations nobody opened. Output tokens are produced
// serially, so that is latency, not merely cost. They also crowded the answer itself: the main
// prompt had grown until presentation instructions outweighed the instruction to ANSWER.
//
// Same shape as depth/deepen.ts: in-flight dedup on a stable key, the persistent ripple cache,
// bounded context, minimal thinking, and a failure is NEVER memoised — a reader who opens the
// Study again after a rate limit gets a real attempt, not the shrug the first open earned.
//
// Reached ONLY through a dynamic import, because liveSchema pins the engine + catalog and a
// static edge would put all of that in front of every surface that renders cards.
import type { Block, BlockStudy, ConversationSpec } from '../../data/conversation';

import type { ModelConfig } from '../../types/mavea';
import { getAdapter } from '../providers';
import { cacheGet, cachePut, rippleCacheKey } from '../ripple/cache';
import { coerceStudyNotes, STUDY_NOTES_DIRECTIVE } from '../../engine/liveSchema';
import { recordUsage } from '../usage/ledger';
import { studyLevelNote } from '../select/simpleLevel';
import type { ExplainLevel } from '../select/simpleLevel';

/** Notes are short. This is sized for ~12 blocks of five fields plus envelope headroom — on a
 *  thinking model the reasoning spends from the SAME allowance the JSON must fit inside, and a
 *  truncated object survives nothing, caches nothing, and makes the retry pay the whole call. */
const MAX_TOKENS = 600 + 12 * 260;

/** Answers annotated or in flight this session. The persistent cache is the real memory; this
 *  only stops a double-open (or a remount race) paying twice. */
const ANNOTATE_CAP = 16;

/** What the notes are written ABOUT — every block, in the order the desk walks them, with the
 *  real content each one renders. The notes have to name actual figures and actual rows, and a
 *  gesture's "at" has to be text the block truly shows, so the props go in rather than a summary.
 *  Bounded per block so one enormous table cannot crowd out the rest of the answer. */
function blockDigest(blocks: readonly Block[]): string {
  return blocks
    .filter((b) => b.id)
    .map((b) => {
      const props = JSON.stringify(b.props ?? {}).slice(0, 900);
      const note = b.note ? `\n  said: ${b.note}` : '';
      return `${b.id} — ${b.type}${note}\n  shows: ${props}`;
    })
    .join('\n\n')
    .slice(0, 14000);
}

function annotateMessage(spec: ConversationSpec, ask: string): string {
  return `QUESTION THE READER ASKED: ${ask.slice(0, 400)}

THE ANSWER YOU GAVE — annotate every block below, one entry per id:

${blockDigest(spec.blocks)}

Reply with ONE JSON object: {"notes":[…]}, one entry per id above.`;
}

const inFlight = new Map<string, Promise<Map<string, BlockStudy> | null>>();

async function fetchNotes(
  key: string,
  spec: ConversationSpec,
  ask: string,
  cfg: ModelConfig,
  level: ExplainLevel,
): Promise<Map<string, BlockStudy> | null> {
  const cached = await cacheGet<[string, BlockStudy][]>(key);
  if (cached) return new Map(cached);
  let raw: string | object;
  try {
    const res = await getAdapter(cfg.provider).generate(
      {
        // Its OWN prompt, not the answer prompt: this call teaches annotation and nothing else,
        // so it carries no component menu, no tour grammar and no block schema.
        system:
          level === 'standard'
            ? STUDY_NOTES_DIRECTIVE
            : `${STUDY_NOTES_DIRECTIVE}\n\n${studyLevelNote(level)}`,
        systemBase: STUDY_NOTES_DIRECTIVE,
        history: [],
        user: annotateMessage(spec, ask),
        maxTokens: MAX_TOKENS,
        thinkingLevel: 'minimal',
        complexity: 'brief',
      },
      cfg,
    );
    recordUsage('study-notes', res.usage);
    raw = res.raw;
  } catch (err) {
    if (import.meta.env?.DEV) console.warn('[live] study notes failed', err);
    return null;
  }
  const notes = coerceStudyNotes(raw as never, spec.blocks as Block[]);
  if (notes.size === 0) {
    if (import.meta.env?.DEV) {
      console.warn('[live] study notes: nothing survived', {
        raw: typeof raw === 'string' ? raw.slice(0, 400) : raw,
      });
    }
    return null;
  }
  void cachePut(key, [...notes]);
  return notes;
}

/**
 * The margin notes for one answer, or null when there are none to be had — no key, a failed
 * call, or a reply where nothing survived coercion. The caller's job in all of them is the same:
 * keep showing the voices the Study derives itself, which are whole and cost nothing.
 *
 * Content-addressed on the answer, so re-opening the Study, remounting, or returning in a later
 * session all ride the first call.
 */
export function studyNotesFor(
  spec: ConversationSpec,
  ask: string,
  cfg: ModelConfig,
  level: ExplainLevel = 'standard',
): Promise<Map<string, BlockStudy> | null> {
  const signature = spec.blocks
    .map((b) => `${b.id}:${b.type}`)
    .join('|')
    .slice(0, 600);
  // The level is part of the key: a note written for Simple is not the note for In-depth.
  const key = rippleCacheKey(`live-study:${level}:${spec.id}\0${signature}`, cfg.provider);
  const already = inFlight.get(key);
  if (already) return already;
  const started = fetchNotes(key, spec, ask, cfg, level);
  inFlight.set(key, started);
  while (inFlight.size > ANNOTATE_CAP) {
    const oldest = inFlight.keys().next().value;
    if (oldest === undefined || oldest === key) break;
    inFlight.delete(oldest);
  }
  // A failure is never memoised: the next open has to get a real attempt.
  void started.then(
    (notes) => {
      if (!notes) inFlight.delete(key);
    },
    () => inFlight.delete(key),
  );
  return started;
}
