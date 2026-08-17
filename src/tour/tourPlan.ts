// tourPlan.ts — the first-run WALKTHROUGH script. Not a conversation reel: a true, snappy,
// feature-by-feature onboarding (like a great SaaS first-run tour) that TEACHES how to use Mavéa.
// It plays on the real Live surface, so each chapter can spotlight a real control, trigger a real
// feature, or show a real baked answer — narrated by a coach line in one of four modes:
//   voice   — sound ON, "hear Mavéa talk" (the defining behavior: you speak, it speaks back)
//   answer  — show a real baked canvas building, as proof the answer draws itself
//   explain — the coach voice explains a feature while it's spotlighted/triggered
//   silent  — sound OFF, captions + spotlight carry a quick visual walk
// The user can skip parts, step back/forward, and replay — so every chapter is self-contained.
import { tourConversation } from './corpus';
import type { TurnFrame } from '../live/history';
import { naturalGuidedCopy, naturalizeGuidedFrame } from './guidedCopy';

export type TourMode = 'voice' | 'answer' | 'explain' | 'silent';

/** What a chapter DOES on the real surface (beyond speaking its coach line + spotlighting). */
export type TourAction =
  | { kind: 'mic' } // voice showcase — just speak + point at the mic
  | { kind: 'answer'; convoId: string; ask?: string } // showFrame one baked canvas
  | { kind: 'chip'; convoId: string; label: string } // tap a Keep-going chip, then run its baked answer
  | { kind: 'montage'; convoIds: string[] } // flip through a few baked canvases (range)
  | { kind: 'bend'; convoId?: string } // seed a bendable answer (else reuse what's on screen), drag its slider
  | { kind: 'rail' } // collapse + re-expand the conversation rail
  | { kind: 'export' } // open the export-to-document overlay
  | { kind: 'mark' } // arm the pen (setInkArmed)
  | { kind: 'penDemo' } // draw with Mavéa's real answer-annotation Pen
  | { kind: 'ask' } // point at a card's Ask affordance (needs a canvas)
  | { kind: 'askMulti' } // select two cards and compose one grounded follow-up across both
  | { kind: 'focus' } // setViewMode('focus')
  | { kind: 'listen' } // Watch-me-think (spotlight/explain)
  | { kind: 'memory' } // fire the "saved to memory" face glow
  | { kind: 'atlas' } // seed + open Atlas (explored topics as a wanderable place)
  | { kind: 'prism' } // open a baked Prism analysis of a real public document
  | { kind: 'canvas'; convoId: string } // seed a board answer, then flip it into the spatial Canvas
  | { kind: 'focusWalk'; convoId: string } // seed an answer, enter Focus, walk the spotlight card-by-card
  | { kind: 'flashcards' } // turn a card into a flashcard (the capture flow)
  | { kind: 'course' } // seed + open a real course lesson in-place (the CourseRail over its canvas)
  | { kind: 'connect' } // open the real Model settings with all five providers + the BYOK field
  | { kind: 'present' } // setPresenting(true)
  | { kind: 'share' } // setShareOpen(true) → Reel
  | { kind: 'palette' } // openPalette (⌘K)
  | { kind: 'showcase'; featureId: string } // seed + open a feature on the real surface (generic demo)
  | { kind: 'blanksDemo' } // show a hand-authored answer with holes, then its completed twin
  | { kind: 'none' };

export interface TourChapter {
  id: string;
  /** Short label for the chapter rail + transport. */
  title: string;
  mode: TourMode;
  /** The coach line — spoken (unless silent) AND shown as the tour caption. */
  coach: string;
  /** A stable className of a real chrome control to ring + point the callout at (optional). */
  spotlight?: string;
  /** What this chapter triggers/shows. */
  action: TourAction;
  /** How long the chapter holds before auto-advancing (ms). Kept snappy. */
  durationMs: number;
  /** True if the chapter operates on an answer canvas — the driver guarantees one is up first. */
  needsCanvas?: boolean;
  /** Extras only: the one-line hook shown under the title on the end-card "More to explore" grid. */
  hook?: string;
  /** Extras only: a single emoji glyph for that grid chip. */
  glyph?: string;
}

