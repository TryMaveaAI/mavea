import type { ComponentFacts } from '../canvas/blocks/catalog/facts';
import { GALLERY_CLOSED_VOCAB_PATHS } from '../canvas/blocks/catalog/fixture-contracts.generated';

export type GalleryFixtureVariant = 'base' | 'verbose' | 'minimal';

export const GALLERY_FIXTURE_VARIANTS: readonly GalleryFixtureVariant[] = [
  'base',
  'verbose',
  'minimal',
];

const PROSE_KEYS = new Set([
  'acceptance',
  'answer',
  'body',
  'caveat',
  'content',
  'copy',
  'description',
  'detail',
  'disclaimer',
  'evidence',
  'explanation',
  'footer',
  'headline',
  'hint',
  'impact',
  'instruction',
  'instructions',
  'message',
  'note',
  'outcome',
  'prompt',
  'question',
  'rationale',
  'reason',
  'recommendation',
  'summary',
  'text',
  'warning',
]);
const TOP_LEVEL_HEADING_KEY = /^(?:sub)?title$/i;
const REPEATABLE_KEY =
  /items|rows|steps|events|checks|tips|chips|facts|sources|questions|slides|entries|tasks|reasons|options|facets|segments|bullets|messages|cards/i;
const URLISH = /^(?:https?:|data:|blob:|\/|#)/i;
const IDENTITY_KEY =
  /^(?:id|key|name|label|title|caption|value|code|sku|number|rank|step|category|group|period|date|time)$/i;
const NUMERIC_IDENTITY_KEY = /^(?:id|key|number|rank|step)$/i;
const SPATIAL_NUMBER_KEY =
  /^(?:x|y|x0|x1|y0|y1|at|from|to|start|end|left|right|top|bottom|row|col|span)$/i;

interface FixtureContract {
  readonly enumPaths: ReadonlySet<string>;
  /** Repeating one of these arrays would duplicate an immutable enum used as item identity. */
  readonly noRepeatArrays: ReadonlySet<string>;
}

const FIXTURE_CONTRACTS: ReadonlyMap<string, FixtureContract> = new Map(
  Object.entries(GALLERY_CLOSED_VOCAB_PATHS).map(([type, paths]) => {
    const noRepeatArrays = new Set<string>();
    for (const path of paths) {
      const separator = path.lastIndexOf('.');
      if (separator === -1 || !IDENTITY_KEY.test(path.slice(separator + 1))) continue;
      const parent = path.slice(0, separator);
      if (parent.endsWith('[]')) noRepeatArrays.add(parent.slice(0, -2));
    }
    return [type, { enumPaths: new Set(paths), noRepeatArrays }];
  }),
);

const EMPTY_CONTRACT: FixtureContract = {
  enumPaths: new Set(),
  noRepeatArrays: new Set(),
};

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function looksLikeUrl(value: string): boolean {
  return URLISH.test(value);
}

function isProseKey(key: string): boolean {
  const words = key
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z]+/);
  return words.some((word) => PROSE_KEYS.has(word));
}

function stretchString(value: string, key: string, depth: number): string {
  const isTopLevelHeading = depth === 1 && TOP_LEVEL_HEADING_KEY.test(key);
  if ((!isTopLevelHeading && !isProseKey(key)) || looksLikeUrl(value) || value.length === 0)
    return value;
  if (value.length >= 120) return value;
  if (/[?.!]$/.test(value))
    return `${value} Include edge cases, caveats, and what changes the read.`;
  return `${value} — include edge cases and caveats.`;
}

function uniqueRepeatString(value: string, ordinal: number): string {
  if (/^(?:data:|blob:)/i.test(value)) return value;
  if (looksLikeUrl(value)) return `${value}${value.includes('#') ? '&' : '#'}stress-${ordinal + 1}`;
  return `${value} · ${ordinal + 2}`;
}

function carriesSpatialPosition(value: unknown): boolean {
  if (!isObject(value)) return false;
  return Object.entries(value).some(
    ([key, item]) => SPATIAL_NUMBER_KEY.test(key) && typeof item === 'number',
  );
}

function carriesNumericIdentity(value: unknown): boolean {
  if (!isObject(value)) return false;
  return Object.entries(value).some(
    ([key, item]) => NUMERIC_IDENTITY_KEY.test(key) && typeof item === 'number',
  );
}

