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
      'Multiple text variants of the same message — three email rewrites with different tones, A/B subject lines, formal vs casual alternatives — each numbered with a label and optional note. Use whenever the ask is "write N versions/variants/alternatives of …".',
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
];
