// content/fromWorld.ts — a living world as a ContentGraph.
//
// This is the world's figures and structure expressed in the shared vocabulary, and it is where the
// registry walk now lives: it was inside WorldOverlay, which made the world the only surface that
// could prove a number. Typing a figure is `content/value`, shared with the ordinary answer's
// producer — a tier, a receipt and an illustrative banner are how Mavéa grounds ANY figure.
//
// The behaviour is unchanged, deliberately: the world's trust invariants are pinned by a large suite,
// and an extraction that alters them is a rewrite wearing a refactor's clothes.
import { drawableEdges } from '../../canvas/spatial/morph/adapters';
import type { WorldData } from '../../canvas/spatial/morph/types';
import { buildRegistry } from '../trust';
import type { UsedInSource, WorldValue } from '../trust';
import { trustValue } from './value';
import type { WorldNode, WorldSpec } from '../world/types';
import { nodeValueId, pointValueId } from '../world/valueIds';
import type { ContentGraph, Entity, Fact, Relation } from './types';

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
