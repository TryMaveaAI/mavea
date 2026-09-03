// registry.ts — the single source of truth for the features exposed in Mavéa's command palette.
// Pure metadata, no behavior: the host (LiveApp / App) attaches each feature's action and
// availability at render time, because those need live state. The command palette and the
// topbar menu both render from this list, so a new capability becomes discoverable by adding
// ONE entry here — never by hand-listing it in three places again.

/** Which surface a feature belongs to. Live-only features still appear in the Demo palette as a
 *  teaser that opens Live. */
export type FeatureSurface = 'live' | 'demo' | 'both';

/** Mental-model groups — how a person looks for a capability, not how it's implemented. */
export type FeatureGroup = 'Your world' | 'This session' | 'While listening' | 'Setup';

export interface Feature {
  /** Stable key. The host's action map and the registry-sync test both key off this. */
  id: string;
  label: string;
  /** One line — what it does, in plain language. */
  blurb: string;
  group: FeatureGroup;
  surface: FeatureSurface;
  /** A walkthrough chapter that shows this feature in action. Rows with one get a "Watch" demo
   *  affordance in the palette (a quick, key-free solo mini-demo on the real surface). Must name a
   *  real chapter id in tour/tourPlan.ts — enforced by tests; NOT imported here, so this file stays
   *  pure metadata (importing tourPlan would drag the whole baked corpus into every consumer). */
  tourChapter?: string;
  /** Extra search terms so fuzzy matching finds it by intent ("mind map", "ramble", "quiet"). */
  keywords?: string[];
}

export const FEATURE_GROUPS: FeatureGroup[] = [
  'Your world',
  'This session',
  'While listening',
  'Setup',
];

