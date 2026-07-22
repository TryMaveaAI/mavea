// dashboards/budget.ts — the daily search budget: a plain, honest cap on AUTOMATIC search spend.
// The count is DERIVED from the check ledger (never a second counter), so it can never drift from
// the log the user can actually read. Settings here are plaintext (numbers/booleans only, nothing
// sensitive) — the usual localStorage+CustomEvent idiom, not the encrypted-content one.
import { useSyncExternalStore } from 'react';
import { searchesToday } from './ledger';
import type { LedgerEntry } from './ledger';

const STORAGE_KEY = 'mavea-dash-settings-v1';
export const DASH_SETTINGS_EVENT = STORAGE_KEY;

export const MIN_DAILY_BUDGET = 5;
export const MAX_DAILY_BUDGET = 200;
export const DEFAULT_DAILY_BUDGET = 40;

export interface DashSettings {
  dailySearchBudget: number;
  briefingEnabled: boolean;
  briefingSpoken: boolean;
  /** The one-time "keep your key on this device?" nudge (DashboardDetail) has been shown/answered
   *  already — never re-asks once dismissed either way. */
  keyNudgeShown: boolean;
}

const DEFAULT: DashSettings = {
  dailySearchBudget: DEFAULT_DAILY_BUDGET,
  briefingEnabled: true,
  briefingSpoken: false,
  keyNudgeShown: false,
};

function clampBudget(n: number): number {
  return Math.min(MAX_DAILY_BUDGET, Math.max(MIN_DAILY_BUDGET, Math.round(n)));
}

function isObj(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object';
}

function coerce(v: unknown): DashSettings {
  if (!isObj(v)) return { ...DEFAULT };
  return {
    dailySearchBudget:
      typeof v.dailySearchBudget === 'number' && Number.isFinite(v.dailySearchBudget)
        ? clampBudget(v.dailySearchBudget)
        : DEFAULT.dailySearchBudget,
    briefingEnabled:
      typeof v.briefingEnabled === 'boolean' ? v.briefingEnabled : DEFAULT.briefingEnabled,
    briefingSpoken:
      typeof v.briefingSpoken === 'boolean' ? v.briefingSpoken : DEFAULT.briefingSpoken,
    keyNudgeShown: typeof v.keyNudgeShown === 'boolean' ? v.keyNudgeShown : DEFAULT.keyNudgeShown,
  };
}

let cache: DashSettings | undefined;

function read(): DashSettings {
  try {
    if (typeof localStorage === 'undefined') return { ...DEFAULT };
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? coerce(JSON.parse(raw)) : { ...DEFAULT };
  } catch {
    return { ...DEFAULT };
  }
}

function get(): DashSettings {
  cache ??= read();
  return cache;
}

function persist(next: DashSettings): void {
  cache = next;
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    }
  } catch {
    /* quota / private mode — settings keep working off the in-memory cache */
  }
  try {
    if (typeof window !== 'undefined' && typeof CustomEvent === 'function') {
      window.dispatchEvent(new CustomEvent(DASH_SETTINGS_EVENT, { detail: next }));
    }
  } catch {
    /* non-browser env */
  }
}

export function getDashSettings(): DashSettings {
  return get();
}

export function setDashSettings(patch: Partial<DashSettings>): void {
  persist(coerce({ ...get(), ...patch }));
}

function invalidateDashSettings(): void {
  cache = undefined;
}

function subscribeDashSettings(onStoreChange: () => void): () => void {
  const onStorage = (e: StorageEvent): void => {
    if (e.key !== null && e.key !== STORAGE_KEY) return;
    invalidateDashSettings();
    onStoreChange();
  };
  window.addEventListener(DASH_SETTINGS_EVENT, onStoreChange);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(DASH_SETTINGS_EVENT, onStoreChange);
    window.removeEventListener('storage', onStorage);
  };
}

/** Live-updating dashboards settings (budget + briefing prefs). */
export function useDashSettings(): DashSettings {
  return useSyncExternalStore(subscribeDashSettings, getDashSettings);
}

/** ≥85% of the daily cap reads amber ("LOW") before it reads paused at 100%. */
export const AMBER_RATIO = 0.85;

export interface BudgetState {
  used: number;
  cap: number;
  amber: boolean;
  paused: boolean;
  /** Epoch ms of the next local midnight — when an automatic pause lifts. */
  resumesAt: number;
}

function nextLocalMidnight(now: number): number {
  const d = new Date(now);
  d.setHours(24, 0, 0, 0);
  return d.getTime();
}

/** Pure budget accounting — no side effects, easy to unit test against a fixed `now`. `used`
 *  counts ALL search calls made today, manual included (the meter may honestly read "43/40" past
 *  cap); `paused` is a signal for GATING AUTOMATIC work only (useDashboardLoop.ts) — manual
 *  actions (a user tapping "Check now") never consult it. */
export function budgetState(entries: LedgerEntry[], cap: number, now: number): BudgetState {
  const used = searchesToday(entries, now);
  return {
    used,
    cap,
    amber: used >= cap * AMBER_RATIO,
    paused: used >= cap,
    resumesAt: nextLocalMidnight(now),
  };
}