// The FAST core — the ten chapters a first-time visitor sees, in order. It's built to be amazing
// but quick: about two minutes end to end. It tells four stories — the answer experience
// (draw it → mark it → ask across it → spread it), then Walk the why, Prism, and Share.
// Everything else the product does lives in TOUR_EXTRAS below, one tap away from the end card, so
// nothing is lost by keeping the first run short. Coach lines are deliberately terse: the
// auto-advance waits for speech, so short lines are what keep the clock honest.
// Dashboards' core slot was retired in favor of `living-answer` — `track` in TOUR_EXTRAS already
// covers the same "keep it current" ground as its own full chapter, so the core no longer needed
// a second, shorter pass at it.
//
// Arc: talk → connect → draw → mark → ask → spread → walk the why → prove it → share it → your turn.
export const TOUR: readonly TourChapter[] = [
  {
    id: 'talk',
    title: 'Speak naturally',
    mode: 'voice',
    coach: 'Start by speaking naturally or typing. I will understand either and respond out loud.',
    spotlight: '.mic-btn',
    action: { kind: 'mic' },
    durationMs: 6000,
  },
  {
    id: 'connect',
    title: 'Bring your own model',
    mode: 'explain',
    coach:
      "Choose Gemini, Claude, GPT, Grok, or OpenRouter, then paste your own API key. Start with a fast, lower cost model and move up only when a task needs it. The key stays in memory unless you choose Remember. Requests pass through this deployment, and your provider's usage charges, privacy, and retention terms apply.",
    spotlight: '.settings-model-connect',
    action: { kind: 'connect' },
    durationMs: 12000,
  },
  {
    id: 'draws',
    title: 'See the answer',
    mode: 'explain',
    coach:
      "Ask anything. I build a visual answer while I explain the important parts. Use the voice toggle labeled Mavéa's voice to turn speech off and reveal everything immediately. Your microphone stays unchanged.",
    spotlight: '.voice-switch',
    action: { kind: 'answer', convoId: 'money', ask: 'How does $10,000 grow at 7% over 30 years?' },
    durationMs: 9000,
  },
  {
    id: 'mark',
    title: 'Follow the explanation',
    mode: 'explain',
    coach:
      'Watch the Pen circle the result, then underline why it matters. Its marks stay with the answer.',
    spotlight: '.pen-toggle-pill',
    action: { kind: 'penDemo' },
    durationMs: 10000,
    needsCanvas: true,
  },
  {
    id: 'ask',
    title: 'Ask across the answer',
    mode: 'explain',
    coach:
      'Choose Ask on two cards, then type a question. I will use both pieces of context together.',
    spotlight: '.topic-wrap .block-ask, .ask-hint',
    action: { kind: 'askMulti' },
    durationMs: 12000,
    needsCanvas: true,
  },
  {
    id: 'canvas',
    title: 'Explore the canvas',
    mode: 'explain',
    coach: 'Switch to Canvas when you want to explore the whole answer spatially.',
    action: { kind: 'canvas', convoId: 'travel' },
    durationMs: 15000,
  },
  {
    id: 'living-answer',
    title: 'Walk the why',
    mode: 'explain',
    // Narrated, not instructed. The line said "Ask why something happened" and "Press walk me
    // through it" while the chapter only OPENED the surface — describing two things the reader was
    // doing neither of, on a replay where nobody presses anything. The walk starts itself now
    // (WorldOverlay's `autoWalk`), so the line can just say what is happening on screen.
    coach:
      'A living answer lays out the causes behind an answer. Watch as I walk it cause by cause and say what each one did.',
    action: { kind: 'showcase', featureId: 'living-answer' },
    // Long enough for several beats of the walk to land. A beat waits for its own line to be
    // audible, so the clock has to allow more than the open; the chapter still moves on mid-walk,
    // which is fine — the mechanic is what it is here to show.
    durationMs: 26000,
  },
  {
    id: 'prism',
    title: 'Check the evidence',
    mode: 'explain',
    coach: 'Prism checks a document claim by claim and ties every finding to its source.',
    action: { kind: 'prism' },
    // The baked briefing visits claims on pages 1, 4, 2, and beyond. Give the lazy PDF renderer
    // enough room to visibly turn those pages instead of ending after the first receipt lands.
    durationMs: 32000,
  },
  {
    id: 'share',
    title: 'Present or publish',
    mode: 'explain',
    coach: 'Turn a useful answer into a polished presentation or document.',
    action: { kind: 'export' },
    durationMs: 16000,
    needsCanvas: true,
  },
  {
    id: 'yours',
    title: 'Try it yourself',
    mode: 'voice',
    coach: 'That is the tour. Now ask your first question.',
    spotlight: '.mic-btn',
    action: { kind: 'mic' },
    durationMs: 6000,
  },
];

