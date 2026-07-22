import { useMemo, Fragment } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { StemLeafProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = StemLeafProps & { delay?: number };

function parseStemLeaves(values: number[], leafUnit: number): Map<number, number[]> {
  const stemUnit = leafUnit * 10;
  const sorted = [...values].sort((a, b) => a - b);
  const map = new Map<number, number[]>();
  for (const v of sorted) {
    const stem = Math.floor(v / stemUnit);
    const leaf = Math.floor((v % stemUnit) / leafUnit);
    if (!map.has(stem)) map.set(stem, []);
    map.get(stem)!.push(leaf);
  }
  return map;
}

export function StemLeaf({
  title,
  icon = 'chart',
  iconColor = 'var(--presence)',
  values,
  title2,
  values2,
  leafUnit = 1,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.chart;
  const backToBack = values2 != null && values2.length > 0;

  const model = useMemo(() => {
    const map1 = parseStemLeaves(values, leafUnit);
    const map2 = backToBack && values2 ? parseStemLeaves(values2, leafUnit) : null;

    const allStems = [...map1.keys(), ...(map2 ? [...map2.keys()] : [])];
    if (allStems.length === 0) return { rows: [] };

    const minStem = Math.min(...allStems);
    const maxStem = Math.max(...allStems);

    const rows: { stem: number; leavesLeft: number[]; leavesRight: number[] }[] = [];
    for (let s = minStem; s <= maxStem; s++) {
      rows.push({
        stem: s,
        // Left side = values (title), reversed so leaves read outward from stem
        leavesLeft: map1.get(s) ?? [],
        // Right side = values2 (title2)
        leavesRight: map2 ? (map2.get(s) ?? []) : [],
      });
    }
    return { rows };
  }, [values, values2, leafUnit, backToBack]);

  const monoBase: CSSProperties = {
    fontFamily: 'var(--font-mono, monospace)',
    fontSize: 11,
    lineHeight: '1.85',
    padding: '1px 8px',
    whiteSpace: 'nowrap',
  };

  const stemCellStyle: CSSProperties = {
    ...monoBase,
    background: 'var(--surface-elevated)',
    color: 'var(--text-muted)',
    textAlign: 'center',
    borderLeft: '1px solid var(--grid-line)',
    borderRight: '1px solid var(--grid-line)',
    minWidth: 32,
  };

  const leafCellStyle: CSSProperties = {
    ...monoBase,
    color: 'var(--text-primary)',
  };

  const headerStyle: CSSProperties = {
    ...monoBase,
    color: 'var(--text-muted)',
    fontWeight: 600,
    borderBottom: '1px solid var(--grid-line)',
    paddingBottom: 5,
    fontSize: 10,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
  };

  const gridCols = backToBack ? '1fr auto 1fr' : 'auto 1fr';

  return (
    <div
      className="card reveal c1"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div style={{ overflowX: 'auto', overflowY: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: gridCols }}>
          {/* Header row */}
          {backToBack ? (
            <>
              <div style={{ ...headerStyle, textAlign: 'right' }}>{title}</div>
              <div
                style={{
                  ...headerStyle,
                  ...stemCellStyle,
                  borderBottom: '1px solid var(--grid-line)',
                  fontWeight: 600,
                  fontSize: 10,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                }}
              >
                stem
              </div>
              <div style={{ ...headerStyle }}>{title2}</div>
            </>
          ) : (
            <>
              <div
                style={{
                  ...headerStyle,
                  ...stemCellStyle,
                  borderBottom: '1px solid var(--grid-line)',
                  fontWeight: 600,
                  fontSize: 10,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                }}
              >
                stem
              </div>
              <div style={{ ...headerStyle }}>leaves</div>
            </>
          )}

          {/* Data rows */}
          {model.rows.map(({ stem, leavesLeft, leavesRight }) => (
            <Fragment key={stem}>
              {backToBack ? (
                <>
                  <div style={{ ...leafCellStyle, textAlign: 'right' }}>
                    {[...leavesLeft].reverse().join(' ')}
                  </div>
                  <div style={stemCellStyle}>{stem}</div>
                  <div style={leafCellStyle}>{leavesRight.join(' ')}</div>
                </>
              ) : (
                <>
                  <div style={stemCellStyle}>{stem}</div>
                  <div style={leafCellStyle}>{leavesLeft.join(' ')}</div>
                </>
              )}
            </Fragment>
          ))}
        </div>

        <div
          style={{
            fontFamily: 'var(--font-mono, monospace)',
            fontSize: 10,
            color: 'var(--text-muted)',
            marginTop: 8,
            paddingLeft: 2,
          }}
        >
          Leaf unit: {leafUnit}
        </div>
      </div>

      {footer && (
        <div className="insight-summary" style={{ marginTop: 8 }}>
          <span dangerouslySetInnerHTML={richInnerHtml(footer)} />
        </div>
      )}
    </div>
  );
}
