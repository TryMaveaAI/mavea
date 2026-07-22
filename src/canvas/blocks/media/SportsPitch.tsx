import { useId, type CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { richInnerHtml } from '../../../lib/richText';
import type { SportsPitchProps, SportKind } from './types';

type Props = SportsPitchProps & { delay?: number };

// Baked-in pitch SVG paths and viewBoxes for each sport
const PITCH: Record<
  SportKind,
  { viewBox: string; bg: string; markings: string; aspectRatio: number }
> = {
  soccer: {
    viewBox: '0 0 100 65',
    bg: '#2d7a3a',
    aspectRatio: 65 / 100,
    markings: `
      <rect x="0" y="0" width="100" height="65" fill="#2d7a3a"/>
      <rect x="1" y="1" width="98" height="63" fill="none" stroke="rgba(255,255,255,0.7)" stroke-width="0.6"/>
      <line x1="50" y1="1" x2="50" y2="64" stroke="rgba(255,255,255,0.5)" stroke-width="0.5"/>
      <circle cx="50" cy="32.5" r="9.15" fill="none" stroke="rgba(255,255,255,0.5)" stroke-width="0.5"/>
      <circle cx="50" cy="32.5" r="0.5" fill="rgba(255,255,255,0.7)"/>
      <rect x="1" y="20.25" width="16" height="24.5" fill="none" stroke="rgba(255,255,255,0.5)" stroke-width="0.5"/>
      <rect x="83" y="20.25" width="16" height="24.5" fill="none" stroke="rgba(255,255,255,0.5)" stroke-width="0.5"/>
      <rect x="1" y="26.5" width="5.5" height="12" fill="none" stroke="rgba(255,255,255,0.4)" stroke-width="0.4"/>
      <rect x="93.5" y="26.5" width="5.5" height="12" fill="none" stroke="rgba(255,255,255,0.4)" stroke-width="0.4"/>
    `,
  },
  basketball: {
    viewBox: '0 0 100 55',
    bg: '#c45c2a',
    aspectRatio: 55 / 100,
    markings: `
      <rect x="0" y="0" width="100" height="55" fill="#c45c2a"/>
      <rect x="1" y="1" width="98" height="53" fill="none" stroke="rgba(255,255,255,0.7)" stroke-width="0.6"/>
      <line x1="50" y1="1" x2="50" y2="54" stroke="rgba(255,255,255,0.5)" stroke-width="0.5"/>
      <circle cx="50" cy="27.5" r="6" fill="none" stroke="rgba(255,255,255,0.5)" stroke-width="0.5"/>
      <circle cx="50" cy="27.5" r="0.5" fill="rgba(255,255,255,0.7)"/>
      <rect x="1" y="12" width="19" height="31" fill="none" stroke="rgba(255,255,255,0.5)" stroke-width="0.5"/>
      <rect x="80" y="12" width="19" height="31" fill="none" stroke="rgba(255,255,255,0.5)" stroke-width="0.5"/>
      <circle cx="19" cy="27.5" r="6" fill="none" stroke="rgba(255,255,255,0.4)" stroke-width="0.4" stroke-dasharray="2,2"/>
      <circle cx="81" cy="27.5" r="6" fill="none" stroke="rgba(255,255,255,0.4)" stroke-width="0.4" stroke-dasharray="2,2"/>
    `,
  },
  football: {
    viewBox: '0 0 100 55',
    bg: '#3d7a44',
    aspectRatio: 55 / 100,
    markings: `
      <rect x="0" y="0" width="100" height="55" fill="#3d7a44"/>
      <rect x="1" y="1" width="98" height="53" fill="none" stroke="rgba(255,255,255,0.7)" stroke-width="0.6"/>
      <rect x="1" y="1" width="10" height="53" fill="rgba(255,255,255,0.06)"/>
      <rect x="89" y="1" width="10" height="53" fill="rgba(255,255,255,0.06)"/>
      ${Array.from({ length: 10 }, (_, i) => `<line x1="${11 + i * 8}" y1="1" x2="${11 + i * 8}" y2="54" stroke="rgba(255,255,255,0.35)" stroke-width="0.4"/>`).join('')}
      <line x1="50" y1="1" x2="50" y2="54" stroke="rgba(255,255,255,0.5)" stroke-width="0.6"/>
    `,
  },
  tennis: {
    viewBox: '0 0 100 55',
    bg: '#6aaa55',
    aspectRatio: 55 / 100,
    markings: `
      <rect x="0" y="0" width="100" height="55" fill="#6aaa55"/>
      <rect x="5" y="5" width="90" height="45" fill="none" stroke="rgba(255,255,255,0.8)" stroke-width="0.7"/>
      <line x1="50" y1="5" x2="50" y2="50" stroke="rgba(255,255,255,0.7)" stroke-width="0.6"/>
      <line x1="5" y1="27.5" x2="95" y2="27.5" stroke="rgba(255,255,255,0.7)" stroke-width="0.6"/>
      <rect x="5" y="13.5" width="90" height="28" fill="none" stroke="rgba(255,255,255,0.5)" stroke-width="0.4"/>
      <line x1="50" y1="1" x2="50" y2="5" stroke="rgba(255,255,255,0.7)" stroke-width="0.6"/>
      <line x1="50" y1="50" x2="50" y2="54" stroke="rgba(255,255,255,0.7)" stroke-width="0.6"/>
    `,
  },
  baseball: {
    viewBox: '0 0 100 90',
    bg: '#5a8a3a',
    aspectRatio: 90 / 100,
    markings: `
      <rect x="0" y="0" width="100" height="90" fill="#5a8a3a"/>
      <path d="M50 85 L5 85 L5 40 Q50 5 95 40 L95 85 Z" fill="rgba(200,160,80,0.3)" stroke="rgba(255,255,255,0.5)" stroke-width="0.5"/>
      <rect x="42" y="77" width="16" height="8" fill="rgba(200,160,80,0.5)" stroke="rgba(255,255,255,0.5)" stroke-width="0.4"/>
      <circle cx="50" cy="50" r="3" fill="rgba(255,255,255,0.6)"/>
      <circle cx="20" cy="60" r="3" fill="rgba(255,255,255,0.6)"/>
      <circle cx="80" cy="60" r="3" fill="rgba(255,255,255,0.6)"/>
      <circle cx="50" cy="30" r="3" fill="rgba(255,255,255,0.6)"/>
      <line x1="50" y1="50" x2="20" y2="60" stroke="rgba(255,255,255,0.3)" stroke-width="0.4"/>
      <line x1="20" y1="60" x2="50" y2="30" stroke="rgba(255,255,255,0.3)" stroke-width="0.4"/>
      <line x1="50" y1="30" x2="80" y2="60" stroke="rgba(255,255,255,0.3)" stroke-width="0.4"/>
      <line x1="80" y1="60" x2="50" y2="50" stroke="rgba(255,255,255,0.3)" stroke-width="0.4"/>
    `,
  },
};

const PLAY_STROKE: Record<string, string> = {
  pass: '#fff',
  run: '#ffdd55',
  shot: '#ff6644',
};

// The position marker is a fixed r=3.5 circle, so a 2-char code ("GK", "PG") is the only length
// it was ever sized for. A 3-char code (e.g. "CDM", "ATT") at the same 2.8 font-size overruns the
// disc, so scale the size down per extra character — still centred, just smaller.
function positionLabelSize(label: string): number {
  const extra = Math.max(0, label.length - 2);
  return Math.max(1.6, 2.8 - extra * 0.6);
}

// Player names are author-supplied and can run well past what fits under a marker without
// bleeding into a neighbouring player or off the pitch edge — the same overrun the TamSam/Treemap
// charts hit with long labels. Budget a character count from the .sp-name font-size (2px, ~1.1px
// average glyph advance) and truncate with an ellipsis, keeping the full name as a native
// <title> tooltip so it's never silently lost, only visually shortened.
const SP_NAME_CHAR_W = 1.1;
const SP_NAME_MAX_WIDTH = 22; // viewBox units the name may span, centred under the marker
function truncateName(text: string): string {
  const max = Math.max(3, Math.floor(SP_NAME_MAX_WIDTH / SP_NAME_CHAR_W));
  return text.length > max ? text.slice(0, max - 1).trimEnd() + '…' : text;
}

export function SportsPitch({
  title,
  icon = 'chart',
  iconColor = 'var(--presence)',
  sport,
  positions,
  plays,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.chart;
  // Per-instance prefix so two pitches in one answer don't both define `sp-arr-0`, `sp-arr-1`…
  const uid = useId().replace(/:/g, '');
  const p = PITCH[sport] ?? PITCH.soccer;

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="sp-wrap">
        <svg
          viewBox={p.viewBox}
          width="100%"
          style={{ display: 'block', borderRadius: 6, overflow: 'hidden' }}
          aria-hidden="true"
        >
          {/* Pitch markings */}
          <g dangerouslySetInnerHTML={{ __html: p.markings }} />

          {/* Play arrows */}
          {plays?.map((play, i) => {
            const [fx, fy] = play.from;
            const [tx, ty] = play.to;
            const color = PLAY_STROKE[play.kind ?? 'pass'];
            const dashed = play.kind === 'run' ? '2,2' : undefined;
            const sw = play.kind === 'shot' ? 1.2 : 0.8;
            return (
              <g key={i}>
                <defs>
                  <marker
                    id={`sp-arr-${uid}-${i}`}
                    markerWidth="4"
                    markerHeight="4"
                    refX="3"
                    refY="2"
                    orient="auto"
                  >
                    <path d="M0,0 L0,4 L4,2 Z" fill={color} />
                  </marker>
                </defs>
                <line
                  x1={fx}
                  y1={fy}
                  x2={tx}
                  y2={ty}
                  stroke={color}
                  strokeWidth={sw}
                  strokeDasharray={dashed}
                  markerEnd={`url(#sp-arr-${uid}-${i})`}
                  strokeOpacity={0.85}
                />
              </g>
            );
          })}

          {/* Positions */}
          {positions?.map((pos, i) => (
            <g key={i}>
              <circle
                cx={pos.x}
                cy={pos.y}
                r="3.5"
                fill="rgba(255,255,255,0.9)"
                stroke="rgba(0,0,0,0.4)"
                strokeWidth="0.5"
              />
              <text
                x={pos.x}
                y={pos.y + 0.5}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={positionLabelSize(pos.label)}
                fontWeight="700"
                fill="#1a1a1a"
              >
                {pos.label}
                {pos.label.length > 2 && <title>{pos.label}</title>}
              </text>
              {pos.name && (
                <text
                  x={pos.x}
                  y={pos.y + 6}
                  textAnchor="middle"
                  fontSize="2"
                  fill="rgba(255,255,255,0.8)"
                >
                  {truncateName(pos.name)}
                  {pos.name.length > truncateName(pos.name).length && <title>{pos.name}</title>}
                </text>
              )}
            </g>
          ))}
        </svg>
      </div>

      {footer && (
        <div
          className="insight-summary"
          style={{ marginTop: 12 }}
          // The footer is model-written, like every other block's, and every other block runs it
          // through the sanitiser. This one was passing it raw — safe today only because the schema
          // happens to neutralise tags for this type by default, which is protection by accident and
          // one RAW_TEXT_PROPS entry away from being stored XSS.
          dangerouslySetInnerHTML={richInnerHtml(footer)}
        />
      )}
    </div>
  );
}