// The EXTRAS — the feature demos the fast core leaves out, each a self-contained chapter.
// They never play in the first run; instead each is a one-tap "mini-demo" from the end card's
// "More to explore" grid (and, later, the ⌘K palette's "Watch" affordance). Every one carries a
// `glyph` + `hook` for its grid chip. Their coach lines stay a touch fuller than the core's — a
// solo demo has no neighbours to race, and the line is the whole teaching.
export const TOUR_EXTRAS: readonly TourChapter[] = [
  {
    id: 'bend',
    title: 'Make it yours',
    mode: 'explain',
    // A rent dial, not an initial-investment one — everybody has a rent number and feels a
    // change to it; dragging $10,000 of savings up and down doesn't land the same way.
    coach: 'These are starting assumptions. Drag the rent and watch the comparison update.',
    spotlight: '.bend-strip',
    action: { kind: 'bend', convoId: 'mortgage' },
    durationMs: 8000,
    needsCanvas: true,
    glyph: '🎚️',
    hook: 'Drag a number, watch it recompute',
  },
  {
    id: 'chips',
    title: 'Go deeper',
    mode: 'explain',
    coach: "When an answer offers ways to go deeper, tap one and I'll take it further.",
    spotlight: '.footer-keepgoing',
    // Then it HAPPENS: the "$500 monthly" chip presses itself and its real baked answer plays.
    action: { kind: 'chip', convoId: 'monthly', label: 'What if I added $500 monthly?' },
    durationMs: 9000,
    needsCanvas: true,
    glyph: '💬',
    hook: 'Tap a suggestion, go deeper',
  },
  {
    id: 'rail',
    title: 'Session history',
    mode: 'explain',
    coach: 'Settled turns stay on the left for this session. Jump back anytime.',
    spotlight: '.rail-chat',
    action: { kind: 'rail' },
    durationMs: 8000,
    needsCanvas: true,
    glyph: '📜',
    hook: 'Settled turns, replayable on the left',
  },
  {
    id: 'highlight',
    title: 'Highlight to ask',
    mode: 'explain',
    coach:
      'Choose Highlight, draw around any part of an answer, then ask about exactly what you marked.',
    spotlight: '.mark-toggle',
    action: { kind: 'mark' },
    durationMs: 8000,
    needsCanvas: true,
    glyph: '✎',
    hook: 'Draw around the exact part you mean',
  },
  {
    id: 'range',
    title: 'A fitting picture',
    // The montage flips silently (three overlapping narrations were noise); the coach line carries.
    mode: 'explain',
    coach: 'Answers can choose from diagrams, flows, charts, and interactive maps.',
    action: { kind: 'montage', convoIds: ['space', 'krebs', 'travel'] },
    // Room for the montage's lead-in pause plus the per-frame flips (see useTourDriver's
    // 'montage' handling) — the cut in from the previous (canvas) chapter used to read as a flash.
    durationMs: 9000,
    glyph: '🎨',
    hook: 'See the visual range',
  },
  {
    id: 'focus',
    title: 'One card at a time',
    mode: 'explain',
    coach: 'Feeling overwhelmed? Focus puts one card center stage, one at a time.',
    spotlight: '.focus-toggle',
    action: { kind: 'focusWalk', convoId: 'money' },
    // Room for the hold-then-transform beat before Focus dims the canvas (see useTourDriver's
    // 'focusWalk' handling) plus the per-card walk after it.
    durationMs: 11000,
    glyph: '🎯',
    hook: 'One card at a time, center stage',
  },
  {
    id: 'think',
    title: 'Think out loud',
    mode: 'explain',
    coach: 'Not sure what to ask yet? Think out loud, and I will map your thoughts live.',
    action: { kind: 'listen' },
    durationMs: 16000,
    glyph: '🧠',
    hook: 'Think out loud, I map it live',
  },
  {
    id: 'atlas',
    title: 'Memory and Atlas',
    mode: 'explain',
    coach: 'When Memory is enabled, saved facts and kept topics can shape Atlas.',
    action: { kind: 'atlas' },
    durationMs: 9000,
    glyph: '🗺️',
    hook: 'Kept topics become a place',
  },
  {
    id: 'export',
    title: 'Export the answer',
    mode: 'explain',
    coach: 'Need to share it? Export the current answer as a styled slide deck or document.',
    action: { kind: 'export' },
    durationMs: 12000,
    needsCanvas: true,
    glyph: '📄',
    hook: 'Any answer becomes a deck or document',
  },
  {
    id: 'flashcards',
    title: 'Make it stick',
    mode: 'explain',
    coach: 'Learning something? Any card becomes a flashcard, kept right here on your device.',
    action: { kind: 'flashcards' },
    durationMs: 8000,
    needsCanvas: true,
    glyph: '🎴',
    hook: 'Turn any card into a flashcard',
  },
  {
    id: 'course',
    title: 'Master a subject',
    mode: 'explain',
    coach:
      "Want to truly master something? I'll build you a course and teach it, one lesson at a time.",
    // Rings the real CourseRail (an <aside class="course-rail">) — "Lesson 1 of 5", its objectives,
    // a checkpoint, and Prev/Next — so the chapter reads as a whole course, not a single answer.
    spotlight: '.course-rail',
    // Seeds a genuine five-lesson course into the course store and opens Lesson 1's baked canvas in
    // place (see useTourDriver's 'course' handling + tour/courseSeed) — no route to #/course, no model.
    action: { kind: 'course' },
    durationMs: 12000,
    glyph: '🎓',
    hook: 'A full course, a lesson at a time',
  },
  {
    id: 'present',
    title: 'Fill the room',
    mode: 'explain',
    coach: 'Present fills the room with the answer while the microphone stays live.',
    action: { kind: 'present' },
    durationMs: 9000,
    needsCanvas: true,
    glyph: '🖥️',
    hook: 'Fill the room, chrome falls away',
  },
  {
    id: 'palette',
    title: 'Feature index, one key away',
    mode: 'explain',
    coach: 'Browse the feature index with one keystroke. Just press Command K.',
    spotlight: '.cmdk-panel',
    action: { kind: 'palette' },
    durationMs: 9000,
    glyph: '⌘',
    hook: 'Feature index, one keystroke away',
  },
  // ── Generic "showcase" walkthroughs: open the real feature on the Live surface so every feature
  //    in the palette has a "See how", not just the ones with a bespoke chapter. Each seeds/opens
  //    its feature via the shared `showcase` op (see useTourDriver + LiveApp.showcaseFeature),
  //    key-free. The featureId matches the registry entry so the palette's "See how" resolves here.
  {
    id: 'ripple',
    title: 'See a change ripple',
    mode: 'explain',
    coach:
      'Here is a real code change. See what it touches, what could break, and the safest order to ship it.',
    action: { kind: 'showcase', featureId: 'ripple' },
    durationMs: 12000,
    glyph: '🌊',
    hook: "A code change's whole blast radius",
  },
  {
    id: 'deepzoom',
    title: 'Telescope any topic',
    mode: 'explain',
    coach: 'Telescope a topic from the big picture all the way down to the finest detail.',
    action: { kind: 'showcase', featureId: 'deepzoom' },
    durationMs: 10000,
    glyph: '🔭',
    hook: 'From big picture to finest detail',
  },
  {
    id: 'synthesis',
    title: 'Fuse many documents',
    mode: 'explain',
    coach:
      'Drop in several documents and I combine them into one map of agreements, contradictions, and gaps.',
    action: { kind: 'showcase', featureId: 'synthesis' },
    durationMs: 10000,
    glyph: '🧬',
    hook: 'Many documents into one map',
  },
  {
    id: 'memory',
    title: 'What I remember',
    mode: 'explain',
    coach:
      'Everything I remember about you lives here. Review it, edit it, or forget it. It stays on your device.',
    action: { kind: 'showcase', featureId: 'memory' },
    durationMs: 9000,
    glyph: '🔖',
    hook: 'See, edit, or forget what I know',
  },
  {
    id: 'library',
    title: 'Past conversations',
    mode: 'explain',
    coach: 'Every canvas you build is kept. Reopen any past conversation where you left it.',
    action: { kind: 'showcase', featureId: 'library' },
    durationMs: 9000,
    glyph: '📚',
    hook: 'Reopen a canvas you built before',
  },
  {
    id: 'review',
    title: 'Study your cards',
    mode: 'explain',
    coach:
      'Open Study to go through your flashcards. Keep it a plain pile, or let Mavéa space them out so the ones you find hard come back sooner.',
    action: { kind: 'showcase', featureId: 'review' },
    durationMs: 9000,
    glyph: '🧠',
    hook: 'Go through your flashcards',
  },
  {
    id: 'manage-flashcards',
    title: 'Manage your deck',
    mode: 'explain',
    coach: 'Open your flashcard library to organize decks, edit cards, and choose what to study.',
    action: { kind: 'showcase', featureId: 'flashcards' },
    durationMs: 9000,
    glyph: '🗂️',
    hook: 'Organize and edit every study card',
  },
  {
    id: 'track',
    title: 'Build a living dashboard',
    mode: 'explain',
    coach:
      'Choose the parts you want to keep live, set a refresh schedule, and create a dashboard from this answer.',
    action: { kind: 'showcase', featureId: 'track' },
    durationMs: 12000,
    needsCanvas: true,
    glyph: '📈',
    hook: 'Choose what stays live and how often',
  },
  {
    id: 'delegate',
    title: 'Rehearse it first',
    mode: 'explain',
    coach:
      'Prepare a hard conversation before you have it. Take the seat and practice your own lines, or send me to argue your side and read the debrief.',
    action: { kind: 'showcase', featureId: 'delegate' },
    durationMs: 9000,
    glyph: '🤝',
    hook: 'Practice it, or send me to scout it',
  },
  {
    id: 'just-listen',
    title: 'Just listen',
    mode: 'explain',
    coach: 'Think out loud and I save what you say without answering, so you can sort it later.',
    action: { kind: 'showcase', featureId: 'just-listen' },
    durationMs: 9000,
    glyph: '👂',
    hook: 'Bank everything you say, sort it later',
  },
  {
    id: 'recap',
    title: 'Recap the session',
    mode: 'explain',
    coach: "Lost the thread? I'll recap everything we've covered this session at a glance.",
    action: { kind: 'showcase', featureId: 'recap' },
    durationMs: 9000,
    glyph: '📋',
    hook: "Everything we've covered, at a glance",
  },
  {
    id: 'ghost',
    title: 'Ghost answers',
    mode: 'explain',
    coach: 'While you listen, I quietly draft a response, so it is ready when you want it.',
    action: { kind: 'showcase', featureId: 'ghost' },
    durationMs: 9000,
    glyph: '👻',
    hook: 'I draft what I would say, quietly',
  },
  {
    id: 'whisper',
    title: 'Whisper mode',
    mode: 'explain',
    coach: 'Need to stay quiet? Whisper mode lowers my voice to a soft murmur.',
    action: { kind: 'showcase', featureId: 'whisper' },
    durationMs: 9000,
    glyph: '🤫',
    hook: 'A quiet voice when you need it',
  },
  {
    id: 'morning-brief',
    title: 'Morning brief',
    mode: 'explain',
    coach:
      'Start the day with a brief of what changed across the things you track. It stays off until you turn it on.',
    action: { kind: 'showcase', featureId: 'morning-brief' },
    durationMs: 9000,
    glyph: '☀️',
    hook: "Open the day with what's changed",
  },
  {
    id: 'settings',
    title: 'Bring your own model',
    mode: 'explain',
    coach:
      'Bring your own model, connect a provider, and tune how I answer. You control the key and the terms.',
    action: { kind: 'showcase', featureId: 'settings' },
    durationMs: 9000,
    glyph: '⚙️',
    hook: 'Connect a provider, tune the answers',
  },
  {
    id: 'zoom-deck',
    title: 'Chapter view',
    mode: 'explain',
    coach: 'Pull back from the cards to the whole session, with every topic shown as a chapter.',
    action: { kind: 'showcase', featureId: 'zoom-deck' },
    durationMs: 10000,
    glyph: '📖',
    hook: 'Pull back to the whole session',
  },
  {
    id: 'blanks',
    title: 'Fill in your own',
    mode: 'explain',
    // Key-free: shows a hand-authored answer with glowing holes, then its completed twin (see
    // tour/blanksDemo). The real feature is model-emitted; this demonstrates the idea without a key.
    coach:
      'Some numbers are only yours to give. I leave glowing spaces and finish the answer around what you add.',
    spotlight: '.blank-slot',
    action: { kind: 'blanksDemo' },
    durationMs: 10000,
    glyph: '◌',
    hook: 'Holes for the numbers only you know',
  },
];

