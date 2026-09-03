// useLiveConfig.ts — the multi-provider Live config store + React hook for the
// dedicated Live surface. Framework-light: a localStorage-backed store (keeps a
// model + key PER provider, so switching providers doesn't lose your keys) plus a
// CustomEvent so any view re-reads on change. Derives the engine's ModelConfig.
//
// Security: API keys are the user's own (BYOK) and live client-side. When
// `rememberKey` is OFF, keys are kept ONLY in memory for the session and are never
// written to localStorage — the safer default for shared machines. An in-memory
// cache (`memory`) is the in-session source of truth so non-persisted keys survive
// re-reads within the session but vanish on reload.
//
// This is the v2 store for the separate src/live surface. The legacy 2-provider
// engine/liveConfig store still backs the (now superseded) in-App live path.
import { useEffect, useState } from 'react';
import { encryptSecret, decryptSecret } from './keyVault';
import type { ModelConfig, ProviderId } from '../types/mavea';
import { PROVIDERS, providerInfo } from './providers';
import { modelCanGenerate } from './providers/spendPolicy';
import type { LiveCaps } from './generateLive';
import type { SearchProviderId } from './search';
import type { SearchMode, QualityPref } from './generateLive';

export interface LiveConfigV2 {
  provider: ProviderId;
  /** Selected model per provider (falls back to the registry default). */
  models: Partial<Record<ProviderId, string>>;
  /** API key per hosted provider. Calls send it through the configured same-origin proxy to the
   *  selected provider; it is never included in config exports. */
  keys: Partial<Record<ProviderId, string>>;
  /** Remember keys in a separate encrypted device-local blob? Off → in-memory only. */
  rememberKey: boolean;
  /** Legacy on/off web-search flag — kept so old saved configs migrate; `searchMode` is the
   *  control the UI now uses (on → 'free'). */
  webSearch: boolean;
  /** How to ground answers in the live web: off / free Wikipedia / real-time provider
   *  grounding. The user's choice, each surfaced with its cost in the settings. */
  searchMode: SearchMode;
  /** Reasoning effort the user prefers (Fast cheapest → Thorough deepest). */
  quality: QualityPref;
  /** Which search backend to use (free default: keyless Wikipedia). */
  searchProvider: SearchProviderId;
  /** Key per keyed search backend (Brave/Tavily); kept off-disk when rememberKey is off. */
  searchKeys: Partial<Record<SearchProviderId, string>>;
  /** Remember durable facts about the user across sessions and use them to personalize
   *  future answers. Off by default; facts are stored locally and are fully user-managed. */
  memoryEnabled: boolean;
  /** Automatically save any flashcards an answer produces to your study deck. Off by default —
   *  the primary path is tapping "Cards" on a block — but power users can opt in. When on, each
   *  auto-save still shows a visible pill (never silent). */
  autoSaveFlashcards: boolean;
  /** Let Mavéa compose NEW visuals on the fly when nothing in the library fits (the
   *  generative diagram/composite family). On by default; disabling it removes those contracts
   *  from the model menu. */
  generativeBlocks: boolean;
  /** Build a living world for a causal ask — a standing, explorable causal web the conversation
   *  keeps alive and follow-ups evolve. On by default; the model call behind a world runs only
   *  when a reader opens one, so an unopened offer costs nothing. */
  worldEnabled: boolean;
  /** Keep a local library of the canvases you generate, so you can pick any one back up later.
   *  On by default; stored only in this browser and fully user-managed. */
  libraryEnabled: boolean;
  /** Teach mode: Mavéa draws on the canvas — circling, underlining, pointing — at every
   *  walkthrough stop, not only when a stop deliberately calls out one datum. Off by
   *  default so the pen stays purposeful rather than constant. Saying "teach me" /
   *  "walk me through" turns it on for that turn regardless. */
  teachMode: boolean;
  /** Let Mavéa draw gestures while it talks — circling, underlining, pointing at chart
   *  elements in sync with its voice. On by default. The gesture track logs each stroke
   *  with a timestamp so you can see exactly what Mavéa highlighted and when. */
  annotationsEnabled: boolean;
  /** Greet you with a proactive "morning brief" on the first open of the day — a quick read on
   *  the things you track. OFF by default: it otherwise appeared unprompted as the first turn of a
   *  conversation, which read as confusing and bled into the session you actually started. When you
   *  want it, this opts you in. */
  morningBrief: boolean;
  /** Explanation level: 'standard' (default), 'simple', or 'deep'. 'simple' makes BOTH the
   *  words and the visuals plainer — short sentences, everyday analogies, fewer/simpler diagram
   *  blocks, more captions. 'deep' is the full-rigor treatment — mechanisms, numbers, edge
   *  cases. Switchable in settings or by voice ("explain like I'm 5" / "go deeper"). */
  explainLevel: 'standard' | 'simple' | 'deep';
  /** Reading text size across canvas answers — a Kindle-style scale over the fluid `--fs-*` type
   *  ramp and card body copy. 'normal' (default) is untouched; 'smaller'/'larger' shrink or bump
   *  both the floor and ceiling of the ramp via `--fs-reader` (see wow-polish.css) so it stays
   *  readable even in a narrow tiled card. Purely a display setting — never sent to the model. */
  fontScale: 'smaller' | 'normal' | 'larger';
  /** The keyboard key to hold for push-to-talk in tap mode. KeyboardEvent.key value.
   *  Defaults to 'Alt' (⌥ on Mac, Alt on Windows/Linux). */
  pttKey: string;
  /** Which physical side of the hold-to-talk key counts. 'any' accepts either; 'left'/'right'
   *  pin it to one side (e.g. only Right Ctrl) so the other side stays free for shortcuts. */
  pttSide: PttSide;
  /** How fast Mavéa speaks, 0.75×–2× (default 1×). Applied model-side so the voice stays natural
   *  at every speed; the replay scrubber reads the same value. */
  voiceSpeed: number;
}

