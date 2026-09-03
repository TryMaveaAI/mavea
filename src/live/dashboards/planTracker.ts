// dashboards/planTracker.ts — turns "what I want to track", in the user's own words, into a
// concrete tracking plan: which numbers to watch, which rich cards to keep live, and the standing
// search query each one re-runs every refresh. This is the ONE planning call a tracker ever costs
// — it happens at create-time, never on the refresh cadence — and it exists because the user's raw
// phrasing ("yankees scores") is a fine wish but a poor recurring query: the plan names the exact
// subject, demands the CURRENT state, and picks the display shape that actually fits the data
// (a scoreboard for games, a forecast for weather) instead of forcing everything into one mold.
// No data is fetched here and nothing is fabricated — the plan is pure structure; real values
// arrive later from refreshDashboard's grounded fetch. That searchless-ness is safe BECAUSE of
// the add-time gate downstream (confirmAdd.ts): a live-flavored plan only becomes a persisted
// tile once that grounded probe confirms the metric actually returns sourced data.
import { getAdapter } from '../providers';
import type { ModelConfig } from '../../types/mavea';
import type { GroundingSource } from '../providers/types';
import type { DataCadenceMode, WidgetSpan } from './types';
import { currentDateTimeLine } from '../ground/now';
import { parseLooseJson } from '../ground/json';
import { arr, obj } from '../providers/http';

export interface PlanMetric {
  label: string;
  query: string;
  unit?: string;
}
export interface PlanWidget {
  blockType: string;
  query: string;
  span: WidgetSpan;
}
export interface TrackerPlan {
  title: string;
  metrics: PlanMetric[];
  widgets: PlanWidget[];
  cadence: DataCadenceMode;
  /** 'static' ⇒ the ask is a fact that won't meaningfully change (a mountain's height, a settled
   *  date) — the composer should offer a one-time answer instead of a standing tracker. The plan
   *  still carries a usable live fallback in case the user tracks it anyway. */
  kind: 'live' | 'static';
  staticReason?: string;
  /** A bounded live-event window ("match only") — ONLY from a time the user explicitly stated in
   *  their own words. This planner never searches, so it must never INVENT a time; the grounded
   *  refresh's own `liveWindow` discovery (refresh.ts) is the only other source for one. */
  window?: { startAt: number; endAt: number; label: string };
  /** A single scheduled check at a known moment instead of a recurring cadence — same rule: only
   *  from an explicit user-stated time. */
  oneShotAt?: number;
  oneShotLabel?: string;
}

/** The display shapes a plan may choose from — a deliberate, small subset of the block library
 *  whose props all have an honest empty state (arrays), so a freshly-created tracker never shows
 *  a fabricated row while it waits for its first real fetch. */
export const PLAN_BLOCK_TYPES = new Set([
  'chart',
  'scoreboard',
  'standings',
  'forecast',
  'list',
  'timeline',
]);

const PLAN_CADENCES = new Set<DataCadenceMode>(['15min', 'hourly', '6h', 'daily']);

const WIDE_PLAN_BLOCKS = new Set(['chart', 'scoreboard', 'forecast', 'timeline']);

