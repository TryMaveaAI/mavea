import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { OrbitalDiagramProps, OrbitalRow } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = OrbitalDiagramProps & { delay?: number };

// The canonical orbital count per subshell letter — a fixed physical fact, used only as a
// fallback when a row omits (or garbles) its own `boxes`, never to override a real value.
const CANON_BOXES: Record<string, number> = { s: 1, p: 3, d: 5, f: 7 };

/** How many boxes this subshell draws: the caller's own count when it's a real positive
 *  integer, else the canonical count for the subshell letter, else a single box. */
function boxCountFor(row: OrbitalRow): number {
  const given = Math.floor(Number(row.boxes));
  if (Number.isFinite(given) && given > 0) return given;
  const letter = String(row.subshell ?? '')
    .trim()
    .slice(-1)
    .toLowerCase();
  return CANON_BOXES[letter] ?? 1;
}

/** A box's occupancy, clamped to the only three physical states — anything else (missing,
 *  a stray string, an out-of-range number) renders as an empty box rather than crashing or
 *  drawing a fabricated third arrow. */
function occupancyAt(electrons: unknown, i: number): 0 | 1 | 2 {
  const arr = Array.isArray(electrons) ? electrons : [];
  const n = Math.floor(Number(arr[i]));
  return n === 1 ? 1 : n === 2 ? 2 : 0;
}

export function OrbitalDiagram({
  title,
  icon = 'sparkle',
  iconColor = 'var(--presence)',
  element,
  orbitals,
  configString,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.sparkle;
  const rows = Array.isArray(orbitals) ? orbitals : [];

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
        {element && <span className="lr-od-element">{element}</span>}
      </div>

      {rows.length === 0 ? (
        <div className="lr-od-empty">No orbitals to fill.</div>
      ) : (
        <div className="lr-od-rows">
          {rows.map((row, ri) => {
            const boxes = boxCountFor(row);
            return (
              <div key={ri} className="lr-od-row">
                <span className="lr-od-subshell">{row.subshell || '—'}</span>
                <span className="lr-od-boxes">
                  {Array.from({ length: boxes }, (_, bi) => {
                    const occ = occupancyAt(row.electrons, bi);
                    return (
                      <span
                        key={bi}
                        className="lr-od-box"
                        data-occupancy={occ}
                        aria-label={
                          occ === 0 ? 'empty' : occ === 1 ? 'one electron' : 'two electrons'
                        }
                      >
                        {occ >= 1 && <span className="lr-od-arrow lr-od-arrow--up">↑</span>}
                        {occ === 2 && <span className="lr-od-arrow lr-od-arrow--down">↓</span>}
                      </span>
                    );
                  })}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {configString && <p className="lr-od-config">{configString}</p>}

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
