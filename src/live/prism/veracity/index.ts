// veracity/ — Prism's "is this TRUE?" layer: check a settled map's load-bearing claims against the
// live world, with a verdict + a gated, real world-side citation per claim, and a deterministic
// Standing line summarizing how the document fared. The document-side verbatim gate stays sacred and
// unchanged; the world-side receipt is honestly weaker (a search snippet) and never blended with it.
export type { Verdict, Veracity, WorldCitation } from './types';
export { VERDICT_META, TROUBLED } from './types';
export { standingLine } from './standingLine';
export { runVeracity, type VeracityOpts } from './verify';
export { gateCitation, resolveVerdict, hostOf, type Evidence, type RawVerdict } from './gate';
