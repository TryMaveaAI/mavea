// Finishes for structure: a concept graph (node–link), a technical blueprint (equation + vector
// sketch), and a transit-map of steps/milestones. Each draws its lines in with the shared stroke
// animation. SVG keeps geometry crisp at any export size.
import type { CSSProperties } from 'react';
import type { SlideProps } from './types';
import { Card } from './primitives';
import { fitText, BODY_TIERS, HERO_TIERS } from './fitText';
import { centeredLabelWidth, estWidth, fitLabel } from './svgLabel';

const SERIES = [
  'var(--reel-orb-1)',
  'var(--reel-accent-2)',
  'var(--reel-accent)',
  'var(--reel-orb-2)',
];
const dim: CSSProperties = { color: 'color-mix(in oklab, var(--reel-ink) 64%, transparent)' };

const GRAPH_VIEW_MIN_X = -46;
const GRAPH_VIEW_MAX_X = 346;
const GRAPH_CENTER_PAD_X = 10;

/** The clean, canonical "concept" finish — a headline + subtitle in the glass card. The flashier
 *  concept finishes (neon, glow, cosmic…) are remixable alternates for this same content. */
export function ConceptSlide({ slots }: SlideProps<'concept'>) {
  // Headline and subtitle size by length, so a bridged quote re-sets as a tighter block instead of
  // towering one word per line in the card.
  const head = fitText(slots.title, HERO_TIERS);
  const sub = slots.subtitle ? fitText(slots.subtitle, BODY_TIERS) : undefined;
  return (
    <Card kicker={slots.tag || 'Concept'}>
      <div
        data-fit-tier={head.tier}
        style={{
          fontWeight: 700,
          fontFamily: 'var(--reel-sans)',
          letterSpacing: '-0.02em',
          color: 'var(--reel-ink)',
          marginTop: 'calc(var(--ru) * 2)',
          ...head.style,
        }}
      >
        {slots.title}
      </div>
      {slots.subtitle && sub && (
        <div
          data-fit-tier={sub.tier}
          style={{
            fontWeight: 500,
            fontFamily: 'var(--reel-sans)',
            marginTop: 'calc(var(--ru) * 2)',
            ...dim,
            ...sub.style,
          }}
        >
          {slots.subtitle}
        </div>
      )}
    </Card>
  );
}

