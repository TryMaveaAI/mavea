// Canvas visual foundation — the shared "quality floor" every block builds on.
//
// Charts used to hand-roll their own axis math, number formatting, density handling, and
// empty states; the result was inconsistent and broke on real data (the `hours9` bug, sparse
// charts stranded in dead space). These modules centralise that work so a block consumes a
// scale, a formatter, and axis/legend primitives instead of reinventing them.

export { niceStep, ticks, niceDomain, extent, scaleLinear } from './scale';
export { formatValue, formatPercent, formatDate } from './format';

export { densityPlan } from './density';

export { BlockEmpty } from './BlockEmpty';
export { computeEdgeLayout, ringPositions, adaptiveRadius } from './edgeLayout';
export { CopyButton } from './CopyButton';
export { BlankSlot } from './BlankSlot';
export { BlankFillContext, type BlankFillState } from './blankFill';
export { useCountUp, usePathDraw } from './motion';