export type PttSide = 'any' | 'left' | 'right';

const STORAGE_KEY = 'mavea-live-v2';
// Secrets (API keys) live in a SEPARATE, encrypted blob — never plaintext in the main config.
const SECRETS_KEY = 'mavea-live-v2:secrets';
export const LIVE_V2_EVENT = STORAGE_KEY;
export const SECRET_PERSISTENCE_EVENT = `${STORAGE_KEY}:secret-persistence`;
const MAX_CONFIG_IMPORT_BYTES = 250_000;
const MAX_CONFIG_VALUE_LENGTH = 512;

const DEFAULT: LiveConfigV2 = {
  provider: 'gemini',
  models: {},
  keys: {},
  // Off by default: a BYOK key is a secret, so it stays in memory for the session and is
  // never written to localStorage until the user opts in — the safer default for shared
  // machines (see the security note at the top of this file).
  rememberKey: false,
  webSearch: false,
  searchMode: 'off',
  quality: 'balanced',
  searchProvider: 'wikipedia',
  searchKeys: {},
  memoryEnabled: false,
  autoSaveFlashcards: false,
  generativeBlocks: true,
  // On by default: OFFERING a world costs nothing — the card carries only what the turn already
  // knew, and the single model call behind it runs when a reader opens one. An opt-in default was
  // right while the explode rode along with every causal turn; keeping it after that changed only
  // hid the feature from the people who would never think to go looking for it in settings.
  worldEnabled: true,
  libraryEnabled: true,
  teachMode: false,
  annotationsEnabled: true,
  morningBrief: false,
  explainLevel: 'standard',
  fontScale: 'normal',
  pttKey: 'Alt',
  pttSide: 'any',
  voiceSpeed: 1,
};

function coercePttSide(v: unknown): PttSide {
  return v === 'left' || v === 'right' ? v : 'any';
}

