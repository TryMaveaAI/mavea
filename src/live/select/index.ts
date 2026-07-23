// The Live component-selection brain: classify the ask, retrieve fitting components
// from the catalog, rank them for fit + wow, and hand back exactly what the generation
// path needs (types, prompt menu, validator gate). See ./rank for the entry point.
export {
  selectComponents,
  chooseComponents,
  menuFor,
  weightFor,
  TEACHING_KIT,
  type SelectionResult,
  type SelectionInput,
  type Choice,
} from './rank';
export {
  SAFE_SET,
  BASE_FLOOR,
  GENERATIVE_BLOCK_TYPES,
  FAKE_DATA_TYPES,
  COERCIBLE_TYPES,
  catalogSpan,
  metaFor,
  tierPool,
  type ModelTier,
} from './catalog';
export {
  detectShapes,
  detectRequested,
  requestedFormLabel,
  formRequestDirective,
  type ShapeVector,
} from './shapes';
export { classifyAsk, isTeachingAsk, type AskComplexity } from './complexity';
export {
  simpleAsk,
  deepAsk,
  standardAsk,
  effectiveExplainLevel,
  simpleLevelMenu,
  deepLevelMenu,
  type ExplainLevel,
} from './simpleLevel';
export { analyzeIntent, type IntentSignals, type IntentDomain } from './intent';
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
