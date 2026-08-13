// tour.test.tsx — the first-run walkthrough (`?tour=1`, src/tour/) end to end: entry flags, the
// baked corpus it replays, the driver's pacing math, its seeded course/dashboard, and the scripted
// gestures. Each describe below carries the header of the file it was merged from, naming the real
// bug it locks down.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { Blanks } from '../src/canvas/blocks/forms/Blanks';
import { buildBlanksDemo } from '../src/tour/blanksDemo';
import { ensureTourCourse } from '../src/tour/courseSeed';
import { ensureTourDashboard } from '../src/tour/dashboardSeed';
import { markCircleLoop } from '../src/tour/markCircle';
import { TourEndCard } from '../src/tour/TourEndCard';
import { ALL_CHAPTERS, TOUR, TOUR_EXTRAS, tourFrame } from '../src/tour/tourPlan';
import { loadTourCorpus, tourConversation, tourConversations } from '../src/tour/corpus';
import { loadTourPrism } from '../src/tour/corpus/prism';
import { focusWalkSchedule, montageSchedule } from '../src/tour/useTourDriver';
import { QUIET_POLL_MS, QUIET_POLLS, startQuietGate } from '../src/tour/driverKit';
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
import {
  isEnclosingStroke,
  pathLength,
  polygonArea,
  boundsOf,
} from '../src/live/annotate/geometry';
import {
  getCourse,
  getCourses,
  getCachedLessonFrame,
  removeCourse,
} from '../src/live/course/store';
import { clearDashboards, getDashboards } from '../src/live/dashboards/store';
import type { BlanksProps } from '../src/canvas/blocks/forms/types';
import type { ConversationSpec } from '../src/data/conversation';

vi.mock('../src/presence/Presence', () => ({
  Presence: () => <div data-testid="presence" />,
}));

// The corpus JSON loads through a lazy chunk (corpus/index.ts) and the sync reads are empty until
// then — resolve it up front, exactly the way the driver's corpusReady gate does on the surface.
beforeAll(() => loadTourCorpus());

// The "It draws the answer" chapter (mode: 'answer') speaks through its own showFrame narration,
// not the coach-line path — so it needs the same cold-start AudioContext-unlock gate the coach
// line gets (see whenUnlocked in useTourDriver.ts). Without it, a fresh document load straight
// onto this chapter (a `?tour=1&ch=draws` deep link, or a reload that resumed here via
// syncTourUrl — the walkthrough is designed to survive exactly that) could reveal the canvas with
// no user gesture having unlocked audio yet, so the narration would try to play on a still-
// suspended context and never be heard.
//
// This can't be proven by mounting the hook (it needs a real audio-unlock + timer + chapter-entry
// sequence) — asserted by source inspection instead, matching the caption-sync suite.
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

// Regression coverage for chapter 3 ("bend", "Make it yours"): the demo used to drag an "Initial
// Investment" dial ($1,000–$50,000) — a lump sum most viewers don't have lying around, so the
// before/after didn't land as something that mattered to THEM. It now bends a "Monthly Rent" dial
// on a real buy-vs-rent comparison instead — a number almost everyone relates to directly.
describe('bend chapter — a relatable worked example', () => {
  it("seeds its own worked example rather than reusing whatever's already on screen", () => {
    const bend = ALL_CHAPTERS.find((c) => c.id === 'bend');
    expect(bend).toBeDefined();
    if (bend?.action.kind !== 'bend') throw new Error('bend chapter changed action kind');
    expect(bend.action.convoId).toBeTruthy();
  });

  it("the seeded conversation's bend spec is a relatable, everyday stat — not a lump sum", () => {
    const bend = ALL_CHAPTERS.find((c) => c.id === 'bend');
    if (bend?.action.kind !== 'bend' || !bend.action.convoId) throw new Error('no convoId');
    const convo = tourConversation(bend.action.convoId);
    const spec = convo?.frames[0]?.spec;
    expect(spec?.bend).toBeDefined();
    // "Rent" reads as something almost anyone pays monthly; a five-figure investment doesn't.
    expect(spec?.bend?.label.toLowerCase()).toContain('rent');
  });

  it('the bend range covers real, plausible monthly rents — not a token demo range', () => {
    const bend = ALL_CHAPTERS.find((c) => c.id === 'bend');
    if (bend?.action.kind !== 'bend' || !bend.action.convoId) throw new Error('no convoId');
    const convo = tourConversation(bend.action.convoId);
    const param = convo?.frames[0]?.spec.bend?.param;
    expect(param).toBeDefined();
    expect(param?.min).toBeGreaterThan(0);
    expect(param?.max).toBeGreaterThan(param?.min ?? 0);
    // The dragged value (scriptedBendRef glides to ~78% of the range) should land somewhere a
    // renter would recognize as a real, if high, monthly rent — not a wildly implausible figure.
    const dragged = (param?.min ?? 0) + ((param?.max ?? 0) - (param?.min ?? 0)) * 0.78;
    expect(dragged).toBeGreaterThan(1000);
    expect(dragged).toBeLessThan(20000);
  });

  it("the chip chapter's target chip actually exists on the base answer it reseeds", () => {
    // The 'chips' chapter now reseeds 'money' before pressing its chip (chapter 3's bend demo no
    // longer guarantees 'money' is on screen) — the chip label must be a real suggestion there.
    const chips = ALL_CHAPTERS.find((c) => c.id === 'chips');
    if (chips?.action.kind !== 'chip') throw new Error('chips chapter changed action kind');
    const money = tourConversation('money');
    const labels = money?.frames[0]?.spec.suggests?.map((s) => s.label) ?? [];
    expect(labels).toContain(chips.action.label);
  });
});

