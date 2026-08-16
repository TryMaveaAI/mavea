// world/valueIds.ts — how a world's figures are named in the trust registry. One formula, imported
// by everything that builds or reads the index, for the same reason the edge ids come from the
// adapted morph world rather than a second copy: a surface that prints a figure and a surface that
// speaks it must be asking for the SAME value, and two local `\`node:${id}\`` templates drift the
// first time one of them grows a prefix.

/** A node's own magnitude. */
export const nodeValueId = (nodeId: string): string => `node:${nodeId}`;

/** One dated point on a node's series, keyed by the point's own time label. */
export const pointValueId = (nodeId: string, t: string): string => `node:${nodeId}@${t}`;
