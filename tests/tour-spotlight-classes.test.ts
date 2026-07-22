// A cheap static guard for the first-run walkthrough. Every chapter that rings a real chrome
// control (the mic, the Focus switch, the Keep-going footer…) names it by a CSS class in its
// `spotlight` selector — that class is the tour's ONLY handle on the live UI. If a control is
// renamed or restyled and its class drifts, the ring silently points at empty space and the
// chapter breaks with no error anywhere. This asserts every class named in a TOUR spotlight still
// exists in src/, so a future rename that would strand the tour fails HERE instead of in a
// hard-to-notice live run.
//
// The match is deliberately dot-prefixed (`.foo`, i.e. a CSS rule / querySelector), not any bare
// occurrence of the word: a coincidental prose mention must not count. GatingPlot's header comment
// says "…cluster-legend/focus-toggle interaction, reused here" — a bare `focus-toggle` with no dot
// — so a whole-word check would let a renamed real `.focus-toggle` slip through on that comment
// alone. Requiring the leading dot pins the check to an actual selector.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { ALL_CHAPTERS } from '../src/tour/tourPlan';

const SRC = join(__dirname, '../src');
const EXT = /\.(tsx?|css)$/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    return e.isDirectory() ? sourceFiles(p) : EXT.test(e.name) ? [p] : [];
  });
}

/** The class tokens a spotlight selector names — one per `.foo`, across a comma / descendant list.
 *  e.g. `.topic-wrap .block-ask, .ask-hint` → ['topic-wrap', 'block-ask', 'ask-hint']. */
function classesOf(selector: string): string[] {
  return Array.from(selector.matchAll(/\.([\w-]+)/g), (m) => m[1]);
}

describe('tour spotlight classes still exist in the UI', () => {
  // Read every source file once; a class "exists" if it appears dot-prefixed as a whole kebab
  // token somewhere — so `.block-ask` is satisfied by `.block-ask {` but NOT by `.block-ask-label`.
  const corpus = sourceFiles(SRC)
    .map((f) => readFileSync(f, 'utf8'))
    .join('\n');

  const spotlights = ALL_CHAPTERS.filter((c) => c.spotlight).map((c) => ({
    id: c.id,
    selector: c.spotlight as string,
  }));

  it('every chapter that spotlights a control names a class that still has a selector in src/', () => {
    const missing: string[] = [];
    for (const { id, selector } of spotlights) {
      for (const cls of classesOf(selector)) {
        // `(?![\w-])` keeps the token whole so a rename to a longer/adjacent class name (e.g.
        // `focus-toggle` → `focus-toggle-opt`) doesn't falsely satisfy the old one.
        const asSelector = new RegExp(`\\.${cls}(?![\\w-])`);
        if (!asSelector.test(corpus)) missing.push(`${id} → .${cls}`);
      }
    }
    expect(
      missing,
      `tour spotlight classes with no matching control selector in src/: ${missing.join(', ')}`,
    ).toEqual([]);
  });

  it('actually covers the spotlights the walkthrough uses (guards against a vacuous pass)', () => {
    // If a refactor dropped every spotlight, the check above would pass on an empty set — so pin
    // that the tour still spotlights controls, including the defining "just talk" mic.
    expect(spotlights.length).toBeGreaterThan(0);
    expect(spotlights.some((s) => s.selector.includes('.mic-btn'))).toBe(true);
  });
});
