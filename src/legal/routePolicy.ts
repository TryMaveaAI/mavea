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

/** Only the landing and the documents themselves are open: a reader has to be able to read what
 *  they are agreeing to before they agree. Everything else, prerecorded examples included, sits
 *  behind the acknowledgement. A replay is reached by URL and runs inside the real surface, where
 *  Settings, a key field, the microphone and connections are one click away; exempting it by route
 *  would exempt all of those, and a new feature on that surface would silently join them. */
export function isLegalGateBypassed(hash: string): boolean {
  if (!hash || hash === '#' || hash === '#/') return true;
  if (hash.startsWith('#/legal') || hash.startsWith('#/terms') || hash.startsWith('#/privacy')) {
    return true;
  }
  return import.meta.env.DEV && DEV_ONLY_PREFIXES.some((prefix) => hash.startsWith(prefix));
}

/** Baked examples are read-only: no model path may spend, even when a key is configured. */
export function isNoSpendRoute(hash: string): boolean {
  if (/^#\/(?:deepzoom|synthesis)[?&].*\bdemo=1(?:&|$)/.test(hash)) return true;
  if (!hash.startsWith('#/live')) return false;
  if (peekTourMode()) return true;
  const demo = peekDemoPersona();
  return !!demo && !!castMember(demo);
}
