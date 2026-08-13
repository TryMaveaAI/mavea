import type { ComponentContentBudget, ComponentMeta, FieldContentBudget } from './meta';

// One contract for both model instructions and the validator. Defaults intentionally preserve
// useful depth while preventing a single field or collection from taking over a Canvas card.
export const DEFAULT_TEXT_GRAPHEMES = 240;
export const DEFAULT_ITEM_LIMIT = 16;

const TYPE_BUDGETS: Readonly<Record<string, ComponentContentBudget>> = {
  codeblock: {
    fields: {
      title: { maxGraphemes: 96, maxLines: 2 },
      code: { maxGraphemes: 32_768, maxLines: 800 },
      footer: { maxGraphemes: 480, maxLines: 8 },
    },
  },
  svgblock: { fields: { svg: { maxGraphemes: 65_536, maxLines: 1_500 } } },
  datatable: {
    fields: {
      columns: { maxItems: 12 },
      rows: { maxItems: 50 },
      'columns[].label': { maxGraphemes: 72, maxLines: 2 },
    },
  },
  docview: { fields: { blocks: { maxItems: 80 } } },
  annotateddoc: { fields: { paragraphs: { maxItems: 60 } } },
  slidedeck: { fields: { slides: { maxItems: 24 } } },
  terminal: { fields: { lines: { maxItems: 120 } } },
  logstream: { fields: { entries: { maxItems: 120 } } },
};

const TITLE_KEYS = /^(title|headline|heading|subject|algorithm)$/i;
const LABEL_KEYS = /^(label|name|key|category|metric|role|word|term|status|tag|kind|type)$/i;
const SHORT_KEYS = /^(date|time|duration|unit|value|score|rank|version|handle|platform)$/i;
const PROSE_KEYS =
  /^(summary|description|detail|explanation|reasoning|caption|note|footer|copy|fix|cause|message|significance)$/i;
const LONG_KEYS = /^(body|content|paragraph|lede|quote|sample|result|answer)$/i;
const RAW_KEYS = /^(code|source|svg|tex|math|smiles)$/i;
const URL_KEYS = /^(url|src|href|thumb|imageUrl)$/i;

const ARRAY_LIMITS: Readonly<Record<string, number>> = {
  columns: 12,
  series: 12,
  categories: 16,
  options: 16,
  items: 16,
  rows: 20,
  events: 20,
  steps: 16,
  stages: 16,
  slides: 24,
  paragraphs: 60,
  blocks: 60,
  lines: 80,
  entries: 80,
  groups: 20,
  nodes: 80,
  edges: 160,
  points: 160,
  values: 200,
  cells: 200,
};

function lastPathKey(path: string): string {
  return path.replace(/\[\]$/g, '').split('.').at(-1) ?? '';
}

function fallbackFieldBudget(path: string): FieldContentBudget {
  const key = lastPathKey(path);
  const nested = path.includes('[]');
  if (RAW_KEYS.test(key)) return { maxGraphemes: 32_768, maxLines: 800 };
  if (URL_KEYS.test(key)) return { maxGraphemes: 2_048, maxLines: 1 };
  if (TITLE_KEYS.test(key)) return { maxGraphemes: 96, maxLines: 2 };
  if (LABEL_KEYS.test(key)) return { maxGraphemes: 96, maxLines: 3 };
  if (SHORT_KEYS.test(key)) return { maxGraphemes: 64, maxLines: 2 };
  if (PROSE_KEYS.test(key)) return { maxGraphemes: nested ? 320 : 480, maxLines: nested ? 8 : 12 };
  if (LONG_KEYS.test(key))
    return { maxGraphemes: nested ? 640 : 1_600, maxLines: nested ? 16 : 48 };
  if (key === 'text') {
    return nested ? { maxGraphemes: 240, maxLines: 6 } : { maxGraphemes: 1_200, maxLines: 36 };
  }
  return { maxGraphemes: DEFAULT_TEXT_GRAPHEMES, maxLines: 8 };
}

function fallbackArrayBudget(path: string): FieldContentBudget {
  const key = lastPathKey(path);
  return { maxItems: ARRAY_LIMITS[key] ?? DEFAULT_ITEM_LIMIT };
}

/** Resolve a calibrated override first, then the central fallback. */
export function fieldContentBudget(
  type: string,
  path: string,
  kind: 'text' | 'array',
  authored?: ComponentContentBudget,
): FieldContentBudget {
  const authoredHit = authored?.fields[path];
  const typeHit = TYPE_BUDGETS[type]?.fields[path];
  return {
    ...(kind === 'text' ? fallbackFieldBudget(path) : fallbackArrayBudget(path)),
    ...typeHit,
    ...authoredHit,
  };
}

