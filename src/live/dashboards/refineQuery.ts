// dashboards/refineQuery.ts — turns a raw, one-off ask into a `refreshQuery` worth re-running
// forever. The words that produced a widget are often conversational ("what are the scores for
// today's world cup games") — fine for a single answer, but stored verbatim as the SAME literal
// string a refresh re-sends every cadence tick, an underspecified ask gives the model room to
// answer inconsistently shaped data turn to turn, and never nails which specific thing (a live
// score vs. a final one) actually matters. This runs ONCE, at add-time, not on every refresh — a
// one-time cost for a materially more reliable recurring one.
import { getAdapter } from '../providers';
import type { ModelConfig } from '../../types/mavea';

const REFINE_SYSTEM =
  "Rewrite the user's question into ONE self-contained search query meant to be re-asked " +
  'verbatim on a recurring schedule to fetch the CURRENT state of the same thing — never a ' +
  "one-time answer to today's exact wording. Name the specific subject explicitly (a team, a " +
  'ticker, a tournament and round) so the query stands alone without this conversation for ' +
  'context. Keep language like "live" or "in progress" when the tracked thing genuinely is a ' +
  'live/current-moment state (e.g. a live score) — dropping it would lose exactly what matters. ' +
  'Return ONLY the rewritten query text — no quotes, no preamble, no explanation.';

/** Rewrite `rawAsk` into a canonical, standing re-ask query for `blockType`. Falls back to the raw
 *  ask (never empty, never fabricated) on any failure — a slightly-unrefined query beats none. */
export async function refineRefreshQuery(
  rawAsk: string,
  blockType: string,
  cfg: ModelConfig,
): Promise<string> {
  const ask = rawAsk.trim();
  if (!ask) return ask;
  try {
    const adapter = getAdapter(cfg.provider);
    const rr = await adapter.generate(
      {
        usageLabel: 'dashboard-query-refine',
        system: REFINE_SYSTEM,
        history: [],
        user: `Original ask: "${ask}"\nThis produces a "${blockType}" block.`,
        maxTokens: 120,
        temperature: 0.2,
        thinkingLevel: 'low',
      },
      cfg,
    );
    const refined = typeof rr.raw === 'string' ? rr.raw.trim().replace(/^["']+|["']+$/g, '') : '';
    return refined || ask;
  } catch (err) {
    console.error('[dashboards] refineRefreshQuery failed, keeping the raw ask', err);
    return ask;
  }
}
