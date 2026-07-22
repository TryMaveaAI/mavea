import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { ShotListProps, ShotSize } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = ShotListProps & { delay?: number };

// Each shot size names a framing convention. The thumbnail draws a stand-in figure whose scale
// (and crop, for the OTS over-the-shoulder framing) is derived from the size, so the placeholder
// reads as the actual composition rather than a generic box. `subject` is the fraction of the
// frame height the subject occupies; `label` is the badge word.
const FRAMING: Record<ShotSize, { subject: number; label: string }> = {
  WS: { subject: 0.5, label: 'Wide' },
  MS: { subject: 0.78, label: 'Medium' },
  CU: { subject: 1.05, label: 'Close' },
  ECU: { subject: 1.5, label: 'Extreme' },
  OTS: { subject: 0.92, label: 'Over-shoulder' },
};

const FRAME_W = 100;
const FRAME_H = 64;

/** Draw the composition stand-in for a shot size into the thumbnail's viewBox. */
function framing(size: ShotSize) {
  const f = FRAMING[size];
  // The subject is a head+shoulders silhouette sized off the framing fraction, anchored to the
  // bottom of the frame so a closer shot simply rises and crops out of the top edge.
  const headR = (FRAME_H * f.subject) / 4;
  const cx = size === 'OTS' ? FRAME_W * 0.62 : FRAME_W / 2;
  const headCy = FRAME_H - headR * 1.7;
  const shoulderW = headR * 2.4;
  return { headR, cx, headCy, shoulderW, label: f.label };
}

export function ShotList({
  title,
  icon = 'play',
  iconColor = 'var(--presence)',
  shots,
  caption,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.play;

  return (
    <div
      className="card reveal lay-shot"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      {title && (
        <div className="card-eyebrow">
          <Ic className="ic" style={{ color: iconColor }} /> {title}
        </div>
      )}

      <ol className="lay-shot-list">
        {shots.map((s, i) => {
          const size = s.size || 'MS';
          const g = framing(size);
          const meta = [s.movement, s.lens, s.duration].filter(Boolean) as string[];
          return (
            <li className="lay-shot-row" key={i}>
              <div className="lay-shot-thumb">
                <svg
                  className="lay-shot-frame"
                  viewBox={`0 0 ${FRAME_W} ${FRAME_H}`}
                  role="img"
                  aria-label={`${size} shot framing`}
                  preserveAspectRatio="xMidYMid slice"
                >
                  {/* the over-the-shoulder foreground mass on the near side */}
                  {size === 'OTS' && (
                    <path
                      d={`M 0 ${FRAME_H} L 0 ${FRAME_H * 0.28} Q ${FRAME_W * 0.18} ${FRAME_H * 0.2} ${FRAME_W * 0.3} ${FRAME_H} Z`}
                      className="lay-shot-fg"
                    />
                  )}
                  <circle cx={g.cx} cy={g.headCy} r={g.headR} className="lay-shot-subj" />
                  <path
                    d={`M ${g.cx - g.shoulderW} ${FRAME_H} Q ${g.cx} ${g.headCy + g.headR * 0.4} ${g.cx + g.shoulderW} ${FRAME_H} Z`}
                    className="lay-shot-subj"
                  />
                  {/* rule-of-thirds guides, the way a viewfinder overlays them */}
                  <line
                    x1={FRAME_W / 3}
                    y1={0}
                    x2={FRAME_W / 3}
                    y2={FRAME_H}
                    className="lay-shot-grid"
                  />
                  <line
                    x1={(FRAME_W / 3) * 2}
                    y1={0}
                    x2={(FRAME_W / 3) * 2}
                    y2={FRAME_H}
                    className="lay-shot-grid"
                  />
                </svg>
                <span className="lay-shot-size">{size}</span>
              </div>

              <div className="lay-shot-body">
                <div className="lay-shot-top">
                  <span className="lay-shot-n tab-num">{s.n}</span>
                  <span className="lay-shot-frame-label">{g.label}</span>
                  {meta.length > 0 && (
                    <div className="lay-shot-meta">
                      {meta.map((m, j) => (
                        <span className="lay-shot-tag" key={j}>
                          {m}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="lay-shot-action">{s.action}</div>
                {s.dialogue && (
                  <div className="lay-shot-dialogue">
                    <Icon.chat className="ic" />
                    <span>{s.dialogue}</span>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {caption && <div className="lay-shot-caption faint">{caption}</div>}

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
