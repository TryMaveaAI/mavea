// debrief.ts — the payoff of a run at The Table. One extra call turns the real transcript into
// what moved them, where the user's case is exposed, and what to say first for real. It never
// quotes from imagination: the model cites a turn NUMBER, and the panel looks up that event's
// actual `say` line — every excerpt shown is a genuine line from the run, or nothing at all if
// the citation doesn't resolve. Pure and transport-agnostic, like negotiate.ts.
import type { AgentCall, NegotiationBrief, NegotiationEvent } from './negotiate';

export interface DebriefCite {
  point: string;
  /** 1-based index into the run's events, or null when there's nothing real to quote. */
  turn: number | null;
}

export interface Debrief {
  moved: DebriefCite[];
  exposed: DebriefCite[];
  openers: string[];
}

const DEBRIEF_SHAPE = `Reply with ONLY a JSON object (no prose, no fences):
{"moved": [{"point": "<an argument the user's side made that the other side visibly responded to>", "turn": <the 1-based line number it happened on>}],
 "exposed": [{"point": "<something the other side pushed that the user's side had no good answer for>", "turn": <line number>}],
 "openers": ["<a line to open the REAL conversation with>", "...", "..."]}
"moved" and "exposed" may each be an empty array when the transcript doesn't support them — never invent one just to fill the slot — and otherwise at most 2 entries each. "openers" is up to 3 short lines (under 20 words), each usable as-is, grounded only in the brief and transcript below. Cite ONLY real line numbers from the transcript; never invent facts, numbers, or concessions.`;

function outcomeLine(deal: string | null): string {
  return deal ? `They agreed: ${deal}.` : 'No deal was reached.';
}

/** The run as a numbered transcript, referee lines included — a citation can point at a
 *  withheld offer just as honestly as at either side's own words. Shared by the debrief prompt
 *  and the Live hand-off so both read the exact same record of what happened. */
export function numberedTranscript(events: NegotiationEvent[], b: NegotiationBrief): string {
  return events
    .map((e, i) => {
      const who =
        e.side === 'yours'
          ? 'YOUR SIDE'
          : e.side === 'theirs'
            ? `${b.counterpart}'S SIDE`
            : 'REFEREE';
      return `${i + 1}. ${who}: ${e.say}${e.offer ? ` [standing offer: ${e.offer}]` : ''}`;
    })
    .join('\n');
}

export function buildDebriefPrompt(
  brief: NegotiationBrief,
  events: NegotiationEvent[],
  deal: string | null,
): { system: string; user: string } {
  const system = `You are a negotiation coach reviewing a practice run. Judge ONLY the numbered transcript below — never anything outside it. ${DEBRIEF_SHAPE}`;
  const user = `THE GOAL: ${brief.goal}
WHAT THE USER COULD OFFER: ${brief.mine}
${brief.counterpart.toUpperCase()}'S POSITION, AS THE USER DESCRIBED IT: ${brief.theirs}
THE TRANSCRIPT:
${numberedTranscript(events, brief)}
OUTCOME: ${outcomeLine(deal)}`;
  return { system, user };
}

/** Lenient JSON extraction, mirroring negotiate.ts's parseMove — models fence and preface. */
export function parseDebrief(raw: string, eventCount: number): Debrief | null {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const o = JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
    const readCites = (v: unknown): DebriefCite[] => {
      if (!Array.isArray(v)) return [];
      const out: DebriefCite[] = [];
      for (const item of v) {
        if (out.length >= 2) break;
        if (!item || typeof item !== 'object') continue;
        const rec = item as Record<string, unknown>;
        const point = typeof rec.point === 'string' ? rec.point.trim() : '';
        if (!point) continue;
        const turn =
          typeof rec.turn === 'number' && rec.turn >= 1 && rec.turn <= eventCount
            ? Math.trunc(rec.turn)
            : null;
        out.push({ point, turn });
      }
      return out;
    };
    const moved = readCites(o.moved);
    const exposed = readCites(o.exposed);
    const openers = Array.isArray(o.openers)
      ? o.openers
          .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
          .map((x) => x.trim())
          .slice(0, 3)
      : [];
    if (!moved.length && !exposed.length && !openers.length) return null;
    return { moved, exposed, openers };
  } catch {
    return null;
  }
}

/**
 * Run the debrief call. Never throws — a transport failure and a reply the engine can't parse
 * both resolve to null, so a failed debrief can never block or blank out the result it's
 * summarizing.
 */
export async function runDebrief(
  brief: NegotiationBrief,
  events: NegotiationEvent[],
  deal: string | null,
  call: AgentCall,
  signal?: AbortSignal,
): Promise<Debrief | null> {
  if (signal?.aborted) return null;
  const { system, user } = buildDebriefPrompt(brief, events, deal);
  const raw = await call(system, user).catch(() => '');
  if (signal?.aborted || !raw) return null;
  return parseDebrief(raw, events.length);
}

/** The raw instruction for handing a finished run to Live as one normal, grounded turn — never
 *  automatic: the user explicitly taps "bring this into the conversation" to run it. */
export function buildPrepInstruction(
  brief: NegotiationBrief,
  events: NegotiationEvent[],
  deal: string | null,
): string {
  return `I ran a practice negotiation at The Table: my Mavéa argued my side against a stand-in for ${brief.counterpart}, built only from my own notes. Nothing was sent to anyone — this was a scouting run on my own key.
My goal: ${brief.goal}
What I could offer: ${brief.mine}
${brief.counterpart}'s position, as I described it: ${brief.theirs}
The full exchange:
${numberedTranscript(events, brief)}
Outcome: ${outcomeLine(deal)}
Help me prepare for the real conversation: what to open with, where my case is weakest, and how to phrase my strongest point. Work only from this transcript and brief — invent nothing about ${brief.counterpart}.`;
}

/** A short, transcript-scrubber-friendly label for the synthetic turn the hand-off creates. */
export function prepLabel(goal: string): string {
  const label = `Negotiation prep: ${goal.trim()}`;
  return label.length > 60 ? `${label.slice(0, 57)}…` : label;
}
