// Sparse/empty data guards for the canvas blocks (pure logic; the placeholder
// component lives in BlockEmpty.tsx). A chart given an empty or all-invalid
// dataset should render a calm placeholder instead of an axis around nothing.

/**
 * True when at least one finite number is present. Use to gate a chart: if `!hasData(values)`,
 * render <BlockEmpty> instead of an axis around emptiness.
 */
export function hasData(values: readonly (number | null | undefined)[]): boolean {
  return values.some((v) => typeof v === 'number' && Number.isFinite(v));
}
