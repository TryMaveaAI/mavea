// tour-entry.test.ts — the flags that gate the first-run walkthrough. `tourSeen` makes it
// auto-play exactly once; `tourEntry` hands the "play the tour" intent from the landing to the
// #/live surface (and honors a ?tour=1 deep-link). Both must degrade to "no tour" on any storage
// failure rather than throw. The one-shot semantics matter: a stale flag must not replay the tour
// on every visit.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { isTourSeen, markTourSeen, resetTourSeen } from '../src/tour/tourSeen';
import {
  stashTourMode,
  takeTourMode,
  peekTourMode,
  clearTourModeFlag,
  stashTourChapter,
  peekTourChapter,
  clearTourChapterFlag,
  stashTourSolo,
  peekTourSolo,
  clearTourSoloFlag,
  syncTourUrl,
} from '../src/tour/tourEntry';

// window.location is a single jsdom instance shared across every test file in this worker —
// syncTourUrl is the one function here that mutates the real hash via history.replaceState, so
// a test that doesn't clean up after itself can leak a `?tour=1` hash into a LATER, unrelated
// test file's render() and switch on tour mode it never asked for.
afterEach(() => {
  sessionStorage.clear();
  window.location.hash = '';
});

describe('tourSeen', () => {
  beforeEach(() => localStorage.clear());

  it('starts unseen, marks seen, and resets', () => {
    expect(isTourSeen()).toBe(false);
    markTourSeen();
    expect(isTourSeen()).toBe(true);
    resetTourSeen();
    expect(isTourSeen()).toBe(false);
  });
});

describe('tourEntry', () => {
  beforeEach(() => {
    sessionStorage.clear();
    window.location.hash = '';
  });

  it('stash → take is a one-shot handoff', () => {
    expect(takeTourMode()).toBe(false);
    stashTourMode();
    expect(takeTourMode()).toBe(true);
    // Consumed: a reload without re-stashing must NOT replay the tour.
    expect(takeTourMode()).toBe(false);
  });

  it('honors a ?tour=1 deep-link in the hash', () => {
    window.location.hash = '#/live?tour=1';
    expect(takeTourMode()).toBe(true);
  });

  it('ignores an unrelated hash', () => {
    window.location.hash = '#/live';
    expect(takeTourMode()).toBe(false);
  });
});

describe('syncTourUrl — a reload mid-tour must resume, not drop out', () => {
  beforeEach(() => {
    sessionStorage.clear();
    window.location.hash = '';
  });

  it('re-writes the one-shot handoff into a durable ?tour=1&ch= url', () => {
    // The landing hands off through the one-shot sessionStorage stash, so a reload's second
    // peekTourMode() call would normally find the flag already consumed and return false —
    // silently ending the tour. Once the driver calls syncTourUrl for the chapter on screen,
    // that same second call must find the tour via the URL instead.
    stashTourMode();
    expect(takeTourMode()).toBe(true);
    syncTourUrl('chips');
    expect(peekTourMode()).toBe(true);
    expect(peekTourChapter()).toBe('chips');
  });

  it('updates in place as the chapter advances, without adding history entries', () => {
    const before = window.history.length;
    syncTourUrl('draws');
    expect(peekTourChapter()).toBe('draws');
    syncTourUrl('chips');
    expect(peekTourChapter()).toBe('chips');
    expect(window.history.length).toBe(before);
  });

  it('preserves the surface path it was called on', () => {
    window.location.hash = '#/live';
    syncTourUrl('rail');
    expect(window.location.hash).toBe('#/live?tour=1&ch=rail');
  });

  it('keeps solo mini-demo playback durable across a reload', () => {
    syncTourUrl('bend', true);
    expect(window.location.hash).toBe('#/live?tour=1&ch=bend&solo=1');
    expect(peekTourMode()).toBe(true);
    expect(peekTourChapter()).toBe('bend');
    expect(peekTourSolo()).toBe(true);
  });
});

// Regression coverage for the "Take the tour occasionally drops onto the ordinary Live home"
// bug: LiveApp used to read the flag with `useRef(takeTourMode())`, whose initializer runs on
// EVERY render (React can invoke a function component's body more than once for a single
// eventual commit — e.g. an interruptible concurrent render that gets abandoned and retried
// synchronously). Because takeTourMode() both read AND consumed the flag in one step, a
// discarded render attempt could burn it before the render that actually committed ever saw it,
// so the mount that stuck saw "already consumed" and fell back to the normal home screen. The
// fix splits the read (peekTourMode, pure) from the consume (clearTourModeFlag, called once from
// an effect after mount) so any number of render attempts before a commit see a stable value.
describe('tourEntry — peek/clear split survives repeated reads before consume', () => {
  beforeEach(() => {
    sessionStorage.clear();
    window.location.hash = '';
  });

  it('peekTourMode is non-destructive: many reads before clearing all see the flag', () => {
    stashTourMode();
    // Simulate several render attempts for the same eventual commit (concurrent retry, extra
    // re-renders before effects flush, etc.) — none of them should consume the flag.
    expect(peekTourMode()).toBe(true);
    expect(peekTourMode()).toBe(true);
    expect(peekTourMode()).toBe(true);
    // Only the effect-driven clear (which runs once, after a real commit) consumes it.
    clearTourModeFlag();
    expect(peekTourMode()).toBe(false);
  });

  it('clearing before any peek would have (the old bug) makes every subsequent read miss it', () => {
    stashTourMode();
    // This reproduces the OLD behavior for contrast: a read that also consumes leaves nothing
    // for a later attempt to see.
    expect(takeTourMode()).toBe(true);
    expect(peekTourMode()).toBe(false);
  });

  it('peekTourChapter is likewise non-destructive across repeated reads', () => {
    stashTourMode();
    stashTourChapter('ripple');
    expect(peekTourChapter()).toBe('ripple');
    expect(peekTourChapter()).toBe('ripple');
    clearTourChapterFlag();
    expect(peekTourChapter()).toBe(null);
  });

  it('peekTourSolo is non-destructive and clearTourSoloFlag consumes only storage', () => {
    stashTourSolo();
    expect(peekTourSolo()).toBe(true);
    expect(peekTourSolo()).toBe(true);
    clearTourSoloFlag();
    expect(peekTourSolo()).toBe(false);

    window.location.hash = '#/live?tour=1&ch=bend&solo=1';
    expect(peekTourSolo()).toBe(true);
    clearTourSoloFlag();
    expect(peekTourSolo()).toBe(true);
  });

  it('clearTourModeFlag is a harmless no-op when nothing was stashed (a ?tour=1 deep-link)', () => {
    window.location.hash = '#/live?tour=1';
    expect(peekTourMode()).toBe(true);
    expect(() => clearTourModeFlag()).not.toThrow();
    // The hash still drives it — clearing storage that was never written changes nothing.
    expect(peekTourMode()).toBe(true);
  });
});
