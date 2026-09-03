// autopsy/run.ts — orchestrates Forecast Autopsy. The document's dated forecast claims are retrieved
// against the live world (free-first Wikipedia or a keyed provider), then ONE batched model call reports
// each real outcome with a gated citation, whether it's comparable (same metric/unit/scope) and due.
// The verdict — hit/miss and by how much — is then computed in PURE code (grade.ts) from numbers parsed
// out of the document's prediction and the cited outcome. The model never decides hit/miss, and an
// outcome with no real citation (or a different unit) degrades to honest "unknown"/"incomparable".
//
// Cost shape: N free searches + ONE model call, on demand, ONLY when web search is on. Never a fan-out.
import type { ModelConfig } from '../../../types/mavea';
import { getAdapter } from '../../providers';
import { getSearchProvider } from '../../search';
import type { SearchProviderId } from '../../search/types';
import { gateCitation, type Evidence } from '../veracity/gate';
import { extractNumbers } from '../reconcile/extractNumbers';
import { gradeForecast } from './grade';
import { completedArrayItems } from '../../streamParse';
import type { ForecastGrade } from './types';

/** A dated forecast claim (kind 'forecast', load-bearing) to grade. */
export interface ForecastClaim {
  id: string;
  page: number;
  quote: string;
}

export interface AutopsyOpts {
  cfg: ModelConfig;
  searchProviderId?: SearchProviderId;
  apiKey?: string;
  signal?: AbortSignal;
  maxClaims?: number;
  perClaimResults?: number;
}

function resolveProvider(id: SearchProviderId | undefined, apiKey: string | undefined) {
  const p = getSearchProvider(id);
  return p.needsKey && !apiKey ? getSearchProvider('wikipedia') : p;
}

function queryFor(c: ForecastClaim): string {
  return c.quote.replace(/\s+/g, ' ').trim().slice(0, 200);
}

/** First parsed magnitude + unit from a piece of text (the document's prediction, or the outcome). */
function firstNumber(text: string): { value: number; unit: string } | null {
  const atoms = extractNumbers([{ id: 'x', page: 0, quote: text }]);
  return atoms.length > 0 ? { value: atoms[0].value, unit: atoms[0].unit } : null;
}

function extractJsonObject(raw: string | object): Record<string, unknown> | null {
  if (raw && typeof raw === 'object') return raw as Record<string, unknown>;
  const text = String(raw);
  const start = text.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, i + 1)) as Record<string, unknown>;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

const SYSTEM =
  "You compare a document's past PREDICTION against what actually happened, judging ONLY from the search " +
  'snippets given to you, and return strict JSON. You never invent a source, URL, number, or outcome, ' +
  'and you default to an empty/unknown outcome when the sources do not clearly say.';

function buildPrompt(
  claims: readonly ForecastClaim[],
  evidence: ReadonlyMap<string, Evidence[]>,
): string {
  const blocks = claims.map((c) => {
    const ev = evidence.get(c.id) ?? [];
    const lines = ev.map((e) => `  - "${e.title}": ${e.snippet} (${e.url})`).join('\n');
    return `[${c.id}] PREDICTION: "${c.quote}" (p.${c.page})\n  sources:\n${lines}`;
  });
  return `For each PREDICTION below (made in a document in the past), report what ACTUALLY happened, using
ONLY the search snippets listed for it.

Return ONLY JSON (no prose, no fences):
{ "grades": [ { "claimId": "...", "actual": "<the real outcome in plain words, e.g. '6% in 2025'>",
  "comparable": true|false, "due": true|false,
  "citationQuote": "<copied VERBATIM from one of that prediction's sources>", "citationUrl": "<that source's URL>" } ] }

Rules:
- "actual" must come ONLY from the snippets. If they don't clearly give the outcome, set "actual":"" and "due" as best you can.
- "comparable": true ONLY if the outcome measures the SAME thing as the prediction (same metric, unit,
  year/horizon, and scope). If it's a different metric or scope, set comparable=false.
- "due": true only if the prediction's horizon (its target year/date) is in the past; false if it hasn't arrived.
- For any non-empty "actual" you MUST copy a "citationQuote" word-for-word from ONE of that prediction's
  sources and copy its "citationUrl" exactly. Never invent a source, URL, number, or outcome.

PREDICTIONS AND THEIR SOURCES:
${blocks.join('\n\n')}`;
}

interface RawGrade {
  claimId?: string;
  actual?: string;
  comparable?: boolean;
  due?: boolean;
  citationQuote?: string;
  citationUrl?: string;
}

function parseGrades(raw: string | object): RawGrade[] {
  const obj = extractJsonObject(raw);
  // Truncated stream → salvage the complete array items rather than dropping every grade (each is
  // gated against real evidence below, so a partial prefix is safe).
  const arr =
    obj && Array.isArray(obj.grades)
      ? obj.grades
      : typeof raw === 'string'
        ? completedArrayItems(raw, 'grades')
        : [];
  const out: RawGrade[] = [];
  for (const g of arr) if (g && typeof g === 'object') out.push(g as RawGrade);
  return out;
}

