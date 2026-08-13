// compose family block types — writing and messaging primitives for drafts, threads,
// dialogues, variants, verse, and slide outlines. Prop shapes are realistic and
// sample-friendly — a data agent fills them later.
import type { BlockBase, AccentVar, HtmlString } from '../../../data/conversation';
// IconKey re-export from `conversation` is missing in the current scaffold (a shared file
// we must not edit), so import it from its canonical source — same type, identical to what
// `conversation` itself imports.
import type { IconKey } from '../../../types/mavea';

/* ── messagedraft ── polished email/message draft with subject, recipient, and full body ── */
// Use for: "write me an email", "draft a message", "compose a reply"
export interface MessageDraftProps {
  title: string; // card eyebrow label, e.g. "Draft Email"
  icon?: IconKey;
  iconColor?: AccentVar;
  subject: string; // email subject line
  to?: string; // recipient name/email shown at top
  from?: string; // sender name (shown when relevant)
  greeting?: string; // opening salutation, e.g. "Hi Sarah,"
  body: HtmlString; // the full message body (may use <p>, <br> etc.)
  closing?: string; // sign-off line, e.g. "Best regards,"
  signature?: string; // sender signature
  tone?: 'formal' | 'friendly' | 'casual' | 'assertive';
  footer?: HtmlString; // usage notes, e.g. "Adjust tone as needed"
}

/* ── chatthread ── realistic IM/chat conversation (user bubbles + other-side bubbles) ── */
// Use for: scripted convos, example dialogues, help desk threads, LLM prompt examples
// HARD CONSTRAINT: the model ONLY provides messages the user supplies; never invent
// the "other" side if user didn't provide it — makes up/hallucinated content
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'other';
  name?: string; // display name for this message
  text: string; // message text (plain or lightly formatted)
  time?: string; // timestamp label, e.g. "10:32 AM"
  status?: 'sent' | 'delivered' | 'read' | 'error';
}
export interface ChatThreadProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  participants?: string; // e.g. "You + Claude" — shown in eyebrow
  messages: ChatMessage[];
  footer?: HtmlString;
}

/* ── dialogue ── structured Q&A / interview format (two alternating speakers) ── */
export interface DialogueLine {
  speaker: string;
  text: string;
  note?: string; // optional aside/annotation under the line
}
export interface DialogueProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  context?: string; // brief framing of the exchange
  lines: DialogueLine[];
  footer?: HtmlString;
}

/* ── variants ── side-by-side text variants (A/B options, rewrites, tone comparisons) ── */
export interface TextVariant {
  label: string; // e.g. "Formal", "Option A", "Original"
  text: string;
  note?: string;
}
export interface VariantsProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  prompt?: string; // the original request that produced these variants
  variants: TextVariant[];
  footer?: HtmlString;
}

/* ── verse ── poem, lyrics, or any line-structured literary text ── */
export interface VerseLine {
  text: string;
  indent?: number; // 0=flush, 1=indented, 2=double-indented
}
export interface VerseStanza {
  lines: VerseLine[];
  label?: string; // stanza label, e.g. "Verse 1", "Chorus"
}
export interface VerseProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  stanzas: VerseStanza[];
  form?: string; // e.g. "Sonnet", "Haiku", "Free verse"
  footer?: HtmlString;
}

/* ── slidedeck ── slide-by-slide outline of a presentation ── */
export interface Slide {
  title: string;
  bullets?: string[];
  note?: string; // speaker note / annotation
  layout?: 'title' | 'content' | 'quote' | 'image';
}
export interface SlideDeckProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  deck: string; // deck/presentation title
  slides: Slide[];
  footer?: HtmlString;
}

/* ── voicestyle ── capture & apply the user's personal writing voice (traits + before→after) ── */
// Use for: "learn my voice", "make it sound like me", "rewrite this in my style".
// The before→after is the payoff — the SAME line in a flat generic voice vs in the user's own.
export interface VoiceTrait {
  trait: string; // a captured style fingerprint, e.g. "Short sentences", "Dry humour"
  example?: string; // an optional tell-tale snippet showing the trait in action
}
export interface VoiceSample {
  generic: string; // the same line written in a flat, generic voice (the muted "before")
  inYourVoice: string; // that line rewritten in the user's own voice (the emphasised "after")
}
export interface VoiceStyleProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  traits: VoiceTrait[]; // the learned style traits, rendered as chips
  sample: VoiceSample; // the before→after pair — the reveal the card builds toward
  footer?: HtmlString;
}

