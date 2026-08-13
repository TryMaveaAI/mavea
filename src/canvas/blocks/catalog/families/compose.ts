// Catalog entries for the `compose` family — the fact sheet the Live selector retrieves over
// and the prompt menu is built from. This module carries the DETAIL fields (blurb, requires,
// optional, item shapes, prop hints); the compact selection facts are generated from it into
// facts.generated.ts. It is loaded lazily, only for the families a turn actually reaches, which is
// what keeps per-turn cost proportional to the answer rather than to the library.
//
// After editing, run `pnpm gen:catalog` — a staleness test fails the build otherwise.
import { createMeta, type ComponentCatalog } from '../meta';

export const CATALOG_COMPOSE: ComponentCatalog = [
  createMeta('voicestyle', {
    family: 'compose',
    dataShapes: ['text', 'comparison'],
    requires: ['title', 'traits', 'sample'],
    optional: ['icon', 'iconColor', 'footer'],
    interactive: false,
    wowWeight: 0.74,
    tier: 'frontier',
    colDefault: 7,
    colMin: 5,
    coercer: 'generic',
    blurb:
      "Captures the user's personal writing voice as style-trait chips, then lands a before→after — the same line in a flat generic voice vs rewritten in the user's own voice (the rewrite is the emphasised payoff). For 'learn my voice / make it sound like me'.",
    itemShapes: [{ prop: 'traits', text: 'trait', textAliases: ['name', 'label', 'style'] }],
    propHints: {
      sample:
        "{ generic: string, inYourVoice: string } — the SAME line, generic vs in-the-user's-voice",
      'traits[].example': 'optional short snippet showing the trait in action',
      iconColor: 'var(--presence)|var(--insight)|var(--warning)',
    },
    intents: ['draft', 'compare'],
  }),
  // ── compose family ──────────────────────────────────────────────────────────
  createMeta('messagedraft', {
    family: 'compose',
    dataShapes: ['text'],
    requires: ['title', 'subject', 'body'],
    optional: [
      'icon',
      'iconColor',
      'to',
      'from',
      'greeting',
      'closing',
      'signature',
      'tone',
      'footer',
    ],
    interactive: false,
    wowWeight: 0.72,
    tier: 'base',
    colDefault: 8,
    colMin: 6,
    coercer: 'generic',
    blurb:
      'A polished email or message draft with subject, recipient, body, and tone chip — ready to copy and send.',
    propHints: {
      tone: "'formal'|'casual'|'friendly'|'professional'|'apologetic'|'assertive'",
      iconColor: 'var(--presence)|var(--insight)|var(--warning)',
    },
  }),
  createMeta('chatthread', {
    family: 'compose',
    dataShapes: ['sequence', 'text'],
    requires: ['title', 'messages'],
    optional: ['icon', 'iconColor', 'participants', 'footer'],
    interactive: false,
    wowWeight: 0.68,
    tier: 'base',
    colDefault: 8,
    colMin: 6,
    coercer: 'generic',
    blurb:
      'A realistic chat bubble thread — existing text messages or IM-style conversation, rendered as user/assistant speech bubbles with names and timestamps. For a scripted theatrical exchange between named characters, use `dialogue` instead.',
    itemShapes: [
      {
        prop: 'messages',
        text: 'text',
        textAliases: ['content', 'body', 'message'],
        requiredFields: ['role'],
      },
    ],
    propHints: {
      'messages[].status': "'sent'|'delivered'|'read'|'error'",
      'messages[].role': "'user'|'assistant'|'system'|'other'",
    },
  }),
  createMeta('dialogue', {
    family: 'compose',
    dataShapes: ['sequence', 'text'],
    requires: ['title', 'lines'],
    optional: ['icon', 'iconColor', 'context', 'footer'],
    interactive: false,
    wowWeight: 0.68,
    tier: 'base',
    colDefault: 8,
    colMin: 6,
    coercer: 'generic',
    blurb:
      'A script-style exchange between two named characters — teacher/student, interviewer/candidate, doctor/patient — alternating spoken lines with optional context header. Use for any "write a dialogue/conversation between X and Y" ask.',
    itemShapes: [{ prop: 'lines', text: 'text', textAliases: ['content', 'dialogue', 'line'] }],
  }),
  createMeta('variants', {
    family: 'compose',
    dataShapes: ['comparison', 'text'],
    requires: ['title', 'variants'],
    optional: ['icon', 'iconColor', 'prompt', 'footer'],
    interactive: false,
    wowWeight: 0.7,
    tier: 'base',
    colDefault: 8,
    colMin: 6,
    coercer: 'generic',
    blurb:
      'Several SHORT versions of the same line, stacked so they can be compared at a glance — A/B subject lines, three taglines, alternative sign-offs, a formal vs casual opener — each numbered with a label and optional note. Reach for it when the ask is "write N versions/variants/alternatives" AND each version runs a line or two. Never for multi-paragraph rewrites, where a stack of them is a wall of text — use variantswitch for those, ideaboard for a spread of different ideas rather than rewrites of one line.',
    itemShapes: [{ prop: 'variants', text: 'text', textAliases: ['content', 'body', 'value'] }],
  }),
  createMeta('verse', {
    family: 'compose',
    dataShapes: ['text'],
    requires: ['title', 'stanzas'],
    optional: ['icon', 'iconColor', 'form', 'footer'],
    interactive: false,
    wowWeight: 0.62,
    tier: 'base',
    colDefault: 6,
    colMin: 4,
    coercer: 'generic',
    blurb:
      'A poem, song lyrics, or any stanza-structured literary text — with per-line indent, stanza labels, and form note.',
  }),
  createMeta('slidedeck', {
    family: 'compose',
    dataShapes: ['sequence', 'list'],
    requires: ['title', 'deck', 'slides'],
    optional: ['icon', 'iconColor', 'footer'],
    interactive: false,
    wowWeight: 0.7,
    tier: 'base',
    colDefault: 10,
    colMin: 7,
    coercer: 'generic',
    blurb:
      'A presentation outline — one card per slide with title, bullets, speaker notes, and layout hint.',
    itemShapes: [{ prop: 'slides', text: 'title', textAliases: ['name', 'heading', 'label'] }],
    propHints: {
      'slides[].layout': "'title'|'content'|'quote'|'image'",
    },
  }),
  createMeta('screenplay', {
    family: 'compose',
    dataShapes: ['sequence', 'text'],
    requires: ['elements'],
    optional: ['title', 'icon', 'iconColor', 'caption', 'footer'],
    interactive: false,
    wowWeight: 0.72,
    tier: 'frontier',
    colDefault: 8,
    colMin: 6,
    coercer: 'generic',
    blurb:
      'A scene typed in industry-standard screenplay format — sluglines (INT./EXT.), action, centred character cues, parentheticals, indented dialogue, and right-aligned transitions, in monospace. Use for any "write a screenplay/script scene" or "format this as a screenplay" ask.',
    itemShapes: [{ prop: 'elements', text: 'text', textAliases: ['line', 'content'] }],
    propHints: {
      'elements[].kind': "'slug'|'action'|'character'|'parenthetical'|'dialogue'|'transition'",
    },
    domains: ['writing', 'media'],
    intents: ['draft', 'reference'],
  }),
  createMeta('socialpost', {
    family: 'compose',
    dataShapes: ['text'],
    requires: ['title', 'platform', 'handle', 'body'],
    optional: ['icon', 'iconColor', 'displayName', 'avatarInitial', 'timestamp', 'media', 'footer'],
    interactive: false,
    wowWeight: 0.66,
    tier: 'base',
    colDefault: 6,
    colMin: 4,
    coercer: 'generic',
    blurb:
      'A platform post preview — avatar, handle, and body rendered as X/LinkedIn/Instagram/Threads chrome, with a live character-count readout against that platform\'s limit. Use for "draft a tweet/post" or "write my LinkedIn update".',
    itemShapes: [{ prop: 'media', text: 'alt', textAliases: ['caption', 'description', 'label'] }],
    propHints: {
      platform: "'x'|'linkedin'|'instagram'|'threads'|'generic'",
      timestamp: "short relative or absolute label, e.g. '2h' or 'Jul 2'",
      iconColor: 'var(--presence)|var(--insight)|var(--warning)',
    },
  }),
  createMeta('longread', {
    family: 'compose',
    dataShapes: ['text'],
    requires: ['title', 'sections'],
    optional: ['icon', 'iconColor', 'standfirst', 'readingTime', 'copySections', 'footer'],
    interactive: false,
    wowWeight: 0.7,
    tier: 'base',
    colDefault: 7,
    colMin: 5,
    coercer: 'generic',
    blurb:
      'Write it out in full — an essay, article, blog post, speech, cover letter, personal statement, or wedding toast, and any 400–1500-word connected answer meant to be read start to finish rather than skimmed as cards. Typesets prose the way prose wants to be read: an optional standfirst, headed sections on a light reading spine at a real ~66-character measure, the reading time, and a copy-out for the whole piece (or one per section). It renders no filename, page number, or paper chrome, so the words never imply they came out of a file; that framing is what makes docview the wrong block for writing Mavéa produced herself. Reach for storystructure only when the ask is specifically inverted-pyramid news.',
    // Long-form prose is the entire job, and the central fallbacks are calibrated for cards: the
    // key `paragraphs` matches no regex in contentBudget.ts, so every paragraph would be cut at the
    // 240-grapheme default — silently, mid-sentence, on the one block that exists to avoid exactly
    // that. These limits are the blurb's own promise (a 400–1500-word headed piece) with headroom.
    contentBudget: {
      fields: {
        standfirst: { maxGraphemes: 320, maxLines: 4 },
        sections: { maxItems: 20 },
        'sections[].paragraphs': { maxItems: 20 },
        // Newlines inside one paragraph collapse inside its <p>, so lines are not a layout axis
        // here; the grapheme cap is what bounds it — ~250 words, a long but genuine paragraph.
        'sections[].paragraphs[]': { maxGraphemes: 1_600, maxLines: 12 },
      },
    },
    propHints: {
      'sections[].heading':
        'optional — omit to continue the previous section with no new heading; a section with a heading gets a marker on the spine',
      'sections[].paragraphs':
        'the section body as plain-text paragraphs, one string each, ~60–140 words apiece — no HTML and no markdown',
      standfirst:
        'optional opening sentence or two that sets the piece up, set larger above the body',
      readingTime: 'optional minutes to read — derived from the word count when omitted',
      copySections: 'optional true to add a copy button beside every section heading',
      iconColor: 'var(--presence)|var(--insight)|var(--warning)',
    },
    intents: ['explain', 'draft', 'reference'],
  }),
  createMeta('ideaboard', {
    family: 'compose',
    dataShapes: ['list', 'text'],
    requires: ['title', 'ideas'],
    optional: ['icon', 'iconColor', 'ask', 'footer'],
    interactive: false,
    wowWeight: 0.72,
    tier: 'base',
    colDefault: 8,
    colMin: 5,
    coercer: 'generic',
    blurb:
      'A deliberately UNRANKED spread of ideas for a brainstorm — "give me ideas", "what should I name this", "what could I do about X". Each idea is a short label with an optional one-line note, grouped into equal-weight angles/lenses (e.g. "Safe", "Bold", "Left-field") a reader can scan for breadth; ideas with no angle form one flat spread. Nothing is numbered, scored, or crowned — reach for picks/tierlist/quadrant when the answer IS a recommendation, and variants when the options are short rewrites of the SAME line rather than different ideas.',
    itemShapes: [{ prop: 'ideas', text: 'label', textAliases: ['idea', 'text', 'name', 'title'] }],
    // A spread has to SHOW breadth to do its job, and the 16-item default silently clipped exactly
    // that. 24 is the honest number in both directions: it is what the menu clause teaches the
    // model and what the runtime keeps, and the board's auto-fill grid stays dense at that size.
    contentBudget: {
      fields: {
        ideas: { maxItems: 24 },
        // One line on what the idea would look like — a runaway note stretches its whole grid row.
        'ideas[].note': { maxGraphemes: 140, maxLines: 2 },
      },
    },
    propHints: {
      'ideas[].angle':
        'optional lens this idea belongs to, e.g. "Safe" | "Bold" | "Left-field" — ideas sharing an angle group together in first-appearance order; omit it throughout for a flat spread',
      'ideas[].note':
        'optional single line on what the idea would look like — never a reason it beats the others',
      ask: 'optional — the brainstorm question these ideas answer, quoted above the spread',
      iconColor: 'var(--presence)|var(--insight)|var(--warning)',
    },
    intents: ['draft'],
  }),
];
