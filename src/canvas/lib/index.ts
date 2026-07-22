// Canvas visual foundation — the shared "quality floor" every block builds on.
//
// Charts used to hand-roll their own axis math, number formatting, density handling, and
// empty states; the result was inconsistent and broke on real data (the `hours9` bug, sparse
// charts stranded in dead space). These modules centralise that work so a block consumes a
// scale, a formatter, and axis/legend primitives instead of reinventing them.

export { niceStep, ticks, niceDomain, extent, scaleLinear, type LinearScale } from './scale';
export {
  formatValue,
  formatPercent,
  formatDate,
  type FormatOptions,
  type DateFormatOptions,
} from './format';
export { Legend, type LegendItem } from './axis';
export { densityPlan, rollup, type DensityPlan, type RollupResult } from './density';
export { hasData } from './empty';
export { BlockEmpty } from './BlockEmpty';
export {
  computeEdgeLayout,
  ringPositions,
  adaptiveRadius,
  type NodePos,
  type EdgeSpec,
  type LayoutEdge,
} from './edgeLayout';
export { CopyButton } from './CopyButton';
export { BlankSlot } from './BlankSlot';
export { BlankFillContext, type BlankFillState } from './blankFill';
export { useCountUp, usePathDraw, type CountUpOptions, type PathDrawOptions } from './motion';
