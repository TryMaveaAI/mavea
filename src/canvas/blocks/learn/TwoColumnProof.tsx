import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { TwoColumnProofProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = TwoColumnProofProps & { delay?: number };

export function TwoColumnProof({
  title = 'Two-Column Proof',
  icon = 'spark',
  iconColor = 'var(--presence)',
  given,
  prove,
  steps,
  diagram,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] ?? Icon.spark;

  return (
    <div
      className="card reveal c1"
      style={{ ['--delay' as string]: (delay ?? 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      {/* Given / Prove block */}
      <div style={headerBoxStyle}>
        <div style={gpRowStyle}>
          <span style={gpLabelStyle}>GIVEN</span>
          <span style={gpValueStyle}>{given}</span>
        </div>
        <div style={{ ...gpRowStyle, marginTop: 6 }}>
          <span style={{ ...gpLabelStyle, color: 'var(--presence)' }}>PROVE</span>
          <span style={gpValueStyle}>{prove}</span>
        </div>
      </div>

      {/* Optional diagram callout */}
      {diagram && (
        <p style={diagramBandStyle}>
          <em>{diagram}</em>
        </p>
      )}

      {/* Two-column proof table */}
      <div style={tableWrapStyle}>
        {/* Header row */}
        <div style={colHeaderRowStyle}>
          <div style={colHeaderCellStyle}>Statement</div>
          <div style={{ ...colHeaderCellStyle, borderLeft: '1px solid var(--grid-line)' }}>
            Reason
          </div>
        </div>

        {/* Step rows */}
        {steps.map((step, idx) => {
          const isEven = idx % 2 === 1;
          const isLast = idx === steps.length - 1;
          const rowBg: CSSProperties = isEven
            ? { background: 'color-mix(in oklab, var(--surface-elevated) 50%, transparent)' }
            : {};

          return (
            <div key={idx} style={{ ...dataRowStyle, ...rowBg }}>
              {/* Statement cell with row number prefix */}
              <div
                style={{
                  ...dataCellStyle,
                  borderBottom: isLast ? 'none' : '1px solid var(--grid-line)',
                }}
              >
                <span style={rowNumStyle}>{idx + 1}.&thinsp;</span>
                <span style={statementStyle}>{step.statement}</span>
                {/* QED badge on the last statement */}
                {isLast && (
                  <span style={qedStyle} aria-label="QED">
                    ∎
                  </span>
                )}
              </div>
              {/* Reason cell */}
              <div
                style={{
                  ...dataCellStyle,
                  borderLeft: '1px solid var(--grid-line)',
                  borderBottom: isLast ? 'none' : '1px solid var(--grid-line)',
                  color: 'var(--text-secondary)',
                }}
              >
                {step.reason}
              </div>
            </div>
          );
        })}
      </div>

      {footer && (
        <div
          className="insight-summary"
          style={{ marginTop: 10 }}
          dangerouslySetInnerHTML={richInnerHtml(footer)}
        />
      )}
    </div>
  );
}

/* ── styles ─────────────────────────────────────────────────────────── */

const headerBoxStyle: CSSProperties = {
  background: 'var(--surface-elevated)',
  borderRadius: 6,
  padding: '10px 14px',
  marginBottom: 10,
};

const gpRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: 8,
};

const gpLabelStyle: CSSProperties = {
  fontSize: 9,
  fontWeight: 700,
  letterSpacing: '0.06em',
  color: 'var(--text-muted)',
  flexShrink: 0,
  minWidth: 40,
};

const gpValueStyle: CSSProperties = {
  fontSize: 12,
  color: 'var(--text-primary)',
  lineHeight: 1.4,
};

const diagramBandStyle: CSSProperties = {
  fontSize: 11,
  color: 'var(--text-muted)',
  margin: '0 0 8px',
  padding: '5px 10px',
  borderLeft: '2px solid var(--surface-border)',
  lineHeight: 1.4,
};

const tableWrapStyle: CSSProperties = {
  border: '1px solid var(--grid-line)',
  borderRadius: 6,
  overflow: 'hidden',
};

const colHeaderRowStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  background: 'var(--surface-elevated)',
  borderBottom: '1px solid var(--grid-line)',
};

const colHeaderCellStyle: CSSProperties = {
  padding: '5px 10px',
  fontSize: 9,
  fontWeight: 700,
  letterSpacing: '0.08em',
  color: 'var(--text-muted)',
  textTransform: 'uppercase',
};

const dataRowStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
};

const dataCellStyle: CSSProperties = {
  padding: '7px 10px',
  fontSize: 12,
  color: 'var(--text-primary)',
  lineHeight: 1.4,
  display: 'flex',
  alignItems: 'baseline',
  gap: 2,
  minWidth: 0,
  wordBreak: 'break-word',
};

const rowNumStyle: CSSProperties = {
  color: 'var(--text-muted)',
  flexShrink: 0,
  fontSize: 11,
};

const statementStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
};

const qedStyle: CSSProperties = {
  marginLeft: 'auto',
  fontSize: 16,
  color: 'var(--presence)',
  lineHeight: 1,
  flexShrink: 0,
};
