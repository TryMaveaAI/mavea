// index.ts — the trust contract's public surface.
export type {
  CalcTrace,
  CalculatedValue,
  Computed,
  GroundedResolution,
  GroundedValue,
  IllustrativeResolution,
  IllustrativeValue,
  StructureResolution,
  StructureValue,
  ValueScope,
  ValueStatus,
  WorldValue,
} from './types';
export { statusOf } from './types';
export { numberOf, rawOf, STATUS_LABEL } from './display';
export type { CalcResult } from './calc';
export { computeCalc, selfConsistent, SELF_CONSISTENCY_TOL } from './calc';
export type { CoercedWorld, RawWorldValue } from './coerce';
export { coerceWorldValues } from './coerce';
export type { TrustRegistry, UsedInRef, UsedInSource, UsedInSurface } from './registry';
export { buildRegistry } from './registry';
export type { EdgeRelation, EdgeStatus } from './relations';
export { asEdgeRelation, EDGE_RELATIONS, NOT_REPRESENTED_AS } from './relations';
export { DELTA_NOISE, relativeDeltaPhrase, shiftChip } from './phrase';
