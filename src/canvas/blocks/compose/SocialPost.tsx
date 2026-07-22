import { type CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { SocialPostProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = SocialPostProps & { delay?: number };
type Platform = SocialPostProps['platform'];

const PLATFORM_LABEL: Record<Platform, string> = {
  x: 'X',
  linkedin: 'LinkedIn',
  instagram: 'Instagram',
  threads: 'Threads',
  generic: 'Post',
};

// Published character ceilings the live count reads against. `generic` gets a conservative
// default so the readout still means something when the platform isn't one of the four named
// ones (a company blog, a forum post drafted in this shape).
const PLATFORM_LIMIT: Record<Platform, number> = {
  x: 280,
  linkedin: 3000,
  instagram: 2200,
  threads: 500,
  generic: 500,
};

// LinkedIn identity reads as a name + headline, not an @handle — every other platform is
// conventionally @-prefixed, so only add the sigil where it's missing on those.
function formatHandle(handle: string, platform: Platform): string {
  if (platform === 'linkedin' || handle.startsWith('@')) return handle;
  return `@${handle}`;
}

// Avatar glyph: an explicit override wins, otherwise the display name's first letter, falling
// back to the handle's (with any leading @ stripped so it never renders as "@").
function avatarGlyph(handle: string, displayName?: string, avatarInitial?: string): string {
  if (avatarInitial) return avatarInitial.slice(0, 2).toUpperCase();
  const source = displayName || handle.replace(/^@/, '');
  return source.charAt(0).toUpperCase() || '?';
}

// Hand-drawn heart glyph for the "like" engagement icon — mirrors Ratinginput's outline heart
// since the shared Icon set carries no brand/social glyphs.
function HeartGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="sp-eng-icon" aria-hidden="true">
      <path
        d="M12 20.5 4.2 12.8a4.6 4.6 0 0 1 6.5-6.5l1.3 1.3 1.3-1.3a4.6 4.6 0 0 1 6.5 6.5L12 20.5Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function SocialPost({
  title,
  icon = 'globe',
  iconColor = 'var(--presence)',
  platform,
  handle,
  displayName,
  avatarInitial,
  body,
  timestamp,
  media,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] ?? Icon.globe;
  const attachments = media ?? [];
  const limit = PLATFORM_LIMIT[platform] ?? PLATFORM_LIMIT.generic;
  const count = body.length;
  const ratio = count / limit;
  const state: 'ok' | 'warning' | 'danger' = ratio > 1 ? 'danger' : ratio >= 0.9 ? 'warning' : 'ok';
  const glyph = avatarGlyph(handle, displayName, avatarInitial);
  const formattedHandle = formatHandle(handle, platform);

  return (
    <div
      className={`card reveal sp-card sp-card--${platform}`}
      style={{ ['--delay' as string]: (delay ?? 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
        <span className="sp-platform-chip" style={{ marginLeft: 'auto' }}>
          {PLATFORM_LABEL[platform]}
        </span>
      </div>

      <div className="sp-post">
        <div className="sp-head">
          <div className="sp-avatar" aria-hidden="true">
            {glyph}
          </div>
          <div className="sp-who">
            <div className="sp-name-row">
              <span className="sp-name">{displayName || formattedHandle}</span>
              {displayName && <span className="sp-handle">{formattedHandle}</span>}
            </div>
            {timestamp && <div className="sp-time">{timestamp}</div>}
          </div>
        </div>

        <div className="sp-body">{body}</div>

        {attachments.length > 0 && (
          <div className="sp-media">
            {attachments.map((m, i) => (
              <div
                key={i}
                className="sp-media-item m-stagger-item m-fade-rise"
                style={{ ['--i' as string]: i } as CSSProperties}
                title={m.alt}
              >
                <Icon.image className="ic" aria-hidden="true" />
                {/* A thumbnail caption is a one-line label by design, and the wrapper above carries
                    the full alt text as its `title`, so nothing is actually lost when a long one
                    ellipsizes. Mark it disclosed so the truncation audit reads it as intentional
                    rather than as a label the reader can no longer finish. */}
                <span className="sp-media-alt" data-semantic-ellipsis="true">
                  {m.alt}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="sp-meta-row">
          <div className="sp-engagement" aria-hidden="true">
            <span
              className="sp-eng m-stagger-item m-fade-rise"
              style={{ ['--i' as string]: 0 } as CSSProperties}
            >
              <Icon.chat className="sp-eng-icon" />
            </span>
            <span
              className="sp-eng m-stagger-item m-fade-rise"
              style={{ ['--i' as string]: 1 } as CSSProperties}
            >
              <Icon.refresh className="sp-eng-icon" />
            </span>
            <span
              className="sp-eng m-stagger-item m-fade-rise"
              style={{ ['--i' as string]: 2 } as CSSProperties}
            >
              <HeartGlyph />
            </span>
            <span
              className="sp-eng m-stagger-item m-fade-rise"
              style={{ ['--i' as string]: 3 } as CSSProperties}
            >
              <Icon.share className="sp-eng-icon" />
            </span>
          </div>
          <span className="sp-charcount" data-state={state}>
            {count.toLocaleString()}/{limit.toLocaleString()}
          </span>
        </div>
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