/* ── screenplay ── industry-standard screenplay formatting (sluglines, action, cues, dialogue) ── */
// Use for: "write a screenplay/script scene", "format this as a screenplay".
// Each element carries its kind; the renderer applies the correct margin, casing, and
// alignment for that kind — the model only supplies the kind + the raw line text.
export interface ScreenplayElement {
  kind: 'slug' | 'action' | 'character' | 'parenthetical' | 'dialogue' | 'transition';
  text: string;
}
export interface ScreenplayProps {
  title?: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  elements: ScreenplayElement[];
  caption?: string; // a brief scene framing shown above the page
  footer?: HtmlString;
}

/* ── socialpost ── platform post preview (X · LinkedIn · Instagram · Threads · generic) ── */
// Use for: "draft a tweet/post", "write my LinkedIn update", "what should I post about…"
// The live char-count readout is why `platform` is required — it picks the cap the count reads against.
export interface SocialPostMedia {
  alt: string; // what the attached photo/video shows — no real asset, just the described slot
}
export interface SocialPostProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  platform: 'x' | 'linkedin' | 'instagram' | 'threads' | 'generic';
  handle: string; // e.g. "alexrivera" or "@alexrivera" — the @ is added automatically where the platform expects one
  displayName?: string; // shown name above the handle, e.g. "Alex Rivera"
  avatarInitial?: string; // override for the avatar glyph; defaults to displayName/handle's first letter
  body: string; // the post text itself — plain, not HTML
  timestamp?: string; // e.g. "2h", "Jul 2"
  media?: SocialPostMedia[]; // described attachment slots (no real image URLs — text only)
  footer?: HtmlString;
}

/* ── longread ── Mavéa's OWN long-form prose, typeset to be read ── */
// Use for: a 400–1500-word connected answer, or a piece the user will take away and use
// (cover letter, personal statement, wedding toast, blog post).
// Deliberately carries NO filename, page number, or any other uploaded-document chrome —
// `docview` always prints a file bar, which frames Mavéa's own writing as somebody else's
// document. Body text is PLAIN strings (React text nodes, escaped), never markup.
export interface LongreadSection {
  heading?: string; // section heading; omit to continue the previous section without a new one
  paragraphs: string[]; // the section's prose, one plain-text paragraph per string
}
export interface LongreadProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  standfirst?: string; // the opening sentence or two that sets the piece up, set larger
  sections: LongreadSection[];
  readingTime?: number; // minutes; derived from the word count when omitted
  copySections?: boolean; // add a copy button beside each headed section, not just the whole piece
  footer?: HtmlString;
}

/* ── ideaboard ── a deliberately UNRANKED spread of ideas for a brainstorm ── */
// Use for: "give me ideas", "what should I name this", "what could I do about X".
// Every other list block converges — `picks` ranks, `tierlist` grades, `takeaways` concludes,
// `variants` rewrites the SAME text. This one shows breadth: ideas grouped into equal-weight
// angles (lenses), none of them marked as the winner.
export interface Idea {
  label: string; // the idea itself, kept short
  note?: string; // one line on what it would look like — never a reason it's the best
  angle?: string; // the lens it belongs to, e.g. "Safe" · "Bold" · "Left-field"
}
export interface IdeaBoardProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  ask?: string; // the brainstorm question these ideas answer
  ideas: Idea[]; // grouped by `angle` in first-appearance order; no angles → one flat spread
  footer?: HtmlString;
}

export type ComposeBlock =
  | (BlockBase & { type: 'messagedraft'; props: MessageDraftProps })
  | (BlockBase & { type: 'chatthread'; props: ChatThreadProps })
  | (BlockBase & { type: 'dialogue'; props: DialogueProps })
  | (BlockBase & { type: 'variants'; props: VariantsProps })
  | (BlockBase & { type: 'verse'; props: VerseProps })
  | (BlockBase & { type: 'slidedeck'; props: SlideDeckProps })
  | (BlockBase & { type: 'voicestyle'; props: VoiceStyleProps })
  | (BlockBase & { type: 'screenplay'; props: ScreenplayProps })
  | (BlockBase & { type: 'socialpost'; props: SocialPostProps })
  | (BlockBase & { type: 'longread'; props: LongreadProps })
  | (BlockBase & { type: 'ideaboard'; props: IdeaBoardProps });
