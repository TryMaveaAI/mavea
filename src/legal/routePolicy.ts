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
  if (/^#\/(?:deepzoom|synthesis)[?&].*\bdemo=1(?:&|$)/.test(hash)) return true;
  if (!hash.startsWith('#/live')) return false;
  if (peekTourMode()) return true;
  const demo = peekDemoPersona();
  return !!demo && !!castMember(demo);
}
