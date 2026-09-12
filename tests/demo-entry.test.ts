// demo-entry.test.ts — the one-shot handoff that boots a landing demo card into the Live
// surface's demo replay mode, mirroring tour-entry.test.ts: stash → peek → clear semantics,
// the ?demo= deep-link, and the syncDemoUrl rewrite that lets a mid-demo reload resume
// instead of dropping the visitor on the setup wizard.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  stashDemoPersona,
  peekDemoPersona,
  clearDemoPersonaFlag,
  peekDemoStep,
  syncDemoUrl,
} from '../src/demo/demoEntry';

// window.location is a single jsdom instance shared across every test file in this worker —
// syncDemoUrl mutates the real hash via history.replaceState, so clean up or a later test
// file's render() would boot demo mode it never asked for.
afterEach(() => {
  sessionStorage.clear();
  window.location.hash = '';
});

describe('demoEntry — stash / peek / clear', () => {
  beforeEach(() => {
    sessionStorage.clear();
    window.location.hash = '';
  });

  it('stash → peek → clear is a one-shot handoff', () => {
    expect(peekDemoPersona()).toBeNull();
    stashDemoPersona('pm');
    expect(peekDemoPersona()).toBe('pm');
    // Peek is non-destructive: repeated render attempts before the commit all see it.
    expect(peekDemoPersona()).toBe('pm');
    clearDemoPersonaFlag();
    expect(peekDemoPersona()).toBeNull();
  });

  it('honors a ?demo=<id> deep-link in the hash', () => {
    window.location.hash = '#/live?demo=student';
    expect(peekDemoPersona()).toBe('student');
    // Clearing storage that was never written changes nothing — the hash still drives it.
    clearDemoPersonaFlag();
    expect(peekDemoPersona()).toBe('student');
  });

  it('ignores an unrelated hash', () => {
    window.location.hash = '#/live';
    expect(peekDemoPersona()).toBeNull();
  });

  it('reads a resume step from the hash, defaulting to null', () => {
    expect(peekDemoStep()).toBeNull();
    window.location.hash = '#/live?demo=pm&step=3';
    expect(peekDemoStep()).toBe(3);
  });
});

describe('syncDemoUrl — a reload mid-demo must resume, not drop out', () => {
  beforeEach(() => {
    sessionStorage.clear();
    window.location.hash = '';
  });

  it('re-writes the one-shot handoff into a durable ?demo=&step= url', () => {
    stashDemoPersona('dev');
    expect(peekDemoPersona()).toBe('dev');
    clearDemoPersonaFlag();
    // Flag consumed — without the URL rewrite a reload would find nothing.
    syncDemoUrl('dev', 2);
    expect(peekDemoPersona()).toBe('dev');
    expect(peekDemoStep()).toBe(2);
  });

  it('updates in place as steps advance, without adding history entries', () => {
    const before = window.history.length;
    syncDemoUrl('traveler', 0);
    expect(peekDemoStep()).toBe(0);
    syncDemoUrl('traveler', 1);
    expect(peekDemoStep()).toBe(1);
    expect(window.history.length).toBe(before);
  });

  it('preserves the surface path it was called on', () => {
    window.location.hash = '#/live';
    syncDemoUrl('pm', 1);
    expect(window.location.hash).toBe('#/live?demo=pm&step=1');
  });

  // The rewrite rebuilds the query from scratch, so anything it does not own is dropped. A
  // `?view=` pin names which view a layout-gate row is measuring; dropping it left three rows
  // measuring whichever view the replay happened to be showing — the same screen, three times.
  it('carries a ?view= pin across the rewrite', () => {
    window.location.hash = '#/live?demo=dev&view=focus';
    syncDemoUrl('dev', 3);
    expect(window.location.hash).toBe('#/live?demo=dev&step=3&view=focus');
    expect(peekDemoStep()).toBe(3);
    expect(peekDemoPersona()).toBe('dev');
  });

  it('adds nothing when no view was pinned', () => {
    window.location.hash = '#/live?demo=dev';
    syncDemoUrl('dev', 1);
    expect(window.location.hash).toBe('#/live?demo=dev&step=1');
  });
});
