// coerce.ts — the loader gate between raw model output and the typed world of values. The model
// PROPOSES ids, tiers, quotes, and formulas; this file verifies them, in trust order, per value:
//   1. the id must be well-formed (duplicates: first wins);
//   2. a claimed real (T1/T2) figure must carry a quote verbatim in the corpus AND its own digits
//      inside that quote — fail-closed, so an empty corpus grounds nothing;
//   3. a formula+inputs pair is settled in a second, fixpoint pass (calcs may feed calcs) through
//      computeCalc, with the model's own claimed value rejected when it disagrees with its own
//      arithmetic;
//   4. a claimed T3 magnitude survives only when the world opted in AND the value carries a caveat;
//   5. everything else degrades to structure — the name survives, the number never does.
// Nothing here fabricates: every gate strips rather than guesses.
import { parseLooseJson } from '../ground/json';
import { makeVerbatimGrounder } from '../ground/verbatim';
import { valueInQuote } from '../ground/number';
import { hostOf } from '../ground/citation';
import { qualitative } from '../ground/types';
import type { Receipt } from '../ground/types';
import { withUnit } from '../../canvas/lib/format';
import { computeCalc, selfConsistent } from './calc';
import type {
  CalcTrace,
  GroundedResolution,
  IllustrativeResolution,
  ValueScope,
  WorldValue,
} from './types';

/** What the model may propose for one value, before any gate has run. */
export interface RawWorldValue {
  id?: string;
  label?: string;
  region?: string;
  period?: string;
  unit?: string;
  tier?: string;
  value?: number;
  quote?: string;
  receipt?: {
    url?: string;
    host?: string;
    date?: string;
    cell?: string;
    doc?: number;
    page?: number;
  };
  formula?: string;
  inputs?: string[];
  /** The caveat text for a T3 claim ("shows the shape, not your numbers"). */
  illustrative?: string;
}

export interface CoercedWorld {
  values: Map<string, WorldValue>;
  /** Diagnostic labels for raw entries that could not be kept AT ALL (bad/duplicate id, over cap).
   *  Demotions are not drops — an ungrounded value survives as structure. */
  dropped: string[];
}

/** Value ids are formula-friendly names; dots namespace ("us.gdp") but such an id can never be a
 *  calc input (the evaluator's token grammar has no dots) — that fails closed, by design. */
const ID_RE = /^[a-zA-Z_][a-zA-Z0-9_.]*$/;
const ID_MAX = 64;
/** One payload's value budget — a runaway model can't flood the world. */
const MAX_VALUES = 64;
/** How many raw entries we even look at (over-cap entries are all drops anyway). */
const MAX_SCAN = 512;
/** A formula over more inputs than this is not a human-auditable derivation. */
const MAX_CALC_INPUTS = 12;
/** Formulas are REJECTED over this length, never truncated — a truncated formula could evaluate
 *  to a silently different number, and fail-closed beats fail-plausible. */
const MAX_FORMULA_LEN = 200;
const LABEL_MAX = 120;
const QUOTE_MAX = 240;
const CAVEAT_MAX = 160;
const SCOPE_MAX = 60;
const UNIT_MAX = 12;

function str(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (!s) return null;
  return s.length > max ? s.slice(0, max) : s;
}

/** Build a Receipt from a raw receipt object + a verified quote (why/validate.ts's clamps, plus
 *  the T1 document anchors the spine's Receipt carries). */
function pickReceipt(rawReceipt: unknown, quote: string): Receipt {
  const r = (rawReceipt && typeof rawReceipt === 'object' ? rawReceipt : {}) as Record<
    string,
    unknown
  >;
  const url = str(r.url, 400);
  const host = str(r.host, 80) ?? (url ? hostOf(url) : null);
  const date = str(r.date, 40);
  const cell = str(r.cell, 12);
  const doc = typeof r.doc === 'number' && Number.isInteger(r.doc) && r.doc >= 0 ? r.doc : null;
  const page =
    typeof r.page === 'number' && Number.isInteger(r.page) && r.page >= 1 ? r.page : null;
  return {
    quote,
    ...(url ? { url } : {}),
    ...(host ? { host } : {}),
    ...(date ? { date } : {}),
    ...(cell ? { cell } : {}),
    ...(doc !== null ? { doc } : {}),
    ...(page !== null ? { page } : {}),
  };
}

/** One entry's identity + whatever the fall-through gates (4/5) need to settle it. */
interface Settleable {
  id: string;
  label: string;
  scope?: ValueScope;
  tier?: 'T1' | 'T2' | 'T3';
  claimed?: number;
  caveat?: string;
}

interface DeferredCalc extends Settleable {
  formula: string;
  inputs: string[];
}

