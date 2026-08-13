// session/store.ts — Live's session continuity: the in-progress conversation, persisted so a
// page reload drops the user back INTO the conversation (transcript + latest canvas + model
// context) instead of the setup wizard. Mavéa converses — losing the thread on refresh breaks
// the core promise.
//
// What's saved is the minimal state a resume needs: the rolling chat history (what the model
// is re-sent so follow-ups still work) and the recent turn frames (each one the canvas the
// user actually saw, its question and spoken line). Everything else — spotlight, prefetch,
// presence — is per-session ephemera that rebuilds naturally.
//
// Mirrors the library/memory/useLiveConfig store idiom exactly: localStorage, dependency-free,
// and it NEVER throws — a corrupt, oversized, or stale session degrades to "no session" (the
// wizard, today's behavior) rather than crashing the surface. Bounded on every axis: turns
// capped, heavy inline data stripped, total bytes capped, and a session idle past the TTL (a week)
// is treated as gone — a reopen within a day or two resumes, but a truly stale thread yields a
// fresh start rather than reviving last month's canvas.
//
// Content at rest: this IS the conversation, so it's encrypted on disk (contentVault.ts), never
// plaintext. Web Crypto is async-only, so a read is a two-step dance: a synchronous fast path
// handles legacy plaintext (and the crypto-unavailable fallback) directly via JSON.parse and
// re-encrypts it once read (migrate-on-read); real ciphertext isn't valid JSON, so that fast path
// yields nothing and a background hydrate decrypts it moments later. `loadSession` is called once
// on mount to decide "resume the conversation or show the wizard" — the background hydrate is
// kicked off eagerly at module load (this module is pulled in by the same lazy chunk as LiveApp,
// so it gets a head start before LiveApp's component function ever runs) so that in the common
// case it has already resolved by the time `loadSession` is first called. If it hasn't (a very
// slow device, a cold IndexedDB), that one load shows the wizard instead of resuming — a
// self-healing degrade (the encrypted session is untouched on disk; the next reload resolves it
// with a warm key) rather than a data loss.
import type { ChatMessage } from '../providers/types';
import type { ConversationSpec } from '../../data/conversation';
import type { Mode } from '../lifecycle';
import { turnFrameId, type TurnFrame, type FrameTourStep } from '../history';
import type { TourMark } from '../../engine/liveSchema';
import { friendlyAsk } from '../friendlyAsk';
import { validateMindShape } from '../mindshape/validate';
import { encryptContent, decryptContent } from '../contentVault';

/** Local Mode guard — main removed lifecycle's isMode as dead code, so the store owns it. */
function isMode(v: unknown): v is Mode {
  return v === 'replace' || v === 'augment' || v === 'refine';
}

/** A resumable session: the chat context + the recent turn frames, stamped with last activity. */
export interface SavedSession {
  v: 1;
  /** Last activity (epoch ms) — a session older than SESSION_TTL_MS is not restored. */
  savedAt: number;
  /** The rolling model context (user/assistant pairs) so follow-ups continue naturally. */
  history: ChatMessage[];
  /** The recent turns (oldest first); the last frame's spec is the canvas to restore. */
  frames: TurnFrame[];
}

export const SESSION_STORAGE_KEY = 'mavea-live-session-v1';
/** How recent "recent" is: a session idle longer than this is not restored. A week's grace so a
 *  reopen after a day or two lands back in the conversation, then a fresh start once it's truly
 *  stale. (Durable work — saved canvases, memory, dashboards — persists regardless of this window.) */
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** Keep only the last N turns — enough thread to continue, bounded for localStorage. */
export const SESSION_TURNS_CAP = 10;
/** Total serialized budget; oldest frames are shed to fit, and a session that still doesn't
 *  fit is skipped rather than risking the whole localStorage quota. */
const MAX_SESSION_BYTES = 600_000;
/** Inline data: URIs (e.g. a generated image) above this are dropped before storage — the
 *  rest of the canvas restores fine and an image is cheap to regenerate (same as the library). */
const MAX_INLINE_STRING = 4096;

/** Deep-clone, dropping large inline data: URIs so one image can't fill the quota. */
function stripHeavy<T>(value: T): T {
  const json = JSON.stringify(value, (_k, v) =>
    typeof v === 'string' && v.length > MAX_INLINE_STRING && v.startsWith('data:') ? '' : v,
  );
  return JSON.parse(json) as T;
}

