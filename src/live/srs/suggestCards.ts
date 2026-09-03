// suggestCards.ts — turn an answer block into flashcard suggestions the user can edit before
// saving. Two paths, both real-data-only (nothing is ever invented):
//   • Blocks that already carry question/answer pairs (flashcard, faq, deflist, quiz) yield real
//     cards instantly, with no model call.
//   • Any other block gets a deterministic seed (its real title as the cue, its key line as the
//     answer); when a model is configured, `draftCardsFromBlock` refines that into well-formed
//     student cards, grounded strictly in the block's own text. It degrades to the seed offline.
//
// The authoring bar for a good card: atomic (one idea), concise, and focused on what's worth
// remembering — key facts, definitions, formulas, cause→effect, a concrete example when it helps.
import type { Block } from '../../data/conversation';
import { blockLabel } from '../../canvas/blockLabel';
import { getAdapter } from '../providers/index';
import { speedTierFor } from '../speed';
import type { ModelConfig } from '../../types/mavea';
import { stripHtml } from './extractCards';

export interface DraftCard {
  front: string;
  back: string;
  tag?: string;
}

// ── reading real cards out of question/answer blocks ──────────────────────────────────

function clean(s: string | undefined): string {
  return stripHtml(s ?? '').trim();
}

/**
 * Real question/answer pairs already present in a block (HTML stripped). Covers the block types
 * that are inherently card-shaped; everything else returns [] (use the seed + draft path instead).
 */
export function cardsFromBlock(b: Block): DraftCard[] {
  const out: DraftCard[] = [];
  const push = (front: string, back: string, tag?: string): void => {
    const f = clean(front);
    const bk = clean(back);
    if (f && bk) out.push({ front: f, back: bk, tag: clean(tag) || undefined });
  };
  switch (b.type) {
    case 'flashcard':
      for (const c of b.props.cards ?? []) push(c.front, c.back, c.tag);
      break;
    case 'faq':
      for (const it of b.props.items ?? []) push(it.q, it.a, it.tag);
      break;
    case 'deflist':
      for (const it of b.props.items ?? []) push(it.term, it.def, it.tag);
      break;
    case 'quiz': {
      const correct = (b.props.options ?? [])
        .filter((o) => o.correct)
        .map((o) => clean(o.text))
        .filter(Boolean);
      if (correct.length) {
        const expl = clean(b.props.explanation);
        const back = expl ? `${correct.join('; ')} — ${expl}` : correct.join('; ');
        push(b.props.question, back);
      }
      break;
    }
    default:
      break;
  }
  return out;
}

/** True when a block contains genuine card material (so a one-tap capture produces complete cards). */
export function blockYieldsCards(b: Block): boolean {
  return cardsFromBlock(b).length > 0;
}

// ── generic title / body / text extraction for arbitrary blocks ───────────────────────

const TITLE_FIELDS = ['title', 'label', 'heading', 'name', 'question', 'caption', 'eyebrow'];
const BODY_FIELDS = ['summary', 'narrative', 'detail', 'sub', 'body', 'text', 'prose', 'def', 'a'];

function props(b: Block): Record<string, unknown> {
  return (b as unknown as { props?: Record<string, unknown> }).props ?? {};
}

function pickString(p: Record<string, unknown>, fields: readonly string[]): string {
  for (const f of fields) {
    const v = p[f];
    if (typeof v === 'string') {
      const s = clean(v);
      if (s) return s;
    }
  }
  return '';
}

function titleOf(b: Block): string {
  return pickString(props(b), TITLE_FIELDS).slice(0, 140) || blockLabel(b);
}

function bodyOf(b: Block): string {
  return pickString(props(b), BODY_FIELDS).slice(0, 400);
}

/** A deterministic, real-data seed card for a block with no inherent Q/A — the user fills the gaps. */
export function seedCardFromBlock(b: Block): DraftCard {
  return { front: titleOf(b), back: bodyOf(b) };
}

