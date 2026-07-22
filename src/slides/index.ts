// The slide layer: a Mavéa answer composed into a 10-style presentation deck. Shared by the
// document/presentation export and the in-app Present mode so what you present is what you export.
export { composeDeck, composeSlides } from './model/compose';
export type { Slide, SlideKind } from './model/Slide';
export { SlideCanvas, SlideStage } from './SlideStage';
export type { SlideCanvasProps, SlideStageProps } from './SlideStage';
export { STAGE_H, STAGE_W } from './skins/chrome/bits';
export { SLIDE_SKIN_ORDER, SLIDE_SKINS, suggestSlideSkin } from './skins/registry';
export type { SlideContext, SlideSkin, SlideSkinId } from './skins/types';