/** A repeated fixture must not repeat renderer identity. Many of the older blocks correctly use
 *  a domain label/id as their React key; an artificial clone with the same identity would make
 *  React reconcile two different rows as one. Keep semantic enum fields intact, but uniquify the
 *  conventional identity fields (and primitive repeat-list entries) in the synthetic copy. */
function cloneForRepeat(
  value: unknown,
  ordinal: number,
  contract: FixtureContract,
  key = '',
  path = '',
  depth = 0,
  repeatRoot = true,
): unknown {
  if (Array.isArray(value))
    return value.map((item) =>
      cloneForRepeat(item, ordinal, contract, key, `${path}[]`, depth + 1, false),
    );
  if (!isObject(value)) {
    if (typeof value === 'string') {
      if (contract.enumPaths.has(path)) return value;
      const stretched = stretchString(value, key, depth);
      return repeatRoot || IDENTITY_KEY.test(key)
        ? uniqueRepeatString(stretched, ordinal)
        : stretched;
    }
    return value;
  }
  const next: Record<string, unknown> = {};
  for (const [childKey, item] of Object.entries(value)) {
    const childPath = path ? `${path}.${childKey}` : childKey;
    next[childKey] = cloneForRepeat(item, ordinal, contract, childKey, childPath, depth + 1, false);
  }
  return next;
}

function stretchArray(
  value: unknown[],
  key: string,
  path: string,
  contract: FixtureContract,
): unknown[] {
  if (
    !REPEATABLE_KEY.test(key) ||
    contract.noRepeatArrays.has(path) ||
    value.some(carriesSpatialPosition) ||
    value.some(carriesNumericIdentity) ||
    value.some((item) => typeof item !== 'string' && !isObject(item)) ||
    value.length === 0 ||
    value.length >= 6
  )
    return value;
  const extras = Math.min(2, 6 - value.length);
  const next = [...value];
  for (let index = 0; index < extras; index++) {
    const source = value[index % value.length];
    next.push(cloneForRepeat(source, index, contract, key, `${path}[]`));
  }
  return next;
}

function applyVerbose(
  value: unknown,
  contract: FixtureContract,
  key = '',
  path = '',
  depth = 0,
): unknown {
  if (Array.isArray(value)) {
    const next = value.map((item) => applyVerbose(item, contract, key, `${path}[]`, depth + 1));
    return stretchArray(next, key, path, contract);
  }
  if (!isObject(value)) {
    return typeof value === 'string' && !contract.enumPaths.has(path)
      ? stretchString(value, key, depth)
      : value;
  }
  const next: Record<string, unknown> = {};
  for (const [childKey, item] of Object.entries(value)) {
    const childPath = path ? `${path}.${childKey}` : childKey;
    next[childKey] = applyVerbose(item, contract, childKey, childPath, depth + 1);
  }
  return next;
}

function applyMinimal(
  value: unknown,
  requiredTopLevel: ReadonlySet<string>,
  isTopLevel = true,
): unknown {
  if (Array.isArray(value)) return value.map((item) => applyMinimal(item, requiredTopLevel, false));
  if (!isObject(value)) return value;
  const next: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (isTopLevel && !requiredTopLevel.has(key)) continue;
    next[key] = applyMinimal(item, requiredTopLevel, false);
  }
  return next;
}

export function coerceFixtureVariant(raw: string | null | undefined): GalleryFixtureVariant {
  return GALLERY_FIXTURE_VARIANTS.includes(raw as GalleryFixtureVariant)
    ? (raw as GalleryFixtureVariant)
    : 'base';
}

export function readFixtureVariant(
  hash = typeof window === 'undefined' ? '' : window.location.hash,
) {
  const query = hash.split('?')[1] ?? '';
  return coerceFixtureVariant(new URLSearchParams(query).get('variant'));
}

export function applyFixtureVariant(
  props: unknown,
  facts: ComponentFacts | undefined,
  variant: GalleryFixtureVariant,
): unknown {
  if (variant === 'base') return props;
  if (variant === 'verbose')
    return applyVerbose(props, FIXTURE_CONTRACTS.get(facts?.type ?? '') ?? EMPTY_CONTRACT);
  const requiredTopLevel = new Set(facts?.requires ?? []);
  return applyMinimal(props, requiredTopLevel);
}