/** Gather the block's readable text (title + string props + shallow list items) to ground a draft. */
function blockText(b: Block): string {
  const parts: string[] = [];
  const title = titleOf(b);
  if (title) parts.push(title);
  for (const [, v] of Object.entries(props(b))) {
    if (typeof v === 'string') {
      const s = clean(v);
      if (s && s !== title) parts.push(s);
    } else if (Array.isArray(v)) {
      for (const it of v.slice(0, 12)) {
        if (typeof it === 'string') {
          const s = clean(it);
          if (s) parts.push(s);
        } else if (it && typeof it === 'object') {
          for (const key of ['label', 'text', 'term', 'def', 'q', 'a', 'name', 'value', 'title']) {
            const val = (it as Record<string, unknown>)[key];
            if (typeof val === 'string') {
              const s = clean(val);
              if (s) parts.push(s);
            }
          }
        }
      }
    }
  }
  // De-duplicate consecutive repeats and cap the grounding context.
  return [...new Set(parts)].join('\n').slice(0, 1400);
}

/** The synchronous starting point for the add sheet: real cards when the block has them, else a seed. */
export function initialCardsForBlock(b: Block): { cards: DraftCard[]; exact: boolean } {
  const real = cardsFromBlock(b);
  if (real.length) return { cards: real, exact: true };
  return { cards: [seedCardFromBlock(b)], exact: false };
}

// ── model-refined suggestions (arbitrary blocks, only when a model is configured) ──────

const DRAFT_SYSTEM =
  'You write flashcards the way a strong student does: atomic (one idea per card), concise (no ' +
  'long prose), and focused on what is worth memorising — key facts, definitions and terms, ' +
  'formulas, cause→effect, and a single concrete example when it aids recall. The FRONT is a clear ' +
  'question or cue; the BACK is the shortest complete answer. Use ONLY information present in the ' +
  'source text — never add facts not stated there. Return 1–4 cards as JSON of the form ' +
  '{"cards":[{"front":"…","back":"…"}]}.';

const CARD_SCHEMA = {
  type: 'object',
  properties: {
    cards: {
      type: 'array',
      minItems: 1,
      maxItems: 4,
      items: {
        type: 'object',
        properties: { front: { type: 'string' }, back: { type: 'string' } },
        required: ['front', 'back'],
      },
    },
  },
  required: ['cards'],
} as const;

function parseCards(raw: string | object): DraftCard[] {
  let obj: unknown = raw;
  if (typeof raw === 'string') {
    const s = raw.trim();
    try {
      obj = JSON.parse(s);
    } catch {
      const m = s.match(/\{[\s\S]*\}/);
      if (!m) return [];
      try {
        obj = JSON.parse(m[0]);
      } catch {
        return [];
      }
    }
  }
  const cards = (obj as { cards?: unknown })?.cards;
  if (!Array.isArray(cards)) return [];
  const out: DraftCard[] = [];
  for (const c of cards) {
    if (!c || typeof c !== 'object') continue;
    const front = clean(String((c as Record<string, unknown>).front ?? '')).slice(0, 300);
    const back = clean(String((c as Record<string, unknown>).back ?? '')).slice(0, 600);
    if (front && back) out.push({ front, back });
  }
  return out.slice(0, 4);
}

/**
 * Ask the configured model to distill a block into well-formed student cards, grounded strictly in
 * the block's own text. Returns [] on any failure (no model, offline, bad key, abort) so callers can
 * fall back to the deterministic seed without a try/catch of their own.
 */
export async function draftCardsFromBlock(
  b: Block,
  cfg: ModelConfig,
  signal?: AbortSignal,
): Promise<DraftCard[]> {
  const content = blockText(b);
  if (!content) return [];
  // Keep the call cheap, and cheaper still on a measured-slow model (runs-on-all-hardware). Even the
  // slow-tier cap needs enough room for up to 4 real cards (the schema's maxItems) — 320 could
  // truncate the JSON on a well-populated block and silently yield zero cards instead of a few.
  const maxTokens = speedTierFor(cfg.model) === 'slow' ? 480 : 640;
  try {
    const out = await getAdapter(cfg.provider).generate(
      {
        usageLabel: 'srs-card-suggestions',
        system: DRAFT_SYSTEM,
        systemBase: DRAFT_SYSTEM,
        history: [],
        user: `Source (from the answer the user is studying):\n"""\n${content}\n"""\n\nWrite the flashcards now.`,
        maxTokens,
        temperature: 0,
        thinkingLevel: 'minimal',
        format: CARD_SCHEMA,
        ...(signal ? { signal } : {}),
      },
      cfg,
    );
    if (signal?.aborted) return [];
    return parseCards(out.raw);
  } catch {
    return [];
  }
}