const PLAN_SYSTEM =
  'You design a live-tracking dashboard from one sentence of what the user wants to follow. ' +
  'Return ONLY JSON: {"title": string, "kind": "live"|"static", "staticReason"?: string, ' +
  '"metrics": [{"label": string, "query": string, "unit"?: string}], "widgets": [{"type": ' +
  'string, "query": string}], "cadence": "15min"|"hourly"|"6h"|"daily", "window"?: {"start": ' +
  'ISO string, "end": ISO string, "label": string}, "oneShot"?: {"at": ISO string, "label": ' +
  'string}}. RULES: (1) "metrics" are ONLY for things a single number genuinely captures (a ' +
  'price, a temperature, a percentage) — 0-2 of them, each with a self-contained search query ' +
  'for its CURRENT value. Skip metrics entirely when no single number is the point. (2) ' +
  '"widgets" carry everything richer — pick the shape that fits the data: "scoreboard" for game ' +
  'results, "standings" for a league table, "forecast" for weather outlooks, "timeline" for ' +
  'dated events/schedules, "chart" for a numeric series over time, "list" for headlines/updates/' +
  'anything else. 1-3 widgets, each with a self-contained standing query that (a) names the ' +
  'exact subject so it works with zero conversation context, (b) explicitly asks for the ' +
  'LATEST/CURRENT state as of the moment it is asked — keeping words like "live" or "in ' +
  'progress" when the tracked thing is a live state, and (c) will still make sense re-asked ' +
  'verbatim tomorrow and next month (never bake in a specific date). (3) "cadence" matches how ' +
  'fast the thing really changes: "15min" for market prices and live games, "hourly" for ' +
  'weather and breaking situations, "6h" for slow-moving sagas, "daily" for everything else. ' +
  '(4) "title" is a short, human dashboard name — the subject, not a sentence. Plan the MINIMUM ' +
  'set that covers the ask — no filler. (5) "kind": "static" ONLY when the ask is a fact that ' +
  "genuinely will not change (a mountain's height, a historical date, a physical constant) — " +
  'give a one-line "staticReason" and still fill in a reasonable live plan as a fallback in case ' +
  'they track it anyway. Default "live" whenever there is any real chance the answer moves. (6) ' +
  'YOU HAVE NO SEARCH ACCESS RIGHT NOW — only set "window" or "oneShot" when the user\'s OWN ' +
  'WORDS state a concrete date/time (e.g. "the game starts at 7pm" or "check after the Fed ' +
  'meeting on the 31st"); NEVER invent or guess a time you were not given. Omit both fields ' +
  'entirely otherwise — a real live-event window can still be discovered later, during an actual ' +
  'search-grounded check. (7) "window" bounds a recurring cadence to a live event\'s span (poll ' +
  'fast only while it is actually happening); "oneShot" is a single check at one moment instead ' +
  'of a recurring cadence — use at most one of the two, and only from an explicit user time.';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/** A bounded live-event window — ONLY accepted with a real, plausible-looking pair of ISO
 *  timestamps within ~30 days of now (the planner has no search access, so a wildly out-of-range
 *  value is a hallucination, not a real user-stated time). */
function coercePlanWindow(
  v: unknown,
  now: number,
): { startAt: number; endAt: number; label: string } | undefined {
  const o = obj(v);
  const startAt = typeof o.start === 'string' ? Date.parse(o.start) : NaN;
  const endAt = typeof o.end === 'string' ? Date.parse(o.end) : NaN;
  if (!Number.isFinite(startAt) || !Number.isFinite(endAt) || endAt <= startAt) return undefined;
  if (startAt < now - THIRTY_DAYS_MS || startAt > now + THIRTY_DAYS_MS) return undefined;
  return { startAt, endAt, label: typeof o.label === 'string' ? o.label.trim().slice(0, 60) : '' };
}

function coercePlanOneShot(v: unknown, now: number): { at: number; label: string } | undefined {
  const o = obj(v);
  const at = typeof o.at === 'string' ? Date.parse(o.at) : NaN;
  if (!Number.isFinite(at)) return undefined;
  if (at < now - 60_000 || at > now + THIRTY_DAYS_MS) return undefined;
  return { at, label: typeof o.label === 'string' ? o.label.trim().slice(0, 60) : '' };
}

/** Coerce whatever the model returned into a valid TrackerPlan, or null when nothing usable
 *  survives. Structural only — drops unknown block types, empty queries, over-cap extras. */
