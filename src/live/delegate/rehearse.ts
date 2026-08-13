// The Rehearsal's take-the-seat engine — Mavéa plays the other side while YOU say your own lines.
// Two small side-channel calls on the user's own key (the ghost-glimpse pattern: bounded,
// abortable, never throws): the counterpart's next line during a take, and one coach card
// between takes. Honesty is structural: the persona is grounded ONLY in the context the
// user typed (plus memory facts they opted in) — the prompt forbids inventing anything
// about the real person, and when the context runs out the counterpart plays it generic
// rather than pretending to know them.
import { getAdapter } from '../providers';
import type { ChatMessage, ModelConfig } from '../providers/types';

export interface RehearsalSetup {
  /** The conversation being rehearsed, in the user's words ("asking for the raise"). */
  scenario: string;
  /** Who Mavéa plays ("my manager", "the contractor"). */
  counterpart: string;
  /** Everything the user chose to supply about the other side — the ONLY persona ground. */
  context: string;
}

export interface CoachCard {
  /** What changed since the last take (or how the first take went). */
  note: string;
  /** One concrete, transcript-grounded tip for the next take. */
  tip: string;
}

/** One exchange inside a take, oldest first. */
export interface TakeLine {
  who: 'you' | 'them';
  text: string;
}

function personaSystem(setup: RehearsalSetup): string {
  return [
    `You are role-playing the OTHER SIDE of a conversation the user is rehearsing: ${setup.counterpart}.`,
    `The conversation: ${setup.scenario}.`,
    'Ground everything in this context the user supplied — and NOTHING else:',
    `"""${setup.context || '(none given)'}"""`,
    'If the context does not tell you how this person would react, play a realistic, generic version of the role — never invent specific facts, history, or quotes about the real person.',
    'Stay in character. Push back the way this role realistically would; do not cave easily, do not be cartoonishly hostile.',
    'The reply is displayed AND spoken. Keep normal spelling on screen, but wrap every name, place, brand, or non-English term a voice might mispronounce as [[shown|said]] — for example [[Omakase|oh-mah-kah-seh]]. The said side must be lowercase voice-safe syllables matching a native/source-language pronunciation, never IPA or an Anglicized guess.',
    'Reply ONLY with JSON: {"reply":"what you say next, 1-3 sentences, spoken language"}. No other keys, no prose outside the JSON.',
  ].join('\n');
}

function coachSystem(): string {
  return [
    'You are a direct, warm conversation coach. The user just finished a practice take of a hard conversation.',
    'Judge ONLY what is in the transcript — quote or reference their actual words; never invent things they said.',
    'If an earlier take summary is given, say concretely what improved or regressed since it.',
    'Reply ONLY with JSON: {"note":"how this take went, 1-2 sentences","tip":"ONE concrete thing to do differently next take, 1-2 sentences"}.',
  ].join('\n');
}

/** Bound the side-channel. The caps stay generous because a reasoning model's thinking
 *  counts against them — a tight cap gets eaten before the first JSON byte and the take
 *  dies on "they didn't respond"; thinkingLevel below keeps the actual spend minimal. */
const REPLY_MAX_TOKENS = 900;
const COACH_MAX_TOKENS = 1000;

function jsonOf(raw: string | object): Record<string, unknown> {
  try {
    if (typeof raw !== 'string') return raw as Record<string, unknown>;
    return JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? '{}') as Record<string, unknown>;
  } catch {
    return {};
  }
}

function toHistory(lines: readonly TakeLine[]): ChatMessage[] {
  return lines.map((l) => ({
    role: l.who === 'you' ? ('user' as const) : ('assistant' as const),
    content: l.text,
  }));
}

/**
 * The counterpart's next line, in character. Empty string on failure/abort — the panel
 * shows a retriable "they didn't respond" state instead of breaking the take.
 */
export async function counterpartReply(
  setup: RehearsalSetup,
  lines: readonly TakeLine[],
  cfg: ModelConfig,
  signal: AbortSignal,
): Promise<string> {
  try {
    const history = toHistory(lines);
    const last = history.pop();
    if (!last || last.role !== 'user') return '';
    const out = await getAdapter(cfg.provider).generate(
      {
        system: personaSystem(setup),
        history,
        user: last.content,
        maxTokens: REPLY_MAX_TOKENS,
        thinkingLevel: 'minimal',
        signal,
      },
      cfg,
    );
    if (signal.aborted) return '';
    const reply = jsonOf(out.raw).reply;
    return typeof reply === 'string' ? reply.trim().slice(0, 600) : '';
  } catch {
    return '';
  }
}

/**
 * One coach card for a finished take, grounded in its real transcript. Null on failure —
 * a missing coach is just absent, never invented.
 */
export async function coachTake(
  setup: RehearsalSetup,
  lines: readonly TakeLine[],
  take: number,
  previousNote: string | null,
  cfg: ModelConfig,
  signal: AbortSignal,
): Promise<CoachCard | null> {
  try {
    if (!lines.some((l) => l.who === 'you')) return null;
    const transcript = lines
      .map((l) => `${l.who === 'you' ? 'USER' : setup.counterpart.toUpperCase()}: ${l.text}`)
      .join('\n');
    const user = [
      `Conversation being rehearsed: ${setup.scenario}`,
      previousNote ? `Earlier take, your summary then: ${previousNote}` : null,
      `Take ${take} transcript:`,
      transcript,
    ]
      .filter(Boolean)
      .join('\n');
    const out = await getAdapter(cfg.provider).generate(
      {
        system: coachSystem(),
        history: [],
        user,
        maxTokens: COACH_MAX_TOKENS,
        thinkingLevel: 'minimal',
        signal,
      },
      cfg,
    );
    if (signal.aborted) return null;
    const obj = jsonOf(out.raw);
    const note = typeof obj.note === 'string' ? obj.note.trim().slice(0, 400) : '';
    const tip = typeof obj.tip === 'string' ? obj.tip.trim().slice(0, 400) : '';
    return note && tip ? { note, tip } : null;
  } catch {
    return null;
  }
}

/** The composer line the Debrief button hands back to the Live conversation. */
export function debriefAsk(setup: RehearsalSetup): string {
  return `Debrief: I had the real "${setup.scenario}" conversation. Here's what happened: `;
}