// In-session source of truth. Holds the FULL config (incl. keys even when they are
// not persisted), so re-reads within a session don't drop a non-remembered key.
let memory: LiveConfigV2 | null = null;

// Unknown ids fall back to the default — this is also the migration path for a saved
// config naming a provider that has since been removed (e.g. the old local Ollama).
function coerceProvider(v: unknown): ProviderId {
  return PROVIDERS.some((p) => p.id === v) ? (v as ProviderId) : DEFAULT.provider;
}
function coerceMap(v: unknown): Partial<Record<ProviderId, string>> {
  const out: Partial<Record<ProviderId, string>> = {};
  if (v && typeof v === 'object') {
    for (const p of PROVIDERS) {
      const val = (v as Record<string, unknown>)[p.id];
      if (typeof val === 'string' && val.length <= MAX_CONFIG_VALUE_LENGTH) out[p.id] = val;
    }
  }
  return out;
}
function coerceBool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
}
/** Clamp a stored/imported voice speed into the supported 0.75×–2× span, else the 1× default. */
function coerceSpeed(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v)
    ? Math.min(2, Math.max(0.75, v))
    : DEFAULT.voiceSpeed;
}
function coerceSearch(v: unknown): SearchProviderId {
  return v === 'wikipedia' || v === 'brave' || v === 'tavily' ? v : DEFAULT.searchProvider;
}
function coerceSearchMode(v: unknown): SearchMode | undefined {
  return v === 'off' || v === 'realtime' ? v : undefined;
}
function coerceQuality(v: unknown): QualityPref {
  return v === 'fast' || v === 'balanced' || v === 'thorough' ? v : DEFAULT.quality;
}
function coerceExplainLevel(v: unknown): LiveConfigV2['explainLevel'] {
  return v === 'simple' || v === 'deep' ? v : DEFAULT.explainLevel;
}
function coerceFontScale(v: unknown): LiveConfigV2['fontScale'] {
  return v === 'smaller' || v === 'larger' ? v : DEFAULT.fontScale;
}
function coerceSearchKeys(v: unknown): Partial<Record<SearchProviderId, string>> {
  const out: Partial<Record<SearchProviderId, string>> = {};
  if (v && typeof v === 'object') {
    for (const id of ['brave', 'tavily'] as const) {
      const val = (v as Record<string, unknown>)[id];
      if (typeof val === 'string' && val.length <= MAX_CONFIG_VALUE_LENGTH) out[id] = val;
    }
  }
  return out;
}

function fromStorage(): LiveConfigV2 {
  try {
    if (typeof localStorage === 'undefined') return { ...DEFAULT };
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT };
    const o = JSON.parse(raw) as Record<string, unknown>;
    const webSearch = coerceBool(o.webSearch, DEFAULT.webSearch);
    // Migrate a saved config from before Real-time went native-only: an explicit legacy 'free'
    // choice drops to 'off' (conservative — don't silently switch a Wikipedia-grounded user onto
    // a mode that may now do nothing for their provider); a config from before `searchMode`
    // existed at all (only the boolean `webSearch` flag, so o.searchMode is undefined) maps
    // on → 'realtime', off → 'off'.
    const searchMode =
      coerceSearchMode(o.searchMode) ??
      (o.searchMode === undefined && webSearch ? 'realtime' : 'off');
    return {
      provider: coerceProvider(o.provider),
      models: coerceMap(o.models),
      keys: coerceMap(o.keys),
      rememberKey: coerceBool(o.rememberKey, DEFAULT.rememberKey),
      webSearch,
      searchMode,
      quality: coerceQuality(o.quality),
      searchProvider: coerceSearch(o.searchProvider),
      searchKeys: coerceSearchKeys(o.searchKeys),
      memoryEnabled: coerceBool(o.memoryEnabled, DEFAULT.memoryEnabled),
      autoSaveFlashcards: coerceBool(o.autoSaveFlashcards, DEFAULT.autoSaveFlashcards),
      generativeBlocks: coerceBool(o.generativeBlocks, DEFAULT.generativeBlocks),
      worldEnabled: coerceBool(o.worldEnabled, DEFAULT.worldEnabled),
      libraryEnabled: coerceBool(o.libraryEnabled, DEFAULT.libraryEnabled),
      teachMode: coerceBool(o.teachMode, DEFAULT.teachMode),
      annotationsEnabled: coerceBool(o.annotationsEnabled, DEFAULT.annotationsEnabled),
      morningBrief: coerceBool(o.morningBrief, DEFAULT.morningBrief),
      explainLevel: coerceExplainLevel(o.explainLevel),
      fontScale: coerceFontScale(o.fontScale),
      pttKey: typeof o.pttKey === 'string' && o.pttKey ? o.pttKey : DEFAULT.pttKey,
      pttSide: coercePttSide(o.pttSide),
      voiceSpeed: coerceSpeed(o.voiceSpeed),
    };
  } catch {
    return { ...DEFAULT };
  }
}

