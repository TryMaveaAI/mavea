import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { ProtocolStackProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = ProtocolStackProps & { delay?: number };

// Concentric-encapsulation geometry. The outermost header occupies the full square; each
// subsequent header insets by a fixed band so the payload sits in the centre — the classic
// "headers wrap the data" picture. These are viewBox units (the SVG is square, 100×100).
const ENC_VB = 100;
const ENC_PAD = 4; // outer margin so the outermost border isn't flush to the edge
const BAND_MAX = 13;
const LABEL_H = 11; // vertical room reserved at the top of each band for its label
// Floor for the innermost square. It carries the payload's name — the one thing the figure is
// pointing at — and letting it take an equal share of the half-width alongside the headers left
// the demo's "Your request" reading "Your…" at five nested fields.
const PAYLOAD_MIN = 34;

// Each header's box shrinks with depth (see `encaps` below), but the label font-size is fixed
// per role (.pst-box-lbl / .pst-box-lbl--inner in styles.css) — so a deeply-nested box gives its
// label far less width per character than the outermost one. Left alone, a long header name (or
// a payload label longer than the demo's "Data") overflows the box and bleeds into its neighbour.
// Derive a per-box character budget from the box's own size and truncate to it, the same
// slice-and-ellipsis approach EtymTree uses for its fixed-width boxes; the untruncated text
// survives as a native <title> tooltip so nothing is silently lost.
const LBL_FONT_OUTER = 4.2; // px, viewBox units — must track .pst-box-lbl
const LBL_FONT_INNER = 5; // px, viewBox units — must track .pst-box-lbl--inner
const AVG_CHAR_W = 0.62; // bold sans average glyph width as a fraction of font-size

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, Math.max(1, max - 1)).trimEnd() + '…' : text;
}

function maxCharsFor(boxSize: number, fontSize: number): number {
  return Math.max(2, Math.floor((boxSize * 0.92) / (fontSize * AVG_CHAR_W)));
}

export function ProtocolStack({
  title,
  icon = 'layers',
  iconColor = 'var(--presence)',
  layers,
  packet,
  caption,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] ?? Icon.layers;
  // Hovering a layer band highlights the matching header in the packet view (and vice-versa),
  // so the reader can connect "where a header is added" to "where it sits in the stack".
  const [hot, setHot] = useState<string | null>(null);

  // Compute each header's nested rectangle once. With many headers the inset auto-shrinks so the
  // innermost payload never collapses to nothing; the label height is clamped likewise.
  const encaps = useMemo(() => {
    const fields = packet ?? [];
    const n = fields.length;
    if (n === 0) return null;
    // Half-width budget for the headers alone — what is left once the payload has its floor. The
    // last field is the payload, so n - 1 bands share it.
    const avail = (ENC_VB - ENC_PAD * 2 - PAYLOAD_MIN) / 2;
    const band = Math.min(BAND_MAX, avail / Math.max(1, n - 1));
    const labelH = Math.max(2, Math.min(LABEL_H, band - 2));
    return fields.map((f, i) => {
      const inset = ENC_PAD + i * band;
      const size = Math.max(0, ENC_VB - inset * 2);
      const inner = i === n - 1; // the last field is the payload
      // The innermost box sizes its label off the full box (the payload label centres in the
      // whole square); every other box sizes off the header band's own width, which is what's
      // actually available to the label — both shrink with depth, so the tightest budget always
      // lands on the smallest, most deeply-nested box.
      const maxChars = maxCharsFor(size, inner ? LBL_FONT_INNER : LBL_FONT_OUTER);
      return {
        key: `${f.header}-${i}`,
        header: f.header,
        layer: f.layer,
        x: inset,
        y: inset,
        size,
        labelH,
        inner,
        maxChars,
        depth: i,
      };
    });
  }, [packet]);

  return (
    <div
      className="card reveal dg-card"
      style={{ ['--delay' as string]: (delay ?? 0) + 'ms' } as CSSProperties}
    >
      {title && (
        <div className="card-eyebrow">
          <Ic className="ic" style={{ color: iconColor }} /> {title}
        </div>
      )}

      <div className={'pst-grid' + (encaps ? '' : ' pst-grid--solo')}>
        {/* LEFT — the layered stack, application on top, link/physical at the bottom. */}
        <ol className="pst-stack" aria-label="Protocol layers, top to bottom">
          {layers.map((l, i) => {
            const on = hot === l.name;
            return (
              <li
                key={l.name + i}
                className={'pst-band' + (on ? ' on' : '')}
                style={{ ['--pst-i' as string]: i } as CSSProperties}
                onMouseEnter={() => setHot(l.name)}
                onMouseLeave={() => setHot(null)}
              >
                <span className="pst-band-num">{layers.length - i}</span>
                <div className="pst-band-body">
                  <span className="pst-band-name">{l.name}</span>
                  {l.role && <span className="pst-band-role">{l.role}</span>}
                  {l.protocols && l.protocols.length > 0 && (
                    <span className="pst-chips">
                      {l.protocols.map((p, j) => (
                        <span key={p + j} className="pst-chip">
                          {p}
                        </span>
                      ))}
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ol>

        {/* RIGHT — encapsulation: nested headers wrapping the payload. */}
        {encaps && (
          <figure className="pst-encaps">
            <figcaption className="pst-encaps-cap">Encapsulation</figcaption>
            <svg
              viewBox={`0 0 ${ENC_VB} ${ENC_VB}`}
              className="pst-encaps-svg"
              role="img"
              aria-label="Packet encapsulation: each layer wraps the one inside it"
            >
              {encaps.map((e) => {
                const on = e.layer != null && hot === e.layer;
                return (
                  <g
                    key={e.key}
                    className={'pst-box' + (e.inner ? ' pst-box--inner' : '') + (on ? ' on' : '')}
                    onMouseEnter={() => e.layer && setHot(e.layer)}
                    onMouseLeave={() => setHot(null)}
                  >
                    {/* The tooltip for a truncated header hangs off the box, not its <text>: it
                        would otherwise inherit the label's few-user-unit font-size, and the whole
                        box is a far easier hover target than a handful of tiny glyphs. */}
                    {e.header.length > e.maxChars && <title>{e.header}</title>}
                    <rect x={e.x} y={e.y} width={e.size} height={e.size} rx={2.4} />
                    {/* Header label sits in the top band of each box; the payload label centres. */}
                    <text
                      x={e.x + e.size / 2}
                      y={e.inner ? e.y + e.size / 2 : e.y + e.labelH / 2 + 1}
                      className={e.inner ? 'pst-box-lbl pst-box-lbl--inner' : 'pst-box-lbl'}
                      textAnchor="middle"
                      dominantBaseline="middle"
                    >
                      {truncate(e.header, e.maxChars)}
                    </text>
                  </g>
                );
              })}
            </svg>
            <div className="pst-flow-note">
              <span className="pst-flow-arrow" aria-hidden="true">
                ↓
              </span>
              header added per layer on the way down
            </div>
          </figure>
        )}
      </div>

      {caption && <p className="pst-caption">{caption}</p>}
      {footer && <div className="dg-foot" dangerouslySetInnerHTML={richInnerHtml(footer)} />}
    </div>
  );
}
