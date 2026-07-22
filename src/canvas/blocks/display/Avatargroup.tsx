import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { AvatargroupProps, AvatarSize, AvatarStatus } from './types';
import { richInnerHtml } from '../../../lib/richText';
import { safeBlockImageSrc } from '../../../lib/safeImageUrl';

type Props = AvatargroupProps & { delay?: number };

const SIZE_PX: Record<AvatarSize, number> = { sm: 30, md: 38, lg: 48 };
const PALETTE = [
  'var(--presence)',
  'var(--insight)',
  'var(--warning)',
  'var(--danger)',
  'var(--presence-soft)',
] as const;
const STATUS_C: Record<AvatarStatus, string> = {
  online: 'var(--insight)',
  away: 'var(--warning)',
  busy: 'var(--danger)',
  offline: 'var(--text-muted)',
};

function ini(name: string, initials?: string) {
  if (initials) return initials.slice(0, 2).toUpperCase();
  const p = name.trim().split(/\s+/);
  return ((p[0]?.[0] || '') + (p[1]?.[0] || '')).toUpperCase();
}

export function Avatargroup({
  title,
  icon = 'share',
  iconColor = 'var(--presence)',
  members,
  max = 5,
  size = 'md',
  caption,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.share;
  const [hover, setHover] = useState<number | null>(null);
  const [spread, setSpread] = useState(false);
  // Faces whose photo URL failed to load — they fall back to initials instead of a broken image.
  const [failed, setFailed] = useState<ReadonlySet<number>>(() => new Set());
  const px = SIZE_PX[size];
  const overlap = Math.round(px * 0.36);

  // cap visible faces so a large `max` can't overflow the card; the rest collapse into "+N"
  const visibleMax = Math.max(1, Math.min(max, 8));
  const shown = members.slice(0, visibleMax);
  const extra = members.length - shown.length;
  const hv = hover != null ? members[hover] : null;

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div
        className={`avg-stack ${spread ? 'spread' : ''}`}
        onMouseEnter={() => setSpread(true)}
        onMouseLeave={() => {
          setSpread(false);
          setHover(null);
        }}
        style={
          {
            ['--av-px' as string]: px + 'px',
            ['--av-ov' as string]: overlap + 'px',
          } as CSSProperties
        }
      >
        {shown.map((m, i) => {
          const c = m.color || PALETTE[i % PALETTE.length];
          // untrusted model URL — a rejected src falls back to initials, same as a load failure
          const src = safeBlockImageSrc(m.src);
          return (
            <button
              key={i}
              type="button"
              className={`avg-face ${hover === i ? 'on' : ''}`}
              style={
                {
                  width: px,
                  height: px,
                  fontSize: px * 0.36,
                  marginLeft: i === 0 ? 0 : `calc(-1 * var(--av-ov))`,
                  zIndex: hover === i ? 50 : i + 1,
                  ['--face-c' as string]: c,
                } as CSSProperties
              }
              onMouseEnter={() => setHover(i)}
              onFocus={() => setHover(i)}
              // first face is the lead position in an authored ordered stack
              {...(i === 0 ? { 'data-mark': 'circle' } : {})}
            >
              {src && !failed.has(i) ? (
                <img
                  className="avg-img"
                  src={src}
                  alt={m.name}
                  onError={() => setFailed((s) => new Set(s).add(i))}
                />
              ) : (
                <span>{ini(m.name, m.initials)}</span>
              )}
              {m.status && (
                <span
                  className="avg-status"
                  style={{ ['--st-c' as string]: STATUS_C[m.status] } as CSSProperties}
                />
              )}
            </button>
          );
        })}
        {extra > 0 && (
          <span
            className="avg-face avg-more"
            style={
              {
                width: px,
                height: px,
                fontSize: px * 0.3,
                marginLeft: `calc(-1 * var(--av-ov))`,
                zIndex: 0,
              } as CSSProperties
            }
          >
            +{extra}
          </span>
        )}
      </div>

      <div className="avg-readout" data-on={hv != null}>
        {hv ? (
          <>
            <span className="avg-readout-name">{hv.name}</span>
            <span className="avg-readout-role faint">{hv.role || 'Collaborator'}</span>
          </>
        ) : (
          caption && (
            <span className="avg-caption faint" dangerouslySetInnerHTML={richInnerHtml(caption)} />
          )
        )}
      </div>

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
