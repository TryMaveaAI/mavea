// The Live component-selection brain: classify the ask, retrieve fitting components
// from the catalog, rank them for fit + wow, and hand back exactly what the generation
// path needs (types, prompt menu, validator gate). See ./rank for the entry point.
export {
  selectComponents,
  chooseComponents,
  menuFor,
  type SelectionResult,
  type SelectionInput,
} from './rank';
export {
  BASE_FLOOR,
  GENERATIVE_BLOCK_TYPES,
  FAKE_DATA_TYPES,
  COERCIBLE_TYPES,
  catalogSpan,
} from './catalog';
export { detectShapes, detectRequested, formRequestDirective, type ShapeVector } from './shapes';
export { classifyAsk, isTeachingAsk, type AskComplexity } from './complexity';
export {
  effectiveExplainLevel,
  simpleLevelMenu,
  deepLevelMenu,
  type ExplainLevel,
} from './simpleLevel';
export { analyzeIntent } from './intent';
export { detectSpecialists, specialistDirective } from './specialists';
export { isMultiPart, multiPartDirective } from './facets';
export {
  shouldSynthesize,
  synthesisMenu,
  annotateMenu,
  svgBlockMenu,
  COMPOSITE_BLOCK_TYPE,
  SYNTH_FIT_FLOOR,
} from './synthesis';
