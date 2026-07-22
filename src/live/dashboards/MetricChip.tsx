// MetricChip — a small pill for one dashboard's headline number, linking straight to that
// dashboard's detail page. Used inline wherever a number needs to stay traceable to its source
// (the briefing's chip row today; anywhere else that wants the same honest "tap through" habit).
import type { ReactElement } from 'react';
import { dashHref } from './route';
import './dash-home.css';

export type MetricChipKind = 'presence' | 'insight' | 'warning';

export function MetricChip({
  label,
  value,
  dashboardId,
  kind = 'presence',
}: {
  label: string;
  value: string;
  dashboardId: string;
  /** Purely a tint choice — MetricChip has no way to know the dashboard's own subject/status. */
  kind?: MetricChipKind;
}): ReactElement {
  return (
    <a className={`metric-chip metric-chip--${kind}`} href={dashHref.detail(dashboardId)}>
      <span className="metric-chip-value">{value}</span>
      <span className="metric-chip-label">{label}</span>
    </a>
  );
}