export function coercePlan(
  raw: unknown,
  ask: string,
  now: number = Date.now(),
): TrackerPlan | null {
  const p = obj(raw);
  const metrics: PlanMetric[] = [];
  for (const m0 of arr(p.metrics).slice(0, 2)) {
    const m = obj(m0);
    if (typeof m.label !== 'string' || !m.label.trim()) continue;
    if (typeof m.query !== 'string' || !m.query.trim()) continue;
    metrics.push({
      label: m.label.trim(),
      query: m.query.trim(),
      ...(typeof m.unit === 'string' && m.unit.trim() ? { unit: m.unit.trim() } : {}),
    });
  }
  const widgets: PlanWidget[] = [];
  for (const w0 of arr(p.widgets).slice(0, 3)) {
    const w = obj(w0);
    const type = typeof w.type === 'string' ? w.type.trim().toLowerCase() : '';
    if (!PLAN_BLOCK_TYPES.has(type)) continue;
    if (typeof w.query !== 'string' || !w.query.trim()) continue;
    widgets.push({
      blockType: type,
      query: w.query.trim(),
      span: (WIDE_PLAN_BLOCKS.has(type) ? 2 : 1) as WidgetSpan,
    });
  }
  const kind = p.kind === 'static' ? 'static' : 'live';
  // A LIVE plan with no metrics and no widgets is unusable — nothing to track. A STATIC plan is
  // allowed to have nothing (the model correctly followed "no filler" for a fact that doesn't
  // need tracking); it still gets a plain fallback widget below so "track it anyway" has
  // something real to build.
  if (kind === 'live' && metrics.length === 0 && widgets.length === 0) return null;
  const title =
    typeof p.title === 'string' && p.title.trim() ? p.title.trim().slice(0, 80) : ask.slice(0, 80);
  // A valid model-suggested cadence survives as exactly that — a SUGGESTION the review sheet
  // offers, never auto-applied (PlanReview always starts on manual). An unusable value (missing,
  // garbage) falls back to manual itself rather than a silent "hourly" — the safer default when
  // there's nothing real to suggest.
  const cadence = PLAN_CADENCES.has(p.cadence as DataCadenceMode)
    ? (p.cadence as DataCadenceMode)
    : 'manual';
  const staticReason =
    kind === 'static' && typeof p.staticReason === 'string' && p.staticReason.trim()
      ? p.staticReason.trim().slice(0, 160)
      : undefined;
  const window = coercePlanWindow(p.window, now);
  // A window and a one-shot are mutually exclusive (one bounds a recurring cadence, the other
  // replaces it) — a model that sent both gets the window; the one-shot only applies otherwise.
  const oneShot = window ? undefined : coercePlanOneShot(p.oneShot, now);
  const finalWidgets =
    kind === 'static' && metrics.length === 0 && widgets.length === 0
      ? [{ blockType: 'list', query: ask, span: 2 as WidgetSpan }]
      : widgets;
  return {
    title,
    metrics,
    widgets: finalWidgets,
    cadence,
    kind,
    ...(staticReason ? { staticReason } : {}),
    ...(window ? { window } : {}),
    ...(oneShot ? { oneShotAt: oneShot.at, oneShotLabel: oneShot.label } : {}),
  };
}

/** The honest floor when planning fails (no model, error, unusable JSON): one live list card
 *  re-asking the user's own words — a working tracker, just not a shaped one. */
export function fallbackPlan(ask: string): TrackerPlan {
  return {
    title: ask.slice(0, 80),
    metrics: [],
    widgets: [{ blockType: 'list', query: ask, span: 2 }],
    cadence: 'manual',
    kind: 'live',
  };
}

/** Ask the model to plan a tracker for `ask`. Never throws — a failed call falls back to
 *  fallbackPlan so creation is never blocked on the planner. */
