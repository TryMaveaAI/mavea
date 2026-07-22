// brief/store.ts — morning brief gate and prompt builder. One brief per calendar day, gated
// on returning visitors (someone with a prior session): a first-time user has nothing to
// orient around, so we stay quiet. Tracking is a single ISO date string in localStorage —
// no personal data, no server, fully local.
//
// Same store idiom as memory/thoughts: in-memory cache + localStorage + CustomEvent,
// never throws. Storage failure degrades to "show the brief anyway" (safe default: a missed
// mark just means we might ask once more today, which is harmless).

const STORAGE_KEY = 'mavea-brief-date';
export const BRIEF_EVENT = STORAGE_KEY;

// ISO date string of the day we last showed the brief, or null if never.
let cache: string | null | undefined = undefined; // undefined = not yet loaded

function todayISO(): string {
  return new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'
}

function read(): string | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(STORAGE_KEY); // null if absent
  } catch {
    return null;
  }
}

function get(): string | null {
  if (cache !== undefined) return cache;
  cache = read();
  return cache;
}

function persist(dateStr: string): void {
  cache = dateStr;
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, dateStr);
  } catch {
    /* quota / private mode — in-session logic still works via cache */
  }
  try {
    if (typeof window !== 'undefined' && typeof CustomEvent === 'function')
      window.dispatchEvent(new CustomEvent(BRIEF_EVENT, { detail: dateStr }));
  } catch {
    /* non-browser env */
  }
}

/** Returns true when a morning brief should be shown at session start.
 *
 * The caller is responsible for checking that a provider IS configured before
 * surfacing the brief — we only decide whether the DAY and USER conditions are met:
 *   (a) returning visitor: hasEverHadSession flag
 *   (b) today's brief has not yet been shown
 *
 * A first-time user (no session history) gets nothing — a blank brief would be
 * confusing and the personalized angle only makes sense once there's something
 * to personalise around. */
export function briefNeeded(hasEverHadSession: boolean): boolean {
  if (!hasEverHadSession) return false;
  const last = get();
  return last !== todayISO();
}

/** Record that today's brief was shown. Call once, immediately after the brief fires,
 *  so a page refresh later in the same day skips the gate. */
export function markBriefShown(): void {
  persist(todayISO());
}

/** Build the LLM prompt for the morning brief.
 *
 * Produces a complete user-turn string ready to pass to `turn.run`. The model receives
 * enough context (recent topics) to generate a grounded, personal brief without
 * fabricating data — the system instruction below reinforces that constraint. */
export function buildBriefPrompt(lastTopics: string[]): string {
  const lines: string[] = [];

  lines.push(
    'You are Mavéa, an AI presence. Generate a concise morning brief (max 3 items). ' +
      'Use real, grounded information only — no invented data, no placeholder numbers.',
  );

  if (lastTopics.length > 0) {
    lines.push('');
    lines.push(`They recently discussed: ${lastTopics.join(', ')}.`);
  }

  lines.push('');
  lines.push(
    'Produce exactly 3 blocks in a warm, alive morning format using only ' +
      'insight, text, or list block types. Start your response with a single short ' +
      'narration sentence — natural and calm, like "Here\'s your morning." or ' +
      '"Good morning. Here\'s a brief look at your day." — ' +
      'then emit the blocks. Do not explain what you are doing; just deliver the brief.',
  );

  return lines.join('\n');
}
