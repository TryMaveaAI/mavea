// SkillTree connectors, drawn in px between the HTML pills.

/** Half a pill's height in px: its 7px vertical padding, half the 20px icon and the 1.5px
 *  border (.fl-sk-node / .fl-sk-icon). An edge stops here so its head lands on the rim. */
const PILL_HALF_H = 19;

/** Furthest a same-tier edge bows above its row. */
const SAME_ROW_BOW = 34;

type Pt = { x: number; y: number };

/** A prerequisite edge in px, rim to rim. Between tiers it leaves the bottom of the
 *  prerequisite and enters the top of the dependent; inside one tier it arcs over the row from
 *  top to top, since a straight line there runs along the tier rule and through every pill
 *  between the two. Drawn centre to centre, the head sat under the dependent's label. */
export function skillEdgePath(a: Pt, b: Pt, rowGap: number): string {
  if (Math.abs(a.y - b.y) < 1) {
    const top = a.y - PILL_HALF_H;
    // The curve peaks 3/4 of the control lift above its ends; on the first tier of a tall tree
    // that peak has to stay inside the box, which clips.
    const lift = Math.min(
      (Math.min(SAME_ROW_BOW, rowGap * 0.35) * 4) / 3,
      (Math.max(0, top - 2) * 4) / 3,
    );
    return `M ${a.x} ${top} C ${a.x} ${top - lift}, ${b.x} ${top - lift}, ${b.x} ${top}`;
  }
  const down = b.y > a.y ? 1 : -1;
  const y1 = a.y + down * PILL_HALF_H;
  const y2 = b.y - down * PILL_HALF_H;
  const my = (y1 + y2) / 2;
  return `M ${a.x} ${y1} C ${a.x} ${my}, ${b.x} ${my}, ${b.x} ${y2}`;
}