export function getLiveConfigV2(): LiveConfigV2 {
  if (memory) return memory;
  memory = fromStorage();
  return memory;
}

function broadcast(cfg: LiveConfigV2): void {
  try {
    if (typeof window !== 'undefined' && typeof CustomEvent === 'function') {
      window.dispatchEvent(new CustomEvent(STORAGE_KEY, { detail: cfg }));
    }
  } catch {
    /* no window (test/SSR) */
  }
}

/** True when the config carries any secret (provider or search key). */
function hasSecrets(c: LiveConfigV2): boolean {
  return Object.keys(c.keys).length > 0 || Object.keys(c.searchKeys).length > 0;
}

// Bumped on every persistSecrets call; an encryption in flight only lands if it's still the
// latest by the time it resolves — otherwise a fast follow-up (e.g. the next keystroke while
// typing a key, or flipping "remember" back off) could land AFTER it and get silently
// overwritten by the stale, slower write once its encryption finally finishes.
let secretsWriteGen = 0;

// True once the on-disk secrets blob (if any) has been read into memory by hydrateSecrets — set
// on every exit path (found real secrets, found nothing, or failed to decrypt). Until then, the
// in-memory keys/searchKeys are UNKNOWN, not "empty by the user's choice": the main config blob
// never carries them (persistSecrets always strips them before writing it), so right after a
// fresh load `hasSecrets()` reads false even when the user has real remembered keys still
// sitting encrypted on disk. Guards persistSecrets below from reading that gap as "the user has
// no secrets" and deleting the real blob out from under the still-in-flight hydrate.
let secretsHydrated = false;

export type SecretPersistenceStatus =
  'not-requested' | 'pending' | 'persisted' | 'session-only' | 'unavailable';

let secretPersistenceStatus: SecretPersistenceStatus = 'not-requested';
let secretPersistenceTask: Promise<void> = Promise.resolve();
// The INITIAL read-back, kept apart from secretPersistenceTask (which every setLiveConfigV2 call
// reassigns to its own write). Callers that must not act on a half-restored config await this one.
let secretsHydrateTask: Promise<void> = Promise.resolve();

/** Resolves once remembered keys have been decrypted back into memory — or once we know there are
 *  none to decrypt. Awaiting it before reading a key is the difference between a turn that runs and
 *  one that sends an empty `Authorization` header and comes back 400 "API key not valid", which the
 *  user then fixes by pressing send a second time. Already-resolved after the first turn, so this
 *  costs a microtask and nothing else. */
export function secretsReady(): Promise<void> {
  return secretsHydrateTask;
}

function reportSecretPersistence(status: SecretPersistenceStatus): void {
  secretPersistenceStatus = status;
  try {
    if (typeof window !== 'undefined' && typeof CustomEvent === 'function') {
      window.dispatchEvent(new CustomEvent(SECRET_PERSISTENCE_EVENT, { detail: status }));
    }
  } catch {
    /* no window (test/SSR) */
  }
}

