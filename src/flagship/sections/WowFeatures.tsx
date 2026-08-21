// "A friend at the whiteboard" — alternating panels, each a claim paired with a small live
// proof of it: your highlight, Mavéa's own pen, answers forming mid-sentence, a map of your
// thinking, the blank space it leaves when only you hold a number, and the canvas's breadth of
// instruments. All visuals are CSS/SVG; entrance choreography is one-shot, reduced-motion safe.
import type { ReactNode } from 'react';
import { Orb } from '../Orb';
import { SectionHead } from '../parts';

function Panel({
  reverse,
  eyebrow,
  eyebrowTone,
  title,
  body,
  visual,
}: {
  reverse?: boolean;
  eyebrow: string;
  eyebrowTone: string;
  title: ReactNode;
  body: ReactNode;
  visual: ReactNode;
}) {
  return (
    <div className={'fl-panel' + (reverse ? ' reverse' : '')}>
      <div className="fl-panel-copy">
        <div className={'fl-panel-eyebrow tone-' + eyebrowTone}>{eyebrow}</div>
        <h3 className="fl-panel-title">{title}</h3>
        <p className="fl-panel-body">{body}</p>
      </div>
      <div className="fl-panel-visual">{visual}</div>
    </div>
  );
}

const REV_BARS = ['46%', '52%', '50%', '58%', '74%', '100%'];

// Revenue that dips then recovers, plotted as a real answer card would plot it (gridlines, area
// fill, quarter axis, data dots). Then Mavéa's judgment ink draws over that answer: a trend arrow
// hugging the recovery, a star on the quarter that matters, a strike through the option it rules
// out — the annotation vocabulary drawn ON a real UI, not a bare sketch. Played once on reveal.
const REV_POINTS: Array<[number, number]> = [
  [24, 72],
  [98, 98],
  [173, 116],
  [247, 98],
  [322, 66],
  [396, 36],
];
const REV_QUARTERS = ['Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6'];

function PenVisual() {
  const line = REV_POINTS.map(([x, y]) => `${x},${y}`).join(' ');
  return (
    <div className="fl-card fl-pen">
      <div className="fl-pen-head">
        <span className="fl-ink-label">Revenue · the road back</span>
        <span className="fl-pen-value">
          $4.2M<i className="fl-pen-delta">▲ recovering</i>
        </span>
      </div>
      <svg className="fl-pen-plot" viewBox="0 0 420 184" aria-hidden="true">
        <defs>
          <linearGradient id="fl-pen-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" className="fl-pen-fill-top" />
            <stop offset="1" className="fl-pen-fill-bot" />
          </linearGradient>
        </defs>
        <g className="fl-pen-grid">
          <line x1="24" y1="48" x2="396" y2="48" />
          <line x1="24" y1="84" x2="396" y2="84" />
          <line x1="24" y1="120" x2="396" y2="120" />
          <line x1="24" y1="150" x2="396" y2="150" className="base" />
        </g>
        <path className="fl-pen-area" d={`M${line.replace(/ /g, ' L')} L396,150 L24,150 Z`} />
        <polyline className="fl-pen-line" points={line} />
        <g className="fl-pen-dots">
          {REV_POINTS.map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r="3.2" />
          ))}
        </g>
        <g className="fl-pen-axis">
          {REV_QUARTERS.map((q, i) => (
            <text key={q} x={REV_POINTS[i][0]} y="172">
              {q}
            </text>
          ))}
        </g>
        {/* Mavéa's pen, drawn on reveal — a trend arrow along the recovery, then a star on the peak */}
        <path
          className="fl-pen-trend"
          pathLength={1}
          d="M166,126 C232,122 300,86 384,44 M384,44 l-13,1 m13,-1 l-3,12"
        />
        <path
          className="fl-pen-star"
          pathLength={1}
          d="M396,18 L399,26 L407,26 L401,32 L403,40 L396,35 L389,40 L391,32 L385,26 L393,26 Z"
        />
      </svg>
      <div className="fl-pen-options">
        <span className="fl-pen-chip">
          Cut marketing
          <svg
            viewBox="0 0 120 26"
            preserveAspectRatio="none"
            aria-hidden="true"
            className="fl-pen-strike"
          >
            <path pathLength={1} d="M5,15 C34,10 74,18 115,10" />
          </svg>
        </span>
        <span className="fl-pen-chip kept">Raise prices ✓</span>
      </div>
    </div>
  );
}

