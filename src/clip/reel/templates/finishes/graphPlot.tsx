// A textbook-clean coordinate plot: a light grid box with centered X/Y axes, two labeled vectors
// drawn from the origin, the equation set big in mono underneath, and the note as a quiet caption.
// The vector strokes re-trace on a gentle loop (gp-trace) so the plot reads as "live" without noise.
import type { CSSProperties } from 'react';
import type { SlideProps } from '../types';
import { Card } from '../primitives';
import { fitText, BODY_TIERS } from '../fitText';
import { edgeLabelWidth, fitLabel } from '../svgLabel';

const dim: CSSProperties = { color: 'color-mix(in oklab, var(--reel-ink) 64%, transparent)' };

// Two vector heads in plot coords (origin is the box centre, 100,75). One leans up-right, one steeper.
const HEADS = [
  { x: 168, y: 30, color: 'var(--reel-accent)', lx: 170, ly: 24, anchor: 'end' as const },
  { x: 64, y: 16, color: 'var(--reel-accent-2)', lx: 36, ly: 12, anchor: 'start' as const },
] as const;

const PLOT_VIEW_MIN_X = 0;
const PLOT_VIEW_MAX_X = 200;

export function GraphPlotSlide({ slots }: SlideProps<'diagram'>) {
  const vectors = slots.vectors?.slice(0, 2) ?? [];
  // The note runs to ~80 chars — set on the body ramp it wraps as a caption instead of truncating
  // mid-thought on one line.
  const note = slots.note ? fitText(slots.note, BODY_TIERS) : undefined;
  return (
    <Card kicker={slots.label}>
      <style>{`@keyframes gp-trace{0%{stroke-dashoffset:1}55%,100%{stroke-dashoffset:0}}`}</style>
      <div
        style={{
          marginTop: 'calc(var(--ru) * 2)',
          borderRadius: 'calc(var(--ru) * 2)',
          overflow: 'hidden',
        }}
      >
        <svg
          viewBox="0 0 200 150"
          style={{ width: '100%', height: 'calc(var(--ru) * 36)', display: 'block' }}
        >
          <defs>
            <marker
              id="gp-tip"
              markerWidth="7"
              markerHeight="7"
              refX="5.4"
              refY="3.5"
              orient="auto"
            >
              <path d="M0,0 L7,3.5 L0,7 Z" fill="context-stroke" />
            </marker>
          </defs>
          {/* Light grid lines every 20 units — the textbook graph paper. */}
          {[20, 40, 60, 80, 100, 120, 140, 160, 180].map((x) => (
            <line
              key={`c${x}`}
              x1={x}
              y1={6}
              x2={x}
              y2={144}
              stroke="color-mix(in oklab, var(--reel-ink) 8%, transparent)"
              strokeWidth={0.6}
            />
          ))}
          {[15, 35, 55, 95, 115, 135].map((y) => (
            <line
              key={`r${y}`}
              x1={8}
              y1={y}
              x2={192}
              y2={y}
              stroke="color-mix(in oklab, var(--reel-ink) 8%, transparent)"
              strokeWidth={0.6}
            />
          ))}
          {/* Axes through the centred origin. */}
          <line
            x1={8}
            y1={75}
            x2={192}
            y2={75}
            stroke="color-mix(in oklab, var(--reel-ink) 34%, transparent)"
            strokeWidth={1.2}
          />
          <line
            x1={100}
            y1={6}
            x2={100}
            y2={144}
            stroke="color-mix(in oklab, var(--reel-ink) 34%, transparent)"
            strokeWidth={1.2}
          />
          {/* The two vectors, each tracing out from the origin on a staggered loop. */}
          {HEADS.map((h, i) => (
            <line
              key={i}
              x1={100}
              y1={75}
              x2={h.x}
              y2={h.y}
              stroke={h.color}
              strokeWidth={2.6}
              strokeLinecap="round"
              markerEnd="url(#gp-tip)"
              pathLength={1}
              strokeDasharray={1}
              style={{
                strokeDashoffset: 1,
                animation: `gp-trace 4.2s ease-in-out ${i * 0.45}s infinite`,
              }}
            />
          ))}
          {vectors.map((v, i) => {
            const head = HEADS[i];
            const { lines, size } = fitLabel(
              v.label,
              edgeLabelWidth(head.lx, PLOT_VIEW_MIN_X, PLOT_VIEW_MAX_X, head.anchor),
            );
            const lineHeight = size * 1.15;
            return (
              <text
                key={i}
                x={head.lx}
                textAnchor={head.anchor}
                style={{ font: `700 ${size}px var(--reel-mono)`, fill: head.color }}
              >
                {lines.map((line, li) => (
                  <tspan key={li} x={head.lx} y={head.ly + li * lineHeight}>
                    {line}
                  </tspan>
                ))}
              </text>
            );
          })}
        </svg>
      </div>
      {slots.equation && (
        <div
          style={{
            font: '600 calc(var(--ru) * 5)/1.2 var(--reel-mono)',
            color: 'var(--reel-ink)',
            textAlign: 'center',
            marginTop: 'calc(var(--ru) * 2.6)',
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
            textAlign: 'center',
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