export const FEATURES: Feature[] = [
  // ── Your world (everything you've built up over time) ───────────────────────
  {
    id: 'atlas',
    label: 'Atlas',
    blurb: 'Kept conversations and topics, as a place you can wander',
    group: 'Your world',
    surface: 'live',
    tourChapter: 'atlas',
    // Deliberately NOT 'memory' — searching that must land on the memory feature below (what Mavéa
    // knows about you), not on the map of what you've talked about.
    keywords: ['map', 'history', 'everything', 'concepts'],
  },
  {
    id: 'memory',
    label: 'What Mavéa remembers',
    blurb: 'See, edit, or forget the facts stored about you on this device',
    group: 'Your world',
    surface: 'live',
    tourChapter: 'memory',
    keywords: ['memory', 'remember', 'forget', 'facts', 'about me', 'personal', 'privacy'],
  },
  {
    id: 'library',
    label: 'Past conversations',
    blurb: 'Reopen a canvas you built before',
    group: 'Your world',
    surface: 'live',
    tourChapter: 'library',
    keywords: ['library', 'past', 'history', 'saved', 'resume', 'previous', 'conversations'],
  },
  {
    id: 'deepzoom',
    label: 'Deep Zoom',
    blurb: 'Telescope any topic from the big picture down to the finest detail',
    group: 'Your world',
    surface: 'both',
    tourChapter: 'deepzoom',
    keywords: ['zoom', 'telescope', 'powers of ten', 'scale', 'detail', 'deeper', 'magnify'],
  },
  {
    // id stays 'pdf-world' for back-compat (stored palette state, deep links); the user-facing
    // name is Prism — a prism splits one document into its spectrum of grounded claims.
    id: 'pdf-world',
    label: 'Prism',
    blurb:
      'Split a PDF, Office doc, or data file (CSV, text, JSON) into a map of its grounded claims — or compare several',
    group: 'Your world',
    surface: 'live',
    tourChapter: 'prism',
    keywords: [
      'prism',
      'pdf',
      'explode',
      'split',
      'document',
      'word',
      'docx',
      'powerpoint',
      'pptx',
      'slides',
      'excel',
      'xlsx',
      'spreadsheet',
      'sheets',
      'google docs',
      'csv',
      'tsv',
      'text',
      'txt',
      'markdown',
      'json',
      'data',
      'code',
      'paper',
      'claims',
      'contradictions',
      'compare',
      'comparison',
      'world',
    ],
  },
  {
    // Prism splits ONE document into its spectrum of claims; Synthesis FUSES a whole pile into one
    // map — where they agree, where they contradict, and what none of them cover. Distinct enough
    // to search for by name (today "synthesis" finds nothing).
    id: 'synthesis',
    label: 'Synthesis',
    blurb: 'Fuse a pile of documents into one map — agreements, contradictions, gaps',
    group: 'Your world',
    surface: 'live',
    tourChapter: 'synthesis',
    keywords: [
      'synthesis',
      'synthesize',
      'fuse',
      'merge',
      'combine',
      'many documents',
      'multiple documents',
      'literature review',
      'cross-reference',
      'corpus',
    ],
  },
  {
    // A change drops in and you watch it ripple outward — the blast radius, the cause & effect, and
    // what to look at first. So no one is ever scared to make a coding change again.
    id: 'ripple',
    label: 'Ripple',
    blurb:
      'Model a code change’s blast radius — what it touches, what could break, and what to check first',
    group: 'Your world',
    surface: 'both',
    tourChapter: 'ripple',
    keywords: [
      'ripple',
      'pr',
      'pull request',
      'review',
      'diff',
      'code review',
      'blast radius',
      'impact',
      'ship',
      'merge',
      'rollout',
      'cascade',
      'breaking change',
      'migration',
      'onboarding',
      'codebase',
      'repo',
    ],
  },
  {
    // id stays 'delegate' for back-compat (stored palette state, deep links); the user-facing
    // name is Rehearse — one table, two seats: take the seat yourself and practice your own
    // lines against the counterpart in character, or send your Mavéa to negotiate against a
    // stand-in while you watch and get the debrief. (Briefly labeled "The Table" between the
    // Delegate rename and the Rehearse merge — 'table' stays a keyword for anyone who knew it.)
    id: 'delegate',
    label: 'Rehearse',
    blurb: 'Practice a hard conversation — take the seat yourself, or send your Mavéa to scout it',
    group: 'Your world',
    surface: 'live',
    tourChapter: 'delegate',
    keywords: [
      'negotiate',
      'negotiation',
      'deal',
      'raise',
      'salary',
      'haggle',
      'bargain',
      'offer',
      'counteroffer',
      'prep',
      'scout',
      'boundaries',
      'delegate',
      'table',
      'rehearse',
      'practice',
      'role play',
      'interview',
      'prepare',
    ],
  },
  {
    id: 'review',
    // "Review", not "Study": the Study is the desk that reads one answer a card at a time, and two
    // features under one word sent readers to the wrong surface. Distinct from "Manage flashcards"
    // below: this GOES THROUGH the cards, that one organises them. Static metadata can't branch on
    // the user's study style, so the wording has to be true of both a plain pile and a schedule.
    label: 'Review',
    blurb: 'Go through your flashcards — on a schedule if you want one',
    group: 'Your world',
    surface: 'live',
    tourChapter: 'review',
    keywords: [
      'srs',
      'flashcards',
      'study',
      'review',
      'remember',
      'spaced',
      'due',
      'flip',
      'pile',
      'anki',
    ],
  },
  {
    id: 'flashcards',
    label: 'Manage flashcards',
    blurb: 'See, organise, and edit your study deck (decks, tags, study)',
    group: 'Your world',
    surface: 'live',
    tourChapter: 'manage-flashcards',
    keywords: ['flashcards', 'cards', 'deck', 'tag', 'manage', 'anki', 'study'],
  },
  {
    id: 'courses',
    label: 'Courses',
    blurb: 'Turn a topic into a structured syllabus — a lesson at a time, at your pace',
    group: 'Your world',
    surface: 'live',
    tourChapter: 'course',
    keywords: ['course', 'courses', 'lesson', 'syllabus', 'learn', 'teach', 'curriculum', 'class'],
  },
  {
    id: 'dashboards',
    label: 'Living dashboards',
    // Distinct from "Track this" below: this OPENS the collection, that one CREATES one from the
    // current conversation — the blurbs say which so a "dashboard" search self-distinguishes.
    // No tourChapter of its own: the core walkthrough's old 'dashboards' chapter was a near-
    // duplicate of "Track this" below, so it was retired in favor of `living-answer`'s core slot —
    // "Track this" is the one mini-demo this territory gets now.
    blurb: 'Open dashboards that refresh on schedule while Mavéa is running',
    group: 'Your world',
    surface: 'both',
    keywords: ['dashboard', 'dashboards', 'track', 'metrics', 'watch'],
  },

  // ── This session (what's in front of you right now) ─────────────────────────
  {
    id: 'living-answer',
    label: 'View as living answer',
    blurb: 'Open the causal web behind this answer — walk it, weigh it, and see its receipts',
    group: 'This session',
    surface: 'live',
    // Off Live there is no answer to open a world on, so without a chapter this row was the one
    // dead teaser under the landing palette's "click any feature to see it in action".
    tourChapter: 'living-answer',
    keywords: [
      'world',
      'living answer',
      'causal',
      'why',
      'evidence',
      'receipts',
      'what if',
      'walk me through it',
      'narrate',
      'explain',
      'contribution',
      'timeline',
    ],
  },
  {
    id: 'recap',
    label: 'Recap',
    blurb: "What we've covered so far this session",
    group: 'This session',
    surface: 'live',
    tourChapter: 'recap',
    keywords: ['summary', 'so far', 'covered'],
  },
  {
    // The deck also opens by pinching out on the canvas — a gesture nobody discovers on their own,
    // which left the whole altitude view effectively hidden. It gets a name here too.
    id: 'zoom-deck',
    label: 'Chapter view',
    blurb: 'Pull back from the cards to the shape of the whole session',
    group: 'This session',
    surface: 'live',
    tourChapter: 'zoom-deck',
    keywords: ['zoom', 'chapters', 'pinch', 'altitude', 'overview', 'pull back', 'whole night'],
  },
  {
    id: 'present',
    label: 'Present',
    blurb: 'Fill the room — the chrome falls away, the mic stays live',
    group: 'This session',
    surface: 'live',
    tourChapter: 'present',
    keywords: ['presentation', 'full screen', 'room', 'talk'],
  },
  {
    id: 'track',
    label: 'Track this',
    // Distinct from "Living dashboards" above: this CREATES a dashboard from THIS conversation.
    blurb: 'Turn this conversation into a dashboard that refreshes while Mavéa is running',
    group: 'This session',
    surface: 'live',
    tourChapter: 'track',
    keywords: ['dashboard', 'watch', 'monitor', 'keep'],
  },
  {
    id: 'share',
    // The menu this sits in is already "Share", so the item names the artifact, not the verb again.
    label: 'Video',
    blurb: 'Share a moment, a topic, or the whole conversation',
    group: 'This session',
    surface: 'live',
    tourChapter: 'share',
    keywords: ['share', 'video', 'reel', 'conversation', 'export', 'publish'],
  },
  {
    id: 'export',
    label: 'Export',
    // Was "Print this or save it as a PDF", which undersold it and disagreed with the walkthrough's
    // own line for the same feature ("Any answer becomes a deck or document"). ExportModal opens on
    // a format choice — presentation deck or document — with a template picker behind it, so a
    // reader searching "slides" or "deck" was finding nothing for the feature that does exactly
    // that. Keywords widened for the same reason.
    blurb: 'Turn this answer into a presentation deck or a designed document',
    group: 'This session',
    surface: 'live',
    tourChapter: 'export',
    keywords: ['pdf', 'print', 'save', 'download', 'deck', 'slides', 'presentation', 'document'],
  },
  {
    id: 'study',
    label: 'The Study',
    tourChapter: 'study',
    blurb:
      'Pull an answer onto one desk — cards, notes in the margin, and a guided walk through what holds up',
    group: 'This session',
    surface: 'live',
    keywords: ['study', 'desk', 'room', 'spatial', 'walkthrough', 'notes', 'shared attention'],
  },
  {
    id: 'board',
    label: 'Board view',
    blurb: "Spread this answer's cards on a spatial board you can wander",
    group: 'This session',
    surface: 'live',
    tourChapter: 'canvas',
    keywords: ['board', 'spatial', 'canvas', 'spread', 'arrange', 'wander', 'map'],
  },
  {
    id: 'focus',
    label: 'Focus mode',
    blurb: 'One card at a time, with a filmstrip of the rest',
    group: 'This session',
    surface: 'live',
    tourChapter: 'focus',
    keywords: ['focus', 'one card', 'filmstrip', 'zoom'],
  },
  {
    id: 'ink',
    label: 'Highlight to ask',
    blurb: 'Mark any part of an answer to ask Mavéa about it',
    group: 'This session',
    surface: 'live',
    tourChapter: 'highlight',
    keywords: ['ink', 'draw', 'highlight', 'annotate', 'mark', 'ask'],
  },
  {
    // "The Blank Space" — the answer arrives with the numbers only YOU know left as glowing holes to
    // fill (type, speak, or drop a card in). Model-authored mid-answer, so it can't be triggered on
    // demand — but the walkthrough shows it key-free (a hand-authored answer with holes, then filled).
    id: 'blanks',
    label: 'The Blank Space',
    blurb:
      'An answer can leave a glowing hole for a value only you know — type it, say it, or drop a card in',
    group: 'This session',
    surface: 'live',
    tourChapter: 'blanks',
    keywords: [
      'blank',
      'blanks',
      'fill',
      'fill in',
      'fill in my numbers',
      'your numbers',
      'hole',
      'slot',
      'placeholder',
    ],
  },

  // ── While listening (the voice-first, think-out-loud surfaces) ──────────────
  {
    id: 'watch-me-think',
    label: 'Watch me think',
    blurb: 'Talk freely — nothing is answered, your thinking is drawn as a live map',
    group: 'While listening',
    surface: 'live',
    tourChapter: 'think',
    keywords: ['mind map', 'mindshape', 'think', 'ramble', 'map', 'thinking'],
  },
  {
    id: 'just-listen',
    label: 'Just listen',
    blurb: 'Talk freely — nothing is answered, every thought is banked to sort later',
    group: 'While listening',
    surface: 'live',
    tourChapter: 'just-listen',
    keywords: ['listen', 'bank', 'think out loud', 'notes'],
  },
  {
    id: 'whisper',
    label: 'Whisper mode',
    // It's automatic (softens the voice in quiet hours), so the palette action opens its setting —
    // say so, or clicking it and landing in Settings reads as "the button didn't do what it said".
    blurb: "Ultra-quiet voice for when you can't make a sound — opens its Quiet-hours setting",
    group: 'While listening',
    surface: 'live',
    tourChapter: 'whisper',
    keywords: ['quiet', 'whisper', 'night', 'silent'],
  },
  {
    id: 'ghost',
    label: 'Ghost answers',
    // Its action starts Just Listen (where the drafts actually appear) — name that so the outcome
    // matches the click.
    blurb: 'Mavéa quietly drafts what it would say — starts Just listen, where the drafts appear',
    group: 'While listening',
    surface: 'live',
    tourChapter: 'ghost',
    keywords: ['ghost', 'draft', 'preview', 'alternative'],
  },

  // ── Setup (connect, configure, learn the ropes) ─────────────────────────────
  {
    id: 'settings',
    label: 'Model settings',
    blurb: 'Connect a provider and tune how Mavéa answers',
    group: 'Setup',
    surface: 'live',
    tourChapter: 'settings',
    // This one dialog owns a dozen shipped controls the palette is the only index of. Without
    // their names here, searching "theme", "backup" or "tokens" answered "No features match" —
    // which reads as "Mavéa can't do that" on the surface built for discovery.
    keywords: [
      'settings',
      'model',
      'provider',
      'api key',
      'config',
      'appearance',
      'theme',
      'dark mode',
      'light mode',
      'workspace',
      'text size',
      'font',
      'web search',
      'thinking time',
      'explanation level',
      'usage',
      'tokens',
      'cost',
      'spend',
      'backup',
      'export',
      'import',
      'restore',
    ],
  },
  {
    id: 'morning-brief',
    label: 'Morning brief',
    // Automatic once on, so the palette action opens the switch that turns it on — say so.
    blurb: "Open the day with what's changed — off by default; opens the switch that turns it on",
    group: 'Setup',
    surface: 'live',
    tourChapter: 'morning-brief',
    keywords: ['brief', 'briefing', 'morning', 'daily', 'catch up', 'start of day'],
  },
  {
    id: 'how',
    label: 'How Mavéa works',
    blurb: 'A quick tour of the basics',
    group: 'Setup',
    surface: 'both',
    keywords: ['help', 'tour', 'how', 'guide', 'onboarding'],
  },
];

/** Lower-cased haystack for fuzzy matching one feature. */
export function featureHaystack(f: Feature): string {
  return [f.label, f.blurb, f.group, ...(f.keywords ?? [])].join(' ').toLowerCase();
}
