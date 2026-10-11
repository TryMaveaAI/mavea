import type { SmallPanel } from './types';

// The unit a panel is measured in, read off its stat ("54 bpm", "$1.2M") or, failing that, a
// unit in brackets on its label ("HRV (ms)"). Undefined when neither says.
export function panelUnit(panel: Pick<SmallPanel, 'label' | 'stat'>): string | undefined {
  const stat = panel.stat?.trim();
  if (stat) {
    const m = stat.match(/^([^\d.-]*)-?[\d.,]+\s*(.*)$/);
    if (m && (m[1] || m[2])) return `${m[1].trim()}|${m[2].trim()}`.toLowerCase();
  }
  const bracket = panel.label?.match(/\(([^)]+)\)\s*$/);
  return bracket ? `|${bracket[1].trim()}`.toLowerCase() : undefined;
}

/**
 * The value range each panel is drawn against. Small multiples share one domain so a glance
 * compares them, but only panels in the SAME unit can share one: milliseconds, beats and pounds
 * on a common axis put every line in a flat band at its own height and show none of the trends.
 * So when the panels name two or more units, each takes its own range; otherwise all share.
 */
export function panelDomains(panels: Pick<SmallPanel, 'label' | 'stat' | 'series'>[]): {
  shared: boolean;
  domains: [number, number][];
} {
  const units = new Set(panels.map(panelUnit).filter((u): u is string => u !== undefined));
  const shared = units.size < 2;
  const range = (vs: number[]): [number, number] =>
    vs.length ? [Math.min(...vs), Math.max(...vs)] : [0, 1];
  if (shared) {
    const all = range(panels.flatMap((p) => p.series));
    return { shared, domains: panels.map(() => all) };
  }
  return { shared, domains: panels.map((p) => range(p.series)) };
}
