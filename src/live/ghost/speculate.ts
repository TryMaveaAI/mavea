// "It answers while you talk" — the speculative glimpse behind the ghost blocks. While the
// user is still mid-sentence we ask the connected model one tiny question: if the ask ended
// right now, what 2-3 cards WOULD you build? The reply is titles only (~a hundred output
// tokens), clearly marked forming/maybe, and entirely disposable — the real turn never sees
// it. A new partial transcript aborts the previous glimpse; nothing here touches turn state.
import { getAdapter } from '../providers';
import type { ModelConfig } from '../providers/types';

export interface GhostCard {
  kind: 'forming' | 'maybe';
  title: string;
}

const SYSTEM = [
  'You catch a HALF-SPOKEN question, still being said. Reply ONLY with JSON:',
  '{"ghosts":[{"kind":"forming"|"maybe","title":"..."}]}',
  '2-3 entries: the visual cards you would build if the sentence ended right now.',
  '"forming" = clearly needed for what was said so far; "maybe" = a plausible direction the sentence is heading.',
  'Each title ≤ 6 words, concrete (e.g. "Bloom forecast", "Late-April flights"). No prose, no other keys.',
].join('\n');

/** Bound the glimpse: a small reply, fast or not at all. */
const MAX_TOKENS = 150;

function parseGhosts(raw: string | object): GhostCard[] {
  try {
    const obj =
      typeof raw === 'string'
        ? (JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? '{}') as unknown)
        : raw;
    const list = (obj as { ghosts?: unknown }).ghosts;
    if (!Array.isArray(list)) return [];
    return list
      .map((g): GhostCard | null => {
        const o = g as { kind?: unknown; title?: unknown };
        const title = typeof o.title === 'string' ? o.title.trim().slice(0, 48) : '';
        if (!title) return null;
        return { kind: o.kind === 'maybe' ? 'maybe' : 'forming', title };
      })
      .filter((g): g is GhostCard => g !== null)
      .slice(0, 3);
  } catch {
    return [];
  }
}

/**
 * One speculative glimpse off a partial transcript. The signal is threaded into the adapter's
 * fetch, so a superseded glimpse STOPS generating instead of billing the user's key for a reply
 * nobody will read. Resolves [] on any failure or when the signal aborts — a ghost that can't
 * form simply doesn't appear; nothing ever throws.
 */
export async function speculate(
  partial: string,
  cfg: ModelConfig,
  signal: AbortSignal,
): Promise<GhostCard[]> {
  try {
    const adapter = getAdapter(cfg.provider);
    // 'minimal' thinking, explicitly: a six-word title list needs no reasoning, and a glimpse
    // fires up to three times per listen — on providers with a thinking dial (Gemini) the
    // default level would spend more on deliberation than on the entire disposable answer.
    const out = await adapter.generate(
      {
        system: SYSTEM,
        history: [],
        user: partial,
        maxTokens: MAX_TOKENS,
        thinkingLevel: 'minimal',
        signal,
      },
      cfg,
    );
    if (signal.aborted) return [];
    return parseGhosts(out.raw);
  } catch {
    return [];
  }
}
