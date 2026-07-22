// dashboards/ledger.ts — the check ledger: an append-only, cross-dashboard log of every real check,
// insight, savings suggestion, alert, briefing, and goal event. This is the source of truth for
// "how many searches have we actually spent" (the daily budget derives its count from THIS, never a
// separate counter that could drift from the log the user sees) and for the check-log rail + Weekly
// Rewind. Same idiom as dashboards/store.ts: in-memory cache + encrypted localStorage + CustomEvent
// broadcast, coerce-on-read, never throws. Its own storage key so a check never rewrites the
// (larger, per-dashboard) dashboards blob.
import { encryptContent, decryptContent } from '../contentVault';
import type { DataCadenceMode } from './types';

const STORAGE_KEY = 'mavea-dash-ledger-v1';
export const LEDGER_EVENT = STORAGE_KEY;

/** Retention is BOTH time- and count-bounded — whichever is smaller wins on prune. A week covers
 *  the daily budget and Weekly Rewind; older entries are noise nobody reads. */
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 400;

export type LedgerKind = 'check' | 'insight' | 'savings' | 'alert' | 'briefing' | 'goal';

/** A cadence-optimizer suggestion riding a `savings`-kind entry. `savesPerMonth` is always an
 *  extrapolation from OBSERVED ledger counts (never a theoretical 24/7 rate) — see optimizer.ts. */
export interface LedgerSuggestion {
  action: 'set-cadence';
  dashboardId: string;
  to: DataCadenceMode;
  savesPerMonth: number;
  state: 'open' | 'applied' | 'dismissed';
}

export interface LedgerEntry {
  id: string;
  at: number;
  kind: LedgerKind;
  text: string;
  /** Empty for a cross-cutting entry (e.g. a budget pause) that isn't about one dashboard. */
  dashboardIds: string[];
  /** Source hostnames, for the check-log rail's "finance.yahoo.com" footer. */
  domains?: string[];
  /** Grounded web-search CALLS this entry represents — the budget's countable unit. Some providers
   *  bill more than one internal query per call (Anthropic's server tool allows up to 5); this is
   *  deliberately call-count, not a true per-provider search count, so the budget stays uniform
   *  across providers. */
  searches: 0 | 1;
  /** Drives the "2 SOURCES" chip when a check cross-referenced more than one source. */
  sourceCount?: number;
  /** A user-triggered action (manual refresh, a static-fact answer) — exempt from the budget cap. */
  manual?: boolean;
  suggestion?: LedgerSuggestion;
}

