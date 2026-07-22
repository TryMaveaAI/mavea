// Media layouts: people grid and full-bleed image. A member without a photo — or whose photo URL
// fails to load — falls back to an initials monogram (real data only — no invented portrait) so
// the row of cards stays aligned; the full-bleed title is sized to fit and clamps over the image.
import { useState } from 'react';
import { safeBlockImageSrc } from '../../../lib/safeImageUrl';
import { displayWeight, kickerFont, SlideFrame } from '../chrome/bits';
import type { SlideLayout } from '../types';
import { clampStyle, FULLBLEED_TIERS, nowrapEllipsis, pickTier, titleTier } from './fit';

/** Up to two initials from a name, for the photo-less monogram. */
const initials = (name: string): string =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] ?? '')
    .join('')
    .toUpperCase() || '·';

export const TeamGrid: SlideLayout<'teamGrid'> = ({ slide, skin, ctx }) => {
  const t = skin.tokens;
  const d = slide.data;
  // Cap at four across so portraits never crowd the frame, regardless of the input length.
  const members = d.members.slice(0, 4);
  const n = Math.max(1, members.length);
  const head = d.title ? titleTier(d.title.length) : null;
  const bioLines = n <= 3 ? 4 : 3;
  // One or two people centre at card scale rather than leaving half the row empty.
  const portrait = n <= 2 ? 300 : 230;
  const colMax = n <= 2 ? 640 : 520;
  // Photos whose URL failed to load — they fall back to the monogram instead of a broken image.
  const [failed, setFailed] = useState<ReadonlySet<number>>(() => new Set());
  return (
    <SlideFrame slideId={slide.id} skin={skin} ctx={ctx} kicker={slide.kicker}>
      <div
        style={{
          flex: '1 1 auto',
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 48,
          minWidth: 0,
        }}
      >
        {head ? (
          <div
            data-fit-tier={head.size}
            style={{
              font: `${displayWeight(skin)} ${head.size}px/${head.line} ${skin.fonts.display}`,
              color: t.ink,
              ...clampStyle(head.maxLines),
            }}
          >
            {d.title}
          </div>
        ) : null}
        <div
          style={{
            flex: '1 1 auto',
            minHeight: 0,
            display: 'grid',
            gridTemplateColumns: `repeat(${n}, minmax(0, ${colMax}px))`,
            justifyContent: n < 4 ? 'center' : 'start',
            alignContent: 'center',
            gap: 48,
            minWidth: 0,
          }}
        >
          {members.map((m, i) => {
            const imageSrc = safeBlockImageSrc(m.img);
            return (
              <div
                key={i}
                style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}
              >
                {imageSrc && !failed.has(i) ? (
                  <img
                    src={imageSrc}
                    alt=""
                    onError={() => setFailed((s) => new Set(s).add(i))}
                    style={{
                      width: portrait,
                      height: portrait,
                      borderRadius: '50%',
                      objectFit: 'cover',
                      background: t.track,
                    }}
                  />
                ) : (
                  <div
                    aria-hidden
                    style={{
                      width: portrait,
                      height: portrait,
                      borderRadius: '50%',
                      background: t.tint,
                      display: 'grid',
                      placeItems: 'center',
                      font: `${displayWeight(skin)} 88px/1 ${skin.fonts.display}`,
                      color: 'var(--accent-ink)',
                    }}
                  >
                    {initials(m.name)}
                  </div>
                )}
                <div
                  style={{
                    font: `${displayWeight(skin)} 36px/1.1 ${skin.fonts.display}`,
                    color: t.ink,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {m.name}
                </div>
                {m.role ? (
                  <div
                    style={{
                      font: `700 24px/1.2 ${kickerFont(skin)}`,
                      letterSpacing: '0.18em',
                      textTransform: 'uppercase',
                      color: 'var(--accent-ink)',
                      ...clampStyle(2),
                    }}
                  >
                    {m.role}
                  </div>
                ) : null}
                {m.bio ? (
                  <div
                    style={{
                      font: `400 26px/1.45 ${skin.fonts.body}`,
                      color: t.muted,
                      ...clampStyle(bioLines),
                    }}
                  >
                    {m.bio}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </SlideFrame>
  );
};

// Double shadow — a tight dark hug plus a larger soft dark halo — so the hero title/kicker stay
// legible over whatever photo lands here, including a naturally light one, without relying on any
// pixel/luminance sampling of the image (canvas sniffing is CORS-fragile and non-deterministic
// during raster export capture; a stronger universal scrim + shadow is the deterministic fix).
const heroTextShadow = '0 1px 3px rgba(0,0,0,0.9), 0 6px 24px rgba(0,0,0,0.55)';

export const FullBleed: SlideLayout<'fullBleed'> = ({ slide, skin, ctx }) => {
  const t = skin.tokens;
  const d = slide.data;
  const imageSrc = safeBlockImageSrc(d.img);
  const tier = d.title ? pickTier(d.title.length, FULLBLEED_TIERS) : null;
  // A broken/CORS-blocked photo falls back to a skin-tinted panel rather than a broken-image box.
  const [imgFailed, setImgFailed] = useState(false);
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      {!imageSrc || imgFailed ? (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: `linear-gradient(135deg, ${t.darkSurface} 0%, color-mix(in oklab, ${t.accent} 22%, ${t.darkSurface}) 100%)`,
          }}
        />
      ) : (
        <img
          src={imageSrc}
          alt=""
          onError={() => setImgFailed(true)}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
          }}
        />
      )}
      {/* A full-frame floor plus a stronger band at the bottom, where the title sits — dark enough
          that white text holds up over a naturally light photo, with no fully-clear zone. */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'linear-gradient(180deg, rgba(0,0,0,0.86) 0%, rgba(0,0,0,0.28) 50%, rgba(0,0,0,0.42) 100%)',
        }}
      />
      {/* The one layout that drops the shared Footer keeps its own page number, so deck chrome
          never silently disappears for a slide. */}
      <div
        style={{
          position: 'absolute',
          top: 56,
          right: 64,
          font: `600 22px/1 ${kickerFont(skin)}`,
          letterSpacing: '0.16em',
          color: '#fff',
          opacity: 0.9,
          textShadow: heroTextShadow,
        }}
      >
        {String(ctx.index + 1).padStart(2, '0')} / {String(ctx.total).padStart(2, '0')}
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: t.pad }}>
        {slide.kicker ? (
          <div
            style={{
              font: `700 24px/1 ${kickerFont(skin)}`,
              letterSpacing: '0.3em',
              textTransform: 'uppercase',
              color: '#fff',
              marginBottom: 22,
              textShadow: heroTextShadow,
              // FullBleed hand-rolls its chrome with no BandFit backstop, so a long kicker would
              // wrap freely and shove the bottom-anchored block. Kickers are single-line everywhere.
              ...nowrapEllipsis,
            }}
          >
            {slide.kicker}
          </div>
        ) : null}
        {tier ? (
          <div
            data-fit-tier={tier.size}
            style={{
              font: `${displayWeight(skin)} ${tier.size}px/${tier.line} ${skin.fonts.display}`,
              color: '#fff',
              maxWidth: 1500,
              textShadow: heroTextShadow,
              textWrap: 'balance',
              ...clampStyle(tier.maxLines),
            }}
          >
            {d.title}
          </div>
        ) : null}
      </div>
    </div>
  );
};
