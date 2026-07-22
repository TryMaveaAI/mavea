import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { BlockEmpty } from '../../lib';
import type { PatentclaimchartProps, PatentClaimCell, ClaimDisclosure } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = PatentclaimchartProps & { delay?: number };

const STATE: Record<ClaimDisclosure, { c: string; icon: keyof typeof Icon | null; t: string }> = {
  disclosed: { c: 'var(--insight)', icon: 'check', t: 'Disclosed' },
  'not-disclosed': { c: 'var(--text-muted)', icon: null, t: 'Not disclosed' },
  disputed: { c: 'var(--warning)', icon: 'alert', t: 'Disputed' },
};
const VALID_STATES = new Set<string>(['disclosed', 'not-disclosed', 'disputed']);

/** A cell straight from `cells[r][c]` is untrusted at every level: `cells` itself, its rows, and
 *  each cell can each independently be missing, the wrong shape, or a loose model guess (a
 *  string where an object was expected). Reads every level defensively rather than assuming the
 *  2D shape held, so a malformed reply degrades to "not-disclosed" instead of throwing. */
function readCell(cells: unknown, r: number, c: number): PatentClaimCell {
  const row = Array.isArray(cells) ? cells[r] : undefined;
  const raw = Array.isArray(row) ? row[c] : undefined;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { state: 'not-disclosed' };
  const cell = raw as Record<string, unknown>;
  const state =
    typeof cell.state === 'string' && VALID_STATES.has(cell.state)
      ? (cell.state as ClaimDisclosure)
      : 'not-disclosed';
  const quote = typeof cell.quote === 'string' && cell.quote.trim() ? cell.quote : undefined;
  return quote ? { state, quote } : { state };
}

// A patent claim chart: the claim's own numbered elements down the rows, the references (prior
// art, an accused product) across the columns, each intersection marked whether that reference
// discloses the element. `cells` is nominally `PatentClaimCell[][]`, but a model — or the fuzz
// harness — can hand it any shape at any depth, so every read goes through `readCell` rather than
// trusting the nesting held.
export function Patentclaimchart({
  title,
  icon = 'table',
  iconColor = 'var(--presence)',
  claimElements,
  references,
  cells,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.table;
  const elements = Array.isArray(claimElements) ? claimElements : [];
  const refs = Array.isArray(references) ? references.filter((r) => typeof r === 'string') : [];
  const [hover, setHover] = useState<{ r: number; c: number } | null>(
    elements.length && refs.length ? { r: 0, c: 0 } : null,
  );

  if (elements.length === 0 || refs.length === 0) {
    return (
      <div
        className="card reveal"
        style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
      >
        <div className="card-eyebrow">
          <Ic className="ic" style={{ color: iconColor }} /> {title}
        </div>
        <BlockEmpty message="No claim elements or references to chart" />
      </div>
    );
  }

  let disclosedCount = 0;
  let disputedCount = 0;
  for (let r = 0; r < elements.length; r++) {
    for (let c = 0; c < refs.length; c++) {
      const st = readCell(cells, r, c).state;
      if (st === 'disclosed') disclosedCount++;
      else if (st === 'disputed') disputedCount++;
    }
  }

  const hovered = hover ? readCell(cells, hover.r, hover.c) : null;
  const hMeta = hovered ? STATE[hovered.state] : null;

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="pcc-head">
        <span className="pcc-count faint">
          {elements.length} element{elements.length === 1 ? '' : 's'} × {refs.length} reference
          {refs.length === 1 ? '' : 's'}
        </span>
        <span className="pcc-tally tab-num faint">
          {disclosedCount} disclosed
          {disputedCount > 0 ? ` · ${disputedCount} disputed` : ''}
        </span>
      </div>

      <div className="pcc-scroll">
        <table className="pcc-table">
          <colgroup>
            <col className="pcc-col-el" />
            {refs.map((_, i) => (
              <col key={i} className="pcc-col-ref" />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th className="pcc-corner" />
              {refs.map((ref, i) => (
                <th key={i} className="pcc-refh">
                  <span>{ref}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {elements.map((el, r) => {
              const elId = typeof el?.id === 'string' && el.id.trim() ? el.id : String(r + 1);
              const elText = typeof el?.text === 'string' ? el.text : '';
              return (
                <tr key={r}>
                  <th className="pcc-elh" scope="row">
                    <span className="pcc-el-num">{elId}</span>
                    {elText && <span className="pcc-el-text">{elText}</span>}
                  </th>
                  {refs.map((_, c) => {
                    const cell = readCell(cells, r, c);
                    const m = STATE[cell.state];
                    const CI = m.icon ? Icon[m.icon] : null;
                    const on = hover?.r === r && hover?.c === c;
                    return (
                      <td
                        key={c}
                        className={`pcc-cell ${cell.state} ${on ? 'on' : ''}`}
                        style={{ ['--cc' as string]: m.c } as CSSProperties}
                        onMouseEnter={() => setHover({ r, c })}
                      >
                        <span className="pcc-mark">
                          {CI ? (
                            <CI className="pcc-mark-ic" />
                          ) : (
                            <span className="pcc-dash">–</span>
                          )}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {hovered && hMeta && (
        <div className="pcc-tip" style={{ ['--cc' as string]: hMeta.c } as CSSProperties}>
          <span className="pcc-tip-tag" style={{ color: hMeta.c }}>
            {hMeta.t}
          </span>
          {hovered.quote ? (
            <span className="pcc-tip-note" dangerouslySetInnerHTML={richInnerHtml(hovered.quote)} />
          ) : (
            <span className="pcc-tip-note faint">
              {elements[hover!.r]?.id || String(hover!.r + 1)} × {refs[hover!.c]}
            </span>
          )}
        </div>
      )}

      {footer && (
        <div
          className="insight-summary"
          style={{ marginTop: 12 }}
          dangerouslySetInnerHTML={richInnerHtml(footer)}
        />
      )}
    </div>
  );
}
