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
/** The centre is not just the face: "WHAT I HEARD", the question, and the settled synthesis line
 *  stack BELOW it, in screen space, out of the world's reach. A symmetric keep-out let a card sit
 *  right on top of that text, which is how a settled map came to read as a pile. Reserve the
 *  column that stack actually occupies. */
const CENTER_STACK_BELOW = 150;
/** Half-width of that same stack: the centre question and the tension line both wrap to a ~200px
 *  measure, so the reserved column is far wider than the 80px face it sits under. */
const CENTER_TEXT_HW = 105;
/** Half-extent of a theme label, for keeping it off the cards it names. */
const LABEL_HW = 82;
const LABEL_HH = 16;
/** Where the face parks once the shape has settled — the corner, the same move Live makes when a
 *  canvas takes over. While listening it stays centred (thoughts orbit the thing hearing them); on
 *  settle it docks and the middle of the stage becomes ordinary space instead of a reserved hole. */
/** Every screen this runs on is wider than it is tall, but the seed ring is circular — so the map
 *  is always height-constrained, and the camera shrinks it to fit while the sides sit empty. Widen
 *  the settled field to roughly the shape of the stage. Applied AFTER separation, and only
 *  outward, so it can never push two cards together. */
const WIDE_SPREAD = 1.5;

/** Radius of the settled hub — the circle holding the question at the centre of the map (see
 *  .ms-hub, which is 2×HUB_R wide in these same world units). A card's POSITION is its centre, so
 *  the clear zone has to be the hub's radius plus the card's own half-extent plus a gap, per axis —
 *  reserving only the radius would let every card's near edge sit inside the circle. */
const HUB_R = 130;
const HUB_KEEPOUT_X = HUB_R + CARD_HW + 44;
const HUB_KEEPOUT_Y = HUB_R + CARD_HH + 44;

export const DOCK_X = 0.1 * VW;
export const DOCK_Y = 0.12 * VH;
const DOCK_HW = 120;
const DOCK_HH = 80;

/** The unsaid card is pinned — it is the one card the person has not said yet, and it always waits
 *  in the same corner so it never looks like just another thought. Pinned, but not invisible: the
 *  relaxation has to push real atoms OFF it, or the two render as one unreadable pile. */
