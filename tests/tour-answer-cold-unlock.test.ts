// The "It draws the answer" chapter (mode: 'answer') speaks through its own showFrame narration,
// not the coach-line path — so it needs the same cold-start AudioContext-unlock gate the coach
// line gets (see whenUnlocked in useTourDriver.ts). Without it, a fresh document load straight
// onto this chapter (a `?tour=1&ch=draws` deep link, or a reload that resumed here via
// syncTourUrl — the walkthrough is designed to survive exactly that) could reveal the canvas with
// no user gesture having unlocked audio yet, so the narration would try to play on a still-
// suspended context and never be heard.
//
// This can't be proven by mounting the hook (it needs a real audio-unlock + timer + chapter-entry
// sequence) — asserted by source inspection instead, matching tour-caption-sync.test.ts.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

describe("the 'answer' chapter's reveal waits for audio unlock like the coach line does", () => {
  const src = readFileSync(join(__dirname, '../src/tour/useTourDriver.ts'), 'utf8');

  it("wraps the 'answer' action's showFrame call in whenUnlocked, not a bare call", () => {
    const answerStart = src.indexOf("a.kind === 'answer'");
    expect(answerStart, "'answer' action branch not found").toBeGreaterThan(-1);
    const slice = src.slice(answerStart, answerStart + 1000);
    expect(slice).toMatch(/whenUnlocked\(\(\)\s*=>\s*o\.showFrame\(/);
  });

  it('speakWhenUnlocked (the coach-line path) is built on the same whenUnlocked gate', () => {
    expect(src).toMatch(/const speakWhenUnlocked = \(line: string\): void => whenUnlocked\(/);
  });
});
