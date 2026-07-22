// A muted turn no longer runs the reveal walk: the reader gets the whole marked-up canvas at
// once instead of watching it arrive one card at a time. This can't be proven by mounting
// LiveApp (the walk effect needs a landed turn, timers, and the annotation layer's DOM) — see
// live-tour-replay-guard.test.tsx for why that class of wiring is asserted by inspecting the
// source instead of a full render.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('a muted turn skips the walk entirely', () => {
  const src = readFileSync(join(__dirname, '../src/live/LiveApp.tsx'), 'utf8');

  it('releases the spot and returns before any walk state is set', () => {
    const effectStart = src.indexOf("// Reveal tour: when a turn's canvas lands");
    expect(effectStart, 'reveal-tour effect not found in LiveApp.tsx').toBeGreaterThan(-1);
    const mutedStart = src.indexOf('if (mutedRef.current) {', effectStart);
    expect(mutedStart, 'muted branch not found in the reveal-tour effect').toBeGreaterThan(-1);
    const walkActiveStart = src.indexOf('walkActive.current = true;', effectStart);
    expect(walkActiveStart).toBeGreaterThan(mutedStart);
    const mutedBranch = src.slice(mutedStart, walkActiveStart);
    expect(mutedBranch).toMatch(/revealInkPlan\(/);
    expect(mutedBranch).toMatch(/turn\.setSpot\(null\)/);
    expect(mutedBranch).toMatch(/\breturn;/);
  });

  it('no longer paces to reading time or tracks a written-walk flag', () => {
    expect(src).not.toMatch(/\breadMs\(/);
    expect(src).not.toMatch(/\bwritingNow\b/);
  });

  it('mute flushes a running walk instead of resyncing its voice', () => {
    const flushEffect =
      /useEffect\(\(\) => \{\s*if \(muted\) flushWalkRef\.current\?\.\(\);\s*\}, \[muted\]\);/;
    expect(src).toMatch(flushEffect);
  });
});
