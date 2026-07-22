import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { AvatarProps, AvatarSize, AvatarStatus } from './types';
import { richInnerHtml } from '../../../lib/richText';
import { safeBlockImageSrc } from '../../../lib/safeImageUrl';

type Props = AvatarProps & { delay?: number };

const SIZES: AvatarSize[] = ['sm', 'md', 'lg'];
const SIZE_PX: Record<AvatarSize, number> = { sm: 40, md: 56, lg: 76 };
const STATUS_C: Record<AvatarStatus, string> = {
  online: 'var(--insight)',
  away: 'var(--warning)',
  busy: 'var(--danger)',
  offline: 'var(--text-muted)',
};
const STATUS_LABEL: Record<AvatarStatus, string> = {
  online: 'Online',
  away: 'Away',
  busy: 'Busy',
  offline: 'Offline',
};

function deriveInitials(name?: string, initials?: string) {
  if (initials) return initials.slice(0, 2).toUpperCase();
  if (!name) return '';
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || parts[0]?.[1] || '')).toUpperCase();
}

export function Avatar({
  title,
  icon = 'eye',
  iconColor = 'var(--presence)',
  name,
  src,
  glyph = 'eye',
  initials,
  size = 'md',
  status,
  ring,
  color = 'var(--presence)',
  role,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.eye;
  const Glyph = Icon[glyph] || Icon.eye;
  const [sz, setSz] = useState<AvatarSize>(size);
  const [imgOk, setImgOk] = useState(true);
  const px = SIZE_PX[sz];
  const ini = deriveInitials(name, initials);
  // `src` is untrusted model output — a rejected URL falls back to initials/glyph.
  const imgSrc = safeBlockImageSrc(src);
  const showImg = !!imgSrc && imgOk;

  const cycle = () => setSz(SIZES[(SIZES.indexOf(sz) + 1) % SIZES.length]);

  return (
    <div
      className="card reveal"
      style={
        { ['--delay' as string]: (delay || 0) + 'ms', ['--av-c' as string]: color } as CSSProperties
      }
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="av-main">
        <button
          type="button"
          className={`av-avatar ${ring ? 'ring' : ''}`}
          style={{ width: px, height: px, fontSize: px * 0.36 } as CSSProperties}
          onClick={cycle}
          title="Click to resize"
          // the avatar circle is the component's single salient visual datum
          data-mark="circle"
        >
          {showImg ? (
            <img className="av-img" src={imgSrc} alt={name || ''} onError={() => setImgOk(false)} />
          ) : ini ? (
            <span className="av-initials">{ini}</span>
          ) : (
            <Glyph className="av-glyph" />
          )}
          {status && (
            <span
              className="av-status"
              style={{ ['--st-c' as string]: STATUS_C[status] } as CSSProperties}
              title={STATUS_LABEL[status]}
            />
          )}
        </button>

        <div className="av-meta">
          {name && <div className="av-name">{name}</div>}
          {role && <div className="av-role faint">{role}</div>}
          <div className="av-sizes" role="radiogroup">
            {SIZES.map((s) => (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={sz === s}
                className={`av-size-btn ${sz === s ? 'on' : ''}`}
                onClick={() => setSz(s)}
              >
                {s.toUpperCase()}
              </button>
            ))}
          </div>
          {status && (
            <div className="av-status-line">
              <span
                className="av-status-dot"
                style={{ ['--st-c' as string]: STATUS_C[status] } as CSSProperties}
              />
              {STATUS_LABEL[status]}
            </div>
          )}
        </div>
      </div>

      {footer && (
        <div
          className="insight-summary"
          style={{ marginTop: 14 }}
          dangerouslySetInnerHTML={richInnerHtml(footer)}
        />
      )}
    </div>
  );
}