function isSpec(v: unknown): v is ConversationSpec {
  return !!v && typeof v === 'object' && Array.isArray((v as { blocks?: unknown }).blocks);
}

function coerceMessage(v: unknown): ChatMessage | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if (o.role !== 'user' && o.role !== 'assistant') return null;
  if (typeof o.content !== 'string') return null;
  // A session saved before history stored the friendly label still holds the raw synthetic
  // prompt as a user message; clean it on read so it can't surface (e.g. in the dashboard
  // extraction preview) or re-pollute the model context. Idempotent on ordinary asks.
  return { role: o.role, content: o.role === 'user' ? friendlyAsk(o.content) : o.content };
}

function coerceTourMark(v: unknown, blockCount: number): TourMark | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const kinds = [
    'circle',
    'underline',
    'point',
    'highlight',
    'rising',
    'falling',
    'bracket',
    'note',
    'connect',
  ];
  if (!kinds.includes(o.kind as string)) return null;
  if (typeof o.at !== 'string' || !o.at) return null;
  const mark: TourMark = { kind: o.kind as TourMark['kind'], at: o.at as string };
  if (typeof o.to === 'string' && o.to) mark.to = o.to;
  if (typeof o.label === 'string' && o.label) mark.label = o.label;
  if (mark.kind === 'note' && !mark.label) return null;
  if (o.color === 'key' || o.color === 'cool') mark.color = o.color;
  // "connect" needs a real OTHER block to land on, same as the live coercer in liveSchema.ts —
  // `blockCount` comes from THIS frame's own persisted spec, since a frame's tour is already
  // remapped against it before saving.
  if (mark.kind === 'connect') {
    const onIndex = typeof o.onIndex === 'number' ? Math.round(o.onIndex) : -1;
    if (!mark.to || onIndex < 0 || onIndex >= blockCount) return null;
    mark.onIndex = onIndex;
  }
  return mark;
}

function coerceTour(v: unknown, blockCount: number): FrameTourStep[] {
  if (!Array.isArray(v)) return [];
  const out: FrameTourStep[] = [];
  for (const t of v) {
    if (!t || typeof t !== 'object') continue;
    const o = t as Record<string, unknown>;
    if (typeof o.index !== 'number') continue;
    const step: FrameTourStep = {
      index: o.index,
      ...(typeof o.say === 'string' ? { say: o.say } : {}),
      ...(typeof o.saySpoken === 'string' ? { saySpoken: o.saySpoken } : {}),
    };
    const mark = coerceTourMark(o.mark, blockCount);
    if (mark) step.mark = mark;
    if (Array.isArray(o.marks)) {
      const marks = o.marks
        .map((m) => coerceTourMark(m, blockCount))
        .filter((m): m is TourMark => m !== null);
      if (marks.length) step.marks = marks;
    }
    out.push(step);
  }
  return out;
}

function coerceFrame(v: unknown): TurnFrame | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if (!isSpec(o.spec) || o.spec.blocks.length === 0) return null;
  if (typeof o.question !== 'string') return null;
  // Re-validate a persisted Watch-Me-Think map (no transcript → grounding skipped) so the read-only
  // viewer survives a reload; drops silently if the stored shape is corrupt.
  const mind = o.mind ? validateMindShape(o.mind) : null;
  const frame: TurnFrame = {
    // Clean a synthetic prompt saved before `displayAs` shipped, so a legacy session never
    // renders the raw instruction in the hero/sidebar/scrubber on resume.
    question: friendlyAsk(o.question),
    ...(typeof o.id === 'string' && o.id.trim() ? { id: o.id } : {}),
    narration: typeof o.narration === 'string' ? o.narration : '',
    ...(typeof o.spoken === 'string' ? { spoken: o.spoken } : {}),
    mode: isMode(o.mode) ? o.mode : 'replace',
    // The subject boundary must survive the round trip: dropping it would make every restored
    // streamed follow-up (render mode 'replace') fall back to the mode boundary and re-split
    // the session rail into one chapter per turn — the exact bug topicShift exists to fix.
    ...(typeof o.topicShift === 'boolean' ? { topicShift: o.topicShift } : {}),
    tour: coerceTour(o.tour, o.spec.blocks.length),
    spec: o.spec,
    at: typeof o.at === 'number' && Number.isFinite(o.at) ? o.at : 0,
    ...(mind ? { mind } : {}),
  };
  // Normalize pre-ID sessions once at the persistence boundary. From here on selection and retained
  // audio never depend on a frame's current array position.
  frame.id = turnFrameId(frame);
  return frame;
}