// The key-free Blank Space walkthrough hand-authors two frames (answer WITH holes, then completed).
// This pins the load-bearing facts the browser can't easily show: the holes frame carries a real
// `blanks` block that renders two glowing slots + the spec-level awaiting/blanks the Complete bar
// reads, and the completed frame drops both. Deterministic — no timing, no session, no model.
describe('blanks demo — the key-free walkthrough frames', () => {
  // A minimal but structurally valid scaffold — buildBlanksDemo only reuses its routing fields.
  const scaffold = {
    id: 'money',
    workspace: 'Money',
    title: 't',
    sub: 's',
    opener: 'o',
    context: [],
    blocks: [],
    proof: null,
    extras: {},
    group: 'money',
    suggests: [],
  } as unknown as ConversationSpec;

  it('holes frame carries a blanks block that renders two glowing slots', () => {
    const { holes } = buildBlanksDemo(scaffold);
    const block = holes.spec.blocks.find((b) => b.type === 'blanks');
    expect(block, 'holes frame has a blanks block').toBeTruthy();
    const { container } = render(<Blanks {...(block!.props as BlanksProps)} />);
    // The real feature: one fillable hole per value only the user can give.
    expect(container.querySelectorAll('.blank-slot')).toHaveLength(2);
    expect(container.querySelector('.blanks-grid')).toBeTruthy();
  });

  it('holes frame is awaiting with spec-level blanks; the completed frame is neither', () => {
    const { holes, filled } = buildBlanksDemo(scaffold);
    expect(holes.spec.awaiting).toBe(true);
    expect(holes.spec.blanks).toHaveLength(2);
    // The completed twin: no holes, not awaiting, and it actually shows a result (the runway).
    expect(filled.spec.awaiting).toBe(false);
    expect(filled.spec.blanks).toBeUndefined();
    expect(filled.spec.blocks.some((b) => b.type === 'blanks')).toBe(false);
    expect(filled.spec.blocks.length).toBeGreaterThan(0);
    expect(filled.narration.trim().length).toBeGreaterThan(0);
  });
});

