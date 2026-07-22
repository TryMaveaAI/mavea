// SourcesLineage — the conversations that built this dashboard, in order: ORIGIN (the one that
// created it), ADDED (later turns folded in), LINKED (separate conversations you connected). Lineage
// is never silent — every number on the dashboard traces back to a real conversation here.
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { LineageKind, SourcesLineageProps } from './types';

type Props = SourcesLineageProps & { delay?: number };

const KIND_ACCENT: Record<LineageKind, string> = {
  origin: 'var(--presence)',
  added: 'var(--insight)',
  linked: 'var(--warning)',
};
const KIND_LABEL: Record<LineageKind, string> = {
  origin: 'ORIGIN',
  added: 'ADDED',
  linked: 'LINKED',
};

export function SourcesLineage({
  title = 'Sources',
  icon = 'layers',
  iconColor = 'var(--text-muted)',
  rows,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.layers;
  return (
    <div
      className="card reveal dash-sources"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      {rows.length === 0 ? (
        <div className="dash-sources-empty faint">No sources yet.</div>
      ) : (
        <div className="dash-sources-list">
          {rows.map((r, i) => (
            <div className="dash-source-row" key={i}>
              <span className="dash-source-rail" style={{ background: KIND_ACCENT[r.kind] }} />
              <div className="dash-source-body">
                <div className="dash-source-head">
                  <span className="dash-source-label">{r.label}</span>
                  <span className="dash-source-kind" style={{ color: KIND_ACCENT[r.kind] }}>
                    {KIND_LABEL[r.kind]}
                  </span>
                </div>
                {r.contributed && <div className="dash-source-contrib">{r.contributed}</div>}
              </div>
            </div>
          ))}
        </div>
      )}

      {footer && <div className="dash-foot">{footer}</div>}
    </div>
  );
}
