// A conceptmap as a night-sky constellation: a bright central star (the center idea) wired to the
// surrounding ideas by faint lines, the whole field gently twinkling on the dark wash.
import type { SlideProps } from '../types';
import { centeredLabelWidth, estWidth, fitLabel } from '../svgLabel';

const STAR = [
  'var(--reel-orb-1)',
  'var(--reel-accent-2)',
  'var(--reel-accent)',
  'var(--reel-orb-2)',
  'var(--reel-orb-1)',
];

const VIEW_MIN_X = -46;
const VIEW_MAX_X = 346;
const VIEW_MIN_Y = 0;
const GLOW_GAP = 9;
const CENTER_PAD_X = 10;

export function ConstellationSlide({ slots }: SlideProps<'conceptmap'>) {
  const nodes = slots.nodes.slice(0, 5);
  const cx = 150;
  const cy = 110;
  const placed = nodes.map((n, i) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / Math.max(1, nodes.length);
    return { ...n, x: cx + 116 * Math.cos(a), y: cy + 78 * Math.sin(a) };
  });
  // A word-count budget doesn't guarantee a pixel fit — the center label sets its own pill size from
  // its ACTUAL estimated width, so a 16-char label gets a pill wide enough to hold it instead of the
  // old fixed 34px-diameter circle it could never have read inside.
  const centerFit = fitLabel(slots.center, centeredLabelWidth(cx, VIEW_MIN_X, VIEW_MAX_X));
  const centerLineHeight = centerFit.size * 1.15;
  const centerLongest = centerFit.lines.reduce((a, b) => (b.length > a.length ? b : a), '');
  const centerRx = Math.max(17, estWidth(centerLongest, centerFit.size) / 2 + CENTER_PAD_X);
  const centerRy = Math.max(17, (centerLineHeight * centerFit.lines.length) / 2 + 6);
  return (
    <div style={{ width: 'calc(var(--rw) * 96)', maxWidth: '94%' }}>
      <style>{`@keyframes cst-tw{0%,100%{opacity:.55;transform:scale(.85)}50%{opacity:1;transform:scale(1)}}`}</style>
      {/* Side-padded viewBox + clip so a wide label centred on an edge star stays in the box instead of
          bleeding past the card edge (SVG paint overflow is invisible to FitScale's measure). The
          fitLabel calls above/below size every label to that same box, so this clip stays the
          last-resort backstop it was always meant to be, not the thing actually doing the work. */}
      <svg viewBox="-46 0 392 220" style={{ width: '100%', height: 'auto', overflow: 'hidden' }}>
        {placed.map((n, i) => (
          <line
            key={`l${i}`}
            x1={cx}
            y1={cy}
            x2={n.x}
            y2={n.y}
            stroke="var(--reel-accent)"
            strokeWidth="1.2"
            strokeOpacity="0.35"
            pathLength={1}
            strokeDasharray={1}
            style={{
              ['--len' as string]: 1,
              animation: `reel-draw 0.8s ease-out ${i * 0.1}s both`,
            }}
          />
        ))}
        {placed.map((n, i) => {
          const above = n.y < cy;
          const { lines, size } = fitLabel(
            n.label,
            centeredLabelWidth(n.x, VIEW_MIN_X, VIEW_MAX_X),
          );
          const lineHeight = size * 1.15;
          const baseY = above ? n.y - 14 : n.y + 22;
          // A node near the top of the ring, wearing a wrapped two-line label, can push its first
          // line's baseline above the viewBox entirely — clamp it down so the label always stays
          // in-frame, at the cost of sitting a touch closer to its node in that one edge case.
          const rawStartY = above ? baseY - (lines.length - 1) * lineHeight : baseY;
          const startY = above ? Math.max(rawStartY, VIEW_MIN_Y + size * 1.05) : rawStartY;
          return (
            <g
              key={`n${i}`}
              style={{
                transformOrigin: `${n.x}px ${n.y}px`,
                animation: `cst-tw ${3 + i * 0.4}s ease-in-out ${i * 0.2}s infinite`,
              }}
            >
              <circle
                cx={n.x}
                cy={n.y}
                r="9"
                fill="none"
                stroke={STAR[i % STAR.length]}
                strokeOpacity="0.3"
              />
              <circle cx={n.x} cy={n.y} r="4.5" fill={STAR[i % STAR.length]} />
              <text
                x={n.x}
                textAnchor="middle"
                style={{ font: `600 ${size}px var(--reel-sans)`, fill: 'var(--reel-ink)' }}
              >
                {lines.map((line, li) => (
                  <tspan key={li} x={n.x} y={startY + li * lineHeight}>
                    {line}
                  </tspan>
                ))}
              </text>
            </g>
          );
        })}
        <ellipse
          cx={cx}
          cy={cy}
          rx={centerRx + GLOW_GAP}
          ry={centerRy + GLOW_GAP}
          fill="var(--reel-accent)"
          opacity="0.18"
        />
        <ellipse cx={cx} cy={cy} rx={centerRx} ry={centerRy} fill="var(--reel-accent)" />
        <text
          x={cx}
          textAnchor="middle"
          style={{ font: `700 ${centerFit.size}px var(--reel-sans)`, fill: '#fff' }}
        >
          {centerFit.lines.map((line, li) => (
            <tspan
              key={li}
              x={cx}
              y={cy + 4 + (li - (centerFit.lines.length - 1) / 2) * centerLineHeight}
            >
              {line}
            </tspan>
          ))}
        </text>
      </svg>
    </div>
  );
}
