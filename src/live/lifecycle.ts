// lifecycle.ts — decide what a new Live turn does to the canvas: clear and build a
// fresh set, add to what's there, or update it in place.
//
// The demo cross-fades to a brand-new canvas on a topic switch but keeps the canvas
// when a follow-up just drills in. Live had neither instinct — it rebuilt everything
// every turn — so a follow-up threw away the view the user was reading. This module is
// the bulletproof decision: a capable model may TAG its turn (replace / augment /
// refine), but a deterministic topic-shift check is the override that catches the
// model when it's wrong, and the only signal a small local model needs.
//
// Pure and tier-aware: a 3B model's hint is never trusted (it decides from word
// overlap alone), a frontier model's hint is honored on a genuine follow-up. The one
// hard rule the deterministic side enforces: you cannot AUGMENT a canvas about a
// different topic — a real topic shift always REPLACES.
import type { Block } from '../data/conversation';

/** What this turn does to the canvas. */
export type Mode = 'replace' | 'augment' | 'refine';

/** The comparable essence of one turn — enough to tell topic shift from follow-up. */
export interface TurnSnapshot {
  /** The user's question this turn. */
  question: string;
  /** Mavéa's spoken line. */
  narration: string;
  /** The answer's headline. */
  title: string;
  /** The block types produced, in order. */
  blockTypes: string[];
}

/** Below this much word overlap with the prior turn (and no model guidance), it's a new
 *  topic → REPLACE. Tuned low so a follow-up that just re-words things still APPENDS
 *  rather than wiping the canvas — most of the "stop wiping the page" win is here. */
const TOPIC_SHIFT_BELOW = 0.1;
/** A hard floor: even a model that explicitly asks to keep the canvas can't append onto a
 *  CLEARLY unrelated topic (it's almost certainly wrong) — this protects against a stale
 *  canvas accreting unrelated answers. */
const UNRELATED_FLOOR = 0.04;

/** Common words that carry no topic signal — dropped before comparing turns. */
const STOPWORDS: ReadonlySet<string> = new Set([
  'the',
  'a',
  'an',
  'of',
  'to',
  'and',
  'or',
  'is',
  'are',
  'was',
  'were',
  'be',
  'in',
  'on',
  'at',
  'for',
  'my',
  'me',
  'i',
  'you',
  'it',
  'this',
  'that',
  'these',
  'those',
  'how',
  'what',
  'why',
  'when',
  'where',
  'which',
  'who',
  'should',
  'do',
  'does',
  'did',
  'can',
  'could',
  'would',
  'will',
  'with',
  'about',
  'please',
  'show',
  'tell',
  'give',
  'make',
  'get',
  'see',
  'want',
  'need',
  'from',
  'by',
  'as',
  'so',
  'if',
  'then',
  'your',
  'our',
  'their',
  'his',
  'her',
  'its',
]);

/** Lowercased, stopword-free, length≥2 word set — the topic fingerprint of some text. */
function topicTokens(text: string): Set<string> {
  const out = new Set<string>();
  for (const raw of text.toLowerCase().split(/[^a-z0-9]+/)) {
    if (raw.length >= 2 && !STOPWORDS.has(raw)) out.add(raw);
  }
  return out;
}

/** Jaccard similarity of two token sets (0 = disjoint, 1 = identical). */
function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

/** How much two turns are about the same thing (their question + narration + title). */
export function topicOverlap(prior: TurnSnapshot, next: TurnSnapshot): number {
  const text = (s: TurnSnapshot) => `${s.question} ${s.narration} ${s.title}`;
  return jaccard(topicTokens(text(prior)), topicTokens(text(next)));
}

/** Words that ask to keep going rather than name a subject — the vocabulary of "more please".
 *  Stripped before judging whether a question introduces its own topic: "tell me more" and
 *  "go deeper with another example" name nothing, they lean on what's already on screen. */
const CONTINUATION_WORDS: ReadonlySet<string> = new Set([
  'more',
  'deeper',
  'deep',
  'further',
  'detail',
  'details',
  'detailed',
  'elaborate',
  'expand',
  'explain',
  'continue',
  'keep',
  'go',
  'going',
  'dive',
  'depth',
  'again',
  'else',
  'another',
  'example',
  'examples',
  'ok',
  'okay',
  'yes',
  'sure',
]);

/**
 * Pre-turn guess at whether `question` is a follow-up to `prior` — before the answer exists,
 * so there's no narration/title to compare and no model hint yet. Jaccard is the wrong tool
 * here: a four-word follow-up against a forty-token prior turn scores near zero even when
 * every word matches. So this reads two honest signals instead: a question whose content
 * words are all continuation vocabulary is anaphoric ("tell me more", "why?" — it leans on
 * what's on screen), and one whose own subject words mostly already appear in the prior turn
 * is drilling into it. A short question that names a NEW subject ("what is bitcoin?") passes
 * neither and stays a fresh topic.
 */
export function likelyFollowUp(prior: TurnSnapshot | null, question: string): boolean {
  if (!prior) return false;
  const subject = [...topicTokens(question)].filter((t) => !CONTINUATION_WORDS.has(t));
  if (subject.length === 0) return true;
  const p = topicTokens(`${prior.question} ${prior.narration} ${prior.title}`);
  let inter = 0;
  for (const t of subject) if (p.has(t)) inter++;
  return inter / subject.length >= 0.5;
}

