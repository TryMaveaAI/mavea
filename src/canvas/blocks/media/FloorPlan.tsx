import { type CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { FloorPlanProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = FloorPlanProps & { delay?: number };

// Accent colors for room fills — cycle through a calm palette
const ROOM_FILLS = [
  'rgba(var(--presence-rgb,99,102,241),0.08)',
  'rgba(var(--insight-rgb,16,185,129),0.06)',
  'rgba(var(--warning-rgb,245,158,11),0.06)',
  'rgba(99,102,241,0.04)',
  'rgba(16,185,129,0.04)',
  'rgba(245,158,11,0.04)',
];

// Room labels sit centered in a rect whose width (`room.w`) varies with the plan's own geometry,
// so a single fixed length cutoff either wastes a wide room or overflows a narrow-to-medium one —
// a name like "Living / Dining" at w=25 slips past a "w < 20" gate untouched and bleeds past the
// rect edges. Budget from the rect's own width at the label's actual font-size (bold, ~0.62 ×
// font-size average glyph advance in this viewBox's units) and always keep the untruncated name
// as a native <title> tooltip so it's never silently lost, only visually shortened.
const FP_CHAR_ADVANCE = 0.62;
function truncateRoomName(text: string, boxW: number, fontSize: number): string {
  const max = Math.max(3, Math.floor(boxW / (fontSize * FP_CHAR_ADVANCE)));
  return text.length > max ? text.slice(0, max - 1).trimEnd() + '…' : text;
}

export function FloorPlan({
  title,
  icon = 'layers',
  iconColor = 'var(--presence)',
  rooms,
  scale,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.layers;

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="fp-wrap">
        <svg
          viewBox="0 0 100 100"
          width="100%"
          style={{ display: 'block', borderRadius: 6, overflow: 'hidden' }}
          aria-label={title}
        >
          {/* Background */}
          <rect width="100" height="100" fill="var(--surface-glass, #f8f8f8)" />

          {rooms.map((room, i) => {
            const fill = ROOM_FILLS[i % ROOM_FILLS.length];
            const cx = room.x + room.w / 2;
            const cy = room.y + room.h / 2;
            // Leave a small inset on each side so the label never touches the room's stroke.
            const nameFontSize = Math.min(room.w, room.h) < 14 ? 2.5 : 3;
            const shortName = truncateRoomName(room.name, Math.max(0, room.w - 2), nameFontSize);
            const isTruncated = shortName !== room.name;

            return (
              <g key={i}>
                <rect
                  className="fp-room-rect"
                  x={room.x}
                  y={room.y}
                  width={room.w}
                  height={room.h}
                  fill={fill}
                  stroke="var(--line, #ccc)"
                  strokeWidth="0.8"
                />
                <text
                  className="fp-room-name"
                  x={cx}
                  y={cy - (room.note ? 1.5 : 0)}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={nameFontSize}
                  fontWeight="600"
                  fill="var(--text-primary, #111)"
                >
                  {isTruncated && <title>{room.name}</title>}
                  {shortName}
                </text>
                {room.note && (
                  <text
                    x={cx}
                    y={cy + 4}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize="2"
                    fill="var(--text-muted, #888)"
                  >
                    {room.note}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {scale && <div className="fp-scale">{scale}</div>}

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