/**
 * Grade the document's dated forecasts against the live world. Returns one {@link ForecastGrade} per
 * checked claim — never throws: a failed search/model call degrades every claim to honest "unknown".
 * The hit/miss verdict is computed in pure code; the outcome is shown only with a gate-verified citation.
 */
export async function runAutopsy(
  claims: readonly ForecastClaim[],
  opts: AutopsyOpts,
): Promise<ForecastGrade[]> {
  const targets = claims.slice(0, opts.maxClaims ?? 10);
  if (targets.length === 0) return [];
  const provider = resolveProvider(opts.searchProviderId, opts.apiKey);

  const evidence = new Map<string, Evidence[]>();
  await Promise.all(
    targets.map(async (c) => {
      const results = await provider.search(queryFor(c), {
        apiKey: opts.apiKey,
        limit: opts.perClaimResults ?? 4,
        ...(opts.signal ? { signal: opts.signal } : {}),
      });
      evidence.set(
        c.id,
        results.map((r) => ({ title: r.title, url: r.url, snippet: r.snippet })),
      );
    }),
  );

  const checkable = targets.filter((c) => (evidence.get(c.id)?.length ?? 0) > 0);
  const out: ForecastGrade[] = targets
    .filter((c) => (evidence.get(c.id)?.length ?? 0) === 0)
    .map((c) => ({
      claimId: c.id,
      page: c.page,
      predicted: c.quote,
      ...(firstNumber(c.quote) ? { predictedValue: firstNumber(c.quote)!.value } : {}),
      status: 'unknown' as const,
      note: 'No live outcome was found to check this prediction.',
    }));
  if (checkable.length === 0) return out;

  let raw: string | object;
  try {
    const res = await getAdapter(opts.cfg.provider).generate(
      {
        usageLabel: 'prism-autopsy',
        system: SYSTEM,
        history: [],
        user: buildPrompt(checkable, evidence),
        maxTokens: 1500,
        temperature: 0,
        format: null,
        ...(opts.signal ? { signal: opts.signal } : {}),
      },
      opts.cfg,
    );
    raw = res.raw;
  } catch {
    for (const c of checkable) {
      out.push({
        claimId: c.id,
        page: c.page,
        predicted: c.quote,
        status: 'unknown',
        note: 'Could not reach the source check.',
      });
    }
    return out;
  }

  const byId = new Map(checkable.map((c) => [c.id, c]));
  const grades = parseGrades(raw);
  const seen = new Set<string>();
  for (const g of grades) {
    const c = byId.get(str(g.claimId));
    if (!c || seen.has(c.id)) continue;
    seen.add(c.id);

    const ev = evidence.get(c.id) ?? [];
    const citation = gateCitation(
      { citationQuote: str(g.citationQuote), citationUrl: str(g.citationUrl) },
      ev,
    );
    const pred = firstNumber(c.quote);
    const act = firstNumber(str(g.actual));
    // A different unit between prediction and outcome can never be comparable, whatever the model said.
    const comparable = !!g.comparable && (!pred || !act || pred.unit === act.unit);
    const hasOutcome = !!str(g.actual) && !!citation;
    // A real, cited outcome means the horizon has arrived — so treat the prediction as due even when
    // the model didn't echo due:true. Only an explicit due:false overrides that, so a settled
    // prediction with a perfect citation isn't mislabeled "not due" on a missing field.
    const due = g.due === false ? false : !!g.due || hasOutcome;
    const grade = gradeForecast(
      pred?.value,
      hasOutcome ? act?.value : undefined,
      comparable && hasOutcome,
      due,
    );

    out.push({
      claimId: c.id,
      page: c.page,
      predicted: c.quote,
      ...(pred ? { predictedValue: pred.value } : {}),
      status: hasOutcome ? grade.status : g.due === false ? 'not-due' : 'unknown',
      ...(hasOutcome ? { actual: str(g.actual) } : {}),
      ...(hasOutcome && act ? { actualValue: act.value } : {}),
      ...(grade.delta ? { delta: grade.delta } : {}),
      ...(grade.factor ? { factor: grade.factor } : {}),
      ...(citation ? { citation } : {}),
      note: hasOutcome
        ? 'Graded against a cited source.'
        : g.due === false
          ? 'Not due yet — the prediction’s horizon hasn’t arrived.'
          : 'No verifiable outcome was found.',
    });
  }
  // checkable claims the model skipped → honest unknown
  for (const c of checkable) {
    if (!seen.has(c.id)) {
      out.push({
        claimId: c.id,
        page: c.page,
        predicted: c.quote,
        status: 'unknown',
        note: 'The sources did not clearly give an outcome.',
      });
    }
  }
  return out;
}
