import { castMember } from '../demo/cast';
import { peekDemoPersona } from '../demo/demoEntry';
import { peekTourMode } from '../tour/tourEntry';

const DEV_ONLY_PREFIXES = [
  '#/reel',
  '#/slidelab',
  '#/exportlab',
  '#/synlab',
  '#/pageviewlab',
  '#/whylab',
  // The world and mind labs were the two the list forgot. Both are dev-only harnesses over
  // AUTHORED fixtures — they call no model and send nothing anywhere — so gating them behind the
  // connected-features acknowledgement asked the reader to accept terms about data leaving the
  // device in order to look at a scenario baked into the bundle.
  '#/worldlab',
  '#/mindlab',
];

/** Public reading surfaces and prerecorded examples do not send the visitor's data to a model. */
export function isLegalGateBypassed(hash: string): boolean {
  if (!hash || hash === '#' || hash === '#/') return true;
  if (
    hash.startsWith('#/legal') ||
    hash.startsWith('#/terms') ||
    hash.startsWith('#/privacy') ||
    hash.startsWith('#/gallery')
  ) {
    return true;
  }
  if (import.meta.env.DEV && DEV_ONLY_PREFIXES.some((prefix) => hash.startsWith(prefix))) {
    return true;
  }
  if (isNoSpendRoute(hash)) return true;
  return false;
}

/** Baked examples are read-only: no model path may spend, even when a key is configured. */
export function isNoSpendRoute(hash: string): boolean {
  if (/^#\/(?:deepzoom|synthesis)[?&].*\bdemo=1(?:&|$)/.test(hash)) return true;
  if (!hash.startsWith('#/live')) return false;
  if (peekTourMode()) return true;
  const demo = peekDemoPersona();
  return !!demo && !!castMember(demo);
}
