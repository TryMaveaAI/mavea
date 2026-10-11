import { useId, type CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { richInnerHtml } from '../../../lib/richText';
import { markupLiteral, trustedHtml, type SanitizedHtml } from '../../../lib/trustedTypes';
import type { SportsPitchProps, SportKind } from './types';
import { nameSpot, playLine, separateTokens, toPitch } from './pitchTokens';
import { useHostWidth } from '../../lib/useBoxSize';

type Props = SportsPitchProps & { delay?: number };

// Baked-in pitch SVG paths and viewBoxes for each sport
const PITCH: Record<SportKind, { viewBox: string; markings: SanitizedHtml; aspectRatio: number }> =
  {
    soccer: {
      viewBox: '0 0 100 65',
      aspectRatio: 65 / 100,
      markings: markupLiteral`
      <rect x="0" y="0" width="100" height="65" fill="var(--sp-soccer)"/>
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
      aspectRatio: 55 / 100,
      markings: markupLiteral`
      <rect x="0" y="0" width="100" height="55" fill="var(--sp-basketball)"/>
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
      aspectRatio: 55 / 100,
      markings: markupLiteral`
      <rect x="0" y="0" width="100" height="55" fill="var(--sp-football)"/>
      <rect x="1" y="1" width="98" height="53" fill="none" stroke="rgba(255,255,255,0.7)" stroke-width="0.6"/>
      <rect x="1" y="1" width="10" height="53" fill="rgba(255,255,255,0.06)"/>
      <rect x="89" y="1" width="10" height="53" fill="rgba(255,255,255,0.06)"/>
      <line x1="11" y1="1" x2="11" y2="54" stroke="rgba(255,255,255,0.35)" stroke-width="0.4"/>
      <line x1="19" y1="1" x2="19" y2="54" stroke="rgba(255,255,255,0.35)" stroke-width="0.4"/>
      <line x1="27" y1="1" x2="27" y2="54" stroke="rgba(255,255,255,0.35)" stroke-width="0.4"/>
      <line x1="35" y1="1" x2="35" y2="54" stroke="rgba(255,255,255,0.35)" stroke-width="0.4"/>
      <line x1="43" y1="1" x2="43" y2="54" stroke="rgba(255,255,255,0.35)" stroke-width="0.4"/>
      <line x1="51" y1="1" x2="51" y2="54" stroke="rgba(255,255,255,0.35)" stroke-width="0.4"/>
      <line x1="59" y1="1" x2="59" y2="54" stroke="rgba(255,255,255,0.35)" stroke-width="0.4"/>
      <line x1="67" y1="1" x2="67" y2="54" stroke="rgba(255,255,255,0.35)" stroke-width="0.4"/>
      <line x1="75" y1="1" x2="75" y2="54" stroke="rgba(255,255,255,0.35)" stroke-width="0.4"/>
      <line x1="83" y1="1" x2="83" y2="54" stroke="rgba(255,255,255,0.35)" stroke-width="0.4"/>
      <line x1="50" y1="1" x2="50" y2="54" stroke="rgba(255,255,255,0.5)" stroke-width="0.6"/>
    `,
    },
    tennis: {
      viewBox: '0 0 100 55',
      aspectRatio: 55 / 100,
      markings: markupLiteral`
      <rect x="0" y="0" width="100" height="55" fill="var(--sp-tennis)"/>
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
      aspectRatio: 90 / 100,
      markings: markupLiteral`
      <rect x="0" y="0" width="100" height="90" fill="var(--sp-baseball)"/>
      <path d="M50 85 L5 85 L5 40 Q50 5 95 40 L95 85 Z" fill="rgba(200,160,80,0.3)" stroke="rgba(255,255,255,0.5)" stroke-width="0.5"/>
      <rect x="42" y="77" width="16" height="8" fill="rgba(200,160,80,0.5)" stroke="rgba(255,255,255,0.5)" stroke-width="0.4"/>
      <path d="M50 80 L75 55 L50 30 L25 55 Z" fill="none" stroke="rgba(255,255,255,0.3)" stroke-width="0.4"/>
      <circle cx="50" cy="56" r="2.4" fill="rgba(200,160,80,0.7)" stroke="rgba(255,255,255,0.4)" stroke-width="0.3"/>
      <rect x="73.2" y="53.2" width="3.6" height="3.6" transform="rotate(45 75 55)" fill="rgba(255,255,255,0.7)"/>
      <rect x="48.2" y="28.2" width="3.6" height="3.6" transform="rotate(45 50 30)" fill="rgba(255,255,255,0.7)"/>
      <rect x="23.2" y="53.2" width="3.6" height="3.6" transform="rotate(45 25 55)" fill="rgba(255,255,255,0.7)"/>
      <path d="M48 78.6 L52 78.6 L52 80.2 L50 82 L48 80.2 Z" fill="rgba(255,255,255,0.8)"/>
    `,
    },
  };

const PLAY_STROKE: Record<string, string> = {
  pass: 'var(--sp-pass)',
  run: 'var(--sp-run)',
  shot: 'var(--sp-shot)',
};

// A position code is sized for its disc: a 2-char code ("GK", "PG") at 2.8, and each extra
// character ("CDM", "ATT") a step smaller so it stays inside — never below the legibility floor.
function positionLabelSize(label: string, floor: number): number {
  const extra = Math.max(0, label.length - 2);
  return Math.max(floor, 2.8 - extra * 0.6);
}

// Player names are author-supplied and can run well past what fits under a marker without
// bleeding into a neighbouring player or off the pitch edge. Budget a character count from the
// name's font size (~0.55 em average glyph advance) and truncate with an ellipsis, keeping the full
// name as a native <title> tooltip so it's never silently lost, only visually shortened.
const SP_NAME_ADVANCE = 0.55;
const SP_NAME_MAX_WIDTH = 22; // viewBox units the name may span, centred under the marker
function truncateName(text: string, fontSize: number): string {
  const max = Math.max(3, Math.floor(SP_NAME_MAX_WIDTH / (fontSize * SP_NAME_ADVANCE)));
  return text.length > max ? text.slice(0, max - 1).trimEnd() + '…' : text;
}

/** The smallest a label may render, in px. The pitch is a 100-unit board stretched to its card,
 *  so on a phone card its authored 2-unit names paint at ~5px; the type grows to hold this floor
 *  instead of the whole pitch being held wide and panned. */
const SP_MIN_PX = 9.5;
const SP_NAME_FS = 2;
const TOKEN_R = 3.5;
/** A disc holds a 3-character code at the floor size. */
const TOKEN_R_PER_FS = 1.6;

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
  const [, , vbW, vbH] = p.viewBox.split(/\s+/).map(Number);
  const pitch = { w: vbW || 100, h: vbH || 100 };
  const [wrapRef, hostW] = useHostWidth<HTMLDivElement>();
  // Viewbox units per rendered px; 0 before the first measurement, which keeps the authored sizes.
  const floor = hostW > 0 ? (pitch.w / hostW) * SP_MIN_PX : 0;
  const nameFs = Math.max(SP_NAME_FS, floor);
  const tokenR = Math.max(TOKEN_R, floor * TOKEN_R_PER_FS);
  /** Centre-to-centre distance two position discs keep, so neighbours never touch. */
  const tokenClear = tokenR * 2 + 1.6;
  const authored = (positions ?? []).map((pos) => ({ x: pos.x, y: pos.y }));
  const placed = separateTokens(
    authored.map((pos) => toPitch(pos.x, pos.y, pitch)),
    tokenClear,
    pitch,
    tokenR,
  );

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="sp-wrap" ref={wrapRef}>
        <svg
          viewBox={p.viewBox}
          width="100%"
          style={{ display: 'block', borderRadius: 6, overflow: 'hidden' }}
          aria-hidden="true"
        >
          {/* Pitch markings */}
          <g dangerouslySetInnerHTML={{ __html: trustedHtml(p.markings) }} />

          {/* Play arrows */}
          {plays?.map((play, i) => {
            const line = playLine(play.from, play.to, authored, placed, pitch, tokenR);
            if (!line) return null;
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
                  {...line}
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
          {positions?.map((pos, i) => {
            const { x, y } = placed[i];
            const name = pos.name ? truncateName(pos.name, nameFs) : '';
            const nameAt = nameSpot(
              placed[i],
              tokenR,
              nameFs,
              name.length * nameFs * SP_NAME_ADVANCE,
              pitch,
            );
            return (
              <g key={i}>
                <circle
                  cx={x}
                  cy={y}
                  r={tokenR}
                  fill="rgba(255,255,255,0.9)"
                  stroke="rgba(0,0,0,0.4)"
                  strokeWidth="0.5"
                />
                <text
                  x={x}
                  y={y + 0.5}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={positionLabelSize(pos.label, floor)}
                  fontWeight="700"
                  fill="var(--sp-ink)"
                >
                  {pos.label}
                  {pos.label.length > 2 && <title>{pos.label}</title>}
                </text>
                {pos.name && (
                  <text
                    x={nameAt.x}
                    y={nameAt.y}
                    textAnchor="middle"
                    fontSize={nameFs}
                    fill="rgba(255,255,255,0.8)"
                  >
                    {name}
                    {pos.name.length > name.length && <title>{pos.name}</title>}
                  </text>
                )}
              </g>
            );
          })}
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
