// The figure-embed layer: render a real canvas block as a designed, skin-themed, fit-to-frame
// figure inside an export (PDF document or slide deck). Shared by both export/ and slides/ so the
// "render the real component" path exists once. See canvas/embed/FigureEmbed for the entry point.
export { FigureEmbed, type FigureEmbedProps, type FigurePalette } from './FigureEmbed';
export { computeFitScale } from './fitScale';
export { bridgeVars } from './bridge';
export { embedClass, isEmbeddable, type EmbedKind } from './embedClass';
export { renderBlockBare, type BareBlock } from './renderBlockBare';
export { ensureFigureReady, type FigureReadyOpts } from './ready';
