// demoEntry.ts — the one-shot handoff that tells LiveApp to boot in "demo replay mode": a
// baked persona session replayed on the real Live surface, no key, no model. It mirrors
// tourEntry.ts exactly: the landing stashes the persona id, then navigates to #/live; LiveApp
// consumes it once on mount. A `?demo=<id>` in the hash is also honored so any demo is
// directly deep-linkable (and easy to dev-test) without going through the landing. Defensive:
// any storage failure just means no demo, never a throw.
const KEY = 'mavea-demo-persona';

/** Ask the next #/live mount to replay this persona's demo. Call right before navigating. */
export function stashDemoPersona(id: string): void {
  try {
    sessionStorage.setItem(KEY, id);
  } catch {
    /* storage unavailable — the demo just won't auto-start; harmless */
  }
}

/** Pure check: does the current hash or session storage ask for a demo persona? Never mutates
 *  anything, so it's safe to call from a component's render body — React can retry a render,
 *  and a "read" that doubles as a one-shot consume would let a discarded attempt burn the flag
 *  before the render that sticks ever sees it (see peekTourMode for the long form). Pair with
 *  `clearDemoPersonaFlag` (called once, from an effect after mount) to consume it. */
export function peekDemoPersona(): string | null {
  try {
    const hash = typeof window !== 'undefined' ? window.location.hash : '';
    const m = /[?&]demo=([a-z-]+)(?:&|$)/.exec(hash);
    if (m) return m[1];
    return sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/** Consume the one-shot demo-persona flag. Call exactly once, from an effect after the mount
 *  that read it (via peekDemoPersona) has committed — never from render itself. A no-op for a
 *  `?demo=<id>` deep-link, which isn't backed by storage. */
export function clearDemoPersonaFlag(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* storage unavailable */
  }
}

/** Pure check for a resume step: the `&step=N` a mid-demo reload lands back on. */
export function peekDemoStep(): number | null {
  try {
    const hash = typeof window !== 'undefined' ? window.location.hash : '';
    const m = /[?&]step=(\d+)(?:&|$)/.exec(hash);
    return m ? Number(m[1]) : null;
  } catch {
    return null;
  }
}

/** Keep the URL in step with the demo on screen (replace, never push, so it never adds a
 *  back-button stop). The landing hands off through the one-shot sessionStorage stash above —
 *  so without this, a reload mid-demo finds the flag already consumed and drops the visitor
 *  onto the setup wizard. Once this has run, every later reload re-enters through the same
 *  `?demo=` check peekDemoPersona already does for a direct deep-link, resuming on the step
 *  it left off on. */
export function syncDemoUrl(id: string, step: number): void {
  try {
    const path = window.location.hash.split('?')[0] || '#/live';
    window.history.replaceState(null, '', `${path}?demo=${id}&step=${step}`);
  } catch {
    /* history API unavailable — the demo still plays, it just won't survive a reload */
  }
}

/** Switch to another persona's demo from inside a running one (the end card's cast chips).
 *  A reload is deliberate, for the same reason the tour reloads (see launchSoloChapter): a
 *  demo drives the REAL turn state, and a clean boot keeps the visitor's own session out of it. */
export function launchDemo(id: string): void {
  stashDemoPersona(id);
  try {
    window.location.hash = '#/live';
    window.location.reload();
  } catch {
    /* no window (SSR/test) — the stashed flag still takes effect on the next real mount */
  }
}