export function KnowledgeGraphSlide({ slots }: SlideProps<'conceptmap'>) {
  const nodes = slots.nodes.slice(0, 5);
  const cx = 150;
  const cy = 150;
  const radius = 108;
  const placed = nodes.map((n, i) => {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / Math.max(1, nodes.length);
    return { ...n, x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) };
  });
  // A word-count budget doesn't guarantee a pixel fit — the center label sets its own circle size from
  // its ACTUAL estimated width, so a 16-char label gets room to hold it instead of the old fixed r=30.
  const centerFit = fitLabel(
    slots.center,
    centeredLabelWidth(cx, GRAPH_VIEW_MIN_X, GRAPH_VIEW_MAX_X),
  );
  const centerLineHeight = centerFit.size * 1.15;
  const centerLongest = centerFit.lines.reduce((a, b) => (b.length > a.length ? b : a), '');
  const centerRx = Math.max(30, estWidth(centerLongest, centerFit.size) / 2 + GRAPH_CENTER_PAD_X);
  const centerRy = Math.max(30, (centerLineHeight * centerFit.lines.length) / 2 + 8);
  return (
    <Card kicker="How it connects">
      <div style={{ height: 'calc(var(--ru) * 46)', marginTop: 'calc(var(--ru) * 1.6)' }}>
        {/* Pad the viewBox sideways so a wide (≤18-char) label centred on the leftmost/rightmost node
            stays inside the box, and clip as a backstop — the fitLabel calls below size every label to
            that same box, so this clip stays the last-resort backstop, not the thing doing the work. */}
        <svg viewBox="-46 0 392 300" style={{ width: '100%', height: '100%', overflow: 'hidden' }}>
          {placed.map((n, i) => (
            <line
              key={`e${i}`}
              x1={cx}
              y1={cy}
              x2={n.x}
              y2={n.y}
              stroke="var(--reel-accent)"
              strokeWidth="2"
              strokeOpacity="0.5"
              pathLength={1}
              strokeDasharray={1}
              style={{
                ['--len' as string]: 1,
                animation: `reel-draw 0.7s ease-out ${i * 0.12}s both`,
              }}
            />
          ))}
          {placed.map((n, i) => {
            const above = n.y < cy;
            const { lines, size } = fitLabel(
              n.label,
              centeredLabelWidth(n.x, GRAPH_VIEW_MIN_X, GRAPH_VIEW_MAX_X),
            );
            const lineHeight = size * 1.15;
            const baseY = above ? n.y - 12 : n.y + 20;
            const startY = above ? baseY - (lines.length - 1) * lineHeight : baseY;
            return (
              <g
                key={`n${i}`}
                style={{ animation: `reel-pop 0.5s ease-out ${0.3 + i * 0.12}s both` }}
              >
                <circle cx={n.x} cy={n.y} r="7" fill={SERIES[i % SERIES.length]} />
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
    </Card>
  );
}

export function BlueprintSlide({ slots }: SlideProps<'diagram'>) {
  const v = slots.vectors?.slice(0, 2) ?? [];
  // The note is free prose (up to ~80 chars) — the tier reflows a long caption under the sketch
  // instead of letting a fixed size stretch the card.
  const note = slots.note ? fitText(slots.note, BODY_TIERS) : undefined;
  return (
    <Card kicker={slots.label}>
      <div
        style={{
          position: 'relative',
          height: 'calc(var(--ru) * 36)',
          marginTop: 'calc(var(--ru) * 2)',
          borderRadius: 'calc(var(--ru) * 2)',
          backgroundImage:
            'linear-gradient(color-mix(in oklab, var(--reel-accent) 14%, transparent) 1px, transparent 1px), linear-gradient(90deg, color-mix(in oklab, var(--reel-accent) 14%, transparent) 1px, transparent 1px)',
          backgroundSize: '8% 14%',
        }}
      >
        <svg viewBox="0 0 200 150" style={{ width: '100%', height: '100%', overflow: 'visible' }}>
          <defs>
            <marker
              id="reel-arrow"
              markerWidth="8"
              markerHeight="8"
              refX="6"
              refY="4"
              orient="auto"
            >
              <path d="M0,0 L8,4 L0,8 Z" fill="var(--reel-accent)" />
            </marker>
          </defs>
          <line
            x1="30"
            y1="120"
            x2="120"
            y2="60"
            stroke="var(--reel-accent)"
            strokeWidth="3"
            markerEnd="url(#reel-arrow)"
            pathLength={1}
            strokeDasharray={1}
            style={{ ['--len' as string]: 1, animation: 'reel-draw 0.8s ease-out 0.2s both' }}
          />
          <line
            x1="30"
            y1="120"
            x2="170"
            y2="35"
            stroke="var(--reel-accent-2)"
            strokeWidth="3"
            markerEnd="url(#reel-arrow)"
            pathLength={1}
            strokeDasharray={1}
            style={{ ['--len' as string]: 1, animation: 'reel-draw 0.8s ease-out 0.7s both' }}
          />
          {v[0] && (
            <text
              x="118"
              y="56"
              style={{ font: '700 12px var(--reel-mono)', fill: 'var(--reel-ink)' }}
            >
              {v[0].label}
            </text>
          )}
          {v[1] && (
            <text
              x="168"
              y="30"
              style={{ font: '700 12px var(--reel-mono)', fill: 'var(--reel-ink)' }}
            >
              {v[1].label}
            </text>
          )}
        </svg>
      </div>
      {slots.equation && (
        <div
          style={{
            font: '600 calc(var(--ru) * 4.4)/1.2 var(--reel-mono)',
            color: 'var(--reel-ink)',
            marginTop: 'calc(var(--ru) * 2.4)',
            textAlign: 'center',
          }}
        >
          {slots.equation}
        </div>
      )}
      {slots.note && note && (
        <div
          data-fit-tier={note.tier}
          style={{
            fontWeight: 500,
            fontFamily: 'var(--reel-sans)',
            marginTop: 'calc(var(--ru) * 1.6)',
            ...dim,
            ...note.style,
          }}
        >
          {slots.note}
        </div>
      )}
    </Card>
  );
}

export function StepsSlide({ slots }: SlideProps<'steps'>) {
  const stops = slots.stops.slice(0, 5);
  return (
    <Card kicker="The path">
      {/* The line sits behind the dots; the dots are in-flow so labels always clear them. */}
      <div style={{ position: 'relative', marginTop: 'calc(var(--ru) * 2.4)' }}>
        <span
          style={{
            position: 'absolute',
            left: 'calc(var(--ru) * 1.35)',
            top: 'calc(var(--ru) * 2)',
            bottom: 'calc(var(--ru) * 2)',
            width: 'calc(var(--ru) * 0.7)',
            borderRadius: 999,
            background: 'linear-gradient(var(--reel-accent), var(--reel-accent-2))',
          }}
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'calc(var(--ru) * 3)' }}>
          {stops.map((s, i) => {
            const done = s.state === 'done';
            const active = s.state === 'active';
            return (
              <div
                key={i}
                style={{
                  position: 'relative',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'calc(var(--rw) * 3.4)',
                  animation: `reel-rise 0.5s ease-out ${i * 0.12}s both`,
                }}
              >
                <span
                  style={{
                    flexShrink: 0,
                    width: 'calc(var(--ru) * 3.4)',
                    height: 'calc(var(--ru) * 3.4)',
                    borderRadius: '50%',
                    background: done || active ? 'var(--reel-accent)' : 'var(--reel-bg)',
                    border: `calc(var(--ru) * 0.6) solid ${active ? 'var(--reel-accent-2)' : 'var(--reel-accent)'}`,
                    boxSizing: 'border-box',
                  }}
                />
                <span
                  style={{
                    minWidth: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    font: '600 calc(var(--ru) * 3.2)/1.2 var(--reel-sans)',
                    color: done ? dim.color : 'var(--reel-ink)',
                    textDecoration: done ? 'line-through' : 'none',
                  }}
                >
                  {s.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}
