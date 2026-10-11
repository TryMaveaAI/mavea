import { useId, type CSSProperties, type ReactNode } from 'react';
import { Icon } from '../../../icons/icons';
import { estimateTextWidth } from '../../lib/fitText';
import { useHostWidth } from '../../lib/useBoxSize';
import type { ArtAnalysisProps, ArtOverlay } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = ArtAnalysisProps & { delay?: number };

// The canvas is a 160×100 frame (a 16:10 abstract picture plane). Pins/regions arrive 0..100 in
// each axis, so we scale x by 1.6 to land them in the frame.
const VB_W = 160;
const VB_H = 100;
const sx = (x: number) => (x / 100) * VB_W;
const sy = (y: number) => (y / 100) * VB_H;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// Region names are set at a fixed SCREEN size: the frame is laid out in 160 units and stretched
// to the card, so a size in units would paint at 4px on a phone and at display size on a desktop
// (which is what got the whole figure held to a third of its card). `unit` converts.
const LABEL_PX = 11;
const NODE_PX = 3.5;
const FALLBACK_PX = 480;

/** The longest prefix of `text` (with an ellipsis) whose width at `fontSize` fits `room`. */
function fitLabel(text: string, room: number, fontSize: number): string {
  if (estimateTextWidth(text, fontSize, true) <= room) return text;
  for (let n = text.length - 1; n > 1; n--) {
    const cut = text.slice(0, n).trimEnd() + '…';
    if (estimateTextWidth(cut, fontSize, true) <= room) return cut;
  }
  return text.slice(0, 1) + '…';
}

// Each overlay is a small piece of computed geometry — the classic compositional guide drawn to
// scale over the frame. No image: the canvas is a soft gradient field; the value here is the guide.
function overlayGeometry(overlay: ArtOverlay, nodeR: number): ReactNode {
  switch (overlay) {
    case 'leadinglines': {
      // Diagonals + converging lines drawing the eye to a focal third.
      const fx = VB_W * (2 / 3);
      const fy = VB_H * (1 / 3);
      return (
        <g className="art-guide">
          <line x1={0} y1={VB_H} x2={fx} y2={fy} />
          <line x1={VB_W} y1={VB_H} x2={fx} y2={fy} />
          <line x1={0} y1={0} x2={fx} y2={fy} />
          <circle cx={fx} cy={fy} r={nodeR * 1.3} className="art-guide-node" />
        </g>
      );
    }
    case 'goldenratio': {
      // The phi division (golden lines) plus a golden-spiral approximation — two quarter-circle arcs
      // sweeping inward toward the phi eye point, the classic spiral fitted to the frame.
      const phi = 1.618;
      const gx = VB_W / phi; // ≈61.8% across — the vertical golden line
      const gy = VB_H / phi; // the horizontal golden line
      const rBig = VB_W - gx; // first arc radius: the large phi rectangle's short side
      const rSmall = gx - (VB_W - gx) / phi; // shrink by 1/phi for the next turn
      return (
        <g className="art-guide">
          <line x1={gx} y1={0} x2={gx} y2={VB_H} />
          <line x1={0} y1={gy} x2={VB_W} y2={gy} />
          <path
            d={`M${VB_W} ${gy} A${rBig} ${rBig} 0 0 1 ${gx} ${VB_H} A${gx} ${gx} 0 0 1 0 ${gy} A${rSmall} ${rSmall} 0 0 1 ${gx - rSmall} ${VB_H - rSmall * phi}`}
            className="art-guide-arc"
          />
          <circle cx={gx} cy={gy} r={nodeR * 1.3} className="art-guide-node" />
        </g>
      );
    }
    case 'symmetry': {
      // The vertical axis of symmetry + a couple of mirror tick pairs.
      const ax = VB_W / 2;
      return (
        <g className="art-guide">
          <line x1={ax} y1={0} x2={ax} y2={VB_H} className="art-guide-axis" />
          {[0.3, 0.5, 0.7].map((t, i) => (
            <g key={i}>
              <line x1={ax - 22} y1={VB_H * t} x2={ax - 12} y2={VB_H * t} />
              <line x1={ax + 12} y1={VB_H * t} x2={ax + 22} y2={VB_H * t} />
            </g>
          ))}
        </g>
      );
    }
    case 'thirds':
    default: {
      // The rule-of-thirds grid + the four power points where the eye naturally rests.
      const cols = [VB_W / 3, (VB_W * 2) / 3];
      const rows = [VB_H / 3, (VB_H * 2) / 3];
      return (
        <g className="art-guide">
          {cols.map((x, i) => (
            <line key={`c${i}`} x1={x} y1={0} x2={x} y2={VB_H} />
          ))}
          {rows.map((y, i) => (
            <line key={`r${i}`} x1={0} y1={y} x2={VB_W} y2={y} />
          ))}
          {cols
            .flatMap((x) => rows.map((y) => [x, y] as const))
            .map(([x, y], i) => (
              <circle key={`p${i}`} cx={x} cy={y} r={nodeR} className="art-guide-node" />
            ))}
        </g>
      );
    }
  }
}

