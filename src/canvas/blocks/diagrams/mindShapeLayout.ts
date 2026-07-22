import type { MindAtom, MindCluster } from '../../../live/mindshape/types';

export const VW = 1000;
export const VH = 700;
export const CX = 500;
export const CY = 329;
export const CARD_HW = 150;
export const CARD_HH = 78;
export const MARGIN = 24;
export const KEEPOUT = 168;
const SEP_GAP = 26;

export interface MindShapePoint {
  x: number;
  y: number;
}

export interface MindShapeLayout {
  positions: Map<string, MindShapePoint>;
  centroidOf: Map<string, MindShapePoint>;
  labels: Array<{ id: string; label: string; x: number; y: number }>;
}

function separate(
  positions: Map<string, MindShapePoint>,
  halfWidth: number,
  halfHeight: number,
): void {
  const ids = Array.from(positions.keys());
  const minDX = halfWidth * 2 + SEP_GAP;
  const minDY = halfHeight * 2 + SEP_GAP;
  const keepout = KEEPOUT + Math.max(0, ids.length - 6) * 10;
  const keepoutX = keepout;
  const keepoutY = keepout + halfHeight * 0.9;
  for (let iteration = 0; iteration < 400; iteration++) {
    for (const id of ids) {
      const point = positions.get(id)!;
      const dx = point.x - CX;
      const dy = point.y - CY;
      const normalizedX = dx / keepoutX;
      const normalizedY = dy / keepoutY;
      const distance = Math.hypot(normalizedX, normalizedY) || 1;
      if (distance < 1) {
        point.x = CX + (normalizedX / distance) * keepoutX;
        point.y = CY + (normalizedY / distance) * keepoutY;
      }
    }
    let moved = false;
    for (let leftIndex = 0; leftIndex < ids.length; leftIndex++) {
      for (let rightIndex = leftIndex + 1; rightIndex < ids.length; rightIndex++) {
        const left = positions.get(ids[leftIndex])!;
        const right = positions.get(ids[rightIndex])!;
        let dx = right.x - left.x;
        let dy = right.y - left.y;
        if (dx === 0 && dy === 0) {
          dx = leftIndex - rightIndex;
          dy = rightIndex - leftIndex;
        }
        const overlapX = minDX - Math.abs(dx);
        const overlapY = minDY - Math.abs(dy);
        if (overlapX > 0 && overlapY > 0) {
          moved = true;
          if (overlapX <= overlapY) {
            const push = (overlapX / 2) * (dx < 0 ? -1 : 1);
            left.x -= push;
            right.x += push;
          } else {
            const push = (overlapY / 2) * (dy < 0 ? -1 : 1);
            left.y -= push;
            right.y += push;
          }
        }
      }
    }
    if (!moved) break;
  }
}

/** Deterministic, append-stable layout for the live mind shape. */
export function computeLayout(
  atoms: MindAtom[],
  clusters?: MindCluster[],
  previous?: ReadonlyMap<string, MindShapePoint>,
): MindShapeLayout {
  const positions = new Map<string, MindShapePoint>();
  const centroidOf = new Map<string, MindShapePoint>();
  const labels: MindShapeLayout['labels'] = [];
  const byId = new Map(atoms.map((atom) => [atom.id, atom]));
  const assigned = new Set<string>();
  const groups: Array<{ id: string; label?: string; members: MindAtom[] }> = [];
  for (const cluster of clusters ?? []) {
    const members = cluster.atomIds
      .map((id) => byId.get(id))
      .filter((atom): atom is MindAtom => Boolean(atom));
    if (members.length === 0) continue;
    members.forEach((atom) => assigned.add(atom.id));
    groups.push({ id: cluster.id, label: cluster.label, members });
  }
  const rest = atoms.filter((atom) => !assigned.has(atom.id));
  if (rest.length) groups.push({ id: '__rest', members: rest });
  if (groups.length === 0) return { positions, centroidOf, labels };

  const groupCount = groups.length;
  const single = groupCount === 1;
  const ringRadius = single ? 0 : Math.min(250, 180 + groupCount * 20);
  groups.forEach((group, groupIndex) => {
    const angle = (groupIndex / groupCount) * 2 * Math.PI - Math.PI / 2;
    const centerX = single ? CX : CX + ringRadius * Math.cos(angle);
    const centerY = single ? CY : CY + ringRadius * Math.sin(angle);
    if (group.label) {
      labels.push({ id: group.id, label: group.label, x: centerX, y: centerY });
    }
    const memberCount = group.members.length;
    const memberRadius = single
      ? Math.max(KEEPOUT + 150, 230 + memberCount * 26)
      : Math.min(220, 110 + memberCount * 16);
    const centroid: MindShapePoint = { x: centerX, y: centerY };
    group.members.forEach((atom, index) => {
      const seeded = previous?.get(atom.id);
      if (seeded) {
        positions.set(atom.id, { x: seeded.x, y: seeded.y });
      } else {
        const memberAngle =
          (index / Math.max(1, memberCount)) * 2 * Math.PI - Math.PI / 2 + groupIndex * 0.4;
        positions.set(atom.id, {
          x: centerX + memberRadius * Math.cos(memberAngle),
          y: centerY + memberRadius * Math.sin(memberAngle),
        });
      }
      centroidOf.set(atom.id, centroid);
    });
  });
  separate(positions, CARD_HW, CARD_HH);
  return { positions, centroidOf, labels };
}
