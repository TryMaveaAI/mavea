// Grid of reviewed image tiles; tap a tile to save it to notes.
import type { CSSProperties } from 'react';
import { Icon } from '../icons/icons';
import { toast } from '../lib/toast';
import { safeBlockImageSrc } from '../lib/safeImageUrl';
import { useValidatedImage } from '../hooks/useValidatedImage';
import type { GalleryItem, GalleryProps } from '../data/conversation';

type Props = GalleryProps & { delay?: number };

/** Show the first cleared URL that decodes; otherwise retain the designed placeholder. */
function GalleryTileImage({ item }: { item: GalleryItem }) {
  const reals = [item.src ?? '', ...(item.candidates ?? [])]
    .map((url) => safeBlockImageSrc(url))
    .filter((url): url is string => !!url);
  const fallback = safeBlockImageSrc(item.fallbackSrc);
  const validated = useValidatedImage(reals);
  const shown =
    validated.src ?? (reals.length && validated.state === 'none' ? fallback : undefined);
  if (!shown) return <Icon.image className="img-ph-ic" />;
  return (
    <img
      className="img-real"
      src={shown}
      alt={item.label}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={(e) => {
        // last-ditch: swap to the generated fallback if the proven URL somehow fails at render.
        const img = e.currentTarget;
        if (fallback && img.src !== fallback) img.src = fallback;
      }}
    />
  );
}

export function Gallery({ eyebrow = 'From the web', items, footer, delay }: Props) {
  return (
    <div className="card reveal" style={{ '--delay': (delay || 0) + 'ms' } as CSSProperties}>
      <div className="card-eyebrow">
        <Icon.image className="ic" style={{ color: 'var(--presence-soft)' }} /> {eyebrow}
      </div>
      <div className="gallery">
        {items.map((it, i) => {
          const save = () => toast('Saved “' + it.label + '” to your notes');
          return (
            // A <div> (not <figure>) so the click-to-save role can live on the element itself —
            // <figure> carries an implicit non-interactive role that a11y lint rightly rejects
            // pairing with role="button".
            <div
              className="img-tile"
              key={it.label + i}
              role="button"
              tabIndex={0}
              aria-label={`Save ${it.label} to your notes`}
              onClick={save}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  save();
                }
              }}
              style={
                {
                  '--h1': it.h1 || '#3a4a6e',
                  '--h2': it.h2 || '#1a2236',
                  cursor: 'pointer',
                } as CSSProperties
              }
            >
              <span className="img-ph">
                <GalleryTileImage item={it} />
                {it.tag && <span className="img-tag">{it.tag}</span>}
                {it.source && <span className="img-src">{it.source}</span>}
              </span>
              <span className="img-cap">{it.label}</span>
            </div>
          );
        })}
      </div>
      {footer && (
        <div className="insight-summary" style={{ marginTop: 12 }}>
          {footer}
        </div>
      )}
    </div>
  );
}
