// index.ts — the trust contract's public surface.
export type { WorldValue } from './types';
export { statusOf } from './types';
export { numberOf, rawOf, STATUS_LABEL } from './display';

export { computeCalc, selfConsistent } from './calc';
export type { RawWorldValue } from './coerce';
export { coerceWorldValues } from './coerce';
export type { TrustRegistry, UsedInRef, UsedInSource } from './registry';
export { buildRegistry } from './registry';

export { asEdgeRelation, EDGE_RELATIONS, NOT_REPRESENTED_AS } from './relations';
export { relativeDeltaPhrase, shiftChip } from './phrase';