/** Every chapter — core first, then extras. The lookup space for deep-links and solo mini-demos. */
export const ALL_CHAPTERS: readonly TourChapter[] = [...TOUR, ...TOUR_EXTRAS];

/** Resolve any chapter (core or extra) by id — the handle a deep-link or a solo mini-demo uses. */
export function chapterById(id: string): TourChapter | undefined {
  return ALL_CHAPTERS.find((c) => c.id === id);
}

/** Punchy display asks, per conversation. The baked prompts were deliberately verbose to force
 *  rich answers — nobody talks like that, so every surface that shows a question (the rail, the
 *  AnswerHero, the Share reel's opening card) reads the natural ask instead. */
const ASKS: Record<string, string> = {
  money: 'How does $10,000 grow at 7% over 30 years?',
  monthly: 'What if I added $500 monthly?',
  mortgage: 'Should I buy or rent a $500,000 home?',
  space: 'How does a black hole bend light?',
  travel: 'Plan me 5 days in Japan.',
  budget: 'Where does the US federal budget actually go?',
  krebs: 'Explain the Krebs cycle.',
  url: 'What actually happens when I open a website?',
  neural: 'How does a neural network learn?',
  fitness: 'Design me a 3-day strength routine.',
};

/** Resolve a baked answer to its real frame + the question to show. Missing → null (chapter skips
 *  the answer but still teaches via its coach line). */
export function tourFrame(
  convoId: string,
  ask?: string,
): { frame: TurnFrame; question: string } | null {
  const convo = tourConversation(convoId);
  const frame = convo?.frames[0];
  if (!convo || !frame) return null;
  const question = naturalGuidedCopy(ask ?? ASKS[convoId] ?? convo.question);
  return {
    frame: naturalizeGuidedFrame({ ...frame, question }),
    question,
  };
}
