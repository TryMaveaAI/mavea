// Public surface of the share module: the lazy launcher, demo frames adapter, and annotation reel
// builder. ShareModal stays behind direct dynamic imports so its renderers and encoders never join
// the eager application payload.
export { ClipButton } from './ClipButton';