// The canvas's range: a sample of the block library's instruments popping in — the answer
// picks its shape, these are just eight of the hundreds it can reach for.
const INSTRUMENTS = [
  { id: 'bars', d: 'M6,26 V14 M14,26 V6 M22,26 V18', label: 'chart' },
  { id: 'line', d: 'M4,24 L11,14 L18,18 L26,6', label: 'trend' },
  { id: 'donut', d: 'M14,4 A10,10 0 1 1 4,14', label: 'share' },
  {
    id: 'pin',
    d: 'M14,4 a8,8 0 0 1 8,8 c0,6 -8,14 -8,14 s-8,-8 -8,-14 a8,8 0 0 1 8,-8',
    label: 'map',
  },
  { id: 'steps', d: 'M4,24 H12 V16 H20 V8 H26', label: 'timeline' },
  { id: 'net', d: 'M6,22 L14,8 L24,20 M6,22 L24,20', label: 'network' },
  { id: 'gauge', d: 'M4,22 A11,11 0 0 1 26,22 M15,22 L21,12', label: 'gauge' },
  { id: 'rows', d: 'M5,8 H25 M5,15 H25 M5,22 H17', label: 'table' },
];

function CanvasVisual() {
  return (
    <div className="fl-card fl-instruments">
      {INSTRUMENTS.map((g, i) => (
        <span key={g.id} className="fl-instrument" style={{ ['--in-i' as string]: String(i) }}>
          <svg viewBox="0 0 30 30" aria-hidden="true">
            <path d={g.d} />
          </svg>
          {g.label}
        </span>
      ))}
    </div>
  );
}

function HighlightVisual() {
  return (
    <div className="fl-card fl-ink">
      <div className="fl-ink-label">Revenue · last 6 quarters</div>
      <div className="fl-ink-plot">
        <div className="fl-ink-bars">
          {REV_BARS.map((h, i) => (
            <div key={i} className="fl-ink-barcol">
              <div className={'fl-ink-bar' + (h === '100%' ? ' peak' : '')} style={{ height: h }} />
            </div>
          ))}
        </div>
        {/* a highlight sweeping over the peak bar, then the ask chip — the real Highlight flow
            (drag across the answer, the grab becomes the next turn's grounding) */}
        <span className="fl-hl-sweep" />
        <span className="fl-hl-chip">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M3 21l3.2-.9L18 8.3l-2.3-2.3L4 17.6 3 21z M14.7 7l2.3 2.3" />
          </svg>
          Ask about this
        </span>
      </div>
    </div>
  );
}

function GhostVisual() {
  return (
    <div className="fl-card fl-ghostwrap">
      <div className="fl-ghost-said">
        <span className="fl-wave" aria-hidden="true">
          {Array.from({ length: 12 }, (_, i) => (
            <i key={i} style={{ ['--i' as string]: String(i) }} />
          ))}
        </span>
        <span className="fl-ghost-words">
          “…and how does that compare to last year, and
          <span className="fl-caret" />”
        </span>
      </div>
      <div className="fl-ghost-cards">
        <div className="fl-ghost">
          <div className="fl-ghost-tag">Forming…</div>
          <div className="fl-ghost-bars">
            <i style={{ height: '50%' }} />
            <i style={{ height: '80%' }} />
            <i style={{ height: '65%' }} />
          </div>
        </div>
        <div className="fl-ghost delay">
          <div className="fl-ghost-tag">Forming…</div>
          <svg viewBox="0 0 120 50" aria-hidden="true">
            <polyline points="0,42 24,30 48,34 72,18 96,22 120,8" />
          </svg>
        </div>
      </div>
    </div>
  );
}