// The walkthrough's coach line bypasses the per-turn narration walk (it isn't a new answer, so
// nothing resets or advances `spokenNow`, the state the on-screen SpeakingDock caption reads).
// A chapter that speaks a coach line directly — e.g. "Make it yours" right after "It draws the
// answer" — used to leave the dock showing the PREVIOUS answer's narration while the coach's own
// audio played, a caption/voice mismatch a visitor would notice immediately. The fix: the speak
// function handed to the tour driver must also update `spokenNow` with the exact line it speaks,
// so the caption always matches the audio regardless of which chapter triggered it.
//
// This can't be proven by mounting LiveApp (it needs a live tour run — audio unlock, chapter
// timers, session storage — see live-tour-replay-guard.test.tsx for why that class of tour
// wiring is asserted by inspecting the source instead of a full render).
describe('tour coach speech stays in sync with the SpeakingDock caption', () => {
  const src = readFileSync(join(__dirname, '../src/live/LiveApp.tsx'), 'utf8');

  it('passes the scripted drivers a speak() that updates spokenNow before speaking', () => {
    // The ops literal is shared by the tour and demo drivers (liveOps); anchor on it.
    const opsStart = src.indexOf('const liveOps: TourOps');
    expect(opsStart, 'liveOps wiring not found in LiveApp.tsx').toBeGreaterThan(-1);
    // The ops object is large; a few hundred chars comfortably spans from `speak:` to `cancelSpeech,`.
    const opsSlice = src.slice(opsStart, opsStart + 2000);
    const speakMatch = /speak:\s*\(text\)\s*=>\s*\{([^}]*)\}/.exec(opsSlice);
    expect(
      speakMatch,
      'ops.speak is not a wrapper function — regressed to a bare reference?',
    ).not.toBeNull();
    const body = speakMatch![1];
    expect(body).toMatch(/setSpokenNow\(text\)/);
    // setSpokenNow must run before the audio call, not after, so the caption is never a beat late.
    expect(body.indexOf('setSpokenNow')).toBeLessThan(body.indexOf('speak(text)'));
  });
});

describe('core walkthrough feature scenes', () => {
  it('uses the canvas Pen on the answer instead of the user Highlight tool', () => {
    const pen = TOUR.find((chapter) => chapter.id === 'mark');
    expect(pen?.spotlight).toBe('.pen-toggle-pill');
    expect(pen?.action.kind).toBe('penDemo');
    expect(pen?.coach).toContain('Pen');
    expect(pen?.coach).toContain('circle');
    expect(pen?.coach).toContain('underline');
    expect(pen?.coach).not.toContain('Highlight');
  });

  it('draws and holds two real Pen strokes during the explanation scene', () => {
    const driver = readFileSync(join(__dirname, '../src/tour/useTourDriver.ts'), 'utf8');
    const live = readFileSync(join(__dirname, '../src/live/LiveApp.tsx'), 'utf8');
    expect(driver).toMatch(/drawPenTourStep\('result'\)/);
    expect(driver).toMatch(/drawPenTourStep\('reason'\)/);
    expect(driver).toMatch(/after\(7200, \(\) => o\.setSpot\(null\)\)/);
    expect(live).toMatch(/kind: 'circle', at: '\$76,123'/);
    expect(live).toMatch(/kind: 'underline', at: '7\.6x'/);
  });

  it('leaves Space and the arrows to the real controls the run opens', () => {
    // Both transport handlers listen on `window` under a pointer-transparent overlay, so a blanket
    // preventDefault stole typing in the API-key input the Connect chapter opens, and Space on a
    // focused end-card button drove the tour instead of pressing the button. (Escape stays global —
    // it always means "leave the run".)
    const live = readFileSync(join(__dirname, '../src/live/LiveApp.tsx'), 'utf8');
    const guard = /function transportKeyBelongsToControl[\s\S]{0,500}?\n}/.exec(live);
    expect(guard, 'the transport-key guard is gone').not.toBeNull();
    expect(guard![0]).toMatch(/inTextField\(e\.target\)/);
    expect(guard![0]).toMatch(/closest\('button'\)/);
    // Both the tour handler and the demo-replay handler consult it.
    expect(live.match(/transportKeyBelongsToControl\(e\)/g)).toHaveLength(2);
  });

  it('uses the presentation and document studio instead of the share reel', () => {
    const publish = TOUR.find((chapter) => chapter.id === 'share');
    expect(publish?.action.kind).toBe('export');
    expect(publish?.coach).toContain('presentation');
    expect(publish?.coach).toContain('document');
  });

  it('opens the real five-provider BYOK settings without changing configuration', () => {
    const connect = TOUR.find((chapter) => chapter.id === 'connect');
    const driver = readFileSync(join(__dirname, '../src/tour/useTourDriver.ts'), 'utf8');
    const live = readFileSync(join(__dirname, '../src/live/LiveApp.tsx'), 'utf8');
    const settings = readFileSync(join(__dirname, '../src/live/LiveSettings.tsx'), 'utf8');

    expect(connect?.action.kind).toBe('connect');
    expect(driver).toMatch(/a\.kind === 'connect'[\s\S]*?o\.openModelSettings\(\)/);
    expect(live).toMatch(/openModelSettings:[\s\S]*?setSettingsTab\('model'\)/);
    expect(settings).toContain('settings-provider-picker');
    expect(settings).toContain('settings-api-key-field');
    expect(driver).not.toMatch(/a\.kind === 'connect'[\s\S]{0,300}setProviderField/);
  });

  it('paces the spatial canvas and warms Prism early enough to visit several source pages', () => {
    const driver = readFileSync(join(__dirname, '../src/tour/useTourDriver.ts'), 'utf8');
    const live = readFileSync(join(__dirname, '../src/live/LiveApp.tsx'), 'utf8');
    const prism = TOUR.find((chapter) => chapter.id === 'prism');

    expect(driver).toMatch(/2700 \+ i \* 1900/);
    expect(prism?.durationMs).toBeGreaterThanOrEqual(30_000);
    expect(live).toMatch(/Promise\.all\(\[tourPrismLoad\.preload\(\), loadTourPrism\(\)\]\)/);
  });

  it('starts the guided format sequence only after the lazy export modal mounts', () => {
    const modal = readFileSync(join(__dirname, '../src/export/ExportModal.tsx'), 'utf8');
    const live = readFileSync(join(__dirname, '../src/live/LiveApp.tsx'), 'utf8');
    expect(modal).toMatch(/if \(!guided\) return/);
    expect(modal).toMatch(/setFormat\('document'\)/);
    expect(live).toMatch(
      /guided=\{tourMode\.current && tourDrive\.chapter\?\.action\.kind === 'export'\}/,
    );
  });
});