/** The last known good session (independent of any particular "now" — TTL is applied at read
 *  time), or null once we're sure there's nothing to restore. Kept so `loadSession` can answer
 *  synchronously even though the on-disk copy is encrypted (Web Crypto is async-only). */
let cache: SavedSession | null = null;
/** True once `cache` reflects a DEFINITIVE answer — a save, an explicit clear, or the async
 *  hydrate below settling one way or the other — so a slow, late-arriving decrypt can't clobber
 *  a fresher save, and a settled "nothing here" doesn't retry crypto forever. */
let settled = false;
/** The prior session the hydrate found on disk, held for the page's lifetime. When a fresh
 *  conversation starts WITHOUT building on it (the mount decision lost the race to a slow
 *  decrypt), `saveSession` folds these turns in rather than losing them to the next write; a
 *  conversation that resumed normally already carries them in its own frames, which makes the
 *  fold a natural no-op. Kept separate from (and never overwritten by) `cache`, which every save
 *  updates, so a burst of saves racing the same hydrate all still know to fold it in — the first
 *  successful merge would otherwise erase `cache`'s memory of it and the very next save would
 *  silently drop it again. Cleared only by `clearSession()` (a deliberate fresh start has
 *  nothing to protect). */
let foreignPrior: SavedSession | null = null;
/** Bumped by clearSession. A save that arrived while the on-disk read was still in flight waits
 *  for that read before writing (see saveSession); if the user explicitly discards the session
 *  inside that window, the deferred save must die with it rather than resurrect what was just
 *  cleared. */
let clearGen = 0;
/** Bumped on every write attempt; a write only lands if it's still the latest by the time its
 *  encryption resolves, so two writes racing (a migrate vs. a real save, or two quick saves)
 *  can't land out of order and leave a stale copy on disk. */
let writeGen = 0;

/** Structural decode only — no JSON.parse, no TTL check (that's applied per-call in
 *  `loadSession`, since it depends on the caller's `now`). */
function decodeSession(parsed: unknown): SavedSession | null {
  const o = parsed as Record<string, unknown>;
  if (!o || typeof o !== 'object' || o.v !== 1) return null;
  if (typeof o.savedAt !== 'number' || !Number.isFinite(o.savedAt)) return null;
  if (!Array.isArray(o.frames)) return null;
  const frames = o.frames
    .map(coerceFrame)
    .filter((f): f is TurnFrame => f !== null)
    .slice(-SESSION_TURNS_CAP);
  if (!frames.length) return null;
  const history = (Array.isArray(o.history) ? o.history : [])
    .map(coerceMessage)
    .filter((m): m is ChatMessage => m !== null);
  return { v: 1, savedAt: o.savedAt, history, frames };
}

/** Write the encrypted blob to disk, but only if no newer write has started since — otherwise a
 *  slow migrate-write (or an earlier save) could resolve after a fresher one (or a clear) and
 *  clobber it. */
async function writeEncrypted(session: SavedSession): Promise<void> {
  const gen = ++writeGen;
  try {
    if (typeof localStorage === 'undefined') return;
    const enc = await encryptContent(session);
    if (gen !== writeGen) return; // a newer write (or a clear) has since started
    localStorage.setItem(SESSION_STORAGE_KEY, enc);
  } catch {
    /* storage full/unavailable — the session simply won't survive a reload */
  }
}

/** Synchronous read: legacy plaintext (or the crypto-unavailable fallback) parses directly as
 *  JSON — decode and re-encrypt it right away. Real ciphertext isn't valid JSON, so this yields
 *  nothing; hydrateAsync below decrypts it moments later. */
function readSyncFallback(): SavedSession | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const session = decodeSession(JSON.parse(raw));
    if (session) void writeEncrypted(session);
    return session;
  } catch {
    return null;
  }
}

/** The one authoritative read of what's on disk. Kicked off eagerly at module load (see the
 *  file header) and again from `loadSession` while nothing has settled yet; a no-op once
 *  anything definitive has happened (a save, a clear, or an earlier completion). Its completion
 *  ALWAYS settles the store — plaintext decodes synchronously, ciphertext after the decrypt,
 *  nothing-stored and unreadable both settle as "no session" — so anything awaiting it (the
 *  deferred first save) is guaranteed a settled store when it resumes. */
