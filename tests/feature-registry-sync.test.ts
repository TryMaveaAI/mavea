// feature-registry-sync.test.ts — the registry is the single source of truth for discovery, so
// a feature added there must also be wired to an action in the host. This source-scan is the
// tripwire that keeps the ⌘K palette / topbar menu from ever listing something that does nothing.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { FEATURES } from '../src/live/features/registry';
import { chapterById } from '../src/tour/tourPlan';

const liveApp = readFileSync(join(__dirname, '../src/live/LiveApp.tsx'), 'utf8');

/** The exploreMenu array literal, sliced from its declaration to its closing `];` — robust to the
 *  menu growing (the old fixed `+ 1200` offsets silently stopped covering later items). */
function exploreMenuSource(): string {
  const start = liveApp.indexOf('const exploreMenu');
  return liveApp.slice(start, liveApp.indexOf('];', start) + 2);
}

describe('feature registry', () => {
  it('wires every Live feature to an action in LiveApp', () => {
    // Each feature id appears as an object key in the LiveApp action map — bare (`atlas:`) for
    // plain ids, quoted (`'watch-me-think'`) for hyphenated ones.
    const missing = FEATURES.filter((f) => f.surface !== 'demo').filter(
      (f) => !liveApp.includes(`${f.id}:`) && !liveApp.includes(`'${f.id}'`),
    );
    expect(missing.map((f) => f.id)).toEqual([]);
  });

  it('every feature that names a walkthrough chapter names a real one', () => {
    // A `tourChapter` becomes a "Watch" mini-demo, so a typo/rename would leave a dead affordance.
    const bad = FEATURES.filter((f) => f.tourChapter && !chapterById(f.tourChapter));
    expect(bad.map((f) => `${f.id} → ${f.tourChapter}`)).toEqual([]);
  });

  it('leads the Explore topbar menu with "Search all features"', () => {
    // The palette is the index of everything Explore contains, so a "where do I find X" scan should
    // hit it first — not bury it under a dozen items (the "something's off" discoverability fix).
    const explore = exploreMenuSource();
    const firstLabel = /label: '([^']+)'/.exec(explore)?.[1];
    expect(firstLabel).toBe('Search all features');
  });

  it('renders the persistent Search button in the Live topbar', () => {
    // The always-visible handle on the palette (also the only path to it on phones, where the menus
    // collapse away). Source-scan so a refactor that drops it fails here, like the menu guards below.
    expect(liveApp).toContain('<TopbarSearchButton');
  });

  it('lists Prism (pdf-world) in the Explore topbar menu', () => {
    // The Explore menu is a curated, hardcoded list (not auto-generated), so a feature can silently
    // go missing from it. Prism was added late; this guards that it stays discoverable there.
    const explore = exploreMenuSource();
    expect(explore).toContain("label: 'Prism'");
    expect(explore).toContain("featureActions['pdf-world'].run");
  });

  it('lists Ripple in the Explore topbar menu', () => {
    // Ripple sits in the same curated Explore menu as Prism; guard that it stays discoverable there.
    const explore = exploreMenuSource();
    expect(explore).toContain("label: 'Ripple'");
    expect(explore).toContain('featureActions.ripple.run');
  });

  it('lists The Table (delegate) in the Explore topbar menu, not its retired background-task label', () => {
    // The negotiation feature was renamed from "Delegate" (which read as a background-task
    // hand-off it never was) to "The Table". The id stays 'delegate' for back-compat, but the
    // menu — a curated, hardcoded list — must show the new, accurate label.
    const explore = exploreMenuSource();
    expect(explore).toContain("label: 'The Table'");
    expect(explore).toContain('featureActions.delegate.run');
    expect(explore).not.toContain("label: 'Delegate'");
  });

  it('The Table is grouped with Rehearse, not filed under Setup, and keeps "delegate" as a search term', () => {
    const table = FEATURES.find((f) => f.id === 'delegate');
    expect(table?.label).toBe('The Table');
    expect(table?.group).toBe('Your world');
    expect(table?.keywords).toContain('negotiate');
    expect(table?.keywords).toContain('delegate');
    expect(table?.blurb.toLowerCase()).not.toContain('work on its own');
  });

  it('has unique feature ids', () => {
    const ids = FEATURES.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every feature a label and a blurb', () => {
    for (const f of FEATURES) {
      expect(f.label.trim().length).toBeGreaterThan(0);
      expect(f.blurb.trim().length).toBeGreaterThan(0);
    }
  });
});
