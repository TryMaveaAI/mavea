// Resolve a glyph from the model's free-form condition/mode words.
//
// The model doesn't speak our icon-key vocabulary: it writes "partly cloudy", "rainy",
// "thunderstorm" for weather and "walking", "driving", "light rail" for transit. A bare
// `Icon[name]` lookup misses all of those and falls back to a single default — which is why
// every forecast day rendered a sun and every transit leg a globe. These resolvers map the
// natural-language word onto the closest canonical glyph, with an exact-key fast path so a
// model that already emits 'rain'/'bus' keeps working unchanged.

import { Icon } from '../../../icons/icons';
import type { IconKey } from '../../../icons/icons';

type Glyph = (typeof Icon)[IconKey];

// Order matters: more specific patterns first (thunderstorm → storm before rain; sleet → snow).
const WEATHER: ReadonlyArray<readonly [RegExp, IconKey]> = [
  [/thunder|lightning|\bstorm/, 'storm'],
  [/snow|sleet|flurr|blizzard|\bice\b|wintry/, 'snow'],
  [/rain|drizzle|shower|precip|pour/, 'rain'],
  [/wind|breez|gust|gale/, 'wind'],
  [/cloud|overcast|fog|mist|haze|smoke/, 'cloud'],
  [/sun|clear|fair|\bhot\b|warm/, 'sun'],
];

const TRANSIT: ReadonlyArray<readonly [RegExp, IconKey]> = [
  [/walk|\bfoot\b|pedestrian|stroll/, 'walk'],
  [/subway|metro|underground|\btube\b/, 'subway'],
  [/train|\brail|tram|streetcar/, 'train'],
  [/bus|coach|shuttle/, 'bus'],
  [/bike|bicycl|cycl|scooter/, 'bike'],
  [/ferry|boat|ship|water taxi/, 'ferry'],
  [/car|driv|taxi|\bcab\b|rideshare|uber|lyft/, 'car'],
];

function resolve(
  raw: string | undefined,
  table: ReadonlyArray<readonly [RegExp, IconKey]>,
  fallback: IconKey,
): Glyph {
  if (raw && raw in Icon) return Icon[raw as IconKey]; // model already used a canonical key
  const s = (raw ?? '').toLowerCase();
  for (const [re, key] of table) if (re.test(s)) return Icon[key];
  return Icon[fallback];
}

/** Closest weather glyph for a condition word ("partly cloudy", "rainy", …). */
export const weatherGlyph = (condition: string | undefined): Glyph =>
  resolve(condition, WEATHER, 'sun');

/** Closest transit glyph for a mode word ("walking", "light rail", "driving", …). */
export const transitGlyph = (mode: string | undefined): Glyph => resolve(mode, TRANSIT, 'walk');