export async function planTracker(ask: string, cfg: ModelConfig): Promise<TrackerPlan> {
  const wish = ask.trim();
  if (!wish) return fallbackPlan(ask);
  try {
    const adapter = getAdapter(cfg.provider);
    const rr = await adapter.generate(
      {
        usageLabel: 'dashboard-plan',
        system: currentDateTimeLine() + ' ' + PLAN_SYSTEM,
        history: [],
        user: `Track: ${wish}`,
        maxTokens: 600,
        temperature: 0.2,
        thinkingLevel: 'low',
        // An explicit schema so schema-constrained adapters can't strip the plan fields
        // (the same silent-drop gotcha refreshDashboard documents).
        format: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            kind: { type: 'string' },
            staticReason: { type: 'string' },
            metrics: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  label: { type: 'string' },
                  query: { type: 'string' },
                  unit: { type: 'string' },
                },
                required: ['label', 'query'],
              },
            },
            widgets: {
              type: 'array',
              items: {
                type: 'object',
                properties: { type: { type: 'string' }, query: { type: 'string' } },
                required: ['type', 'query'],
              },
            },
            cadence: { type: 'string' },
            window: {
              type: 'object',
              description:
                "ONLY when the user's own words stated a concrete time — never invented.",
              properties: {
                start: { type: 'string' },
                end: { type: 'string' },
                label: { type: 'string' },
              },
            },
            oneShot: {
              type: 'object',
              description:
                "ONLY when the user's own words stated a concrete time — never invented.",
              properties: { at: { type: 'string' }, label: { type: 'string' } },
            },
          },
          required: ['title', 'widgets', 'cadence'],
        },
      },
      cfg,
    );
    return coercePlan(parseLooseJson(rr.raw), wish) ?? fallbackPlan(wish);
  } catch (err) {
    console.error('[dashboards] planTracker failed, falling back to a plain list tracker', err);
    return fallbackPlan(wish);
  }
}

export interface StaticAnswer {
  text: string;
  sources: GroundingSource[];
  /** Whether the answer actually grounded in real search — an ungrounded static answer is still
   *  returned (better than nothing for an offline/keyless session) but must be labeled as such by
   *  the caller, never presented as verified when it isn't. */
  grounded: boolean;
}

const ANSWER_SYSTEM =
  'Answer plainly and concretely in 1-3 sentences, using web search. Return ONLY JSON: ' +
  '{"answer": string, "sources": [{"title": string, "url": string}]}. CITE every real source ' +
  'URL actually relied on; omit "sources" entirely if you used no search. Never invent a source ' +
  'or a fact you could not verify.';

/** ONE grounded call for a static fact the planner flagged as not worth a standing tracker — the
 *  honest one-time answer instead of a recurring check nobody needs. Never throws; returns null
 *  only when the call itself fails outright (network/auth) or came back with nothing usable. */
export async function answerOnce(ask: string, cfg: ModelConfig): Promise<StaticAnswer | null> {
  const wish = ask.trim();
  if (!wish) return null;
  try {
    const adapter = getAdapter(cfg.provider);
    const rr = await adapter.generate(
      {
        usageLabel: 'dashboard-plan-answer',
        system: currentDateTimeLine() + ' ' + ANSWER_SYSTEM,
        history: [],
        user: wish,
        maxTokens: 500,
        temperature: 0.15,
        thinkingLevel: 'low',
        tools: { webSearch: true },
        format: {
          type: 'object',
          properties: {
            answer: { type: 'string' },
            sources: {
              type: 'array',
              items: {
                type: 'object',
                properties: { title: { type: 'string' }, url: { type: 'string' } },
                required: ['title', 'url'],
              },
            },
          },
          required: ['answer'],
        },
      },
      cfg,
    );
    const parsed = obj(parseLooseJson(rr.raw));
    const text = typeof parsed.answer === 'string' ? parsed.answer.trim() : '';
    if (!text) return null;
    const selfReported: GroundingSource[] = [];
    for (const raw of arr(parsed.sources)) {
      const s = obj(raw);
      if (typeof s.title === 'string' && typeof s.url === 'string') {
        selfReported.push({ title: s.title, url: s.url });
      }
    }
    const sources = rr.sources?.length ? rr.sources : selfReported;
    const grounded = sources.length > 0;
    return { text, sources, grounded };
  } catch (err) {
    console.error('[dashboards] answerOnce failed', err);
    return null;
  }
}