let segmenter: Intl.Segmenter | null | undefined;

function graphemes(value: string): string[] {
  if (segmenter === undefined) {
    segmenter =
      typeof Intl.Segmenter === 'function'
        ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
        : null;
  }
  return segmenter
    ? Array.from(segmenter.segment(value), (part) => part.segment)
    : Array.from(value);
}

/** Cap by lines and graphemes without ever splitting an emoji or combining sequence. */
export function capContentText(value: string, budget: FieldContentBudget): string {
  const normalized = value.replace(/\r\n?/g, '\n');
  const lines = normalized.split('\n');
  const lineCapped = budget.maxLines ? lines.slice(0, budget.maxLines).join('\n') : normalized;
  if (!budget.maxGraphemes) return lineCapped;
  const parts = graphemes(lineCapped);
  return parts.length <= budget.maxGraphemes
    ? lineCapped
    : parts.slice(0, budget.maxGraphemes).join('');
}

function capDeep(
  type: string,
  value: unknown,
  path: string,
  authored: ComponentContentBudget | undefined,
  depth: number,
): unknown {
  if (depth > 12) return null;
  if (typeof value === 'string') {
    return capContentText(value, fieldContentBudget(type, path, 'text', authored));
  }
  if (Array.isArray(value)) {
    const { maxItems = DEFAULT_ITEM_LIMIT } = fieldContentBudget(type, path, 'array', authored);
    return value
      .slice(0, maxItems)
      .map((item) => capDeep(type, item, `${path}[]`, authored, depth + 1));
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      const childPath = path ? `${path}.${key}` : key;
      out[key] = capDeep(type, child, childPath, authored, depth + 1);
    }
    return out;
  }
  return value;
}

/** Runtime half of the contract. Action arguments are deliberately preserved: content budgets are
 * a display/layout concern and must never silently change the operation a user is confirming. */
export function enforceComponentContentBudget(
  type: string,
  props: Record<string, unknown>,
  meta?: Pick<ComponentMeta, 'contentBudget'>,
): Record<string, unknown> {
  if (type === 'action') {
    const label =
      typeof props.label === 'string'
        ? capContentText(
            props.label,
            fieldContentBudget(type, 'label', 'text', meta?.contentBudget),
          )
        : props.label;
    return label === undefined ? props : { ...props, label };
  }
  return capDeep(type, props, '', meta?.contentBudget, 0) as Record<string, unknown>;
}

/** Prompt half of the same contract: exact field limits for visible top-level strings and item
 * arrays, kept compact enough to attach to every offered component. */
export function contentBudgetPromptClause(meta: ComponentMeta): string {
  const clauses: string[] = [];
  const keys = [...meta.requires, ...meta.optional];
  for (const key of keys) {
    if (clauses.length >= 4) break;
    if (!(
      TITLE_KEYS.test(key) ||
      LABEL_KEYS.test(key) ||
      PROSE_KEYS.test(key) ||
      LONG_KEYS.test(key)
    ))
      continue;
    const b = fieldContentBudget(meta.type, key, 'text', meta.contentBudget);
    if (b.maxGraphemes) clauses.push(`${key}≤${b.maxGraphemes} chars`);
  }
  for (const spec of meta.itemShapes ?? []) {
    if (clauses.length >= 7) break;
    const list = fieldContentBudget(meta.type, spec.prop, 'array', meta.contentBudget);
    if (list.maxItems) clauses.push(`${spec.prop}≤${list.maxItems}`);
    if (spec.text) {
      const path = `${spec.prop}[].${spec.text}`;
      const text = fieldContentBudget(meta.type, path, 'text', meta.contentBudget);
      if (text.maxGraphemes) clauses.push(`${path}≤${text.maxGraphemes} chars`);
    }
  }
  for (const prop of meta.stringItems ?? []) {
    if (clauses.length >= 7) break;
    const list = fieldContentBudget(meta.type, prop, 'array', meta.contentBudget);
    const text = fieldContentBudget(meta.type, `${prop}[]`, 'text', meta.contentBudget);
    if (list.maxItems) clauses.push(`${prop}≤${list.maxItems}`);
    if (text.maxGraphemes) clauses.push(`${prop}[]≤${text.maxGraphemes} chars`);
  }
  if (!clauses.length) clauses.push(`visible text≤${DEFAULT_TEXT_GRAPHEMES} chars`);
  return ` · limits: ${clauses.join(', ')}`;
}
