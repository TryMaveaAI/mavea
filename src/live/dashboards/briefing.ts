// dashboards/briefing.ts — the morning briefing: composed for free by folding into the FIRST
// batched refresh call of the day (refresh.ts's `briefingContext` option) — never a separate
// billed call except a narrow standalone fallback for a user whose dashboards have no live
// content at all (nothing will ever batch, so there's no call to fold into). Storage is
// encrypted (real values); the inline metric chips the UI shows are built CLIENT-SIDE from
// STORED dashboard state, never parsed from the model's prose — a hallucinated number in the
// narrative can never leak into a chip. Distinct from Live's own opt-in `morningBrief`
// conversation greeting (brief/store.ts) — a different surface with its own gate, so a user with
// both enabled is never double-greeted.
import { useSyncExternalStore } from 'react';
import { encryptContent, decryptContent } from '../contentVault';
import { headlineMetric } from './format';
import { sayable, speak } from '../../voice/tts';
import { proseForDisplay, proseForSpeech } from '../../lib/spokenText';
import type { Dashboard } from './types';

const STORAGE_KEY = 'mavea-dash-briefing-v1';
export const BRIEFING_EVENT = STORAGE_KEY;
const GATE_KEY = 'mavea-dash-briefing-date';

export interface BriefChip {
  dashboardId: string;
  label: string;
  value: string;
}

export interface Briefing {
  date: string;
  at: number;
  /** Normally written copy rendered on the dashboard. */
  text: string;
  /** Voice-ready twin derived from inline pronunciation annotations. */
  spoken?: string;
  chips: BriefChip[];
}

function todayISO(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

function isObj(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object';
}

function coerceChip(v: unknown): BriefChip | null {
  if (!isObj(v)) return null;
  if (typeof v.dashboardId !== 'string' || !v.dashboardId) return null;
  if (typeof v.label !== 'string' || typeof v.value !== 'string') return null;
  return { dashboardId: v.dashboardId, label: v.label, value: v.value };
}

function coerceBriefing(v: unknown): Briefing | null {
  if (!isObj(v) || typeof v.date !== 'string' || typeof v.text !== 'string' || !v.text) return null;
  const at = typeof v.at === 'number' && Number.isFinite(v.at) ? v.at : 0;
  const chips = Array.isArray(v.chips)
    ? v.chips.map(coerceChip).filter((c): c is BriefChip => c !== null)
    : [];
  return {
    date: v.date,
    at,
    text: v.text,
    ...(typeof v.spoken === 'string' && v.spoken ? { spoken: v.spoken } : {}),
    chips,
  };
}

let cache: Briefing | null | undefined; // undefined = not loaded from disk yet

async function writeEncrypted(b: Briefing): Promise<void> {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, await encryptContent(b));
  } catch {
    /* quota / private mode — the briefing keeps working off the in-memory cache this session */
  }
}

function fromStorageSync(): Briefing | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = coerceBriefing(JSON.parse(raw));
    if (parsed) void writeEncrypted(parsed); // migrate-on-read, same idiom as store.ts
    return parsed;
  } catch {
    return null; // real ciphertext doesn't parse — hydrateAsync below decrypts it
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
      /* not plain JSON — try decrypting below */
    }
    const b = coerceBriefing(await decryptContent(raw));
    cache = b;
    if (typeof window !== 'undefined' && typeof CustomEvent === 'function') {
      window.dispatchEvent(new CustomEvent(BRIEFING_EVENT, { detail: b }));
    }
  } catch {
    /* corrupt, or this device's content key was rotated/cleared — not restored */
  }
}
void hydrateAsync();

export function getBriefing(): Briefing | null {
  cache ??= fromStorageSync();
  return cache;
}

function persist(b: Briefing): void {
  cache = b;
  void writeEncrypted(b);
  try {
    if (typeof window !== 'undefined' && typeof CustomEvent === 'function') {
      window.dispatchEvent(new CustomEvent(BRIEFING_EVENT, { detail: b }));
    }
  } catch {
    /* non-browser env */
  }
}

function subscribe(onStoreChange: () => void): () => void {
  window.addEventListener(BRIEFING_EVENT, onStoreChange);
  return () => window.removeEventListener(BRIEFING_EVENT, onStoreChange);
}

/** Live-updating today's briefing, or null before one exists / hydrates. */
export function useBriefing(): Briefing | null {
  return useSyncExternalStore(subscribe, getBriefing, () => null);
}

function gateRead(): string | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage.getItem(GATE_KEY);
  } catch {
    return null;
  }
}
function gateWrite(dateStr: string): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(GATE_KEY, dateStr);
  } catch {
    /* quota / private mode — worst case, retries the briefing again today */
  }
}

/** Whether today's briefing hasn't been composed yet. */
export function briefingNeededToday(now: number): boolean {
  return gateRead() !== todayISO(now);
}

/** Mark today done. Call ONLY on a grounded success (recordBriefing does this) — a failed or
 *  ungrounded attempt must leave the gate open so the next due batch retries. */
function markBriefingShown(now: number): void {
  gateWrite(todayISO(now));
}

/** CONTEXT lines for dashboards NOT in this tick's batch — "already known, do not search these"
 *  material the combined call can mention for free. Skips a dashboard with no real value yet
 *  (an honest "—" is not worth mentioning in a briefing). */
export function buildBriefingContext(dashboards: Dashboard[], batchIds: Set<string>): string {
  const lines: string[] = [];
  for (const d of dashboards) {
    if (batchIds.has(d.id)) continue;
    const headline = headlineMetric(d);
    if (!headline || headline.value === '—') continue;
    lines.push(`- ${d.title}: ${headline.label} is ${headline.value}`);
  }
  return lines.join('\n');
}

/** The inline metric chips, built CLIENT-SIDE from stored dashboard state — never parsed from the
 *  model's prose, so the chips stay honest even if the narrative drifts. */
export function buildBriefChips(dashboards: Dashboard[]): BriefChip[] {
  const chips: BriefChip[] = [];
  for (const d of dashboards) {
    const headline = headlineMetric(d);
    if (!headline || headline.value === '—') continue;
    chips.push({ dashboardId: d.id, label: headline.label, value: headline.value });
  }
  return chips;
}

/** Store a freshly-composed, grounded briefing and mark today's gate done. */
export function recordBriefing(text: string, dashboards: Dashboard[], now: number): Briefing {
  const shown = proseForDisplay(text);
  const spoken = proseForSpeech(text);
  const b: Briefing = {
    date: todayISO(now),
    at: now,
    text: shown,
    ...(spoken && spoken !== shown ? { spoken } : {}),
    chips: buildBriefChips(dashboards),
  };
  persist(b);
  markBriefingShown(now);
  return b;
}

/** Speak the briefing aloud — strictly OPT-IN (the ▸ LISTEN tap), never automatic. Silently
 *  no-ops if the voice stack is unreachable, the same degrade-to-silent-text policy as every
 *  other spoken line in the app. */
export function speakBriefing(text: string, spoken?: string): void {
  speak(sayable(spoken || text), 'mavea');
}