export const UNSAID_X = 0.82 * VW;
export const UNSAID_Y = 0.9 * VH;
const UNSAID_HW = 120;

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
  pinned: ReadonlyArray<{ x: number; y: number; hw: number; hh: number }> = [],
  /** True once the face has docked — the centre is ordinary space again. */
  docked = false,
): void {
  const ids = Array.from(positions.keys());
  const minDX = halfWidth * 2 + SEP_GAP;
  const minDY = halfHeight * 2 + SEP_GAP;
  const keepout = KEEPOUT + Math.max(0, ids.length - 6) * 10;
  // The centre's text is WIDER than the face — a two-line question and the tension summary run to
  // the measure below it — so the keep-out has to clear the text, not the jelly. A card level with
  // that block used to sit right on the sentence that explains the map.
  const keepoutX = docked ? HUB_KEEPOUT_X : keepout + CENTER_TEXT_HW;
  const keepoutAbove = docked ? HUB_KEEPOUT_Y : keepout + halfHeight * 0.9;
  // Taller below: that is where the centre's own text lives (see CENTER_STACK_BELOW).
  const keepoutBelow = docked ? HUB_KEEPOUT_Y : keepoutAbove + CENTER_STACK_BELOW;
  for (let iteration = 0; iteration < 400; iteration++) {
    for (const id of ids) {
      const point = positions.get(id)!;
      const dx = point.x - CX;
      const dy = point.y - CY;
      const keepoutY = dy >= 0 ? keepoutBelow : keepoutAbove;
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
    // Pinned cards do not move, so the atoms move off them.
    for (const id of ids) {
      const point = positions.get(id)!;
      for (const fixed of pinned) {
        const gapX = halfWidth + fixed.hw + SEP_GAP - Math.abs(point.x - fixed.x);
        const gapY = halfHeight + fixed.hh + SEP_GAP - Math.abs(point.y - fixed.y);
        if (gapX <= 0 || gapY <= 0) continue;
        moved = true;
        if (gapY <= gapX) point.y += point.y >= fixed.y ? gapY : -gapY;
        else point.x += point.x >= fixed.x ? gapX : -gapX;
      }
    }
    if (!moved) break;
  }
}

/** Park each theme label OUTSIDE the block of cards it names, on the side facing away from the
 *  face, then nudge it off anything it still covers. The label used to be dropped at the group's
 *  seed centre — which for a single theme IS the face, and for several is exactly where that
 *  theme's own cards end up orbiting. Either way it landed under a card. */
function placeLabels(
  labels: MindShapeLayout['labels'],
  positions: ReadonlyMap<string, MindShapePoint>,
  groups: ReadonlyArray<{ id: string; members: MindAtom[] }>,
): void {
  const cards = Array.from(positions.values());
  const membersOf = new Map(groups.map((group) => [group.id, group.members]));
  for (const label of labels) {
    const points = (membersOf.get(label.id) ?? [])
      .map((atom) => positions.get(atom.id))
      .filter((point): point is MindShapePoint => Boolean(point));
    if (points.length) {
      const left = Math.min(...points.map((p) => p.x));
      const right = Math.max(...points.map((p) => p.x));
      const top = Math.min(...points.map((p) => p.y));
      const bottom = Math.max(...points.map((p) => p.y));
      const midX = (left + right) / 2;
      const midY = (top + bottom) / 2;
      // Away from the face along the group's dominant axis, so the label reads as that block's
      // heading instead of floating between two of its cards.
      const dx = midX - CX;
      const dy = midY - CY;
      if (Math.abs(dy) >= Math.abs(dx)) {
        label.x = midX;
        label.y = dy >= 0 ? bottom + CARD_HH + LABEL_HH + 14 : top - CARD_HH - LABEL_HH - 14;
      } else {
        label.y = midY;
        label.x = dx >= 0 ? right + CARD_HW + LABEL_HW + 14 : left - CARD_HW - LABEL_HW - 14;
      }
    }
    // Two theme blocks can sit close enough that their headings meet — settle each label against
    // everything already placed. The world itself is unbounded; the camera fits whatever it spans.
    for (let iteration = 0; iteration < 80; iteration++) {
      let moved = false;
      const obstacles = [
        ...cards.map((point) => ({ point, hw: CARD_HW, hh: CARD_HH })),
        ...labels
          .filter((other) => other !== label)
          .map((point) => ({ point, hw: LABEL_HW, hh: LABEL_HH })),
      ];
      for (const other of obstacles) {
        const gapX = LABEL_HW + other.hw + 12 - Math.abs(label.x - other.point.x);
        const gapY = LABEL_HH + other.hh + 10 - Math.abs(label.y - other.point.y);
        if (gapX <= 0 || gapY <= 0) continue;
        moved = true;
        if (gapY <= gapX) label.y += label.y >= other.point.y ? gapY : -gapY;
        else label.x += label.x >= other.point.x ? gapX : -gapX;
      }
      if (!moved) break;
    }
  }
}

/** Deterministic, append-stable layout for the live mind shape. */
export function computeLayout(
  atoms: MindAtom[],
  clusters?: MindCluster[],
  previous?: ReadonlyMap<string, MindShapePoint>,
  /** True while the map is showing the pinned "unsaid" card, so atoms keep clear of it. */
  hasUnsaid = false,
  /** True once the face has docked (settled): the centre opens up, the dock is what to avoid. */
  docked = false,
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
    // A one-card theme IS its centre — orbiting a single member around an invisible point threw
    // stragglers (an unclustered thought, a theme with one card) hundreds of units into empty space,
    // where they read as unrelated to the map rather than part of it.
    const memberRadius =
      memberCount <= 1
        ? 0
        : single
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
  separate(
    positions,
    CARD_HW,
    CARD_HH,
    [
      ...(hasUnsaid ? [{ x: UNSAID_X, y: UNSAID_Y, hw: UNSAID_HW, hh: CARD_HH }] : []),
      ...(docked ? [{ x: DOCK_X, y: DOCK_Y, hw: DOCK_HW, hh: DOCK_HH }] : []),
    ],
    docked,
  );
  if (docked) {
    // Widen, but not without limit: past about half the stage a card stops reading as part of the
    // same map. Cards beyond that keep their distance rather than being pushed further out.
    const reach = VW * 0.42;
    for (const point of positions.values()) {
      const dx = point.x - CX;
      const spread = Math.abs(dx) * WIDE_SPREAD;
      point.x = CX + Math.sign(dx) * Math.min(spread, Math.max(Math.abs(dx), reach));
    }
  }
  // Spokes tether each card to its theme's centre, so that centre has to be where the theme's
  // cards ENDED UP — not the seed ring they were thrown from. Stale centroids drew long stray
  // threads out to empty space, which read as the map having connections it does not have.
  for (const group of groups) {
    const points = group.members
      .map((atom) => positions.get(atom.id))
      .filter((point): point is MindShapePoint => Boolean(point));
    if (!points.length) continue;
    const centroid = {
      x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
      y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
    };
    for (const atom of group.members) if (positions.has(atom.id)) centroidOf.set(atom.id, centroid);
  }
  // Labels are placed against the SETTLED cards, not the seed ring they were spawned from.
  placeLabels(labels, positions, groups);
  return { positions, centroidOf, labels };
}
