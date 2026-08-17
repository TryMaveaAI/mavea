// content/fromAnswer.ts — an ORDINARY answer as a ContentGraph.
//
// The world's rule is that a figure with nothing behind it does not render. Every other answer in
// Mavéa prints its numbers straight out of block props, so a chart's 140 and a KPI's "$1.2M" reach
// the screen on the model's word alone. This is the producer that puts them on the same footing: it
// reads the shapes an ordinary answer comes in and turns each figure into a FACT with a trust value,
// grounded against the turn's own sources exactly as a world's are.
//
// What it can honestly claim is bounded by what a block carries. A block prop has no receipt field —
// the turn's grounding lives beside the answer, not inside it — so a figure here resolves as
// `illustrative` when the turn was ungrounded, and as grounded only where a source sentence in the
// turn's corpus actually states the number. That is the same gate world/validate applies; it simply
// has less to work with, which is the truth about an ordinary answer rather than a shortcoming of the
// reading.
//
// STATUS: this producer is built and tested; no surface renders from it yet. Putting an ordinary
// answer's figures on screen through <ProvValue> means changing the core canvas's numeric blocks, and
// that is a deliberate change of its own rather than the tail of this one. What exists here is the
// half that has to be right first — the reading, and the grounding of what it read.
//
// Deliberately partial: the four numeric core shapes — chart, breakdown, kpi, ring. A block whose
// numbers this cannot read yields no facts and no entities, which leaves the canvas exactly as it is
// today. Reading a shape half-way would be worse than not reading it: a figure asserted on a field
// nobody parsed is the orphan pixel this exists to prevent.
import type { Block, ConversationSpec } from '../../data/conversation';
import { makeVerbatimGrounder } from '../ground/verbatim';
import { figureInQuote, parseAmount } from '../ground/number';
import { hostOf } from '../ground/citation';
import type { Receipt } from '../ground/types';
import { buildRegistry } from '../trust';
import type { UsedInSource, WorldValue } from '../trust';
import { trustValue } from './value';
import type { ContentGraph, Entity, Fact } from './types';

/** A figure's registry id. Block index and a slug of what it measures, so the same answer always
 *  addresses the same figure — and two blocks measuring "Revenue" stay distinct. */
const blockValueId = (blockIndex: number, key: string, at?: string): string =>
  `block:${blockIndex}:${key}${at === undefined ? '' : `@${at}`}`;

const slug = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'value';

/** One numeric reading pulled out of a block, before it is grounded. */
interface Reading {
  /** Slug-safe key, unique within the block. */
  key: string;
  label: string;
  value: number;
  unit?: string;
  /** The time label, when the reading is one observation in a history. */
  at?: string;
}

/** A block's readings, or none when this is not a shape whose numbers can be read. Every branch
 *  reads DECLARED fields only — nothing is inferred from a rendered string. */
