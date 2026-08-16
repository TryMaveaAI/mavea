// types.ts — the trust contract for a persistent world of named values. Every number a living
// answer can show is a WorldValue, and its status is DERIVED from how it was produced — grounded
// (a receipted T1/T2 resolution), calculated (arithmetic over grounded inputs, carrying its own
// trace), illustrative (an opted-in T3 magnitude), or structure (no number at all). The arms reuse
// the provenance spine's Resolution shapes via Extract<> rather than a parallel copy, so the two
// contracts can never drift apart.
import type { Resolution } from '../ground/types';

/** What a value is a value OF — the qualifiers that make "GDP" mean one specific measurement. */
export interface ValueScope {
  region?: string;
  period?: string;
  unit?: string;
}

declare const COMPUTED: unique symbol;
/** A number PROVEN by arithmetic over grounded inputs. Branded so the type system rejects a plain
 *  model-authored number where a computed one is required; calc.ts is the only producer (a source
 *  pin test enforces that the brand assertion appears nowhere else). */
export type Computed = number & { readonly [COMPUTED]: true };

/** The auditable derivation behind a calculated value: a safeEval-restricted arithmetic formula
 *  over the ids of other WorldValues. */
export interface CalcTrace {
  /** expr.ts-safe arithmetic over input ids, e.g. "price * daily_units". */
  formula: string;
  /** Ids of the WorldValues the formula reads. Each must be grounded or itself calculated. */
  inputs: string[];
  note?: string;
}

/** The receipted (T1 user-data / T2 web-cited) ok-arms of the spine's Resolution. */
export type GroundedResolution = Extract<Resolution, { ok: true; tier: 'T1' | 'T2' }>;
/** The caveated illustrative (T3) ok-arm. */
export type IllustrativeResolution = Extract<Resolution, { ok: true; tier: 'T3' }>;
/** The no-number structure (T0) ok-arm. */
export type StructureResolution = Extract<Resolution, { ok: true; tier: 'T0' }>;

interface WorldValueBase {
  id: string;
  label: string;
  scope?: ValueScope;
}

/** A real, receipted measurement — the resolution carries the proof. */
export interface GroundedValue extends WorldValueBase {
  kind: 'grounded';
  resolution: GroundedResolution;
}

/** A figure derived from other values by recorded arithmetic; `value` is branded because only
 *  calc.ts can have produced it, and `calc` is the derivation shown to the user. */
export interface CalculatedValue extends WorldValueBase {
  kind: 'calculated';
  value: Computed;
  raw: string;
  calc: CalcTrace;
}

/** A textbook magnitude, always caveated — never the user's measured fact. */
export interface IllustrativeValue extends WorldValueBase {
  kind: 'illustrative';
  resolution: IllustrativeResolution;
}

/** A named quantity with NO number — the honest floor everything ungrounded degrades to. */
export interface StructureValue extends WorldValueBase {
  kind: 'structure';
  resolution: StructureResolution;
}

export type WorldValue = GroundedValue | CalculatedValue | IllustrativeValue | StructureValue;

/** A value's trust status. Derived from its shape, never model-authored. */
export type ValueStatus = WorldValue['kind'];

export function statusOf(v: WorldValue): ValueStatus {
  return v.kind;
}