// The baked tour corpus arrives via a lazy chunk (loadTourCorpus in src/tour/corpus/index.ts) so
// the Live mount stays lean — which means a deep-linked ?tour=1 auto-start could race the fetch.
// The driver holds its chapter-apply and auto-advance effects on a corpusReady flag: without the
// hold, a chapter would apply against an empty corpus (tourFrame → null) and silently skip every
// baked frame while the advance clock marched on.
//
// Like the answer-cold-unlock suite, this can't be proven by mounting the hook (it needs a
// real chunk fetch racing a chapter entry) — asserted by source inspection instead.
describe('the tour driver waits for the lazy corpus chunk before playing chapters', () => {
  const src = readFileSync(join(__dirname, '../src/tour/useTourDriver.ts'), 'utf8');

  it('kicks off the corpus fetch as soon as the tour is active, cleanup-guarded', () => {
    // Both outcomes must be gated on the alive flag, so a dismissed tour never sets state on an
    // unmounted driver. (The retry-then-error behavior itself is exercised for real, by mounting
    // the hook against a failing fetch, in guided-chrome.test.tsx.)
    expect(src).toMatch(/await loadTourCorpus\(\);\s*if \(alive\) setCorpusReady\(true\);/);
    expect(src).toMatch(/if \(alive\) setCorpusError\(true\);/);
  });

  it('holds the chapter-apply effect until the corpus has loaded', () => {
    expect(src).toMatch(/if \(!active \|\| !started \|\| done \|\| !corpusReady\) return;/);
  });

  it('holds the auto-advance clock until the corpus has loaded', () => {
    expect(src).toMatch(
      /if \(!active \|\| !started \|\| done \|\| !playing \|\| !corpusReady\) return;/,
    );
  });
});

// The first-run walkthrough replays COMMITTED fixtures of real Live output, so their integrity is
// load-bearing: if a baked frame lost its block ids, its narration, or its tour indices drifted out
// of range, the tour would render blank cards or crash the spotlight walk on the real surface.
// These guard that every baked conversation is fully offline-replayable, that every chapter's
// action resolves against the corpus, and that the Prism documents carry the bytes their page
// renders need. Pure data checks — no model, no network.
describe('tour corpus', () => {
  it('has baked conversations', () => {
    expect(tourConversations().length).toBeGreaterThan(0);
  });

  it('every conversation is offline-replayable (frame + narration + id-bearing blocks)', () => {
    for (const c of tourConversations()) {
      expect(c.frames.length, c.id).toBeGreaterThan(0);
      const f = c.frames[0];
      expect(f.narration.trim().length, `${c.id} narration`).toBeGreaterThan(0);
      expect(f.spec.blocks.length, `${c.id} blocks`).toBeGreaterThan(0);
      // Every block must carry an id — the spotlight/replay anchors on data-spot-id.
      for (const b of f.spec.blocks) expect(b.id, `${c.id} block ${b.type} id`).toBeTruthy();
      // Every stored tour stop must point at a real block (else the walk drops or misfires).
      for (const t of f.tour) {
        expect(f.spec.blocks[t.index], `${c.id} tour index ${t.index}`).toBeTruthy();
      }
    }
  });
});

