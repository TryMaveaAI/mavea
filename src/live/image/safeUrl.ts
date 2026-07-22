// safeUrl.ts — the live pipeline's entry to the model-supplied image URL gate. The
// allowlist core lives in src/lib/safeImageUrl so canvas blocks can share the exact
// same boundary without importing from live/ (canvas must stay live-free); this module
// keeps the established import path for live consumers (liveSchema et al.).
export { safeImageUrl, safeBlockImageSrc } from '../../lib/safeImageUrl';
