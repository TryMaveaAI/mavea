import { useEffect, type CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { useValidatedImage } from '../../../hooks/useValidatedImage';
import type { PhotoProps } from './types';

type Props = PhotoProps & {
  delay?: number;
  /** This block's id + a channel to drop it from the canvas (grid reflows) — supplied by the
   *  media registry entry. Used only for the "no image, no text" case below. */
  blockId?: string;
  onUnrenderable?: (id: string) => void;
};

// Renders a reviewed image. URL clearance happens before this component; the load probe only
// checks availability and decoding, never licensing. Lazy + async-decoded so it does not block the
// canvas reveal.
//
// When EVERY candidate fails to decode (a 404, hotlink block, or hallucinated URL), we NEVER show a
// broken-image placeholder — that reads as an error the user can't act on. Instead the block
// degrades to a clean caption card built from its own text (the same graceful-fallback contract the
// sibling media blocks honor). If it has no text to stand on either, it removes itself so the grid
// closes the gap rather than leaving an empty tile.
export function Photo({
  title,
  icon = 'image',
  iconColor = 'var(--presence)',
  src,
  candidates,
  alt,
  caption,
  footer,
  delay,
  blockId,
  onUnrenderable,
}: Props) {
  const Ic = Icon[icon] || Icon.image;
  // Validate `src` first (preference), then the model's extra candidates.
  const validated = useValidatedImage([src, ...(candidates ?? [])]);
  const state =
    validated.state === 'checking' ? 'loading' : validated.state === 'ready' ? 'ready' : 'error';
  const describe = alt || caption || title || 'Photograph';
  // The text this block can stand on if the image never loads. `title` renders as the eyebrow;
  // caption/footer as the body. A photo with none of these AND a dead image has nothing to show.
  const body = footer || caption;
  const failed = state === 'error';
  const hasText = !!(title || body || alt);

  // No image and no text → drop the block so the grid reflows (never an empty/placeholder tile).
  // Runs in an effect (not during render) so it's a legal state update; the id-guarded Set in
  // TopicCanvas makes it fire once. Falls back to rendering nothing if there's no drop channel.
  useEffect(() => {
    if (failed && !hasText && blockId) onUnrenderable?.(blockId);
  }, [failed, hasText, blockId, onUnrenderable]);
  if (failed && !hasText) return null;

  const style = { ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties;

  // Degraded card: no image box, no broken glyph — just the block's real text, so a dead photo
  // reads as an intentional captioned note rather than a failure.
  if (failed) {
    return (
      <div className="card reveal me-photo-card" style={style}>
        {title && (
          <div className="card-eyebrow">
            <Ic className="ic" style={{ color: iconColor }} /> {title}
          </div>
        )}
        <div className="insight-summary">{body || describe}</div>
      </div>
    );
  }

  return (
    <div className="card reveal" style={style}>
      {title && (
        <div className="card-eyebrow">
          <Ic className="ic" style={{ color: iconColor }} /> {title}
        </div>
      )}

      <div className={'me-photo' + (state === 'ready' ? ' ready' : '')}>
        {validated.src ? (
          // Already proven to load (the probe warmed the cache), so this <img> hits cache.
          <img
            className="me-photo-img"
            src={validated.src}
            alt={describe}
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
          />
        ) : null}
        {state === 'loading' && <div className="me-photo-shimmer" aria-hidden="true" />}
      </div>

      {body && (
        <div className="insight-summary" style={{ marginTop: 10 }}>
          {body}
        </div>
      )}
    </div>
  );
}
