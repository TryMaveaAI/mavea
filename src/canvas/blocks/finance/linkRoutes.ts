// Connector routing for ThreeStatementLink, kept pure (no DOM) so it can be tested directly.
//
// Statement panels sit side by side in equal columns, and a connector may only travel through
// space that holds no figures: the gutter between two panels, and a lane across the top of the
// header row (the panel names sit at the bottom of the header, so its top is empty).

export interface RouteLink {
  from: string;
  to: string;
  label?: string;
}

export interface RouteFrame {
  /** Drawing width in px — the panels split it into equal columns. */
  width: number;
  /** Half the space between two panels, px. */
  gutter: number;
  headerH: number;
  rowH: number;
}

export interface LinkRoute {
  key: string;
  from: string;
  to: string;
  label?: string;
  d: string;
  arrow: string;
  badge: { x: number; y: number };
}

const ARROW_L = 6;
const ARROW_HALF = 3.5;
const LANE_TOP = 7;
const LANE_PITCH = 6;
/** Badges are r=7 circles; two closer than this along a gutter would touch. */
const BADGE_PITCH = 16;

function locate(panels: readonly (readonly string[])[], label: string, from: number) {
  for (let p = from; p < panels.length; p++) {
    const row = panels[p].indexOf(label);
    if (row >= 0) return { panel: p, row };
  }
  return null;
}

/**
 * One route per resolvable link (a `from` row found in some panel, a `to` row in a LATER panel);
 * the rest are dropped. A link to the next panel is an S-bend inside the gutter between them. A
 * link that skips a panel climbs its own gutter to a lane above the header, crosses over, and
 * drops down the target's gutter — each such link takes its own lane so two never share a line.
 */
export function linkRoutes(
  panels: readonly (readonly string[])[],
  links: readonly RouteLink[],
  frame: RouteFrame,
): LinkRoute[] {
  const n = Math.max(1, panels.length);
  const edge = (k: number) => (k * frame.width) / n;
  const rowY = (row: number) => frame.headerH + (row + 0.5) * frame.rowH;
  const lanes = Math.max(1, Math.floor((frame.headerH - 20 - LANE_TOP) / LANE_PITCH) + 1);
  let skips = 0;
  const out: LinkRoute[] = [];

  for (const l of links) {
    const a = locate(panels, l.from, 0);
    if (!a) continue;
    const b = locate(panels, l.to, a.panel + 1);
    if (!b) continue;
    const y0 = rowY(a.row);
    const y1 = rowY(b.row);
    const exit = edge(a.panel + 1);
    const entry = edge(b.panel);
    const x0 = exit - frame.gutter + 2;
    const tip = entry + frame.gutter - 2;
    const base = tip - ARROW_L;
    let d: string;
    let badge: { x: number; y: number };
    if (b.panel === a.panel + 1) {
      d = `M${x0} ${y0} C${exit} ${y0}, ${exit} ${y1}, ${base} ${y1}`;
      badge = { x: exit, y: (y0 + y1) / 2 };
    } else {
      const k = skips++ % lanes;
      const lane = LANE_TOP + k * LANE_PITCH;
      const up = exit - 2 + k * 4;
      const down = entry + 2 - k * 4;
      d = `M${x0} ${y0} H${up} V${lane} H${down} V${y1} H${base}`;
      // Each lane's badge steps sideways too: lanes are closer together than a badge is tall.
      badge = { x: (up + down) / 2 + k * BADGE_PITCH, y: lane };
    }
    out.push({
      key: `${l.from}->${l.to}`,
      from: l.from,
      to: l.to,
      label: l.label,
      d,
      arrow: `${tip},${y1} ${base},${y1 - ARROW_HALF} ${base},${y1 + ARROW_HALF}`,
      badge,
    });
  }

  // Gutter badges sharing a gutter (same x) are pushed apart along it, in order, so none overlap.
  const byX = new Map<number, LinkRoute[]>();
  for (const r of out) {
    if (r.badge.y < frame.headerH) continue;
    const key = Math.round(r.badge.x);
    byX.set(key, [...(byX.get(key) ?? []), r]);
  }
  for (const group of byX.values()) {
    group.sort((p, q) => p.badge.y - q.badge.y);
    for (let i = 1; i < group.length; i++) {
      const prev = group[i - 1].badge.y;
      if (group[i].badge.y - prev < BADGE_PITCH) group[i].badge.y = prev + BADGE_PITCH;
    }
  }
  return out;
}