/** The truthful state of encrypted credential storage. `session-only` means the requested disk
 *  write failed but the current in-memory keys remain usable; `unavailable` means a saved blob
 *  could not be restored. */
export function getSecretPersistenceStatus(): SecretPersistenceStatus {
  return secretPersistenceStatus;
}

/** Wait for the latest requested secret write/read before displaying its persistence status. */
export async function whenSecretPersistenceSettled(): Promise<SecretPersistenceStatus> {
  await secretPersistenceTask;
  return secretPersistenceStatus;
}

// Persist the secrets to their own ENCRYPTED blob (never plaintext in the main config). When the
// user hasn't opted into "remember", or crypto is unavailable, nothing is written to disk and the
// keys stay in memory for the session only — we never fall back to writing them in the clear.
async function persistSecrets(c: LiveConfigV2): Promise<void> {
  const gen = ++secretsWriteGen;
  if (typeof localStorage === 'undefined') {
    reportSecretPersistence(c.rememberKey && hasSecrets(c) ? 'session-only' : 'not-requested');
    return;
  }
  if (!c.rememberKey || !hasSecrets(c)) {
    // An unrelated write (any setLiveConfigV2 call touches this) landing before hydrateSecrets
    // has loaded the real keys must not treat that not-yet-loaded state as "nothing to remember"
    // and wipe the actual on-disk secrets — only a genuine "remember is off" is honored early.
    if (c.rememberKey && !secretsHydrated) {
      reportSecretPersistence('pending');
      return;
    }
    try {
      localStorage.removeItem(SECRETS_KEY);
    } catch {
      /* ignore */
    }
    if (gen === secretsWriteGen) reportSecretPersistence('not-requested');
    return;
  }
  reportSecretPersistence('pending');
  try {
    const enc = await encryptSecret(JSON.stringify({ keys: c.keys, searchKeys: c.searchKeys }));
    if (gen !== secretsWriteGen) return; // a newer write (or a clear) has since started
    localStorage.setItem(SECRETS_KEY, enc);
    reportSecretPersistence('persisted');
  } catch {
    if (gen !== secretsWriteGen) return;
    // Crypto/IndexedDB unavailable → session-only; do NOT write plaintext as a fallback.
    try {
      localStorage.removeItem(SECRETS_KEY);
    } catch {
      /* ignore */
    }
    reportSecretPersistence('session-only');
  }
}

// Decrypt the secrets blob back into the in-memory config on startup. Async (Web Crypto), so it
// lands shortly after load and broadcasts — keys are read at turn time, long after, so the gap is
// invisible. A corrupt blob or rotated device key just yields no keys (the user re-enters them).
async function hydrateSecrets(): Promise<void> {
  if (typeof localStorage === 'undefined') {
    reportSecretPersistence('unavailable');
    return;
  }
  let enc: string | null;
  try {
    enc = localStorage.getItem(SECRETS_KEY);
  } catch {
    secretsHydrated = true;
    reportSecretPersistence('unavailable');
    return;
  }
  if (!enc) {
    secretsHydrated = true;
    reportSecretPersistence('not-requested');
    return;
  }
  // Snapshot the write generation before the async decrypt: if a real edit (setLiveConfigV2)
  // lands while we're decrypting, it already reflects the freshest keys — don't let this stale
  // read clobber it once decryption finally resolves.
  const gen = secretsWriteGen;
  try {
    const data = JSON.parse(await decryptSecret(enc)) as Record<string, unknown>;
    if (gen === secretsWriteGen) {
      const cur = getLiveConfigV2();
      memory = {
        ...cur,
        keys: { ...cur.keys, ...coerceMap(data.keys) },
        searchKeys: { ...cur.searchKeys, ...coerceSearchKeys(data.searchKeys) },
      };
      broadcast(memory);
      reportSecretPersistence('persisted');
    }
  } catch {
    if (gen === secretsWriteGen) reportSecretPersistence('unavailable');
  } finally {
    secretsHydrated = true;
  }
}