// Mind-map nodes in a 420×264 coordinate space (positioned as % so the card stays responsive).
const NODES = [
  { label: 'Runway: 14mo', meta: '4×', x: 92, y: 52, tone: 'blue' },
  { label: 'Hiring freeze', meta: 'a worry', x: 86, y: 200, tone: 'amber' },
  { label: 'Ship velocity', meta: 'slowing', x: 300, y: 204, tone: 'amber' },
  { label: 'Churn signal', meta: 'watch', x: 300, y: 50, tone: 'pink' },
  { label: 'Pricing', meta: 'your idea', x: 206, y: 226, tone: 'green' },
];
const LINKS = [
  [0, 3],
  [3, 2],
  [1, 4],
  [4, 2],
  [0, 1],
];

function MapVisual() {
  return (
    <div className="fl-card fl-mindmap">
      <svg className="fl-mindmap-links" viewBox="0 0 420 264" aria-hidden="true">
        {LINKS.map(([a, b], i) => {
          const A = NODES[a];
          const B = NODES[b];
          const mx = (A.x + B.x) / 2;
          const my = (A.y + B.y) / 2 - 20;
          return <path key={i} d={`M${A.x},${A.y} Q${mx},${my} ${B.x},${B.y}`} />;
        })}
      </svg>
      <div className="fl-mindmap-hub">
        <Orb size={46} />
      </div>
      {NODES.map((n) => (
        <div
          key={n.label}
          className={'fl-node tone-' + n.tone}
          style={{ left: `${(n.x / 420) * 100}%`, top: `${(n.y / 264) * 100}%` }}
        >
          <div className="fl-node-label">{n.label}</div>
          <div className="fl-node-meta">{n.meta}</div>
        </div>
      ))}
    </div>
  );
}

const FILL_OPTIONS = [
  { icon: '⌨', label: 'Type it' },
  { icon: '🎙', label: 'Say it' },
  { icon: '▦', label: 'Drag a card' },
];

function BlankVisual() {
  return (
    <div className="fl-card fl-blank">
      <div className="fl-blank-sentence">
        With <span className="fl-blank-num good">$2.1M</span> in the bank and a burn of{' '}
        <span className="fl-blank-hole">
          your burn / mo
          <span className="fl-caret" />
        </span>
        , your runway is <span className="fl-blank-pending">— months</span>.
      </div>
      {/* Illustrative chips, not real controls — render as spans so keyboard/AT users
          don't tab into buttons that do nothing. */}
      <div className="fl-blank-options" aria-hidden="true">
        {FILL_OPTIONS.map((o) => (
          <span key={o.label} className="fl-blank-btn">
            <span className="fl-blank-icon">{o.icon}</span>
            {o.label}
          </span>
        ))}
      </div>
    </div>
  );
}

// The guided read — Mavéa doesn't drop a wall of cards and leave: it spotlights each part of the
// answer and speaks to it, one beat at a time. A moving spotlight walks the three pieces while the
// resting face "talks" (a voice wave) and its line cross-fades to match. Looped, ambient-pausable.
const WALK_LINES = [
  '“ARR climbed to $15.1M — up 21%.”',
  '“The trend held steady all quarter.”',
  '“North America still leads, at 54%.”',
];