describe('walkthrough chapters (tourPlan)', () => {
  it('every chapter that names a baked answer resolves it against the corpus', () => {
    for (const ch of ALL_CHAPTERS) {
      const a = ch.action;
      const ids =
        a.kind === 'answer' || a.kind === 'chip' || a.kind === 'canvas' || a.kind === 'focusWalk'
          ? [a.convoId]
          : a.kind === 'montage'
            ? a.convoIds
            : a.kind === 'bend' && a.convoId
              ? [a.convoId]
              : [];
      for (const id of ids) {
        const f = tourFrame(id);
        expect(f, `${ch.id} → ${id}`).toBeTruthy();
        expect(f!.frame.spec.blocks.length, `${ch.id} → ${id} blocks`).toBeGreaterThan(0);
      }
    }
  });

  it('the needs-a-canvas seed exists (chapters entered out of order rely on it)', () => {
    expect(tourFrame('money')).toBeTruthy();
  });

  it('shows the punchy ask on the answer chapter, and stamps it onto the frame', () => {
    const draws = TOUR.find((ch) => ch.action.kind === 'answer');
    expect(draws).toBeTruthy();
    const a = draws!.action;
    if (a.kind !== 'answer') throw new Error('unreachable');
    const f = tourFrame(a.convoId, a.ask);
    expect(f).toBeTruthy();
    // The curated question is stamped onto the frame too, so the transcript rail and the
    // AnswerHero both read the natural ask (not the verbose baked generation prompt).
    expect(f!.question).toBe(a.ask);
    expect(f!.frame.question).toBe(a.ask);
  });
});

describe('tour prism fixture', () => {
  it('every baked document ships its bytes and a grounded map', async () => {
    const docs = await loadTourPrism();
    // The chapter flips two documents; the fixture must cover at least that.
    expect(docs.length).toBeGreaterThanOrEqual(2);
    for (const d of docs) {
      // Real bytes — the drill-in renders the actual page (pdf.js / text pages) from these.
      expect(d.doc.data.length, `${d.id} bytes`).toBeGreaterThan(1000);
      expect(d.doc.mime, `${d.id} mime`).toBeTruthy();
      // A grounded map worth flying: several claims, each with a verbatim quote + a real page.
      expect(d.spec.claims.length, `${d.id} claims`).toBeGreaterThanOrEqual(3);
      const pages = d.spec.documents[0]?.pageCount ?? 0;
      expect(pages, `${d.id} pageCount`).toBeGreaterThan(0);
      for (const c of d.spec.claims) {
        expect(c.quote.trim().length, `${d.id} claim quote`).toBeGreaterThan(0);
        expect(c.page, `${d.id} claim page`).toBeGreaterThanOrEqual(1);
        expect(c.page, `${d.id} claim page ≤ pages`).toBeLessThanOrEqual(pages);
      }
    }
  });

  it('leads with the PDF (the chapter is "drop in a PDF")', async () => {
    const docs = await loadTourPrism();
    expect(docs[0].type).toBe('pdf');
    expect(docs[0].id).toBe('nasa-cfd');
    expect(docs.some((doc) => doc.id === 'bitcoin')).toBe(false);
  });
});