export function ArtAnalysis({
  title,
  icon = 'image',
  iconColor = 'var(--presence)',
  overlay = 'thirds',
  regions,
  palette,
  notes,
  caption,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.image;
  // Two analyses on one board must not share a gradient id, or the second paints the first's.
  const fieldId = `art-field-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const [figRef, hostW] = useHostWidth<HTMLDivElement>();
  // Screen px per frame unit.
  const unit = VB_W / (hostW || FALLBACK_PX);
  const fs = LABEL_PX * unit;
  const padX = 5 * unit;
  const chipH = fs * 1.5;

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      {title && (
        <div className="card-eyebrow">
          <Ic className="ic" style={{ color: iconColor }} /> {title}
        </div>
      )}

      <div className="art-figwrap" ref={figRef}>
        <svg viewBox={`0 0 ${VB_W} ${VB_H}`} className="art-svg" role="img" aria-label={title}>
          <defs>
            <linearGradient id={fieldId} x1="0" y1="0" x2="1" y2="1">
              <stop
                offset="0%"
                stopColor="color-mix(in oklab, var(--presence) 22%, var(--surface-elevated))"
              />
              <stop offset="55%" stopColor="var(--surface-elevated)" />
              <stop
                offset="100%"
                stopColor="color-mix(in oklab, var(--insight) 20%, var(--surface-elevated))"
              />
            </linearGradient>
          </defs>
          {/* the abstract picture plane (no supplied image) */}
          <rect x={0} y={0} width={VB_W} height={VB_H} fill={`url(#${fieldId})`} />

          {overlayGeometry(overlay, NODE_PX * unit)}

          {/* labeled focal regions */}
          {(regions ?? []).map((rg, i) => {
            const x = sx(clamp(rg.x, 0, 100));
            const y = sy(clamp(rg.y, 0, 100));
            const w = Math.min(sx(rg.w), VB_W - x);
            const h = Math.min(sy(rg.h), VB_H - y);
            const label = fitLabel(rg.label, Math.max(0, w - padX * 2), fs);
            const chipW = estimateTextWidth(label, fs, true) + padX * 2;
            // The name rides a chip in the box's top-left corner: it covers whatever guide line or
            // power point runs under it, and reads on any picture behind it.
            const chipFits = chipW <= w && chipH <= h;
            const chipY = chipFits ? y : Math.max(0, y - chipH);
            return (
              <g key={i} className="art-region">
                <rect
                  x={x}
                  y={y}
                  width={w}
                  height={h}
                  rx={2}
                  className="art-region-box"
                  {...(i === 0 ? { 'data-mark': 'box' } : {})}
                />
                <rect
                  x={x}
                  y={chipY}
                  width={Math.min(chipW, VB_W - x)}
                  height={chipH}
                  rx={2}
                  className="art-region-chip"
                />
                <text
                  x={x + padX}
                  y={chipY + chipH / 2}
                  dominantBaseline="central"
                  className="art-region-lbl"
                  style={{ fontSize: fs }}
                >
                  {label !== rg.label && <title>{rg.label}</title>}
                  {label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {palette && palette.length > 0 && (
        <div className="art-palette">
          {palette.map((s, i) => (
            <div key={i} className="art-pal-chip" title={s.hex}>
              <span className="art-pal-sw" style={{ background: s.hex }} />
              <span className="art-pal-meta">
                <span className="art-pal-hex tab-num">{s.hex}</span>
                {s.role && <span className="art-pal-role">{s.role}</span>}
              </span>
            </div>
          ))}
        </div>
      )}

      {notes && notes.length > 0 && (
        <div className="art-notes">
          {notes.map((n, i) => (
            <div key={i} className="art-note">
              <span className="art-note-k">{n.label}</span>
              <span className="art-note-v">{n.text}</span>
            </div>
          ))}
        </div>
      )}

      {caption && <div className="art-caption">{caption}</div>}

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
