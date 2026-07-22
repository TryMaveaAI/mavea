// tourSeen.ts — the one flag that separates a first-time visitor from a returning one for the
// cinematic walkthrough. The film auto-plays exactly once, on the very first landing; after
// that it never auto-triggers, but stays replayable on demand ("Take the tour"). This rides in
// its own localStorage key, independent of the Live setup flag (setup.ts) and the config, so the
// two "have I seen X" states never entangle. Framework-free and defensive: any storage failure
// degrades to "not seen yet", which at worst replays the intro once more — never throws.
const STORAGE_KEY = 'mavea-tour-seen-v1';

/** Has the cinematic walkthrough already auto-played on this device? Gates the first-run launch. */
export function isTourSeen(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

/** Mark the walkthrough as seen — set the instant it auto-launches, so a reload never re-triggers. */
export function markTourSeen(): void {
  try {
    localStorage.setItem(STORAGE_KEY, '1');
  } catch {
    /* storage unavailable — the intro simply auto-plays again next visit, which is harmless */
  }
}

/** Forget the flag so the intro auto-plays again (a "show me the tour fresh" / dev reset). */
export function resetTourSeen(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage unavailable */
  }
}
