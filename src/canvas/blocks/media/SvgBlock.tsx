// SvgBlock — the Tier-3 visual escape hatch. Renders a model-generated SVG illustration when
// no purpose-built component fits (a molecule, a circuit, a custom infographic, a geometric
// figure). The SVG is UNTRUSTED, so it is run through `sanitizeSvg` — a strict, synchronous,
// deny-by-default whitelist sanitizer — before it ever reaches the DOM. Sanitization is
// instant (native parser, zero dependency, no network), so the illustration appears with the
// rest of the canvas instead of after a CDN round-trip. Design tokens resolve via normal CSS
// inheritance, so a sanitized SVG using var(--presence) etc. is automatically light/dark-aware.
import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { richInnerHtml } from '../../../lib/richText';
import { sanitizeSvg } from './sanitizeSvg';
import type { SvgBlockProps } from './types';

type Props = SvgBlockProps & { delay?: number };

export function SvgBlock({
  title,
  icon = 'sparkle',
  iconColor = 'var(--presence)',
  svg,
  caption,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.sparkle;
  // Synchronous + memoized: a given SVG string sanitizes once, instantly. `null` means the
  // input was empty, malformed, or unsafe beyond repair — we show an honest fallback rather
  // than a broken or dangerous render.
  const safe = useMemo(() => sanitizeSvg(svg), [svg]);

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} />
        <span className="svgb-title">{title}</span>
        {/* Transparency marker — this illustration was drawn by the model on the fly, not a
            curated component. Mirrors the "AI image" badge the photo block carries. */}
        <span className="svgb-badge">
          <Icon.sparkle /> Generated
        </span>
      </div>

      {safe === null ? (
        <p className="svgb-err">Couldn’t render this illustration.</p>
      ) : (
        <div className="svgb-wrap">
          <div
            className="svgb-inner"
            role="img"
            aria-label={title}
            // `safe` is the output of sanitizeSvg: a deny-by-default whitelist that removes every
            // script-, load-, and animation-capable element/attribute, so this is XSS-safe.
            dangerouslySetInnerHTML={{ __html: safe }}
          />
        </div>
      )}

      {caption && <p className="svgb-caption">{caption}</p>}
      {safe !== null && (
        <p className="svgb-disclaimer" role="note">
          <Icon.alert aria-hidden="true" />
          <span>
            <strong>AI-generated visual.</strong> It may be inaccurate or entirely wrong, including
            its labels, scale, relationships, or depictions. Verify important details with
            authoritative sources; do not treat it as evidence.
          </span>
        </p>
      )}
      {footer && (
        <div
          className="insight-summary"
          style={{ marginTop: 8 }}
          // The SVG above is sanitised by sanitizeSvg; this footer is a different value from a
          // different place — ordinary model-written prose — and it was riding on that file's
          // reputation rather than being sanitised itself.
          dangerouslySetInnerHTML={richInnerHtml(footer)}
        />
      )}
    </div>
  );
}