let hydrating: Promise<void> | null = null;
function hydrateAsync(): Promise<void> {
  if (settled) return Promise.resolve();
  if (hydrating) return hydrating;
  hydrating = (async () => {
    try {
      if (typeof localStorage === 'undefined') return;
      const raw = localStorage.getItem(SESSION_STORAGE_KEY);
      if (!raw) return;
      let session: SavedSession | null;
      let migrate = false;
      try {
        // Legacy plaintext (or the crypto-unavailable fallback) parses directly; re-encrypt it
        // once read, exactly like readSyncFallback's migrate-on-read. Decoding it here — not
        // just detecting it — keeps this read's conclusion complete, so `settled` below is
        // always the whole truth.
        session = decodeSession(JSON.parse(raw));
        migrate = session !== null;
      } catch {
        session = decodeSession(await decryptContent(raw)); // real ciphertext
      }
      if (settled) return; // a save/clear landed while we awaited decryption — it wins
      cache = session;
      if (session) {
        // Nothing (sync mount, a save, a clear) had accounted for this session when the read
        // concluded. Remember it separately so a conversation that started without it folds it
        // in instead of overwriting it unseen (see foreignPrior and saveSession).
        foreignPrior = session;
        if (migrate) void writeEncrypted(session);
      }
    } catch {
      /* genuinely undecryptable (corrupt, or the device key rotated) — nothing to restore */
    } finally {
      // EVERY completion is definitive: a session was found, nothing was stored, or the blob is
      // unreadable. Leaving `settled` false on ANY path would strand saveSession's
      // wait-then-retry in an endless resolved-promise chain — microtasks never yield to the
      // event loop, so that "wait" once froze the whole tab on the first save of a fresh device.
      settled = true;
      hydrating = null;
    }
  })();
  return hydrating;
}
void hydrateAsync();

/**
 * Persist the in-progress conversation (call after each settled turn). Caps the stored turns,
 * strips heavy inline data, sheds oldest frames if over budget, and gives up silently rather
 * than throwing — continuity is a convenience, never allowed to break a turn.
 */
export function saveSession(
  history: ChatMessage[],
  frames: TurnFrame[],
  now: number = Date.now(),
): void {
  // The very first save of a fresh page load can arrive before we've ever confirmed what's
  // already on disk — real content is encrypted, so `loadSession`'s synchronous read can only
  // answer "nothing here YET" while the async decrypt is still in flight (see the file header).
  // On a slow device, or right after a crash-triggered reload, that race is easy to lose: the
  // mount decision shows the wizard instead of resuming, the user starts what looks like a fresh
  // conversation, and without this guard THIS write would blindly overwrite the still-good prior
  // session the moment it lands. Finish the read first, then decide. The retry is bounded by
  // construction: hydrateAsync marks the store settled on EVERY completion path (and the retry
  // restates it), so the re-entry always takes the settled branch — it can never chain into the
  // event-loop-starving promise loop that once froze the tab.
  if (!settled) {
    const clears = clearGen;
    void hydrateAsync().then(() => {
      // An explicit clear while this save waited is the user discarding the conversation —
      // honour it rather than resurrecting the frames captured before the clear.
      if (clears !== clearGen) return;
      settled = true;
      saveSession(history, frames, now);
    });
    return;
  }
  try {
    if (typeof localStorage === 'undefined') return;
    if (!frames.length) {
      clearSession();
      return;
    }
    // A foreignPrior session (see its own comment) that these frames DON'T already build on means
    // this conversation started without seeing it — the "wizard raced ahead of a slow decrypt"
    // case, not an ordinary continuation — so merge the old turns in rather than let them fall
    // out of storage. An ordinary resume carries the old frames forward inside `frames` itself,
    // which makes the merge a natural no-op there. Two deliberate details: it checks
    // `foreignPrior`, not the (mutable, every-save-updated) `cache` — otherwise the FIRST merge
    // would erase the distinction and the very next save would drop the old turns right back
    // out — and it honours the TTL, because a session `loadSession` itself would refuse to
    // restore must not be resurrected into a brand-new conversation either.
    const prior =
      foreignPrior && now - foreignPrior.savedAt <= SESSION_TTL_MS ? foreignPrior : null;
    const priorLast = prior?.frames.length ? prior.frames[prior.frames.length - 1] : null;
    const priorUnrelated = !!priorLast && !frames.some((f) => f.at === priorLast.at);
    const incomingFrames = priorUnrelated ? [...prior!.frames, ...frames] : frames;
    const incomingHistory = priorUnrelated ? [...prior!.history, ...history] : history;
    // Run straight through the same coercion a disk read applies (coerceFrame/coerceMessage) —
    // dropping a stale/out-of-range mark, laundering a legacy synthetic prompt into its friendly
    // label — so an in-memory cache HIT (this same session, later in the page's life) can never
    // see less-sanitized data than a genuine reload would. Before this, only the disk round-trip
    // ran that coercion; saveSession's own cache write skipped it entirely.
    let lean = stripHeavy(incomingFrames.slice(-SESSION_TURNS_CAP))
      .map(coerceFrame)
      .filter((f): f is TurnFrame => f !== null);
    // The history pairs with the kept turns: cap to the same number of user+assistant pairs.
    const leanHistory = incomingHistory
      .slice(-SESSION_TURNS_CAP * 2)
      .map(coerceMessage)
      .filter((m): m is ChatMessage => m !== null);
    let session: SavedSession = { v: 1, savedAt: now, history: leanHistory, frames: lean };
    let raw = JSON.stringify(session); // sizing probe only — the actual write is encrypted below
    // Over budget: shed oldest frames until it fits — the latest canvas matters most.
    while (raw.length > MAX_SESSION_BYTES && lean.length > 1) {
      lean = lean.slice(1);
      session = { ...session, frames: lean };
      raw = JSON.stringify(session);
    }
    if (raw.length > MAX_SESSION_BYTES) return; // even one frame is too big — skip, don't risk the quota
    cache = session;
    settled = true;
    void writeEncrypted(session);
  } catch {
    /* storage full/unavailable — the session simply won't survive a reload */
  }
}

