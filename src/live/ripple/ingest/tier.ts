// tier.ts — size the analysis to the connected model, NEVER swapping it. The user's chosen model is
// sacred; what we change is how much we ask of it. A fast frontier model (Flash/Haiku/nano/mini)
// gets the full read + a 3-course curriculum; a deep reasoning model (Opus, the GPT-5
// heavyweights, o-series, Pro) gets the full read but a tighter curriculum budget (it's slow +
// pricey); a slow/cheap model (a self-hosted gateway, or an OpenRouter `:free` route) gets a lean
// read, ONE course, no extra code-context round-trips, and minimal thinking — so even there Ripple
// feels fast instead of stalling for a minute. The heavy curriculum is always lazy (built only
// when the user opens it), so cost stays proportional to attention. Pure + unit-tested; imports no
// adapters.
import type { ModelConfig } from '../../../types/mavea';
import type { ThinkingLevel } from '../../providers/types';
import { isFreeRoute } from '../../providers/route';

export type RippleTier = 'frontier-fast' | 'frontier-deep' | 'slow-cheap';

export interface TierPlan {
  tier: RippleTier;
  /** Hard output cap for the diff read. */
  enrichMaxTokens: number;
  /** How many WEEKS the curriculum outline spans (fewer on a slow model so its JSON doesn't truncate). */
  courseCount: number;
  /** Hard output cap for the curriculum OUTLINE call — weeks + lessons only, no quiz/capstone, so it
   *  stays small and fast and never truncates. */
  coursesMaxTokens: number;
  /** Hard output cap for the on-demand CLOSING check (one course's quiz + capstone), generated only
   *  when the reader opens that course. Generous — this is where those tokens now actually get spent. */
  closingMaxTokens: number;
  /** Hard output cap for a single DEEP lesson (the in-depth body + code walkthrough). */
  lessonMaxTokens: number;
  /** Read the real changed-file contents + cross-repo callers before the read (extra round-trips). */
  fetchCodeContext: boolean;
  /** Reasoning effort the model spends (providers without the knob ignore it). */
  thinkingLevel: ThinkingLevel;
}

const SLOW_CHEAP: TierPlan = {
  tier: 'slow-cheap',
  enrichMaxTokens: 1600,
  courseCount: 3,
  coursesMaxTokens: 2600,
  closingMaxTokens: 3600,
  lessonMaxTokens: 3600,
  fetchCodeContext: false,
  thinkingLevel: 'minimal',
};

const FRONTIER_DEEP: TierPlan = {
  tier: 'frontier-deep',
  enrichMaxTokens: 2600,
  courseCount: 5,
  // Outline is light (weeks + lessons only) so it fits with room to spare; the quiz + capstone move
  // to the on-demand closing call, which gets generous headroom so its JSON never truncates.
  coursesMaxTokens: 3000,
  closingMaxTokens: 4000,
  // A deep lesson (overview + a code walkthrough that quotes real excerpts) is token-heavy; give it
  // generous headroom so the JSON never truncates mid-build.
  lessonMaxTokens: 7000,
  fetchCodeContext: true,
  thinkingLevel: 'low',
};

const FRONTIER_FAST: TierPlan = {
  tier: 'frontier-fast',
  enrichMaxTokens: 2600,
  courseCount: 5,
  coursesMaxTokens: 3000,
  closingMaxTokens: 4000,
  lessonMaxTokens: 6000,
  fetchCodeContext: true,
  thinkingLevel: 'minimal',
};

/** GPT-5 spans both ends of the price list: the bare family id and the heavyweight tiers are the
 *  slow, expensive ones, while nano, luna and mini are the cheapest models OpenAI sells. Match the
 *  expensive names positively, so a new light tier lands in the fast bucket rather than buying deep
 *  thinking on the cheapest model in the catalog — the trade is that a new heavyweight must be
 *  named here or it reads as fast. */
const GPT5_DEEP = /\bgpt-5(?:\.\d+)?(?:-(?:sol|terra|pro))?(?:-\d{4}-\d{2}-\d{2})?(?![\w.-])/;

const isLocalUrl = (u?: string): boolean =>
  !!u && /(localhost|127\.0\.0\.1|0\.0\.0\.0|host\.docker\.internal|:11434)/i.test(u);

/** Classify the connected model into a tier and the work plan for it. */
export function classifyTier(cfg: ModelConfig): RippleTier {
  const id = cfg.model.toLowerCase();
  // Slow/cheap: anything on a local/self-hosted base URL, or an OpenRouter "free" route
  // (rate-limited + slow).
  if (isLocalUrl(cfg.baseUrl) || isFreeRoute(id)) {
    return 'slow-cheap';
  }
  // Deep reasoning: the big, slower, pricier models — full read, but courses stay lazy.
  if (
    /\bopus\b/.test(id) ||
    GPT5_DEEP.test(id) ||
    /(^|[^a-z])o[1-9](-|\b)/.test(id) || // o1/o3/… reasoning series
    /gemini-[0-9.]*-?pro/.test(id) ||
    (/\bsonnet\b/.test(id) && !/haiku/.test(id))
  ) {
    return 'frontier-deep';
  }
  // Everything else capable (Flash / Haiku / mini / Grok) is treated as fast.
  return 'frontier-fast';
}

export function planFor(cfg: ModelConfig): TierPlan {
  switch (classifyTier(cfg)) {
    case 'slow-cheap':
      return SLOW_CHEAP;
    case 'frontier-deep':
      return FRONTIER_DEEP;
    default:
      return FRONTIER_FAST;
  }
}