function WalkVisual() {
  return (
    <div className="fl-card fl-walk">
      <div className="fl-ink-label">Q3 revenue · read to you</div>
      <div className="fl-walk-stage">
        <div className="fl-walk-presenter">
          <Orb size={44} className="fl-walk-orb" />
          <div className="fl-walk-say">
            <span className="fl-wave" aria-hidden="true">
              {Array.from({ length: 8 }, (_, i) => (
                <i key={i} style={{ ['--i' as string]: String(i) }} />
              ))}
            </span>
            <span className="fl-walk-caps">
              {WALK_LINES.map((t, i) => (
                <span key={t} className={`fl-walk-line l${i + 1}`}>
                  {t}
                </span>
              ))}
            </span>
          </div>
        </div>
        <div className="fl-walk-items">
          <div className="fl-walk-item">
            <span className="fl-walk-k">ARR</span>
            <span className="fl-walk-v">$15.1M</span>
            <span className="fl-walk-up">▲ 21%</span>
          </div>
          <div className="fl-walk-item">
            <svg className="fl-walk-spark" viewBox="0 0 120 26" aria-hidden="true">
              <polyline points="2,20 22,17 42,19 62,11 82,13 100,6 118,3" />
            </svg>
          </div>
          <div className="fl-walk-item">
            <span className="fl-walk-k">N. America</span>
            <span className="fl-walk-v">54%</span>
          </div>
          <span className="fl-walk-spot" aria-hidden="true" />
        </div>
      </div>
      {/* Same on-screen label the sibling section carries (SeeDontRead's .fl-seen-note): these are
          invented figures in a mock card, and the landing says so rather than leaving a reader to
          assume a real company's ARR. The note beside the chips above explained this to US, in a
          code comment nobody reading the page can see.
          Sits OUTSIDE .fl-walk-stage, which is a flex ROW — inside it the note becomes a third
          column beside the figures instead of a caption under them. */}
      <div className="fl-seen-note">Illustrative numbers</div>
    </div>
  );
}

export function WowFeatures() {
  return (
    <>
      <SectionHead eyebrow="Things a chat window can’t do">
        It’s a <em>friend at the whiteboard.</em>
      </SectionHead>

      <div className="fl-panels">
        <Panel
          eyebrow="Highlight is the interface"
          eyebrowTone="presence"
          title="Highlight the answer to ask."
          body="Drag across a bar, a row, a figure — the highlight grabs exactly what’s under it, and your next question is grounded on that piece, not the whole answer."
          visual={<HighlightVisual />}
        />
        <Panel
          reverse
          eyebrow="And the pen is in its hand"
          eyebrowTone="amber"
          title="It draws on its own answers."
          body="A trend arrow along the recovery, a star on the number that matters, a strike through the option it rules out — the whiteboard marks a good teacher leaves."
          visual={<PenVisual />}
        />
        <Panel
          eyebrow="It answers while you talk"
          eyebrowTone="blue"
          title="The answer forms mid-sentence."
          body="Dashed “ghost” cards sketch the answer taking shape behind your words — and reshape live as your question turns. You see it thinking with you, not after you."
          visual={<GhostVisual />}
        />
        <Panel
          reverse
          eyebrow="Watch it map your thinking"
          eyebrowTone="green"
          title="Ramble. Get a map of your mind."
          body="Themes emerge from what you actually said — never fixed buckets — with the tensions between them drawn in. A minute of talking becomes a structure you can see."
          visual={<MapVisual />}
        />
        <Panel
          eyebrow="The Blank Space"
          eyebrowTone="pink"
          title="It won’t guess. It leaves a space."
          body="When an answer needs a number only you have, Mavéa leaves a glowing hole to fill — type it, say it, or drag a card in. Uncertainty, made honest and interactive."
          visual={<BlankVisual />}
        />
        <Panel
          reverse
          eyebrow="One canvas, many instruments"
          eyebrowTone="presence"
          title="The answer picks its shape."
          body="Charts, maps, timelines, networks, tables — hundreds of visual instruments on one canvas, and each answer reaches for the ones that fit."
          visual={<CanvasVisual />}
        />
        <Panel
          eyebrow="It reads the answer to you"
          eyebrowTone="presence"
          title="It points, and talks you through."
          body="Mavéa doesn’t drop a wall of cards and leave. It spotlights each part and speaks to it — walking you through the answer a piece at a time, the way a friend at the whiteboard would."
          visual={<WalkVisual />}
        />
      </div>
    </>
  );
}
