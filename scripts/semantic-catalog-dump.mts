// semantic-catalog-dump.mts — emit the catalog metadata the semantic-index builder embeds.
//
// The semantic fit layer (src/live/semantic) needs, per component, a short "what this answers"
// document to embed. That text is assembled from the same metadata the selector already reasons
// over — blurb + intents + data shapes + domains — so the embedding describes the component's
// PURPOSE, not its name. This script dumps that metadata as JSON for the Python build step
// (build-semantic-index.py), which has no way to read the TypeScript catalog directly.
//
// Run: npx tsx scripts/semantic-catalog-dump.mts > <out>.json
import { RAW_CATALOG } from '../src/canvas/blocks/catalog/catalog.data';

const rows = RAW_CATALOG.map((m) => ({
  type: m.type,
  family: m.family,
  blurb: m.blurb ?? '',
  intents: m.intents ?? [],
  dataShapes: m.dataShapes ?? [],
  domains: m.domains ?? [],
}));

process.stdout.write(JSON.stringify(rows, null, 0));