// Coverage for the walkthrough's "course" chapter ("Master a subject"): the coach line promises
// "I'll build you a course and teach it, one lesson at a time", and the chapter backs that with the
// REAL CourseRail over a REAL lesson canvas. That only holds if ensureTourCourse seeds a genuine
// multi-lesson course into the course store AND caches Lesson 1's canvas (so it opens with no model
// call, key-free, exactly like the rest of the tour). These lock those guarantees.
//
// ensureTourCourse reads the corpus synchronously; on the surface the driver's corpusReady gate
// guarantees it has loaded before the chapter fires — the file-level beforeAll mirrors that.
describe('ensureTourCourse — a real, teachable course backs the tour chapter', () => {
  // The tour course lives in the real store under a stable id; clear it so each test seeds fresh.
  beforeEach(() => {
    const c = getCourse('tour-neural-networks');
    if (c) removeCourse(c.id);
  });

  it('seeds a multi-lesson course into the course store', () => {
    const course = ensureTourCourse();
    expect(course).not.toBeNull();
    // "one lesson at a time" only reads true with several lessons and a checkpoint to earn.
    expect(course!.lessons.length).toBeGreaterThanOrEqual(3);
    expect(course!.lessons[0].objectives.length).toBeGreaterThan(0);
    expect(getCourse(course!.id)).toBeDefined();
  });

  it('caches Lesson 1 canvas from a baked corpus answer, so it opens with no model call', () => {
    const course = ensureTourCourse();
    const lesson = course!.lessons[0];
    const cached = getCachedLessonFrame(course!.id, lesson.id);
    expect(cached, 'Lesson 1 must be cached for a key-free replay').toBeDefined();
    // The canvas is real Live output, not a mock — its blocks match the baked corpus answer.
    const baked = tourConversation('neural')?.frames[0];
    expect(baked).toBeDefined();
    expect(cached!.spec.blocks.length).toBe(baked!.spec.blocks.length);
    expect(cached!.spec.blocks.length).toBeGreaterThan(0);
  });

  it('is idempotent — a replay finds the same course, never stuffs the list', () => {
    const first = ensureTourCourse();
    const before = getCourses().filter((c) => c.id === first!.id).length;
    const second = ensureTourCourse();
    expect(second!.id).toBe(first!.id);
    expect(getCourses().filter((c) => c.id === first!.id).length).toBe(before);
  });
});

// Regression coverage for chapter 15 ("dashboards", "Track it live"): the coach line claims "I'll
// turn it into a living dashboard that keeps itself up to date" — but createBlankDashboard
// defaults to a manual (off) cadence, and the chapter now flips its takeover to the real Settings
// panel to show the refresh control backing that claim. Showing "Manual" there would read as the
// opposite of "keeps itself up to date", so ensureTourDashboard must give the seeded dashboard a
// real, live cadence rather than the blank default.
//
// ensureTourDashboard reads the corpus synchronously; on the surface the driver's corpusReady
// gate guarantees it has loaded before the chapter fires — the file-level beforeAll mirrors that.
describe('ensureTourDashboard — the seeded dashboard actually keeps itself up to date', () => {
  beforeEach(() => clearDashboards());

  it('seeds a live data-refresh cadence, not the manual default', () => {
    const id = ensureTourDashboard();
    expect(id).not.toBeNull();
    const dash = getDashboards().find((d) => d.id === id);
    expect(dash).toBeDefined();
    expect(dash?.cadence.data).not.toBe('manual');
  });

  it('seeds a live AI-analysis cadence too', () => {
    const id = ensureTourDashboard();
    const dash = getDashboards().find((d) => d.id === id);
    expect(dash?.cadence.ai).not.toBe('manual');
  });

  it('sets a real next-due clock consistent with the seeded cadence (not the manual sentinel)', () => {
    const id = ensureTourDashboard();
    const dash = getDashboards().find((d) => d.id === id);
    expect(dash?.nextDataAt).toBeLessThan(Number.MAX_SAFE_INTEGER);
    expect(dash?.nextDataAt).toBeGreaterThan(dash?.createdAt ?? 0);
  });

  it('is idempotent — a second call finds the same, already-live-cadenced dashboard', () => {
    const first = ensureTourDashboard();
    const second = ensureTourDashboard();
    expect(second).toBe(first);
    const dash = getDashboards().find((d) => d.id === second);
    expect(dash?.cadence.data).not.toBe('manual');
  });
});