export function setLiveConfigV2(patch: Partial<LiveConfigV2>): LiveConfigV2 {
  const next: LiveConfigV2 = { ...getLiveConfigV2(), ...patch };
  memory = next;
  try {
    if (typeof localStorage !== 'undefined') {
      // Secrets NEVER touch the main blob in plaintext — they ride the encrypted SECRETS_KEY blob
      // (written by persistSecrets) only when the user opted into "remember". The in-memory `next`
      // still carries them for this session regardless.
      const persisted = { ...next, keys: {}, searchKeys: {} };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
      secretPersistenceTask = persistSecrets(next);
    } else {
      reportSecretPersistence(
        !next.rememberKey ? 'not-requested' : hasSecrets(next) ? 'session-only' : 'unavailable',
      );
    }
  } catch {
    // The in-memory config is still usable, but do not leave a stale "persisted" status visible.
    reportSecretPersistence(
      !next.rememberKey ? 'not-requested' : hasSecrets(next) ? 'session-only' : 'unavailable',
    );
  }
  broadcast(next);
  return next;
}

// One-time bridge on module load: migrate any legacy plaintext keys out of the main blob (a re-save
// strips them and writes the encrypted blob), otherwise decrypt the existing secrets blob.
function initSecrets(): void {
  if (typeof localStorage === 'undefined') {
    // No storage means no blob to restore: nothing is pending, and anyone awaiting readiness
    // should proceed immediately rather than wait for a hydrate that will never run.
    secretsHydrated = true;
    return;
  }
  const c = getLiveConfigV2();
  if (hasSecrets(c)) {
    // Legacy plaintext keys were just read from the old blob, synchronously — memory already
    // holds the real keys with no async gap to protect, so there's nothing left to hydrate.
    // Re-persist to strip them out of the main blob and write the encrypted secrets blob instead.
    secretsHydrated = true;
    setLiveConfigV2({});
  } else {
    secretsHydrateTask = hydrateSecrets();
    secretPersistenceTask = secretsHydrateTask;
  }
}
initSecrets();

/** Reset config to factory defaults — used by the setup wizard's "Start over" action. */
export function resetLiveConfig(): LiveConfigV2 {
  return setLiveConfigV2(DEFAULT);
}

/** Set the model/key for a specific provider without disturbing the others. */
export function setProviderField(
  provider: ProviderId,
  field: 'model' | 'key',
  value: string,
): LiveConfigV2 {
  const cur = getLiveConfigV2();
  const mapKey = field === 'model' ? 'models' : 'keys';
  return setLiveConfigV2({
    [mapKey]: { ...cur[mapKey], [provider]: value },
  } as Partial<LiveConfigV2>);
}

/** Derive the engine ModelConfig for the active provider. */
export function toModelConfig(c: LiveConfigV2): ModelConfig {
  return {
    provider: c.provider,
    model: c.models[c.provider] || providerInfo(c.provider).defaultModel,
    apiKey: c.keys[c.provider],
  };
}

/** A model is picked and, if the provider is hosted, a key is present. This is a synchronous,
 *  local check — NOT a network reachability probe (that's checkLiveReady) — so it's safe to call
 *  on every render. It exists to keep a returning visitor from silently walking into a doomed
 *  turn: the Go hub's "Start talking" gates on it rather than firing a request with no key. */
export function hasModelConfigured(c: LiveConfigV2): boolean {
  return modelCanGenerate(toModelConfig(c));
}

/**
 * Produce a JSON string snapshot of the current config suitable for backup.
 * API/search keys are always stripped. A normal settings backup must never become a portable
 * plaintext credential bundle merely because device-local encrypted remembering is enabled.
 * All other settings (provider choice, model, capabilities, etc.) are always
 * included so a round-trip restore works as expected.
 */
