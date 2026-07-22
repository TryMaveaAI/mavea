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

function generate(): string {
  const references: Record<string, unknown> = {};
  for (const topic of TOPIC_LIST) {
    for (const block of topic.blocks) {
      if (
        block.type !== 'preview' &&
        block.props &&
        !Object.prototype.hasOwnProperty.call(references, block.type)
      ) {
        references[block.type] = compact(block.props);
      }
    }
  }
  for (const [type, props] of Object.entries(AUTHORED_EXAMPLES)) {
    if (!Object.prototype.hasOwnProperty.call(references, type)) references[type] = compact(props);
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
