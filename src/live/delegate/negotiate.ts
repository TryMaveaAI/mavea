// The Mavéa-to-Mavéa negotiation engine. Two REAL agents play the two sides on the user's
// own key: "your Mavéa" argues the user's goal under the user's hard boundaries, and a
// clearly-labeled stand-in argues the counterpart's side from what the user said about
// them. Every line in the log is genuinely model-generated — nothing is scripted — and
// the boundaries are enforced HERE in code, not trusted to the model: an offer that
// names a never-offer item is withheld and the side is told to try again.
//
// The engine is transport-agnostic: it speaks through a `call(system, user)` function the
// panel builds from the active provider adapter, so the negotiation logic is pure and
// testable without a network.

export interface NegotiationBrief {
  /** Who the other side is — used only as the stand-in's label ("Priya's stand-in"). */
  counterpart: string;
  /** What the user wants out of this ("a raise to $95k, up from $82k, this cycle"). */
  goal: string;
  /** What the user can put on the table, in their own words. */
  mine: string;
  /** The other side's position, as the user understands it (the stand-in's whole brief —
   *  it knows nothing else, and the panel says so). */
  theirs: string;
  /** Hard never-offer items. Enforced in code against every outgoing offer. */
  boundaries: string[];
  /** Total turns across both sides before the engine calls a no-deal. Defaults to
   *  {@link DEFAULT_MAX_ROUNDS}. */
  maxRounds?: number;
}

export type NegotiationSide = 'yours' | 'theirs';

export interface NegotiationEvent {
  /** Which agent spoke — or 'engine' for a deterministic action (a withheld offer). */
  side: NegotiationSide | 'engine';
  kind: 'offer' | 'counter' | 'accept' | 'pass' | 'boundary';
  /** The line shown in the log (the agent's own words; for engine events, the reason). */
  say: string;
  /** The full standing proposal in plain words, when this event carries one. */
  offer?: string;
}

export interface NegotiationResult {
  events: NegotiationEvent[];
  /** The accepted proposal, or null when the talks ended without one. */
  deal: string | null;
  rounds: number;
}

/** One model call: returns the raw text of the side's reply. */
export type AgentCall = (system: string, user: string) => Promise<string>;

interface AgentMove {
  say: string;
  offer: string | null;
  decision: 'offer' | 'accept' | 'pass';
}

const REPLY_SHAPE = `Reply with ONLY a JSON object (no prose, no fences):
{"say": "<ONE short spoken line for the negotiation log>", "offer": "<the full current proposal in plain words, or null>", "decision": "offer" | "accept" | "pass"}
"accept" means you take the OTHER side's standing offer as-is (only when one exists). "pass" ends the talks with no deal. Keep every "say" under 25 words.`;

function yourSystem(b: NegotiationBrief): string {
  return `You are the user's Mavéa, negotiating on their behalf with ${b.counterpart}'s side.
THE GOAL: ${b.goal}
YOU MAY OFFER (nothing else exists): ${b.mine}
${b.boundaries.length ? `HARD BOUNDARIES — these are NEVER offered, in any form: ${b.boundaries.join('; ')}` : ''}
You are at the table to REACH an agreement the goal can live with, not to demonstrate firmness: open your first move with a concrete offer near the goal (never pass on your first move), concede in small steps toward the middle, and accept a standing offer when it clearly serves the goal. Walking away is a last resort for a genuinely unacceptable table, not a default. ${REPLY_SHAPE}`;
}

function theirSystem(b: NegotiationBrief): string {
  return `You are a stand-in negotiator for ${b.counterpart}. Everything you know about ${b.counterpart}'s side: ${b.theirs}
Argue that side's interest in GOOD FAITH: counter with concrete terms rather than walking away, concede only for real gains, and accept a standing offer when it is genuinely fair to ${b.counterpart}. Never pass on your first move, and never invent assets the brief above doesn't mention. ${REPLY_SHAPE}`;
}

/** Lenient JSON extraction — models love fences and stray prose around the object. */
export function parseMove(raw: string): AgentMove | null {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const o = JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
    const say = typeof o.say === 'string' ? o.say.trim() : '';
    const offer = typeof o.offer === 'string' && o.offer.trim() ? o.offer.trim() : null;
    const decision =
      o.decision === 'accept' || o.decision === 'pass' || o.decision === 'offer'
        ? o.decision
        : 'offer';
    if (!say) return null;
    return { say, offer, decision };
  } catch {
    return null;
  }
}

const fold = (s: string): string => s.toLowerCase().replace(/[\s,]/g, '');

/** The deterministic guard: does this offer name a never-offer item? */
export function violatedBoundary(offer: string, boundaries: string[]): string | null {
  const hay = fold(offer);
  for (const b of boundaries) {
    const needle = fold(b);
    if (needle && hay.includes(needle)) return b;
  }
  return null;
}

/**
 * The proposal currently on the table: the most recent event that actually carries an
 * offer, and which side put it there. Null before anyone has tabled one. Pure and
 * derived, so the panel can surface the live standing offer without re-deriving the
 * loop's internal state (boundary/pass events don't change what's on the table).
 */
export function standingOffer(
  events: NegotiationEvent[],
): { offer: string; by: NegotiationSide } | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e.offer && (e.side === 'yours' || e.side === 'theirs')) {
      return { offer: e.offer, by: e.side };
    }
  }
  return null;
}

/** Total turns across both sides before the engine calls a no-deal, unless the brief
 *  overrides it. Exported so the panel's progress meter counts against the same cap.
 *  Four moves each: enough room to open, trade concessions twice, and land — six ended
 *  runs mid-convergence once both sides actually engaged. */
