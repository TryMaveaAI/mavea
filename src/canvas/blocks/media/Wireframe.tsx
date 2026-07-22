// Wireframe — a low-fidelity single-page sketch laid out on a column grid. Each region is a
// grey placeholder whose interior hints at its kind (lorem bars for text, a diagonal-crossed
// box for an image, a pill for a button, faux rows for a list). The layout is COMPUTED from
// the region list: spans are clamped into the grid and a region that would overflow the row
// wraps onto the next one, so the frame always reads as a real page even on loose data.
import type { CSSProperties, ReactNode } from 'react';
import { Icon } from '../../../icons/icons';
import type { WireKind, WireframeProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = WireframeProps & { delay?: number };

/** Default span (in grid columns) and height (in grid rows) per placeholder kind, used when a
 *  region omits its own — a hero is wide and tall, a button narrow and short. Tuned so a
 *  region list with no sizing still lays out like a believable page. */
const WIRE_DEFAULT: Record<WireKind, { col: number; rows: number }> = {
  header: { col: 12, rows: 1 },
  hero: { col: 12, rows: 3 },
  nav: { col: 12, rows: 1 },
  image: { col: 6, rows: 2 },
  text: { col: 6, rows: 2 },
  button: { col: 3, rows: 1 },
  card: { col: 4, rows: 2 },
  list: { col: 6, rows: 2 },
  footer: { col: 12, rows: 1 },
  input: { col: 6, rows: 1 },
};

function clampCol(n: number, cols: number): number {
  return Math.min(cols, Math.max(1, Math.round(n))) || 1;
}

/** The low-fi interior drawn inside each placeholder — pure markup, no per-kind component. */
function wireFill(kind: WireKind): ReactNode {
  switch (kind) {
    case 'header':
    case 'nav':
      // a brand mark on the left, a row of nav links on the right
      return (
        <div className="wf-bar">
          <span className="wf-dot" />
          <span className="wf-spacer" />
          <span className="wf-link" />
          <span className="wf-link" />
          <span className="wf-link" />
        </div>
      );
    case 'hero':
      // a big headline, a sub-line, then a CTA pill
      return (
        <div className="wf-hero">
          <span className="wf-line wf-w70 wf-tall" />
          <span className="wf-line wf-w50" />
          <span className="wf-pill" />
        </div>
      );
    case 'image':
      // a framed box with a corner-to-corner diagonal + a glyph, the universal "image here"
      return (
        <div className="wf-image" aria-hidden>
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="wf-image-x">
            <line x1="0" y1="0" x2="100" y2="100" />
            <line x1="100" y1="0" x2="0" y2="100" />
          </svg>
          <Icon.image className="wf-image-ic" />
        </div>
      );
    case 'text':
      // a stack of lorem bars of varying width
      return (
        <div className="wf-text">
          <span className="wf-line wf-w90" />
          <span className="wf-line wf-w100" />
          <span className="wf-line wf-w80" />
          <span className="wf-line wf-w60" />
        </div>
      );
    case 'button':
      return <span className="wf-pill wf-pill-solid" />;
    case 'card':
      // a thumbnail strip, a title, and two body lines — a feature/product card
      return (
        <div className="wf-card">
          <span className="wf-thumb" />
          <span className="wf-line wf-w70 wf-strong" />
          <span className="wf-line wf-w90" />
          <span className="wf-line wf-w50" />
        </div>
      );
    case 'list':
      return (
        <div className="wf-list">
          {[0, 1, 2].map((i) => (
            <span className="wf-row" key={i}>
              <span className="wf-row-dot" />
              <span className="wf-line wf-w80" />
            </span>
          ))}
        </div>
      );
    case 'footer':
      // three columns of stacked link bars
      return (
        <div className="wf-foot">
          {[0, 1, 2].map((c) => (
            <span className="wf-foot-col" key={c}>
              <span className="wf-line wf-w60 wf-strong" />
              <span className="wf-line wf-w90" />
              <span className="wf-line wf-w70" />
            </span>
          ))}
        </div>
      );
    case 'input':
      // a field with a leading caret line and a trailing affordance
      return (
        <div className="wf-input">
          <span className="wf-line wf-w40" />
          <span className="wf-input-cta" />
        </div>
      );
  }
}

export function Wireframe({
  title,
  icon,
  iconColor = 'var(--presence-soft)',
  regions,
  cols = 12,
  caption,
  footer,
  delay,
}: Props) {
  const grid = clampCol(cols, 12);
  const Ic = (icon && Icon[icon]) || Icon.screen;
  const safe = Array.isArray(regions) ? regions : [];

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay ?? 0) + 'ms' } as CSSProperties}
    >
      {title && (
        <div className="card-eyebrow">
          <Ic className="ic" style={{ color: iconColor }} /> {title}
        </div>
      )}
      <div
        className="wireframe"
        style={{ ['--wf-cols' as string]: grid } as CSSProperties}
        role="img"
        aria-label={title ? title + ' wireframe' : 'page wireframe'}
      >
        {safe.map((r, i) => {
          const def = WIRE_DEFAULT[r.kind] ?? WIRE_DEFAULT.card;
          const span = clampCol(r.col ?? def.col, grid);
          const rows = Math.min(6, Math.max(1, Math.round(r.rows ?? def.rows))) || 1;
          return (
            <div
              className={'wf-region wf-' + r.kind}
              key={i}
              style={
                {
                  gridColumn: 'span ' + span,
                  ['--wf-rows' as string]: rows,
                } as CSSProperties
              }
            >
              <div className="wf-fill">{wireFill(r.kind)}</div>
              {r.label && <span className="wf-label">{r.label}</span>}
            </div>
          );
        })}
      </div>
      {caption && <div className="wf-caption" dangerouslySetInnerHTML={richInnerHtml(caption)} />}
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
