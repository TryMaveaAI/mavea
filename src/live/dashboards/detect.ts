// dashboards/detect.ts — the gate for the in-Live "Track it" nudge. It is deliberately the rarest
// affordance in Live: a one-off number is not a dashboard, and a wall of half-watched dashboards is
// worse than none. So the decision is the MODEL's — it scores 0–100 (see the TRACKABLE prompt) how
// genuinely worth-watching-over-time the answer is — and we only offer to track it above a high
// threshold. Keeping the bar here, as one constant, lets us tune rarity without re-prompting.
import type { ConversationSpec } from '../../data/conversation';

/** The model's score must clear this for the surface to offer tracking. High on purpose — tracking
 *  should feel earned, not suggested on every data-rich answer. The prompt asks the model to emit a
 *  score only at 80+, so the extra margin to 95 reserves the nudge for answers it's most sure about. */
export const TRACK_THRESHOLD = 95;

/** True when this answer is worth offering as a living dashboard — i.e. the model judged it (and only
 *  it) trackable with enough confidence. No client heuristic guesses from block types anymore. */
export function shouldOfferTrack(spec: ConversationSpec | null | undefined): boolean {
  return spec?.track != null && spec.track.score >= TRACK_THRESHOLD;
}
