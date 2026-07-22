// talkIntent — does an ask box submission read as a command or a question? A cheap, deterministic
// prefix check (no model call): this runs on every submit, so it has to be free and instant, not an
// LLM round trip. This is a phrasing signal only — distinct from `spec.track`/shouldOfferTrack, which
// judges whether an ANSWER is worth tracking at all. Never wire the two together.
export type TalkIntent = 'add' | 'ask';

const COMMAND_PREFIX = /^(add|track|watch|monitor|follow)\b/i;

export function detectTalkIntent(raw: string): TalkIntent {
  const t = raw.trim();
  return t && COMMAND_PREFIX.test(t) ? 'add' : 'ask';
}
