// setup.ts — the one bit of state that distinguishes a first-time visitor from a returning
// one: whether the onboarding ritual has been completed on this device. It rides in its own
// localStorage flag (separate from the config in `mavea-live-v2`) so that clearing the config
// and clearing "have I been set up" are independent — "Start over" wipes both, but a config
// import shouldn't silently skip the ceremony. Framework-free and defensive, like the MCP
// `connected.ts` store: storage failures degrade to "not set up yet" rather than throwing.

const STORAGE_KEY = 'mavea-live-setup-v1';

/** Has the user finished the setup ritual on this device? Drives first-run vs. returning. */
export function isSetupDone(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

/** Mark the ritual complete — called once, the first time the user reaches the Go step. */
export function markSetupDone(): void {
  try {
    localStorage.setItem(STORAGE_KEY, '1');
  } catch {
    /* storage unavailable — the ritual simply runs again next visit, which is harmless */
  }
}

/** Forget the completed-setup flag so the ceremony replays (the "Start over" half on Go). */
export function resetSetup(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage unavailable */
  }
}