export function exportConfig(): string {
  const cfg = getLiveConfigV2();
  const snapshot = { ...cfg, keys: {}, searchKeys: {}, rememberKey: false };
  return JSON.stringify(snapshot, null, 2);
}

export type CredentialField = 'provider-api-keys' | 'search-api-keys' | 'github-token';

export interface ImportConfigOptions {
  /** Merge recognized fields onto today's config. Used by whole-install backups so fields added
   *  after an old backup was created are not reset to factory defaults. */
  mode?: 'replace' | 'merge';
  /** Whole-install backups are not a secret-management action, so they must not disable or clear
   *  credentials that already belong to this browser. */
  preserveSecretState?: boolean;
}

export interface ConfigImportSummary {
  config: LiveConfigV2;
  credentialsIgnored: CredentialField[];
  appliedFields: string[];
}

const IMPORTABLE_CONFIG_FIELDS = [
  'provider',
  'models',
  'webSearch',
  'searchMode',
  'quality',
  'searchProvider',
  'memoryEnabled',
  'autoSaveFlashcards',
  'generativeBlocks',
  'worldEnabled',
  'libraryEnabled',
  'teachMode',
  'annotationsEnabled',
  'morningBrief',
  'explainLevel',
  'fontScale',
  'pttKey',
  'pttSide',
  'voiceSpeed',
] as const;

function hasOwn(o: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(o, key);
}

function hasCredentialPayload(value: unknown): boolean {
  if (typeof value === 'string') return value.length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === 'object') return Object.keys(value).length > 0;
  return value !== undefined && value !== null;
}

/** Parse a settings file once, apply only recognized non-secret fields, and report credentials a
 *  crafted file tried to carry. Credentials are never imported; existing in-session credentials
 *  remain untouched so importing preferences cannot overwrite or exfiltrate them. */
export function importConfigWithSummary(
  json: string,
  options: ImportConfigOptions = {},
): ConfigImportSummary {
  const size =
    typeof TextEncoder === 'function' ? new TextEncoder().encode(json).byteLength : json.length * 2;
  if (size > MAX_CONFIG_IMPORT_BYTES) {
    throw new Error('Invalid config file — the settings object is too large.');
  }
  let imported: unknown;
  try {
    imported = JSON.parse(json);
  } catch {
    throw new Error('Invalid config file — could not parse JSON.');
  }
  if (!imported || typeof imported !== 'object' || Array.isArray(imported)) {
    throw new Error('Invalid config file — expected a settings object.');
  }

  const o = imported as Record<string, unknown>;
  if (Object.keys(o).length > 64) {
    throw new Error('Invalid config file — the settings object has too many fields.');
  }
  const current = getLiveConfigV2();
  const source: Record<string, unknown> = options.mode === 'merge' ? { ...current, ...o } : o;
  const webSearch = coerceBool(source.webSearch, DEFAULT.webSearch);
  const searchMode =
    coerceSearchMode(source.searchMode) ??
    (source.searchMode === undefined && webSearch ? 'realtime' : 'off');
  const parsed: LiveConfigV2 = {
    provider: coerceProvider(source.provider),
    models: coerceMap(source.models),
    // An imported file is preferences, never a credential transport.
    keys: current.keys,
    rememberKey: options.preserveSecretState === false ? false : current.rememberKey,
    webSearch,
    searchMode,
    quality: coerceQuality(source.quality),
    searchProvider: coerceSearch(source.searchProvider),
    searchKeys: current.searchKeys,
    memoryEnabled: coerceBool(source.memoryEnabled, DEFAULT.memoryEnabled),
    autoSaveFlashcards: coerceBool(source.autoSaveFlashcards, DEFAULT.autoSaveFlashcards),
    generativeBlocks: coerceBool(source.generativeBlocks, DEFAULT.generativeBlocks),
    worldEnabled: coerceBool(source.worldEnabled, DEFAULT.worldEnabled),
    libraryEnabled: coerceBool(source.libraryEnabled, DEFAULT.libraryEnabled),
    teachMode: coerceBool(source.teachMode, DEFAULT.teachMode),
    annotationsEnabled: coerceBool(source.annotationsEnabled, DEFAULT.annotationsEnabled),
    morningBrief: coerceBool(source.morningBrief, DEFAULT.morningBrief),
    explainLevel: coerceExplainLevel(source.explainLevel),
    fontScale: coerceFontScale(source.fontScale),
    pttKey:
      typeof source.pttKey === 'string' && source.pttKey.length > 0 && source.pttKey.length <= 32
        ? source.pttKey
        : DEFAULT.pttKey,
    pttSide: coercePttSide(source.pttSide),
    voiceSpeed: coerceSpeed(source.voiceSpeed),
  };

  const credentialsIgnored: CredentialField[] = [];
  if (hasOwn(o, 'keys') && hasCredentialPayload(o.keys)) {
    credentialsIgnored.push('provider-api-keys');
  }
  if (hasOwn(o, 'searchKeys') && hasCredentialPayload(o.searchKeys)) {
    credentialsIgnored.push('search-api-keys');
  }
  if (
    ['githubToken', 'github_token', 'ghToken'].some(
      (key) => hasOwn(o, key) && hasCredentialPayload(o[key]),
    )
  ) {
    credentialsIgnored.push('github-token');
  }

  return {
    config: setLiveConfigV2(parsed),
    credentialsIgnored,
    appliedFields: IMPORTABLE_CONFIG_FIELDS.filter((field) => hasOwn(o, field)),
  };
}