/**
 * Decide the canvas mode for `next` given the `prior` turn, the model's optional
 * `hint`, and the model `tier`. Deterministic safety first: no prior, or a topic
 * shift, always REPLACES. On a genuine follow-up a capable model's hint is honored;
 * a small model (or no hint) defaults to the non-destructive AUGMENT — and the caller
 * still verifies the augment is safe, downgrading to REPLACE if it isn't.
 */
export function resolveMode(
  prior: TurnSnapshot | null,
  next: TurnSnapshot,
  hint: Mode | undefined,
  tier: 'frontier' | 'mid' | 'small',
): Mode {
  if (!prior) return 'replace';
  const overlap = topicOverlap(prior, next);
  // Trust a capable model that explicitly wants to KEEP the canvas (augment/refine) — a
  // re-worded follow-up is still the same thread even when the words barely overlap, so we
  // honor the hint right down to the unrelated floor. This is what stops the over-wiping.
  if (tier !== 'small' && (hint === 'augment' || hint === 'refine')) {
    return overlap < UNRELATED_FLOOR ? 'replace' : hint;
  }
  // An explicit 'replace', or a topic shift with no keep-hint, clears the canvas.
  if (tier !== 'small' && hint === 'replace') return 'replace';
  return overlap < TOPIC_SHIFT_BELOW ? 'replace' : 'augment';
}

/* ------------------------------------------------------------------ *
 * Content diffing — Live regenerates fresh block ids every turn, so a turn's blocks
 * are identified by their CONTENT (type + headline), not their id. The caller uses
 * this to spotlight only what's new on an augment, and to verify nothing was lost.
 * ------------------------------------------------------------------ */
export interface BlockDiff {
  /** Signatures present in `next` but not `prior` — the newly added blocks. */
  added: string[];
  /** Signatures in both — carried over. */
  kept: string[];
  /** Signatures in `prior` but not `next` — dropped. */
  removed: string[];
}

/** A stable content identity for a block: its type plus its normalized headline. */
export function blockSignature(block: Block): string {
  const type = (block as { type?: string }).type ?? '';
  const props = (block as { props?: unknown }).props;
  let label = '';
  if (props && typeof props === 'object') {
    const p = props as Record<string, unknown>;
    for (const key of ['title', 'eyebrow', 'headline', 'head', 'label', 'name']) {
      const v = p[key];
      if (typeof v === 'string' && v.trim()) {
        label = v.trim().toLowerCase();
        break;
      }
    }
  }
  return `${type}:${label}`;
}

/** Diff two block lists by content signature. */
export function diffBlocks(prior: Block[], next: Block[]): BlockDiff {
  const priorSigs = new Set(prior.map(blockSignature));
  const nextSigs = new Set(next.map(blockSignature));
  const added: string[] = [];
  const kept: string[] = [];
  for (const sig of nextSigs) (priorSigs.has(sig) ? kept : added).push(sig);
  const removed = [...priorSigs].filter((sig) => !nextSigs.has(sig));
  return { added, kept, removed };
}

/* ------------------------------------------------------------------ *
 * Merging — turn the prior canvas + this turn's blocks into the next canvas, per mode.
 * Blocks are re-numbered live-1.. across the merged set so ids stay unique and stable
 * (the prior blocks keep their slots and ids, so the canvas reconciles without a remount).
 * ------------------------------------------------------------------ */
/** Past this many blocks, an augment is too crowded — the caller should REPLACE instead. */
export const AUGMENT_CAP = 16;

export interface MergeResult {
  /** The merged blocks, re-numbered live-1.. */
  blocks: Block[];
  /** The id of the first newly-added block (to spotlight), or null when nothing was added. */
  firstNewId: string | null;
  /** True when the merge grew past AUGMENT_CAP — the caller should fall back to REPLACE. */
  overflow: boolean;
}

function renumber(blocks: Block[]): Block[] {
  return blocks.map((b, i) => ({ ...b, id: `live-${i + 1}` }));
}

/**
 * Produce the next canvas from the `prior` blocks and this turn's `next` blocks.
 *  - replace: just this turn's blocks (also the path for the very first turn).
 *  - augment: keep the prior blocks, append the genuinely new ones (by content).
 *  - refine: update prior blocks whose content matches in place, append the rest.
 * Always returns prior content intact for augment/refine, so the user never loses their
 * place; `overflow` signals when augmenting has grown the canvas too far.
 */
export function mergeForMode(prior: Block[], next: Block[], mode: Mode): MergeResult {
  if (mode === 'replace' || prior.length === 0) {
    const blocks = renumber(next);
    return { blocks, firstNewId: blocks[0]?.id ?? null, overflow: false };
  }

  if (mode === 'refine') {
    const slotBySig = new Map<string, number>();
    prior.forEach((b, i) => slotBySig.set(blockSignature(b), i));
    const merged = [...prior];
    const appended: Block[] = [];
    for (const nb of next) {
      const slot = slotBySig.get(blockSignature(nb));
      if (slot !== undefined) merged[slot] = nb;
      else appended.push(nb);
    }
    const blocks = renumber([...merged, ...appended]);
    const firstNewId = appended.length ? (blocks[merged.length]?.id ?? null) : null;
    return { blocks, firstNewId, overflow: blocks.length > AUGMENT_CAP };
  }

  // augment
  const seen = new Set(prior.map(blockSignature));
  const fresh = next.filter((b) => !seen.has(blockSignature(b)));
  const blocks = renumber([...prior, ...fresh]);
  const firstNewId = fresh.length ? (blocks[prior.length]?.id ?? null) : null;
  return { blocks, firstNewId, overflow: blocks.length > AUGMENT_CAP };
}
