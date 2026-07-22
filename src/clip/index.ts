// Public surface of the share module: the launcher and the modal that turns a conversation into a
// cinematic vertical "Mavéa Reel" (rendered offscreen to a real MP4 — no screen capture), plus the
// demo frames adapter. The reel player, director, finishes and audio renderer live under ./reel.
export { ClipButton } from './ClipButton';
export { ShareModal } from './ShareModal';
export { framesFromSpec } from './frames';
export { buildAnnotationReel } from './reel/annotationReel';
export type { ClipAspect, ClipResult } from './types';
