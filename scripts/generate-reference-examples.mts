#!/usr/bin/env tsx
// Build the compact, runtime-only prop references used in Live's model menu. The source of truth
// remains the real demo corpus plus the explicit authored fallbacks; this derived artifact keeps a
// first Live turn from downloading every full demo narrative merely to show the model prop shapes.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TOPIC_LIST } from '../src/data/topics/index';
import { AUTHORED_EXAMPLES } from '../src/live/select/authoredExamples';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const OUT = resolve(ROOT, 'src/live/select/referenceExamples.generated.json');
const DENSE_MAX_STRING = 90;
const DENSE_MAX_ARRAY = 5;

function compact(value: unknown): unknown {
  if (typeof value === 'string') {
    return value.length > DENSE_MAX_STRING ? `${value.slice(0, DENSE_MAX_STRING - 1)}…` : value;
  }
  if (Array.isArray(value)) return value.slice(0, DENSE_MAX_ARRAY).map(compact);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, compact(item)]),
    );
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** Every string an item or a top-level prop holds, so a reference can be recognised wherever it
 *  is written — a field of its own, an element of a list, a bare prop on the block. */
function stringsIn(value: unknown, out: string[]): void {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) for (const one of value) stringsIn(one, out);
  else if (isRecord(value)) for (const one of Object.values(value)) stringsIn(one, out);
}

/**
 * The array props that are reference TARGETS: something else in the same block names their ids.
 *
 * These are graphs, not lists, and the item cap cannot be applied to a graph. Cutting `nodes` to
 * five while `edges` keeps naming the sixth leaves the example pointing at items that are not
 * there — which is precisely the mistake the reference example exists to teach against, published
 * as the house style for that component. It affected eighteen of them (an orgchart whose three
 * children are absent, a binary tree missing both of one node's subtrees, a family tree whose
 * `rootId` names nobody, a thermostat "feedback loop" whose one feedback wire points at no block),
 * and every source fixture was closed and correct before the cap touched it.
 *
 * The corpus's graphs are small — 39 keyed arrays, the largest 10 items — so keeping them whole
 * costs about 2.9 kB across every component, sharded and fetched only for the types a turn offers.
 * If a fixture ever grows a graph big enough to matter, shrink the FIXTURE; a cut graph is not a
 * smaller example, it is a wrong one.
 */
function referencedArrays(props: Record<string, unknown>): Set<string> {
  const idsOf = new Map<string, Set<string>>();
  for (const [prop, value] of Object.entries(props)) {
    if (!Array.isArray(value)) continue;
    const ids = value
      .filter(isRecord)
      .map((item) => item.id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);
    if (ids.length > 0) idsOf.set(prop, new Set(ids));
  }
  const targets = new Set<string>();
  for (const [prop, ids] of idsOf) {
    const names: string[] = [];
    for (const [other, value] of Object.entries(props)) {
      if (other !== prop) {
        stringsIn(value, names);
        continue;
      }
      // An array can name its own ids — a commit's parents, a tree node's children. Its items'
      // OWN id field is not a reference to itself, so it is the one key skipped here.
      for (const item of value as unknown[])
        if (isRecord(item))
          for (const [field, one] of Object.entries(item))
            if (field !== 'id') stringsIn(one, names);
    }
    if (names.some((name) => ids.has(name))) targets.add(prop);
  }
  return targets;
}

/** A block's props, compacted — the item cap applied to every list, and to no reference graph. */
function compactProps(props: Record<string, unknown>): Record<string, unknown> {
  const targets = referencedArrays(props);
  return Object.fromEntries(
    Object.entries(props).map(([prop, value]) => [
      prop,
      targets.has(prop) ? (value as unknown[]).map(compact) : compact(value),
    ]),
  );
}

function generate(): string {
  const references: Record<string, unknown> = {};
  for (const topic of TOPIC_LIST) {
    for (const block of topic.blocks) {
      if (
        block.type !== 'preview' &&
        block.props &&
        !Object.prototype.hasOwnProperty.call(references, block.type)
      ) {
        references[block.type] = compactProps(block.props as Record<string, unknown>);
      }
    }
  }
  for (const [type, props] of Object.entries(AUTHORED_EXAMPLES)) {
    if (!Object.prototype.hasOwnProperty.call(references, type))
      references[type] = compactProps(props as Record<string, unknown>);
  }
  return `${JSON.stringify(references)}\n`;
}

const expected = generate();
if (process.argv.includes('--write')) {
  writeFileSync(OUT, expected);
  console.log(`Wrote ${Object.keys(JSON.parse(expected)).length} compact reference examples.`);
} else {
  let current = '';
  try {
    current = readFileSync(OUT, 'utf8');
  } catch {
    // Fall through to the actionable stale-artifact message below.
  }
  if (current !== expected) {
    console.error(
      'Compact reference examples are stale. Run `pnpm gen:reference-examples` and commit the result.',
    );
    process.exit(1);
  }
  console.log(
    `✓ ${Object.keys(JSON.parse(expected)).length} compact reference examples are current.`,
  );
}