describe('TourEndCard', () => {
  it('offers every corpus-backed extra and launches the selected mini-demo', () => {
    const onPlayExtra = vi.fn();
    render(<TourEndCard onStart={vi.fn()} onReplay={vi.fn()} onPlayExtra={onPlayExtra} />);

    expect(screen.getAllByRole('button', { name: /play scripted mini-demo/i })).toHaveLength(
      TOUR_EXTRAS.length,
    );
    fireEvent.click(
      screen.getByRole('button', {
        name: `Play scripted mini-demo: ${TOUR_EXTRAS[0].title}`,
      }),
    );
    expect(onPlayExtra).toHaveBeenCalledWith(TOUR_EXTRAS[0].id);
  });

  it('keeps the real-product and replay exits wired', () => {
    const onStart = vi.fn();
    const onReplay = vi.fn();
    render(<TourEndCard onStart={onStart} onReplay={onReplay} onPlayExtra={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Start Mavéa' }));
    fireEvent.click(screen.getByRole('button', { name: 'Replay the tour' }));
    expect(onStart).toHaveBeenCalledOnce();
    expect(onReplay).toHaveBeenCalledOnce();
  });

  it('names the exit honestly when the user has a saved session to resume', () => {
    render(
      <TourEndCard onStart={vi.fn()} onReplay={vi.fn()} onPlayExtra={vi.fn()} hasStoredSession />,
    );
    expect(screen.getByRole('button', { name: 'Back to your session' })).toBeVisible();
  });
});

// The flags that gate the first-run walkthrough. `tourSeen` makes it auto-play exactly once;
// `tourEntry` hands the "play the tour" intent from the landing to the #/live surface (and honors a
// ?tour=1 deep-link). Both must degrade to "no tour" on any storage failure rather than throw. The
// one-shot semantics matter: a stale flag must not replay the tour on every visit.
describe('tour entry flags', () => {
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
});

// Regression coverage for chapter 10 ("focus", "One card at a time"): Focus mode used to kick in
// (dimming everything but the spotlit card) almost immediately after the chapter started, so the
// viewer never actually saw the normal, unblurred canvas it was transforming. focusWalkSchedule
// holds on the plain view for a few seconds first, THEN applies Focus, THEN walks the spotlight
// card by card.
describe('focusWalkSchedule — the "one card at a time" hold-then-focus beat', () => {
  it('holds a real beat before Focus mode applies', () => {
    const { focusAt } = focusWalkSchedule(4, 7200);
    expect(focusAt).toBeGreaterThanOrEqual(1200);
  });

  it('never spotlights a card before Focus mode has actually taken over', () => {
    const { focusAt, spotlightAt } = focusWalkSchedule(4, 14500);
    for (const t of spotlightAt) expect(t).toBeGreaterThan(focusAt);
  });

  it('returns one spotlight delay per card, strictly increasing', () => {
    const { spotlightAt } = focusWalkSchedule(4, 14500);
    expect(spotlightAt).toHaveLength(4);
    for (let i = 1; i < spotlightAt.length; i++)
      expect(spotlightAt[i]).toBeGreaterThan(spotlightAt[i - 1]);
  });

  it('degrades gracefully with zero cards', () => {
    const { spotlightAt } = focusWalkSchedule(0, 14500);
    expect(spotlightAt).toEqual([]);
  });

  it("the tour's own 'focus' chapter gives the walk a real hold on the last card", () => {
    const focus = ALL_CHAPTERS.find((c) => c.id === 'focus');
    expect(focus).toBeDefined();
    if (focus?.action.kind !== 'focusWalk')
      throw new Error('focus chapter is no longer a focusWalk');
    // 'money' has 4 cards in the baked corpus — asserted loosely here since the exact count lives
    // in the corpus fixture, not this plan; the schedule just needs room to breathe either way.
    const { spotlightAt } = focusWalkSchedule(4, focus.durationMs);
    const lastCardHold = focus.durationMs - spotlightAt[spotlightAt.length - 1];
    expect(lastCardHold).toBeGreaterThanOrEqual(900);
  });
});

// Regression coverage for chapter 7 ("mark") of the first-run tour: the scripted demonstration
// used to stroke a bare two-point straight line across the middle of the marked stat's glyphs —
// visually it read as a stray, barely-visible scratch rather than the "just circle it" gesture the
// coach line promises. markCircleLoop replaced that line with a closed loop around the stat. These
// tests lock the properties that made the old line broken: the loop must actually enclose the
// target (so the ink resolver's circle/lasso path — not the bare-swipe path — grabs it, and so it
// visibly reads as a ring rather than a slash) and must stay within the card it was drawn on.
describe('markCircleLoop — the tour\'s scripted "circle it" gesture', () => {
  const rect = { left: 40, top: 100, width: 120, height: 36 }; // a typical stat's bounding box
  const svgRect = { left: 0, top: 0, width: 900, height: 600 }; // the canvas overlay's own frame

  it('produces a stroke the ink resolver treats as an ENCLOSING loop, not a bare line', () => {
    const pts = markCircleLoop(rect, svgRect);
    expect(isEnclosingStroke(pts)).toBe(true);
  });

  it('actually surrounds the target rect — not a degenerate sliver', () => {
    const pts = markCircleLoop(rect, svgRect);
    const bounds = boundsOf(pts);
    // The loop's bounding box must contain the stat's own box (in the overlay's local space).
    const localLeft = rect.left - svgRect.left;
    const localTop = rect.top - svgRect.top;
    expect(bounds.minX).toBeLessThanOrEqual(localLeft);
    expect(bounds.maxX).toBeGreaterThanOrEqual(localLeft + rect.width);
    expect(bounds.minY).toBeLessThanOrEqual(localTop);
    expect(bounds.maxY).toBeGreaterThanOrEqual(localTop + rect.height);
    // A real loop has area and perimeter — the bug this replaces (two points, one segment) has
    // zero enclosed area and a path length equal to a single straight run.
    expect(polygonArea(pts)).toBeGreaterThan(0);
    expect(pathLength(pts)).toBeGreaterThan(Math.max(rect.width, rect.height));
  });

  it('is NOT a two-point straight line (the bug being fixed)', () => {
    const pts = markCircleLoop(rect, svgRect);
    expect(pts.length).toBeGreaterThan(2);
    // The old stroke held every point at the same y (a flat horizontal slash through the glyphs).
    const ys = new Set(pts.map((p) => Math.round(p.y)));
    expect(ys.size).toBeGreaterThan(1);
  });

  it('clamps its horizontal radius so a very wide target never balloons off the canvas', () => {
    const wide = { left: 10, top: 100, width: 2000, height: 30 };
    const pts = markCircleLoop(wide, svgRect);
    const bounds = boundsOf(pts);
    expect(bounds.maxX - bounds.minX).toBeLessThanOrEqual(svgRect.width * 0.9 + 1);
  });
});

// Regression coverage for the chapter 8 → 9 ("canvas" → "range") transition: the montage chapter
// used to flip its first frame the instant it was entered (delay 0), landing in the very same
// tick as the previous chapter's exit (resetTriggers snaps the view back to flat) — two visual
// changes at once read as a confusing flash rather than a followable cut. montageSchedule adds a
// lead-in beat before the first flip and slows the per-frame pacing so each topic actually
// registers before the next replaces it.
describe('montageSchedule — the chapter 9 flip-book pacing', () => {
  it('never fires the first flip immediately — there is a lead-in beat', () => {
    const schedule = montageSchedule(3, 14500);
    expect(schedule[0]).toBeGreaterThan(0);
  });

  it('spaces frames at least ~1.6s apart, so each topic has time to register', () => {
    const schedule = montageSchedule(3, 7200);
    for (let i = 1; i < schedule.length; i++) {
      expect(schedule[i] - schedule[i - 1]).toBeGreaterThanOrEqual(1600);
    }
  });

  it('returns one delay per frame, in increasing order', () => {
    const schedule = montageSchedule(3, 14500);
    expect(schedule).toHaveLength(3);
    expect(schedule).toEqual([...schedule].sort((a, b) => a - b));
  });

  it('degrades gracefully with zero frames', () => {
    expect(montageSchedule(0, 14500)).toEqual([]);
  });

  it("the tour's own 'range' chapter gives the montage enough room for its lead-in + pacing", () => {
    const range = ALL_CHAPTERS.find((c) => c.id === 'range');
    expect(range).toBeDefined();
    if (range?.action.kind !== 'montage') throw new Error('range chapter is no longer a montage');
    const schedule = montageSchedule(range.action.convoIds.length, range.durationMs);
    // The last frame must still get a real hold before the chapter's own minimum duration ends.
    const lastFrameHold = range.durationMs - schedule[schedule.length - 1];
    expect(lastFrameHold).toBeGreaterThanOrEqual(1600);
  });
});

describe('walkthrough autoplay breathing room', () => {
  afterEach(() => vi.useRealTimers());

  it('waits for a full quiet window after the minimum scene hold', () => {
    vi.useFakeTimers();
    const advance = vi.fn();
    const stop = startQuietGate({ minHoldMs: 1000, isQuiet: () => true, advance });

    vi.advanceTimersByTime(1000 + (QUIET_POLLS - 2) * QUIET_POLL_MS);
    expect(advance).not.toHaveBeenCalled();

    vi.advanceTimersByTime(QUIET_POLL_MS);
    expect(advance).toHaveBeenCalledTimes(1);
    stop();
  });

  it('provides at least a 1.5 second pause before autoplay moves on', () => {
    expect((QUIET_POLLS - 1) * QUIET_POLL_MS).toBeGreaterThanOrEqual(1500);
  });
});

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
describe('tour spotlight classes still exist in the UI', () => {
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
