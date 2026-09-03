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
import { cacheGet, cachePut, fnv1a, rippleCacheKey } from '../ripple/cache';
import { coerceStudyNotes, STUDY_NOTES_DIRECTIVE } from '../../engine/liveSchema';
import { ArrayStreamScanner } from '../streamParse';
import { studyLevelNote } from '../select/simpleLevel';
import type { ExplainLevel } from '../select/simpleLevel';

/** Notes are short. A CEILING, not a reservation: the provider bills what it writes, so this
 *  costs nothing when unused and buys headroom when an answer runs long. Sized for ~12 blocks of
 *  four fields — on a thinking model the reasoning spends from the SAME allowance the JSON must
 *  fit inside, and a truncated object survives nothing, caches nothing, and makes the retry pay
 *  the whole call. That asymmetry is why it stays generous rather than tuned to the average. */
const MAX_TOKENS = 600 + 12 * 260;

/** Answers annotated or in flight this session. The persistent cache is the real memory; this
 *  only stops a double-open (or a remount race) paying twice. */
const ANNOTATE_CAP = 16;

/** A provider that never answers must not hold the desk's notes open forever. Generous rather
 *  than tuned — a slow-but-working call still lands, and every note that streamed in before the
 *  deadline is already on the desk — but far short of the adapter's own 60s, which is a hang. */
const STUDY_TIMEOUT_MS = 30_000;

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
/** Who is watching each in-flight call. A second opener (a remount, a Study→Focus→Study flip)
 *  joins the call already running rather than starting a second one, and still sees the notes
 *  arrive as they land — so dedup never costs a subscriber its progress. */
const watchers = new Map<string, Set<(notes: Map<string, BlockStudy>) => void>>();

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
  // The desk is already open while this streams, so hand each note over the moment its object
  // closes rather than at the end. The reply used to be accumulated whole — measured at ~11s on
  // a six-block answer — and the margin stayed in Mavéa's own hand for every second of it. The
  // scanner keeps its cursor between deltas, so the whole reply costs one pass.
  const scanner = new ArrayStreamScanner('notes');
  let buf = '';
  let seen = 0;
  const streamed = new Map<string, BlockStudy>();
  const onDelta = (chunk: string, meta?: { reasoning?: boolean }): void => {
    // Thought tokens are not the answer; scanning them would only confuse the cursor.
    if (meta?.reasoning) return;
    buf += chunk;
    scanner.scan(buf);
    if (scanner.items.length === seen) return;
    const added = scanner.items.slice(seen);
    seen = scanner.items.length;
    // Coerce only newly closed objects. Earlier values keep their identity as the map grows, so
    // a later note cannot make every already-visible aside recompute.
    const partial = coerceStudyNotes({ notes: added } as never, spec.blocks as Block[]);
    if (!partial.size) return;
    for (const [id, note] of partial) streamed.set(id, note);
    const snapshot = new Map(streamed);
    for (const watcher of watchers.get(key) ?? []) watcher(snapshot);
  };
  // Owned by the call, never by a subscriber: openers come and go (the desk's effect re-runs on
  // any config change) and one leaving must not cancel a request the others are still watching.
  const deadline = new AbortController();
  const timer = setTimeout(() => deadline.abort(), STUDY_TIMEOUT_MS);
  try {
    const res = await getAdapter(cfg.provider).generate(
      {
        usageLabel: 'study-notes',
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
        signal: deadline.signal,
      },
      cfg,
      onDelta,
    );
    raw = res.raw;
  } catch (err) {
    if (import.meta.env?.DEV) console.warn('[live] study notes failed', err);
    return null;
  } finally {
    clearTimeout(timer);
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
  // The streamed objects and the final parse represent the same closed JSON. Keep the instances
  // already handed to the desk so settling does not rewrite an authored note one last time.
  for (const [id, note] of streamed) if (notes.has(id)) notes.set(id, note);
  void cachePut(key, [...notes]);
  return notes;
}

/**
 * The margin notes for one answer, or null when there are none to be had — no key, a failed
 * call, or a reply where nothing survived coercion. The caller's job in all of them is the same:
 * keep showing the voices the Study derives itself, which are whole and cost nothing.
 *
 * `onPartial` receives each batch of notes as it finishes streaming, so the desk fills in from the
 * first card rather than all at once at the end. It is never called for a cache hit — those
 * resolve immediately and the promise carries the whole set.
 *
 * Content-addressed on the answer, so re-opening the Study, remounting, or returning in a later
 * session all ride the first call.
 */
export function studyNotesFor(
  spec: ConversationSpec,
  ask: string,
  cfg: ModelConfig,
  level: ExplainLevel = 'standard',
  onPartial?: (notes: Map<string, BlockStudy>) => void,
  subscriberSignal?: AbortSignal,
): Promise<Map<string, BlockStudy> | null> {
  // Content-addressed on the DIGEST the notes are written about, never on ids: a live spec's
  // id is the constant 'live', and block ids restart at live-1 on every replace — keyed on
  // those, a later answer with the same silhouette (chart+kpi+list) would have been served the
  // PREVIOUS answer's notes, figures and all. The digest carries the blocks' actual props, so
  // different content can never share a key. The level rides too: a note written for Simple is
  // not the note for In-depth.
  const key = rippleCacheKey(
    `live-study:${level}:${fnv1a(blockDigest(spec.blocks))}`,
    cfg.provider,
  );
  if (onPartial) {
    const set = watchers.get(key) ?? new Set();
    set.add(onPartial);
    watchers.set(key, set);
  }
  const release = (): void => {
    if (!onPartial) return;
    const set = watchers.get(key);
    if (!set) return;
    set.delete(onPartial);
    if (!set.size) watchers.delete(key);
  };
  const cleanup = (): void => {
    subscriberSignal?.removeEventListener('abort', release);
    release();
  };
  if (subscriberSignal?.aborted) release();
  else subscriberSignal?.addEventListener('abort', release, { once: true });
  const already = inFlight.get(key);
  if (already) return already.finally(cleanup);
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
  return started.finally(cleanup);
}