export function coerceWorldValues(
  raw: unknown,
  corpus: string,
  opts: { illustrativeWorld?: boolean } = {},
): CoercedWorld {
  const parsed = typeof raw === 'string' ? parseLooseJson(raw) : raw;
  const container =
    parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>).values
      : parsed;
  const list: unknown[] = Array.isArray(container) ? container : [];

  const ground = makeVerbatimGrounder(corpus);
  const values = new Map<string, WorldValue>();
  const dropped: string[] = [];
  const deferred: DeferredCalc[] = [];

  // (4)/(5): a claimed-T3 value survives caveated only when the world opted in; otherwise the
  // honest floor — structure keeps the name and strips the number.
  const settle = (e: Settleable): WorldValue => {
    if (e.tier === 'T3' && opts.illustrativeWorld === true && e.caveat && e.claimed !== undefined) {
      const resolution: IllustrativeResolution = {
        ok: true,
        tier: 'T3',
        value: e.claimed,
        raw: withUnit(e.claimed, e.scope?.unit),
        illustrative: e.caveat,
        surface: 'model',
      };
      return {
        id: e.id,
        label: e.label,
        ...(e.scope ? { scope: e.scope } : {}),
        kind: 'illustrative',
        resolution,
      };
    }
    return {
      id: e.id,
      label: e.label,
      ...(e.scope ? { scope: e.scope } : {}),
      kind: 'structure',
      resolution: qualitative(e.label),
    };
  };

  if (list.length > MAX_SCAN) dropped.push(`(${list.length - MAX_SCAN} entries beyond scan cap)`);

  for (let i = 0; i < list.length && i < MAX_SCAN; i += 1) {
    const rv = list[i];
    if (!rv || typeof rv !== 'object') {
      dropped.push(`#${i}`);
      continue;
    }
    const r = rv as Record<string, unknown>;

    // (1) identity — a value without a well-formed, unique id can't be referenced, so it can't exist.
    const id = typeof r.id === 'string' ? r.id.trim() : '';
    if (!id || id.length > ID_MAX || !ID_RE.test(id)) {
      dropped.push(id || `#${i}`);
      continue;
    }
    if (values.has(id) || deferred.some((d) => d.id === id)) {
      dropped.push(id); // duplicate — first wins
      continue;
    }
    if (values.size + deferred.length >= MAX_VALUES) {
      dropped.push(id);
      continue;
    }

    const label = str(r.label, LABEL_MAX) ?? id;
    const region = str(r.region, SCOPE_MAX);
    const period = str(r.period, SCOPE_MAX);
    const unit = str(r.unit, UNIT_MAX);
    const scope: ValueScope | undefined =
      region || period || unit
        ? {
            ...(region ? { region } : {}),
            ...(period ? { period } : {}),
            ...(unit ? { unit } : {}),
          }
        : undefined;
    const tier = r.tier === 'T1' || r.tier === 'T2' || r.tier === 'T3' ? r.tier : undefined;
    const claimed = typeof r.value === 'number' && Number.isFinite(r.value) ? r.value : undefined;
    const quote = str(r.quote, QUOTE_MAX);
    const caveat = str(r.illustrative, CAVEAT_MAX) ?? undefined;
    const base: Settleable = {
      id,
      label,
      ...(scope ? { scope } : {}),
      ...(tier ? { tier } : {}),
      ...(claimed !== undefined ? { claimed } : {}),
      ...(caveat ? { caveat } : {}),
    };

    // (2) a claimed real figure earns its receipt or falls through — verbatim quote AND the value's
    // own digits inside it (an empty corpus grounds nothing).
    if (
      (tier === 'T1' || tier === 'T2') &&
      claimed !== undefined &&
      quote &&
      ground(quote) &&
      valueInQuote(claimed, quote)
    ) {
      const receipt = pickReceipt(r.receipt, quote);
      const rawText = withUnit(claimed, unit ?? undefined);
      const resolution: GroundedResolution =
        tier === 'T1'
          ? { ok: true, tier: 'T1', value: claimed, raw: rawText, receipt, surface: 'user' }
          : { ok: true, tier: 'T2', value: claimed, raw: rawText, receipt, surface: 'web' };
      values.set(id, {
        id,
        label,
        ...(scope ? { scope } : {}),
        kind: 'grounded',
        resolution,
      });
      continue;
    }

    // (3) a derived figure waits for the second pass, once its inputs exist.
    const formulaRaw = typeof r.formula === 'string' ? r.formula.trim() : '';
    const formula = formulaRaw.length > 0 && formulaRaw.length <= MAX_FORMULA_LEN ? formulaRaw : '';
    const inputs = Array.isArray(r.inputs)
      ? r.inputs.filter(
          (x): x is string => typeof x === 'string' && x.length <= ID_MAX && ID_RE.test(x),
        )
      : [];
    if (formula && inputs.length > 0 && inputs.length <= MAX_CALC_INPUTS) {
      deferred.push({ ...base, formula, inputs });
      continue;
    }

    values.set(id, settle(base));
  }

  // Second pass, to fixpoint: a calc may depend on another calc coerced later in the payload, so
  // retry until a full round settles nothing more (each productive round shrinks the list, so this
  // is bounded by deferred.length rounds). Whatever never resolves — cycle, missing or untrusted
  // input — degrades through the same fall-through gates as everything else.
  let pending = deferred;
  while (pending.length > 0) {
    const next: DeferredCalc[] = [];
    for (const d of pending) {
      const calc: CalcTrace = { formula: d.formula, inputs: d.inputs };
      const computed = computeCalc(calc, (vid) => values.get(vid));
      if (!computed) {
        next.push(d);
        continue;
      }
      if (d.claimed !== undefined && !selfConsistent(computed.value, d.claimed)) {
        // The model's headline number disagrees with its own arithmetic — reject the claim rather
        // than pick a side; the value survives only qualitatively.
        values.set(d.id, settle(d));
        continue;
      }
      values.set(d.id, {
        id: d.id,
        label: d.label,
        ...(d.scope ? { scope: d.scope } : {}),
        kind: 'calculated',
        value: computed.value,
        raw: d.scope?.unit ? withUnit(computed.value, d.scope.unit) : computed.raw,
        calc,
      });
    }
    if (next.length === pending.length) break;
    pending = next;
  }
  for (const d of pending) values.set(d.id, settle(d));

  return { values, dropped };
}
