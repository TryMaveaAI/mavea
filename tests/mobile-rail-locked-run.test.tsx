// On a phone the session rail is a 45px "This session" band above the dock. A locked run (a replay,
// the walkthrough) makes everything but its transport inert, so that band would be a dead control
// sitting against whatever the run shows — the band and the rail go while the run holds the surface.
//
// jsdom applies no media queries, so the rules are read out of mobile.css and their selectors are
// matched against the real LiveApp: the test fails if the stylesheet's hook and the attribute the app
// sets during a run ever drift apart.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'fs';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LiveApp } from '../src/live/LiveApp';

const css = readFileSync(join(__dirname, '..', 'src/styles/mobile.css'), 'utf8');

/** The selector of the rule that declares `decl`, with the scripted-run hook in it. */
function selectorFor(decl: RegExp): string {
  for (const m of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    const selector = m[1]!.replace(/\/\*[\s\S]*?\*\//g, '').trim();
    if (selector.includes('data-scripted-run') && decl.test(m[2]!)) return selector;
  }
  return '';
}

const BAND_RULE = selectorFor(/--mobile-rail-h:\s*0px/);
const RAIL_RULE = selectorFor(/display:\s*none/);

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.reject(new Error('no network in test'))),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  sessionStorage.clear();
  localStorage.clear();
  window.location.hash = '';
});

describe('mobile session band during a locked run', () => {
  it('declares both rules against the scripted-run hook', () => {
    expect(BAND_RULE).toMatch(/\[data-scripted-run='locked'\]/);
    expect(RAIL_RULE).toMatch(/\[data-scripted-run='locked'\] \.side-rail/);
  });

  it('matches the replay only once it runs, and never a rail the run has opened', async () => {
    window.location.hash = '#/live?demo=pm';
    const { container } = render(<LiveApp />);
    const app = container.querySelector<HTMLElement>('.mavea-app')!;
    const rail = container.querySelector<HTMLElement>('.side-rail')!;
    expect(rail).not.toBeNull();
    expect(app.matches(BAND_RULE)).toBe(false);
    expect(rail.matches(RAIL_RULE)).toBe(false);

    fireEvent.click(await screen.findByRole('button', { name: /Start demo/ }, { timeout: 8000 }));
    expect(app.matches(BAND_RULE)).toBe(true);
    expect(rail.matches(RAIL_RULE)).toBe(true);

    // A run that opens the transcript to read from keeps it, and its band.
    rail.classList.add('chat-open');
    expect(app.matches(BAND_RULE)).toBe(false);
    expect(rail.matches(RAIL_RULE)).toBe(false);
  });
});