export const DEFAULT_MAX_ROUNDS = 8;

/**
 * Split the user's free-typed never-offer field into distinct items — trimmed, empties
 * dropped, and de-duplicated case-insensitively (the same line twice is one boundary, and
 * one chip). One source of truth: the panel shows these as the enforced set and hands the
 * very same list to the brief, so what the user sees is exactly what's checked.
 */
export function parseBoundaries(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  // A comma flanked by digits on both sides ("$15,000") is a thousands separator, not a field
  // break — splitting on it would shatter one boundary into "going above $15" and a bare "000",
  // and that stray "000" then trips on any offer whose amount happens to contain three zeros.
  for (const part of raw.split(/(?<!\d)[,;\n]|[,;\n](?!\d)/)) {
    const item = part.trim();
    if (!item) continue;
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function transcript(events: NegotiationEvent[], b: NegotiationBrief): string {
  if (events.length === 0) return '(no moves yet — you open)';
  return events
    .map((e) => {
      const who =
        e.side === 'yours' ? 'YOUR SIDE' : e.side === 'theirs' ? `${b.counterpart}'S SIDE` : '—';
      return `${who}: ${e.say}${e.offer ? ` [standing offer: ${e.offer}]` : ''}`;
    })
    .join('\n');
}

/** Why a move produced nothing usable, judged on its last attempt. */
type MoveEnding = 'no-reply' | 'unreadable' | 'withheld';

const ENDING_LINE: Record<MoveEnding, string> = {
  'no-reply': 'No reply arrived — the run ended early.',
  unreadable: 'The reply could not be read — the run ended early.',
  withheld: 'No offer inside your boundaries — the run ended early.',
};

/**
 * Run the negotiation: sides alternate (yours opens) until one accepts, one passes, or
 * the round cap lands. Events surface through `onEvent` as they happen so the log reads
 * live. A reply the engine can't parse counts as that side passing — never invented.
 */
export async function negotiate(
  brief: NegotiationBrief,
  call: AgentCall,
  onEvent: (e: NegotiationEvent) => void,
  signal?: AbortSignal,
): Promise<NegotiationResult> {
  const events: NegotiationEvent[] = [];
  const emit = (e: NegotiationEvent): void => {
    events.push(e);
    onEvent(e);
  };
  const maxRounds = brief.maxRounds ?? DEFAULT_MAX_ROUNDS;
  let standing: { offer: string; by: NegotiationSide } | null = null;
  let deal: string | null = null;
  let rounds = 0;

  for (; rounds < maxRounds && !deal; rounds++) {
    if (signal?.aborted) break;
    const side: NegotiationSide = rounds % 2 === 0 ? 'yours' : 'theirs';
    const system = side === 'yours' ? yourSystem(brief) : theirSystem(brief);
    let user = `Negotiation so far:\n${transcript(events, brief)}\nYour move.`;

    // Each call is billed to the reader, so a move gets at most ONE automatic re-ask, and only when
    // its reply cannot be used: it would not parse (a truncated or fenced reply is not a decision,
    // and reading one as a pass is how every run used to die on turn one), or its offer crossed a
    // boundary and was withheld. A pass is a real decision and stands, even on a side's first
    // move. A call that fails outright is not re-sent: the provider may already have billed it.
    let move: AgentMove | null = null;
    let ending: MoveEnding = 'no-reply';
    for (let attempt = 0; attempt < 2; attempt++) {
      const reply = await call(system, user).then(
        (raw) => ({ raw }),
        () => null,
      );
      if (signal?.aborted) break;
      if (!reply) {
        ending = 'no-reply';
        move = null;
        break;
      }
      move = parseMove(reply.raw);
      if (!move) {
        ending = reply.raw.trim() ? 'unreadable' : 'no-reply';
        user +=
          '\nYour last reply was not the required JSON object. Reply with ONLY {"say":…, "offer":…, "decision":…} — no prose, no fences.';
        continue;
      }
      const tripped =
        side === 'yours' && move.offer ? violatedBoundary(move.offer, brief.boundaries) : null;
      if (!tripped) break;
      emit({
        side: 'engine',
        kind: 'boundary',
        say: `Withheld — "${tripped}" is outside your boundary.`,
      });
      user += `\nYour previous offer was WITHHELD: it included "${tripped}", which is never offered. Make a different move.`;
      move = null;
      ending = 'withheld';
    }
    if (signal?.aborted) break;

    if (!move) {
      // An honest ending line, named for what the LAST attempt did: a side that never produced a
      // usable reply did not "decide" anything, and saying why is what makes a transport problem
      // visible instead of eerie.
      emit({ side, kind: 'pass', say: ENDING_LINE[ending] });
      break;
    }
    if (move.decision === 'accept' && standing && standing.by !== side) {
      deal = standing.offer;
      emit({ side, kind: 'accept', say: move.say, offer: deal });
      break;
    }
    // "accept" only means something when the OTHER side has a standing offer on the table (handled
    // above). No standing offer, or trying to accept your own, is nothing left to agree to — a pass,
    // not a silent no-op turn.
    if (
      move.decision === 'pass' ||
      (move.decision === 'accept' && (!standing || standing.by === side))
    ) {
      emit({ side, kind: 'pass', say: move.say });
      break;
    }
    if (move.offer) standing = { offer: move.offer, by: side };
    emit({
      side,
      kind: events.some((e) => e.kind === 'offer' || e.kind === 'counter') ? 'counter' : 'offer',
      say: move.say,
      offer: move.offer ?? undefined,
    });
  }

  return { events, deal, rounds };
}
