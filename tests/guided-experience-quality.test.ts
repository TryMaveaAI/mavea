import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { DEMO_SCRIPTS } from '../src/demo/scripts';
import { FEATURES } from '../src/live/features/registry';
import { naturalGuidedCopy } from '../src/tour/guidedCopy';
import { ALL_CHAPTERS, TOUR, TOUR_EXTRAS } from '../src/tour/tourPlan';

describe('guided experience quality', () => {
  it('opens with all input modes and a complete eleven-scene story', () => {
    expect(TOUR).toHaveLength(11);
    expect(TOUR[0]?.coach).toBe(
      'Start by speaking naturally or typing. I will understand either and respond out loud.',
    );
    const ask = TOUR.find((chapter) => chapter.id === 'ask');
    expect(ask?.action.kind).toBe('askMulti');
    expect(ask?.coach).toContain('two cards');
    const connect = TOUR.find((chapter) => chapter.id === 'connect');
    expect(connect?.action.kind).toBe('connect');
    expect(connect?.spotlight).toBe('.settings-model-connect');
    for (const provider of ['Gemini', 'Claude', 'GPT', 'Grok', 'OpenRouter']) {
      expect(connect?.coach).toContain(provider);
    }
    expect(connect?.coach).toContain('your own API key');
    expect(connect?.coach).toContain('fast, lower cost model');
    expect(connect?.coach).toContain('key stays in memory unless you choose Remember');
    expect(connect?.coach).toContain('Requests pass through this deployment');
    expect(connect?.coach).toContain('usage charges, privacy, and retention terms apply');
    expect(TOUR[1]?.id).toBe('connect');

    const draws = TOUR.find((chapter) => chapter.id === 'draws');
    expect(draws?.spotlight).toBe('.voice-switch');
    expect(draws?.coach).toContain("voice toggle labeled Mavéa's voice");
    expect(draws?.coach).toContain('reveal everything immediately');
    expect(draws?.coach).toContain('microphone stays unchanged');

    // Guide me is a core scene, right after the Pen: the desk opens on the card just marked.
    const guide = TOUR.find((chapter) => chapter.id === 'study');
    expect(guide?.title).toBe('Guide me');
    expect(guide?.spotlight).toBe('.guide-me');
    expect(guide?.action).toEqual({ kind: 'showcase', featureId: 'study' });
    expect(guide?.needsCanvas).toBe(true);
    expect(TOUR.findIndex((chapter) => chapter.id === 'study')).toBe(
      TOUR.findIndex((chapter) => chapter.id === 'mark') + 1,
    );
    expect(TOUR_EXTRAS.find((chapter) => chapter.id === 'study')).toBeUndefined();

    const canvas = TOUR.find((chapter) => chapter.id === 'canvas');
    const prism = TOUR.find((chapter) => chapter.id === 'prism');
    expect(canvas?.durationMs).toBeGreaterThanOrEqual(15_000);
    expect(prism?.durationMs).toBeGreaterThanOrEqual(30_000);
  });

  it('gives every feature mini-tour enough time to understand what happened', () => {
    expect(TOUR_EXTRAS.filter((chapter) => chapter.durationMs < 8000)).toEqual([]);
  });

  it('never invites a press the run itself has taken out of reach', () => {
    // A scripted run holds the surface: its transport is the only control until a chapter declares
    // handsBack (useScriptedLock). Copy that tells the visitor to press something is the app
    // spotlighting a control and then ignoring the press, so every other line SAYS what it is
    // doing rather than asking for it. The verbs are the ones that name a GESTURE on a control at
    // the head of a clause — a press, a switch of view, a thing opened, a dial grabbed — while
    // "choose Gemini or Claude" is a line about what the product offers, not an instruction to
    // reach for anything on screen.
    const gesture =
      /(?:^|[.!?:;]\s+|\b(?:then|just|now)\s+)(press|tap|click|drag|type|hit|use|open|grab|pull|switch|toggle|scroll|swipe|pick|select)\b/i;
    const lines: [string, string][] = [
      ...ALL_CHAPTERS.filter((chapter) => !chapter.handsBack).map((chapter): [string, string] => [
        chapter.id,
        chapter.coach,
      ]),
      ...DEMO_SCRIPTS.flatMap((script) =>
        script.steps.map((step, i): [string, string] => [
          `${script.persona}[${i}]`,
          step.note ?? '',
        ]),
      ),
    ];
    expect(lines.filter(([, line]) => gesture.test(line))).toEqual([]);
  });

  it('keeps spoken walkthrough and demo copy free of dash-driven pauses', () => {
    const guided = [
      ...ALL_CHAPTERS.flatMap((chapter) => [chapter.coach, chapter.hook ?? '']),
      ...DEMO_SCRIPTS.flatMap((script) =>
        script.steps.flatMap((step) => [step.ask ?? '', step.note ?? '']),
      ),
    ].map(naturalGuidedCopy);
    expect(guided.filter((line) => /[—–]|\p{L}-\p{L}/u.test(line))).toEqual([]);
  });

  it('maps every Search all features tour to a real, uniquely named chapter', () => {
    const ids = ALL_CHAPTERS.map((chapter) => chapter.id);
    expect(new Set(ids).size).toBe(ids.length);
    // playExtra refuses any id it cannot find in TOUR or TOUR_EXTRAS, so a feature naming a
    // chapter outside those two lists leaves its Play tour button doing nothing when pressed.
    const playable = new Set([...TOUR, ...TOUR_EXTRAS].map((chapter) => chapter.id));
    const unplayable = FEATURES.filter(
      (feature) => feature.tourChapter && !playable.has(feature.tourChapter),
    ).map((feature) => `${feature.id} -> ${feature.tourChapter}`);
    expect(unplayable).toEqual([]);
    expect(FEATURES.find((feature) => feature.id === 'ink')?.tourChapter).toBe('highlight');
    expect(FEATURES.find((feature) => feature.id === 'review')?.tourChapter).toBe('review');
    expect(FEATURES.find((feature) => feature.id === 'flashcards')?.tourChapter).toBe(
      'manage-flashcards',
    );
    expect(FEATURES.find((feature) => feature.id === 'track')?.tourChapter).toBe('track');
    // Guide me is the case that spans both lists: the registry replays it by id like any other
    // feature, but its chapter is a core scene, so a check against the extras alone would miss it.
    expect(FEATURES.find((feature) => feature.id === 'study')?.tourChapter).toBe('study');
    expect(TOUR.some((chapter) => chapter.id === 'study')).toBe(true);
  });

  it('uses the real Pen and presentation studio in recorded demos', () => {
    const student = DEMO_SCRIPTS.find((script) => script.persona === 'student');
    const developer = DEMO_SCRIPTS.find((script) => script.persona === 'dev');
    expect(student?.steps.some((step) => step.beats?.some((beat) => beat.kind === 'pen'))).toBe(
      true,
    );
    expect(developer?.steps.some((step) => step.beats?.some((beat) => beat.kind === 'share'))).toBe(
      false,
    );
    expect(
      developer?.steps.some((step) =>
        step.beats?.some((beat) => beat.kind === 'export' && beat.format === 'presentation'),
      ),
    ).toBe(true);
  });

  it('starts guided playback automatically and exposes narration mute controls', () => {
    const tourDriver = readFileSync(join(__dirname, '../src/tour/useTourDriver.ts'), 'utf8');
    const demoDriver = readFileSync(join(__dirname, '../src/demo/useDemoDriver.ts'), 'utf8');
    const tourOverlay = readFileSync(join(__dirname, '../src/tour/TourOverlay.tsx'), 'utf8');
    const demoOverlay = readFileSync(join(__dirname, '../src/demo/DemoOverlay.tsx'), 'utf8');
    expect(tourDriver).toMatch(/const start = useCallback[\s\S]*?setPlaying\(true\)/);
    expect(demoDriver).toMatch(/const start = useCallback[\s\S]*?setPlaying\(true\)/);
    expect(tourOverlay).toContain('driver.toggleMute');
    expect(tourOverlay).toContain("driver.total === 1 ? 'scene plays' : 'scenes play'");
    expect(demoOverlay).toContain('driver.toggleMute');
  });
});
