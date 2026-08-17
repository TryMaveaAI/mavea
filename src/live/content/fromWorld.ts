// content/fromWorld.ts — a living world as a ContentGraph.
//
// This is the world's figures and structure expressed in the shared vocabulary, and it is where
// `trustValue` and the registry walk now live: they were inside WorldOverlay, which made the world
// the only surface that could prove a number. Nothing about either is world-specific — a tier, a
// receipt and an illustrative banner are how Mavéa grounds any figure — so they belong here, where
// an ordinary answer's producer (content/fromAnswer) reaches the same rules.
//
// The behaviour is unchanged, deliberately: the world's trust invariants are pinned by a large suite,
// and an extraction that alters them is a rewrite wearing a refactor's clothes.
import { withUnit } from '../../canvas/lib/format';
import { drawableEdges } from '../../canvas/spatial/morph/adapters';
import type { WorldData } from '../../canvas/spatial/morph/types';
import { isReal, type Receipt, type Tier } from '../ground/types';
import { buildRegistry } from '../trust';
import type { UsedInSource, WorldValue } from '../trust';
import type { WorldNode, WorldSpec } from '../world/types';
import { nodeValueId, pointValueId } from '../world/valueIds';
import type { ContentGraph, Entity, Fact, Relation } from './types';

const ILLUSTRATIVE_CAVEAT = 'Shows the shape, not your numbers.';

/**
 * One figure, typed by what actually backs it. An illustrative graph outranks whatever tier the
 * author wrote on the entity — the whole thing is a textbook explanation, so nothing on it may wear a
 * GROUNDED badge; the entity's own quote rides along as the caveat so the source wording survives.
 * A real figure with no receipt returns null and is never rendered: an unbacked number is not a
 * weaker number, it is no number.
 */
export function trustValue(
  id: string,
  label: string,
  num: number,
  tier: Tier,
  unit: string | undefined,
  receipt: Receipt | undefined,
  illustrative: boolean,
  period?: string,
): WorldValue | null {
  if (!Number.isFinite(num)) return null;
  const raw = withUnit(num, unit);
  const scope = { ...(unit ? { unit } : {}), ...(period ? { period } : {}) };
  const base = { id, label, ...(unit || period ? { scope } : {}) };
  if (illustrative || tier === 'T3') {
    return {
      ...base,
      kind: 'illustrative',
      resolution: {
        ok: true,
        tier: 'T3',
        value: num,
        raw,
        illustrative: receipt?.quote ?? ILLUSTRATIVE_CAVEAT,
        surface: 'model',
      },
    };
  }
  if (!receipt || !isReal(tier)) return null;
  return tier === 'T1'
    ? {
        ...base,
        kind: 'grounded',
        resolution: { ok: true, tier: 'T1', value: num, raw, receipt, surface: 'user' },
      }
    : {
        ...base,
        kind: 'grounded',
        resolution: { ok: true, tier: 'T2', value: num, raw, receipt, surface: 'web' },
      };
}

/**
 * A WorldSpec as a ContentGraph. `morph` supplies the drawn edges' ids, so a click on a path and a
 * "used in" row can never disagree about which link they mean — a second copy of the id formula is a
 * copy that drifts.
 *
 * A breakdown child becomes an entity with `parentId`, at whatever depth the spec carries it. The
 * graph does not cap that; how deep a reader can go is the renderer's level of detail.
 */
export function worldToContent(spec: WorldSpec, morph: WorldData): ContentGraph {
  const illustrative = spec.provenance.illustrative === true;
  const entities: Entity[] = [];
  const facts: Fact[] = [];
  const relations: Relation[] = [];
  const values = new Map<string, WorldValue>();
  const refs: UsedInSource[] = [];
  const labelOf = new Map<string, string>();

  const keep = (v: WorldValue | null, ref: UsedInSource, fact: Fact): void => {
    if (!v || values.has(v.id)) return;
    values.set(v.id, v);
    refs.push(ref);
    facts.push(fact);
  };

  const visit = (n: WorldNode, parentId?: string): void => {
    labelOf.set(n.id, n.label);
    entities.push({
      id: n.id,
      label: n.label,
      role: n.role,
      ...(n.detail !== undefined ? { detail: n.detail } : {}),
      ...(n.domain !== undefined ? { domain: n.domain } : {}),
      ...(parentId !== undefined ? { parentId } : {}),
    });
    const series = n.series;
    const unit = n.unit ?? series?.unit;
    const onNode = (valueId: string): UsedInSource => ({
      valueId,
      surface: 'node',
      id: n.id,
      label: n.label,
    });
    if (n.value !== undefined) {
      const id = nodeValueId(n.id);
      keep(trustValue(id, n.label, n.value, n.tier, unit, n.receipt, illustrative), onNode(id), {
        valueId: id,
        entityId: n.id,
      });
    }
    if (series) {
      for (const p of series.points) {
        const id = pointValueId(n.id, p.t);
        const point = trustValue(
          id,
          `${n.label} · ${p.t}`,
          p.value,
          series.tier,
          series.unit,
          p.receipt ?? series.receipt,
          illustrative,
          p.t,
        );
        keep(point, onNode(id), { valueId: id, entityId: n.id, at: p.t });
      }
    }
    for (const child of n.children ?? []) visit(child, n.id);
  };
  for (const node of spec.nodes) visit(node);

  // A link prints its endpoints' figures too, so it is a use of them — "what breaks if this number
  // changes?" has to name the arrows, not only the cards. Paired against the DRAWN links, since a
  // link the projection refuses has no path on screen to be a use of anything.
  drawableEdges(spec.edges).forEach((e, i) => {
    const label = `${labelOf.get(e.from) ?? e.from} ${e.verb ?? '→'} ${labelOf.get(e.to) ?? e.to}`;
    const id = morph.edges[i]?.id;
    if (id === undefined) return;
    relations.push({
      id,
      from: e.from,
      to: e.to,
      ...(e.relation !== undefined ? { kind: e.relation } : {}),
      ...(e.sign !== undefined ? { sign: e.sign } : {}),
      ...(e.weight !== undefined ? { weight: e.weight } : {}),
    });
    for (const end of [e.from, e.to]) {
      refs.push({ valueId: nodeValueId(end), surface: 'edge', id, label });
    }
  });

  return {
    title: spec.title,
    entities,
    relations,
    facts,
    trust: buildRegistry(values, refs),
    outcomeId: spec.outcomeId,
    ...(illustrative ? { illustrative } : {}),
  };
}