function readingsOf(block: Block): Reading[] {
  const out: Reading[] = [];
  switch (block.type) {
    case 'chart': {
      const { labels, series, unit } = block.props;
      for (const s of series) {
        s.data.forEach((value, i) => {
          const at = labels[i];
          if (at === undefined || !Number.isFinite(value)) return;
          out.push({
            key: `${slug(s.name)}-${slug(at)}`,
            label: `${s.name} · ${at}`,
            value,
            ...(unit !== undefined ? { unit } : {}),
            at,
          });
        });
      }
      return out;
    }
    case 'breakdown':
      // `pct` is the share the bar is DRAWN at, and `val` is what the row says it is. The share is
      // the one the renderer already commits to, so it is the one that has to prove itself.
      for (const row of block.props.rows) {
        if (!Number.isFinite(row.pct)) continue;
        out.push({ key: slug(row.name), label: row.name, value: row.pct, unit: '%' });
      }
      return out;
    case 'kpi':
      // A KPI's value is a formatted STRING ("$1.2M", "36%"), so only a clean single token is read.
      // parseAmount is deliberately strict: a range or a phrase is not a figure to underwrite.
      for (const kpi of block.props.kpis) {
        const parsed = parseAmount(kpi.val);
        if (!parsed) continue;
        out.push({
          key: slug(kpi.label),
          label: kpi.label,
          value: parsed.value,
          ...(parsed.kind === 'pct' ? { unit: '%' } : {}),
        });
      }
      return out;
    case 'ring':
      // A ring's `pct` is a 0..1 fraction and `display` is the string it prints. The DISPLAYED figure
      // is the claim a reader takes away, so that is what has to prove itself — the fraction is the
      // arc's geometry, and grounding "0.36" against a source saying "36%" is the share-vs-digits
      // mismatch shareInQuote exists for.
      for (const ring of block.props.rings) {
        const parsed = parseAmount(ring.display);
        if (!parsed) continue;
        out.push({
          key: slug(ring.label),
          label: ring.label,
          value: parsed.value,
          ...(ring.unit !== undefined
            ? { unit: ring.unit }
            : parsed.kind === 'pct'
              ? { unit: '%' }
              : {}),
        });
      }
      return out;
    default:
      return out;
  }
}

/** What an entity a block describes is called. A block's own title is the honest label: it is what
 *  the reader sees over the figures. */
function entityOf(block: Block, index: number): Entity | null {
  const props = block.props as { title?: string; eyebrow?: string };
  const label = props.title ?? props.eyebrow;
  return label === undefined ? null : { id: `block:${index}`, label, role: 'measure' as const };
}

/**
 * An ordinary answer as a ContentGraph, grounded against the turn's own sources.
 *
 * `corpus` is the same text a world would be judged against — the sentences the answer's sources
 * actually contain. A figure resolves as GROUNDED only where a sentence in it states that number;
 * otherwise it is illustrative, which is what an ungrounded model figure honestly is. Pass '' and every figure comes back illustrative, which is the correct
 * reading of an answer nothing grounded.
 */
export function answerToContent(
  spec: Pick<ConversationSpec, 'title' | 'blocks' | 'sources'>,
  corpus = '',
): ContentGraph {
  const grounds = makeVerbatimGrounder(corpus);
  const sentences = corpus
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const host = spec.sources?.[0]?.url ? hostOf(spec.sources[0].url) : undefined;

  const entities: Entity[] = [];
  const facts: Fact[] = [];
  const values = new Map<string, WorldValue>();
  const refs: UsedInSource[] = [];

  spec.blocks.forEach((block, index) => {
    const readings = readingsOf(block);
    if (readings.length === 0) return;
    const entity = entityOf(block, index);
    if (!entity) return;
    entities.push(entity);

    for (const reading of readings) {
      const id = blockValueId(index, reading.key, reading.at);
      if (values.has(id)) continue;
      // The sentence that states this number, if the turn's own sources contain one. Both gates a
      // world's node value passes: the sentence must be verbatim in the corpus AND must state the
      // figure. Compared as NUMBERS here, not digit runs — a block's figure has been through a
      // formatter, so "$30.0 billion" has to be able to ground a stored 30 (see figureInQuote).
      const quote = sentences.find((s) => figureInQuote(reading.value, s) && grounds(s));
      const receipt: Receipt | undefined =
        quote === undefined ? undefined : { quote, ...(host !== undefined ? { host } : {}) };
      const value = trustValue(
        id,
        reading.label,
        reading.value,
        receipt ? 'T2' : 'T3',
        reading.unit,
        receipt,
        receipt === undefined,
        reading.at,
      );
      if (!value) continue;
      values.set(id, value);
      refs.push({ valueId: id, surface: 'block', id: entity.id, label: entity.label });
      facts.push({
        valueId: id,
        entityId: entity.id,
        ...(reading.at !== undefined ? { at: reading.at } : {}),
      });
    }
  });

  return {
    title: spec.title,
    entities,
    relations: [],
    facts,
    trust: buildRegistry(values, refs),
  };
}
