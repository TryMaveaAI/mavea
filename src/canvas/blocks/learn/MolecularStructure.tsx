import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { smilesToMolecule, type MoleculeGeometry } from './smiles';
import type { MolecularStructureProps, MoleculeBond, MoleculeAtom } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = MolecularStructureProps & { delay?: number };

// Atoms/bonds live on a 0..100 unit canvas; we draw into a padded square viewBox.
const VB = 100;

/** Two parallel offsets perpendicular to a bond, for double/triple lines. */
function offsets(a: MoleculeAtom, b: MoleculeAtom, order: number) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = (-dy / len) * 1.6; // perpendicular unit × spacing
  const ny = (dx / len) * 1.6;
  if (order === 2) return [-1, 1].map((s) => ({ ox: nx * s, oy: ny * s }));
  if (order === 3) return [-1, 0, 1].map((s) => ({ ox: nx * s, oy: ny * s }));
  return [{ ox: 0, oy: 0 }];
}

export function MolecularStructure({
  title,
  icon = 'sparkle',
  iconColor = 'var(--presence)',
  smiles,
  atoms: atomsProp,
  bonds: bondsProp,
  formula,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.sparkle;

  // Manual mode: the model supplied atoms directly (a small hand-authored example). SMILES mode:
  // it supplied a string and the engine computes the geometry (the accurate path for real molecules).
  const hasManual = Array.isArray(atomsProp) && atomsProp.length > 0;
  const [computed, setComputed] = useState<MoleculeGeometry | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>(
    hasManual ? 'ready' : smiles ? 'loading' : 'error',
  );

  useEffect(() => {
    if (hasManual || !smiles) return;
    let live = true;
    setStatus('loading');
    setComputed(null);
    smilesToMolecule(smiles)
      .then((geo) => {
        if (!live) return;
        if (geo) {
          setComputed(geo);
          setStatus('ready');
        } else {
          setStatus('error');
        }
      })
      .catch(() => {
        if (live) setStatus('error');
      });
    return () => {
      live = false;
    };
  }, [smiles, hasManual]);

  const atoms = hasManual ? atomsProp : computed?.atoms;
  const bonds = hasManual ? bondsProp : computed?.bonds;
  const caption = formula ?? computed?.formula;

  const drawBond = (bond: MoleculeBond, i: number) => {
    if (!atoms) return null;
    const a = atoms[bond.from];
    const b = atoms[bond.to];
    if (!a || !b) return null;
    return offsets(a, b, bond.order ?? 1).map((o, j) => (
      <line
        key={`${i}-${j}`}
        x1={a.x + o.ox}
        y1={a.y + o.oy}
        x2={b.x + o.ox}
        y2={b.y + o.oy}
        className="lr-mol-bond"
      />
    ));
  };

  const ready = status === 'ready' && atoms && bonds && atoms.length > 0;

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>
      <div className="lr-mol">
        {status === 'loading' ? (
          <div className="lr-mol-loading" aria-hidden="true">
            <span className="lr-mol-spinner" /> Building structure…
          </div>
        ) : !ready ? (
          <p className="lr-mol-err">Couldn’t render this structure.</p>
        ) : (
          <svg
            viewBox={`-8 -8 ${VB + 16} ${VB + 16}`}
            className="lr-mol-svg"
            role="img"
            aria-label={title}
          >
            {bonds!.map(drawBond)}
            {atoms!.map((at, i) =>
              at.implicit ? null : (
                <g key={i}>
                  <circle cx={at.x} cy={at.y} r={6.5} className="lr-mol-atom-bg" />
                  <text x={at.x} y={at.y + 2.6} className="lr-mol-atom" textAnchor="middle">
                    {at.el}
                  </text>
                  {at.charge && (
                    <text x={at.x + 6} y={at.y - 4} className="lr-mol-charge" textAnchor="middle">
                      {at.charge}
                    </text>
                  )}
                </g>
              ),
            )}
          </svg>
        )}
      </div>
      {caption && <div className="lr-mol-formula tab-num">{caption}</div>}
      {footer && (
        <div
          className="insight-summary"
          style={{ marginTop: 8 }}
          dangerouslySetInnerHTML={richInnerHtml(footer)}
        />
      )}
    </div>
  );
}
