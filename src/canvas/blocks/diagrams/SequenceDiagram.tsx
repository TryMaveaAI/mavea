import { useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { SequenceDiagramProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = SequenceDiagramProps & { delay?: number };

// Geometry in px-like units, so 1 viewBox unit ≈ 1 rendered pixel at natural size. The lanes SPREAD
// to fill the card width (measured below) so a two-actor diagram fills its card instead of being
// scrunched into a narrow strip in the centre — but never wider than LANE_MAX apart (which would
// fling the lifelines absurdly far and leave a message as a lonely long arrow) nor narrower than
// LANE_MIN (which must fit a multi-word actor name). When the natural width can't reach the card
// (few actors, very wide card), the svg's `margin-inline: auto` centres it.
const TOP = 10;
const HEAD_H = 34;
const ROW_H = 38;
const LANE_MIN = 132; // floor: enough horizontal room for a multi-word actor name
const LANE_MAX = 400; // ceiling: past this the lifelines drift too far apart to read as a pair
const BOX_W = 112;
const BOX_H = 26;

// SVG text neither wraps nor clips itself, so a long actor name or message label just
// bleeds past its box / collides with the next lane. Truncate to a conservative
// per-role character budget (derived from the box/gap width at each class's font-size)
// and keep the untruncated string as a native <title> tooltip so nothing is silently lost.
const ACTOR_MAX_CHARS = 16; // .dg-seq-actor: 13px/600, fit inside BOX_W(112) with padding
const PX_PER_CHAR_LBL = 6.4; // .dg-seq-lbl: 12px — rough average glyph advance
const MIN_LBL_CHARS = 8; // floor so adjacent lanes never truncate a label to nothing
// A self-message's loop is a fixed 16px wide regardless of data, so its label gets a fixed
// budget rather than one derived from a (nonexistent) gap between two different lanes.
const SELF_LBL_MAX_CHARS = 12;

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 1).trimEnd() + '…' : text;
}

export function SequenceDiagram({
  title,
  icon = 'share',
  iconColor = 'var(--presence)',
  actors,
  messages,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.share;
  // Per-instance marker id: two sequence diagrams in one answer would otherwise share
  // `dg-seq-arrow`, and if the first unmounts the survivor's arrowheads vanish.
  const arrowId = `dg-seq-arrow-${useId().replace(/:/g, '')}`;
  const arrow = `url(#${arrowId})`;

  // Measure the card so the lanes can spread to fill its width. useLayoutEffect + a ResizeObserver
  // keeps it correct as the card is tiled/resized; the observer is torn down on unmount (no leak).
  const hostRef = useRef<HTMLDivElement>(null);
  const [hostW, setHostW] = useState(0);
  useLayoutEffect(() => {
    const el = hostRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? el.offsetWidth;
      setHostW((prev) => (Math.abs(prev - w) < 1 ? prev : w));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { lanes, width, height } = useMemo(() => {
    const n = Math.max(1, actors.length);
    // Spread the lanes to fill the measured card width, bounded by [LANE_MIN, LANE_MAX]. Before the
    // first measurement (SSR / first paint) fall back to LANE_MIN so the diagram is never blank.
    const laneW = hostW > 0 ? Math.min(LANE_MAX, Math.max(LANE_MIN, hostW / n)) : LANE_MIN;
    const w = n * laneW;
    const laneX = actors.map((_, i) => (i + 0.5) * laneW);
    const map: Record<string, number> = {};
    actors.forEach((a, i) => (map[a.id] = laneX[i]));
    return {
      lanes: { x: laneX, map },
      width: w,
      height: TOP + HEAD_H + messages.length * ROW_H + 14,
    };
  }, [actors, messages.length, hostW]);

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>
      <div className="dg-seq" ref={hostRef}>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="dg-seq-svg"
          style={{ maxWidth: `${width}px` }}
          preserveAspectRatio="xMidYMin meet"
          role="img"
          aria-label={title}
        >
          {/* lifelines */}
          {actors.map((a, i) => (
            <g key={a.id}>
              <line
                x1={lanes.x[i]}
                y1={TOP + HEAD_H}
                x2={lanes.x[i]}
                y2={height - 8}
                className="dg-seq-life"
              />
              <rect
                x={lanes.x[i] - BOX_W / 2}
                y={TOP}
                width={BOX_W}
                height={BOX_H}
                rx={5}
                className="dg-seq-actorbox"
              />
              <text
                x={lanes.x[i]}
                y={TOP + BOX_H / 2 + 4}
                className="dg-seq-actor"
                textAnchor="middle"
              >
                {a.label.length > ACTOR_MAX_CHARS && <title>{a.label}</title>}
                {truncate(a.label, ACTOR_MAX_CHARS)}
              </text>
            </g>
          ))}
          {/* messages */}
          {messages.map((m, i) => {
            const y = TOP + HEAD_H + i * ROW_H + 20;
            const x1 = lanes.map[m.from] ?? 0;
            const x2 = lanes.map[m.to] ?? x1;
            if (m.self) {
              return (
                <g key={i}>
                  <path
                    d={`M ${x1} ${y} h 16 v 12 h -16`}
                    className={'dg-seq-msg' + (m.reply ? ' reply' : '')}
                    fill="none"
                    markerEnd={arrow}
                  />
                  <text x={x1 + 22} y={y - 3} className="dg-seq-lbl" textAnchor="start">
                    {m.label.length > SELF_LBL_MAX_CHARS && <title>{m.label}</title>}
                    {truncate(m.label, SELF_LBL_MAX_CHARS)}
                  </text>
                </g>
              );
            }
            const dir = x2 >= x1 ? 1 : -1;
            // Wider lane gaps (a message spanning several actors) get more room; adjacent
            // lanes get the least — sized off the actual gap, not the fixed demo distance.
            const msgMaxChars = Math.max(
              MIN_LBL_CHARS,
              Math.floor((Math.abs(x2 - x1) - 24) / PX_PER_CHAR_LBL),
            );
            return (
              <g key={i}>
                <line
                  x1={x1}
                  y1={y}
                  x2={x2 - dir * 5}
                  y2={y}
                  className={'dg-seq-msg' + (m.reply ? ' reply' : '')}
                  markerEnd={arrow}
                />
                <text x={(x1 + x2) / 2} y={y - 5} className="dg-seq-lbl" textAnchor="middle">
                  {m.label.length > msgMaxChars && <title>{m.label}</title>}
                  {truncate(m.label, msgMaxChars)}
                </text>
              </g>
            );
          })}
          <defs>
            <marker id={arrowId} markerWidth="7" markerHeight="7" refX="5.5" refY="3" orient="auto">
              <path d="M0,0 L6,3 L0,6 Z" className="dg-seq-arrowhead" />
            </marker>
          </defs>
        </svg>
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
