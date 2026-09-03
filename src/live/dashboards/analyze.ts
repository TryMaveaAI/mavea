// dashboards/analyze.ts — the ONE billable read: Mavéa's brief, honest take on the latest numbers.
// Gated by shouldFireAi (refresh.ts) for the automatic paths (a fresh tripwire break or a chosen
// schedule — most days, never), and fired directly by the on-demand "Read the numbers now" button.
// Grounds the question in the metrics' real values (and, when a line just crossed, that specific
// line + value), and asks: what do these show, what changed, is a crossing a real move or noise?
// Goes through the same provider layer as everything else; never throws (returns null on failure).
import { getAdapter } from '../providers';
import type { ModelConfig } from '../../types/mavea';
import type { GroundingSource } from '../providers/types';
import { currentDateTimeLine } from '../ground/now';
import type { Dashboard, Tripwire, Verdict } from './types';

const SYSTEM =
  'You give a brief, honest read on the latest numbers a user is tracking: what they show now, what ' +
  'has materially changed since the last check, and — if a specific line was crossed — whether that ' +
  'looks like a real move or noise. One or two plain sentences. Never invent data. CITE YOUR ' +
  'SOURCES — whenever you used web search, include the exact source URLs you actually relied on as a ' +
  'top-level "sources": [{"title": string, "url": string}] array; only real URLs from the search ' +
  'results — never invent one, and omit "sources" entirely if you didn’t search. Return ONLY JSON: ' +
  '{"verdict":"…","sources":[...]}.';

/** The self-reported "sources" a model lists inline on a search turn (see refresh.ts's identical
 *  fallback) — the recovery for a provider whose native grounding metadata comes back empty even
 *  though a search genuinely ran. */
function selfReportedSources(parsed: unknown): GroundingSource[] {
  const raw = Array.isArray((parsed as { sources?: unknown })?.sources)
    ? ((parsed as { sources: unknown[] }).sources as unknown[])
    : [];
  const out: GroundingSource[] = [];
  for (const item of raw) {
    const s = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
    if (typeof s.title === 'string' && typeof s.url === 'string')
      out.push({ title: s.title, url: s.url });
  }
  return out;
}

/** The verdict text plus whatever the model self-reported as its sources — parsed from the SAME
 *  payload so a call's groundedness can be judged even when the free-text fallback below fires. */
function parseVerdict(raw: string | object): { text: string | null; sources: GroundingSource[] } {
  try {
    const obj = typeof raw === 'string' ? JSON.parse(extractJson(raw)) : raw;
    const v = (obj as { verdict?: unknown })?.verdict;
    const text = typeof v === 'string' && v.trim() ? v.trim() : null;
    return { text, sources: selfReportedSources(obj) };
  } catch {
    // Some providers return prose despite the instruction — take it as the verdict if non-empty.
    // Nothing structured to read a "sources" array out of in that case.
    const text = typeof raw === 'string' && raw.trim() ? raw.trim() : null;
    return { text, sources: [] };
  }
}

function extractJson(s: string): string {
  const a = s.indexOf('{');
  const b = s.lastIndexOf('}');
  return a >= 0 && b > a ? s.slice(a, b + 1) : s;
}

/** Run the gated verdict for a break (or a scheduled check). Returns the Verdict to store, or null. */
export async function analyzeMove(
  d: Dashboard,
  trigger: Tripwire | 'scheduled',
  cfg: ModelConfig,
  now: number = Date.now(),
): Promise<Verdict | null> {
  try {
    const adapter = getAdapter(cfg.provider);
    const tw = trigger === 'scheduled' ? null : trigger;
    const metric = tw ? d.metrics.find((m) => m.id === tw.metricId) : undefined;
    const readings = d.metrics.map((m) => `${m.label}=${m.lastRaw ?? '—'}`).join(', ');
    const user = tw
      ? `A line the user set just crossed: "${tw.label}" — ${metric?.label ?? tw.label} is now ` +
        `${metric?.lastRaw ?? tw.brokenValue ?? 'past the threshold'}. Currently tracked: ${readings}. ` +
        `Using web search, say briefly and honestly what the latest numbers show and whether this ` +
        `reads as a real move or just noise.`
      : `Currently tracked: ${readings}. Using web search, give a brief, honest read: what the latest ` +
        `numbers show and what has materially changed since the last check.`;
    const rr = await adapter.generate(
      {
        usageLabel: 'dashboard-analysis',
        system: currentDateTimeLine() + ' ' + SYSTEM,
        history: [],
        user,
        // The verdict itself is short (1-2 sentences), but thinkingLevel 'low' means Gemini spends part
        // of this same budget reasoning before any JSON lands — sized generously (well past the bare
        // couple sentences the answer needs) so that reasoning pass can't squeeze out the actual
        // verdict once it's accounted for, the same headroom refreshData/refreshWidgets budget for.
        maxTokens: 700,
        temperature: 0.3,
        thinkingLevel: 'low',
        tools: { webSearch: true },
      },
      cfg,
    );
    const { text, sources: selfReported } = parseVerdict(rr.raw);
    if (!text) return null;
    // Either a native citation or a self-reported one is enough to call this turn grounded — the
    // same OR generateLive.ts uses for its turn-level signal (Gemini's native grounding metadata
    // comes back empty on a JSON turn even when a search genuinely ran).
    const grounded = (rr.sources?.length ?? 0) > 0 || selfReported.length > 0;
    return {
      text,
      at: now,
      grounded,
      ...(rr.sources && rr.sources.length ? { sources: rr.sources } : {}),
      ...(tw ? { tripwireId: tw.id } : {}),
    };
  } catch (err) {
    console.error('[dashboards] analyzeMove failed', err);
    return null;
  }
}