/**
 * Resolve once the one authoritative disk read has concluded (see hydrateAsync), capped so a
 * wedged IndexedDB/WebCrypto can never hold the boot hostage. The live route awaits this before
 * mounting, because the mount decision itself is synchronous: without the wait, "resume or
 * wizard" was a race between React's first render and the content decrypt — and in a production
 * bundle the render wins on EVERY machine, so a stored conversation looked like a fresh start on
 * every reload. Past the cap the mount proceeds unsettled and the old behavior applies: the
 * wizard shows once, and the foreignPrior merge in saveSession keeps the data safe regardless.
 */
export function whenSessionSettled(capMs = 1200): Promise<void> {
  if (settled) return Promise.resolve();
  return Promise.race([
    hydrateAsync(),
    new Promise<void>((resolve) => setTimeout(resolve, capMs)),
  ]).then(() => undefined);
}

/**
 * The session to restore, or null when there's nothing recent to resume: nothing stored, a
 * stale session (older than the TTL), or anything corrupt / from an old schema. The null path
 * IS today's behavior (the wizard) — restoring must never crash on bad localStorage.
 */
export function loadSession(now: number = Date.now()): SavedSession | null {
  const session = cache ?? readSyncFallback();
  if (session && !cache) {
    // A fresh synchronous read just found a real, decodable session (legacy plaintext, or the
    // crypto-unavailable fallback) — remember it so later calls see it without re-parsing.
    cache = session;
    settled = true;
  }
  if (!session) {
    void hydrateAsync(); // maybe it's real ciphertext arriving late — worth a try for a LATER call
    return null;
  }
  if (now - session.savedAt > SESSION_TTL_MS) return null;
  return session;
}

/**
 * Is there a stored session on this device at all? Cheaper than {@link loadSession} (no decode, no
 * decrypt) and safe anywhere — a device with storage walled off (private mode, an embedded frame)
 * throws on the bare `localStorage` access itself, which is exactly the kind of throw that escapes a
 * render or an effect and takes the whole surface to the error boundary. Callers that only need the
 * yes/no (the morning brief, the "back to" target) use this instead of touching storage themselves.
 */
export function hasSavedSession(): boolean {
  if (cache) return true;
  try {
    return typeof localStorage !== 'undefined' && !!localStorage.getItem(SESSION_STORAGE_KEY);
  } catch {
    return false;
  }
}

/** Forget the persisted session — "+ New session", "Start over", and a deliberate fresh-start
 *  hand-off (a landing ask, a course lesson) that intentionally bypasses resuming are the
 *  explicit resets. */
export function clearSession(): void {
  cache = null;
  foreignPrior = null; // an explicit fresh start has nothing left to protect
  settled = true; // an explicit clear is definitive — a late hydrate must never resurrect it
  clearGen++; // a save still waiting on the disk read must die with the cleared conversation
  writeGen++; // supersede any write already in flight (a save, or a migrate-on-read)
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    /* storage unavailable */
  }
}
