// feature-registry-sync.test.ts — the registry is the single source of truth for discovery, so
// a feature added there must also be wired to an action in the host. This source-scan is the
// tripwire that keeps the ⌘K palette / topbar menu from ever listing something that does nothing.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { FEATURES } from '../src/live/features/registry';
import { START_WITH_IDS } from '../src/live/welcome/startWithIds';
import { chapterById } from '../src/tour/tourPlan';
import { buildAppMenus } from '../src/nav/appMenus';

const liveApp = readFileSync(join(__dirname, '../src/live/LiveApp.tsx'), 'utf8');

/** The exploreMenu array literal, sliced from its declaration to its closing `];` — robust to the
 *  menu growing (the old fixed `+ 1200` offsets silently stopped covering later items). */
function exploreMenuSource(): string {
  const start = liveApp.indexOf('const exploreMenu');
  return liveApp.slice(start, liveApp.indexOf('];', start) + 2);
}

/** The practiceMenu array literal, same slice pattern as exploreMenuSource above. */
function practiceMenuSource(): string {
  const start = liveApp.indexOf('const practiceMenu');
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

  it('offers only real features as ways to begin', () => {
    // The Go hub's launcher is the ONLY door to the capabilities while the wizard is up (it hides
    // the whole topbar and dock), so a renamed or removed feature must fail here rather than paint
    // a card that does nothing.
    const ids = new Set(FEATURES.map((f) => f.id));
    for (const id of START_WITH_IDS) expect(ids).toContain(id);
  });

  it('never offers a way to begin that needs an answer to already exist', () => {
    // A launcher row is a promise there is something to see. These act on the current answer, and
    // on a fresh conversation there is none.
    for (const id of ['present', 'export', 'share', 'track', 'focus', 'board', 'ink', 'recap']) {
      expect(START_WITH_IDS).not.toContain(id);
    }
  });

  it('renders the launcher, and the palette handle, inside the setup wizard', () => {
    // Source-scan, like the topbar guards above: the wizard is a separate render branch, so a
    // refactor could drop either and leave a fresh conversation with no door again.
    expect(liveApp).toContain('launcherSlot=');
    expect(liveApp).toContain('paletteSlot=');
    expect(liveApp).toContain('<StartWith');
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

  it('lists Rehearse (delegate) in the Practice topbar menu, not its retired labels', () => {
    // The feature has shed two names: "Delegate" (read as a background-task hand-off it never
    // was) and "The Table" (its brief label after absorbing the old Rehearse feature). One
    // Practice entry now covers both seats. The id stays 'delegate' for back-compat, but the
    // menus — curated, hardcoded lists — must show the current label exactly once.
    const practice = practiceMenuSource();
    expect(practice).toContain("label: 'Rehearse'");
    expect(practice).toContain('featureActions.delegate.run');
    expect(practice).not.toContain("label: 'Delegate'");
    expect(practice).not.toContain("label: 'The Table'");
    expect(exploreMenuSource()).not.toContain("label: 'Rehearse'");
    expect(exploreMenuSource()).not.toContain("label: 'The Table'");
  });

  it('lists Review in the Practice menus, on and off Live, not its retired label', () => {
    // The flashcard surface was renamed out of "Study" because the Study — the reading desk — had
    // the word first, and two features under one name sent readers to the wrong surface. The
    // registry drives the palette, but both Practice menus are curated, hardcoded lists: the
    // rename reached the palette and left the menus, which are the doors people actually click.
    const practice = practiceMenuSource();
    expect(practice).toContain("label: 'Review'");
    expect(practice).toContain('featureActions.review.run');
    expect(practice).not.toContain("label: 'Study'");

    const offLive = buildAppMenus({ openPalette: () => {}, enterLive: () => {} }).practice;
    expect(offLive.map((i) => i.label)).toContain('Review');
    expect(offLive.map((i) => i.label)).not.toContain('Study');
  });

  it('Rehearse absorbed both vocabularies: one entry, searchable by either', () => {
    const rehearse = FEATURES.find((f) => f.id === 'delegate');
    expect(rehearse?.label).toBe('Rehearse');
    expect(rehearse?.group).toBe('Your world');
    expect(rehearse?.keywords).toContain('negotiate');
    expect(rehearse?.keywords).toContain('delegate');
    expect(rehearse?.keywords).toContain('table');
    expect(rehearse?.keywords).toContain('rehearse');
    expect(rehearse?.keywords).toContain('practice');
    expect(rehearse?.blurb.toLowerCase()).not.toContain('work on its own');
    expect(FEATURES.find((f) => f.id === 'rehearse')).toBeUndefined();
  });

  it('calls going through your flashcards "Review" everywhere, never "Study"', () => {
    // Two features shared the word: the Study is the reading DESK that pulls one answer onto a
    // table, and this one goes through your saved cards. The registry was renamed; Live's own
    // Practice menu and its off-Live twin kept the old label, so the topbar still sent a reader
    // looking for the desk to the flashcards.
    const practice = practiceMenuSource();
    expect(practice).toContain("label: 'Review'");
    expect(practice).not.toContain("label: 'Study'");
    expect(FEATURES.find((f) => f.id === 'review')?.label).toBe('Review');
    // The Study keeps its own name — the rename separated them, it did not retire one.
    expect(FEATURES.find((f) => f.id === 'study')?.label).toBe('The Study');
    const offLive = readFileSync(join(__dirname, '../src/nav/appMenus.ts'), 'utf8');
    expect(offLive).not.toContain("route('Study'");
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