let idSeq = 0;
function newLedgerId(): string {
  try {
    const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
    if (c?.randomUUID) return c.randomUUID();
  } catch {
    /* no crypto */
  }
  idSeq += 1;
  return `led-${idSeq.toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}

function isObj(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object';
}
function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}
function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}
function strArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

const KINDS = new Set<string>(['check', 'insight', 'savings', 'alert', 'briefing', 'goal']);

function coerceSuggestion(v: unknown): LedgerSuggestion | undefined {
  if (!isObj(v) || v.action !== 'set-cadence') return undefined;
  const dashboardId = str(v.dashboardId);
  if (!dashboardId || typeof v.to !== 'string') return undefined;
  const state = v.state === 'applied' || v.state === 'dismissed' ? v.state : 'open';
  return {
    action: 'set-cadence',
    dashboardId,
    to: v.to as DataCadenceMode,
    savesPerMonth: Math.max(0, num(v.savesPerMonth, 0)),
    state,
  };
}

function coerceEntry(v: unknown): LedgerEntry | null {
  if (!isObj(v)) return null;
  const id = str(v.id);
  const at = v.at;
  if (
    !id ||
    typeof v.kind !== 'string' ||
    !KINDS.has(v.kind) ||
    typeof at !== 'number' ||
    !Number.isFinite(at)
  ) {
    return null;
  }
  const suggestion = coerceSuggestion(v.suggestion);
  const domains = strArray(v.domains);
  return {
    id,
    at,
    kind: v.kind as LedgerKind,
    text: str(v.text),
    dashboardIds: strArray(v.dashboardIds),
    ...(domains.length ? { domains } : {}),
    searches: v.searches === 1 ? 1 : 0,
    ...(typeof v.sourceCount === 'number' && Number.isFinite(v.sourceCount)
      ? { sourceCount: v.sourceCount }
      : {}),
    ...(v.manual === true ? { manual: true } : {}),
    ...(suggestion ? { suggestion } : {}),
  };
}

/** Keep entries within BOTH bounds. Entries are stored oldest-first (append-only), so the count
 *  cap keeps the tail — the most recent MAX_ENTRIES. */
function prune(entries: LedgerEntry[], now: number): LedgerEntry[] {
  const cutoff = now - RETENTION_MS;
  const kept = entries.filter((e) => e.at >= cutoff);
  return kept.length > MAX_ENTRIES ? kept.slice(-MAX_ENTRIES) : kept;
}

function decode(parsed: unknown): LedgerEntry[] {
  if (!Array.isArray(parsed)) return [];
  return parsed.map(coerceEntry).filter((e): e is LedgerEntry => e !== null);
}

let cache: LedgerEntry[] | null = null;
let settled = false;
let writeGen = 0;

async function writeEncrypted(entries: LedgerEntry[]): Promise<void> {
  const gen = ++writeGen;
  try {
    if (typeof localStorage === 'undefined') return;
    const enc = await encryptContent(entries);
    if (gen !== writeGen) return;
    localStorage.setItem(STORAGE_KEY, enc);
  } catch {
    /* quota / private mode — the ledger keeps working off the in-memory cache */
  }
}

function fromStorage(): LedgerEntry[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const entries = decode(JSON.parse(raw));
    if (entries.length) void writeEncrypted(entries);
    return entries;
  } catch {
    return [];
  }
}

async function hydrateAsync(): Promise<void> {
  try {
    if (typeof localStorage === 'undefined') return;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
      JSON.parse(raw);
      return; // plain JSON — the synchronous fast path already covered this
    } catch {
      /* not plain JSON — try decrypting it below */
    }
    const entries = decode(await decryptContent(raw));
    if (settled) return;
    cache = entries;
    settled = true;
    if (typeof window !== 'undefined' && typeof CustomEvent === 'function') {
      window.dispatchEvent(new CustomEvent(LEDGER_EVENT, { detail: entries }));
    }
  } catch {
    /* corrupt, or this device's content key was rotated/cleared — not restored */
  }
}
void hydrateAsync();

function get(): LedgerEntry[] {
  cache ??= fromStorage();
  return cache;
}

export function invalidate(): void {
  cache = null;
  settled = false;
  void hydrateAsync();
}

function persist(next: LedgerEntry[]): void {
  const clean = decode(next);
  cache = clean;
  settled = true;
  void writeEncrypted(clean);
  try {
    if (typeof window !== 'undefined' && typeof CustomEvent === 'function') {
      window.dispatchEvent(new CustomEvent(LEDGER_EVENT, { detail: clean }));
    }
  } catch {
    /* non-browser env */
  }
}

// getLedger is a useSyncExternalStore snapshot — memoize the reverse so unchanged renders keep the
// same array reference (see store.ts's getDashboards for the same reasoning).
let reversedSnapshot: LedgerEntry[] | null = null;
let reversedFrom: LedgerEntry[] | null = null;

/** Every entry, newest-first. */
export function getLedger(): LedgerEntry[] {
  const c = get();
  if (reversedFrom !== c || reversedSnapshot === null) {
    reversedSnapshot = [...c].reverse();
    reversedFrom = c;
  }
  return reversedSnapshot;
}

/** Record one ledger entry. Returns the entry actually stored (with its assigned id/at). */
export function appendLedger(e: Omit<LedgerEntry, 'id' | 'at'> & { at?: number }): LedgerEntry {
  const now = e.at ?? Date.now();
  const { at: _at, ...rest } = e;
  const entry: LedgerEntry = { ...rest, id: newLedgerId(), at: now };
  persist(prune([...get(), entry], now));
  return entry;
}

/** Move an optimizer suggestion to 'applied' or 'dismissed'. No-op if the entry or its suggestion
 *  is gone (already pruned, or never had one). */
export function setSuggestionState(entryId: string, state: 'applied' | 'dismissed'): void {
  const next = get().map((e) =>
    e.id === entryId && e.suggestion ? { ...e, suggestion: { ...e.suggestion, state } } : e,
  );
  persist(next);
}

export function clearLedger(): void {
  if (get().length > 0) persist([]);
}

function localMidnight(now: number): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Total search CALLS since local midnight — the budget meter's count. Includes manual calls (the
 *  meter is honest about total spend even when it reads over cap), but callers deciding whether to
 *  GATE auto-work should check `manual` separately (see budget.ts). */
export function searchesToday(entries: LedgerEntry[], now: number): number {
  const cutoff = localMidnight(now);
  return entries.filter((e) => e.at >= cutoff).reduce((sum, e) => sum + e.searches, 0);
}

/** How many real checks a specific dashboard has had in the last 7 days — the optimizer's "you
 *  check this often" basis. */
export function checksThisWeek(entries: LedgerEntry[], dashboardId: string, now: number): number {
  const cutoff = now - 7 * 24 * 60 * 60 * 1000;
  return entries.filter(
    (e) => e.at >= cutoff && e.kind === 'check' && e.dashboardIds.includes(dashboardId),
  ).length;
}

export interface WeeklyRewind {
  totalSearches: number;
  /** 7 entries, oldest day first, ISO date + that day's search count. */
  byDay: { date: string; searches: number }[];
  /** The week's most notable entry — a goal event, else whichever check cross-referenced the most
   *  sources, else null when nothing qualifies. */
  topMoment: LedgerEntry | null;
  /** Sum of `savesPerMonth` across suggestions APPLIED this week — an honest rate estimate from
   *  real cadence changes, never a literal "searches saved" count. */
  estSavedPerMonth: number;
}

/** Pure, zero-cost derivation of the whole Weekly Rewind from the ledger — every slide is real,
 *  already-paid-for history, never a fresh call. */
export function weeklyRewind(entries: LedgerEntry[], now: number): WeeklyRewind {
  const cutoff = now - 7 * 24 * 60 * 60 * 1000;
  const recent = entries.filter((e) => e.at >= cutoff);
  const midnight = localMidnight(now);
  const byDay: { date: string; searches: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const dayStart = midnight - i * 24 * 60 * 60 * 1000;
    const dayEnd = dayStart + 24 * 60 * 60 * 1000;
    byDay.push({
      date: new Date(dayStart).toISOString().slice(0, 10),
      searches: recent
        .filter((e) => e.at >= dayStart && e.at < dayEnd)
        .reduce((sum, e) => sum + e.searches, 0),
    });
  }
  const totalSearches = recent.reduce((sum, e) => sum + e.searches, 0);
  const topMoment =
    recent.find((e) => e.kind === 'goal') ??
    [...recent].sort((a, b) => (b.sourceCount ?? 0) - (a.sourceCount ?? 0))[0] ??
    null;
  const estSavedPerMonth = recent
    .filter((e) => e.suggestion?.state === 'applied')
    .reduce((sum, e) => sum + (e.suggestion?.savesPerMonth ?? 0), 0);
  return { totalSearches, byDay, topMoment, estSavedPerMonth };
}