/**
 * Restore config from a previously exported JSON string.
 * Unknown / invalid fields are silently dropped by the same coercion path
 * used when reading from localStorage — so a file from an older version will
 * still import cleanly, filling any missing keys with defaults.
 */
export function importConfig(json: string, options?: ImportConfigOptions): LiveConfigV2 {
  return importConfigWithSummary(json, options).config;
}

/** Derive the per-turn Live capabilities (what generateLive needs). `searchProvider`/
 *  `searchKeys` are NOT forwarded: chat grounding is native-search-only (see LiveCaps), so the
 *  app-side Wikipedia/Brave/Tavily config exists only for the Dashboards number-resolver (which
 *  reads `c.searchProvider`/`c.searchKeys` directly, not through this seam). */
export function toCaps(c: LiveConfigV2): LiveCaps {
  return {
    // searchMode is the control; webSearch stays for any caller still reading the old flag.
    webSearch: c.searchMode !== 'off',
    searchMode: c.searchMode,
    quality: c.quality,
    memoryEnabled: c.memoryEnabled,
    generativeBlocks: c.generativeBlocks,
    worldEnabled: c.worldEnabled,
    explainLevel: c.explainLevel,
  };
}

/** React hook: the current config + a patch setter, re-reading on any change. */
export function useLiveConfig(): [LiveConfigV2, (patch: Partial<LiveConfigV2>) => void] {
  const [cfg, setCfg] = useState<LiveConfigV2>(() => getLiveConfigV2());
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onChange = () => setCfg(getLiveConfigV2());
    window.addEventListener(LIVE_V2_EVENT, onChange);
    // Re-sync immediately on subscribe: API keys are restored ASYNCHRONOUSLY (hydrateSecrets decrypts
    // from IndexedDB) and broadcast ONCE. If that broadcast fired between this hook's initial useState
    // and this listener registering, we'd otherwise hold a stale, key-less config forever — fine for
    // paths that re-read getLiveConfigV2() fresh (chat), but it left Prism / Watch Me Think calling
    // Gemini with an empty key (403). Reading the store here closes that race.
    onChange();
    return () => window.removeEventListener(LIVE_V2_EVENT, onChange);
  }, []);
  return [cfg, setLiveConfigV2];
}
