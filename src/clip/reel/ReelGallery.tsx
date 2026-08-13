// A QA surface for the reel finishes (#/reel): EVERY registered finish rendered statically in a 9:16
// board so it's a one-look check that nothing overflows, across the four palettes, plus one looping
// full reel. Sample content stands in for a real conversation; the components are the live ones. It
// iterates the registry, so a newly-added finish shows up here automatically.
import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { ReelPlayer } from './ReelPlayer';
import { ClipButton } from '../ClipButton';
import { PALETTES } from './palette';
import type { ClipTheme } from '../types';
import type { ReelScript, ReelSlide, SlotKey, SlotsFor, TemplateId } from './reelScript';
import { clampText } from './reelScript';
import type { TurnFrame } from '../../live/history';
import type { ConversationSpec } from '../../data/conversation';
import { FINISH, coerceSlots } from './templates/registry';
import { auditBoard } from './auditBoard';

// QA sample: a three-turn conversation so the ShareModal (and WebM export + narration) can be
// exercised from the gallery without a live session — including a genuine mid-conversation topic
// change (the espresso turn), so the reel's topic sectioning shows up here too. The reel only reads
// question/narration/mode and the blocks' `note`, so a lean spec stands in for a full canvas.
const QA_FRAMES: TurnFrame[] = [
  {
    question: 'What are eigenvalues and eigenvectors?',
    narration: 'Eigenvalues are the core of linear algebra — the factor a vector is scaled by.',
    mode: 'replace',
    tour: [],
    at: 0,
    spec: {
      id: 'linear-algebra',
      title: 'Linear algebra',
      opener: 'What are eigenvalues and eigenvectors?',
      found: 'Eigenvalues are the core of linear algebra.',
      blocks: [
        { type: 'note', note: 'Eigenvalues scale a vector without turning it.' },
        { type: 'note', note: 'Eigenvectors keep their direction under the transform.' },
        { type: 'note', note: 'They power PCA, SVD and stability analysis.' },
      ],
    } as unknown as ConversationSpec,
  },
  {
    // A follow-up on the SAME subject — augments the canvas rather than replacing it, so this stays
    // inside the linear-algebra section.
    question: 'Why do eigenvalues matter in practice?',
    narration: 'They reveal the axes a transformation stretches — the backbone of PCA and SVD.',
    mode: 'augment',
    tour: [],
    at: 1,
    spec: {
      id: 'linear-algebra',
      title: 'Linear algebra',
      blocks: [],
    } as unknown as ConversationSpec,
  },
  {
    // A real subject change — the reel opens a second section for it, with its own title + heading.
    question: 'How do I make a good espresso at home?',
    narration: 'Grind fine, tamp evenly, and pull a 25-to-30-second shot at the right temperature.',
    mode: 'replace',
    tour: [],
    at: 2,
    spec: {
      id: 'espresso',
      title: 'Espresso basics',
      blocks: [
        { type: 'note', note: 'Water temperature matters as much as grind size.' },
        { type: 'note', note: 'Tamp evenly so the water pulls through at one rate.' },
      ],
    } as unknown as ConversationSpec,
  },
];

/** One realistic slot fill per content type — the gallery dresses every finish with its type's sample. */
const SAMPLE: { [K in SlotKey]: SlotsFor<K> } = {
  title: { question: 'What are eigenvalues and eigenvectors?' },
  outro: {
    wordmark: 'Mavéa',
    tagline: 'Talk to AI. See what it means.',
    statline: '12-week learning path',
  },
  stat: {
    value: '94',
    unit: '%',
    label: 'Intuition score',
    prior: 'up from 38% when you started',
    spark: [38, 52, 60, 78, 94],
  },
  metrics: {
    items: [
      { label: 'Vectors', pct: 100 },
      { label: 'Matrix algebra', pct: 80 },
      { label: 'Eigen-theory', pct: 40 },
    ],
    next: 'Focus on the first six weeks.',
  },
  ranked: {
    title: 'Mastery by topic',
    items: [
      { label: 'Vectors', score: '100%', pct: 100 },
      { label: 'Matrices', score: '80%', pct: 80 },
      { label: 'Eigen-theory', score: '40%', pct: 40 },
      { label: 'SVD & PCA', score: '10%', pct: 10 },
    ],
  },
  quote: {
    quote: 'Eigenvalues are the core of linear algebra.',
    highlight: 'core',
    attribution: 'Linear algebra',
  },
  list: {
    items: [
      'Eigenvalues scale a vector without turning it.',
      'Eigenvectors keep their direction.',
      'They power PCA and SVD.',
      'The core of linear algebra.',
    ],
  },
  concept: {
    title: 'Eigenvalue',
    subtitle: 'The factor a vector is scaled by — same line, new length.',
    tag: 'Linear algebra',
  },
  conceptmap: {
    center: 'Eigen',
    nodes: [
      { label: 'Vectors' },
      { label: 'Matrices' },
      { label: 'Span' },
      { label: 'SVD' },
      { label: 'PCA' },
    ],
  },
  qa: {
    question: 'What is an eigenvalue?',
    answer: 'The factor a vector is scaled by — same line, new length.',
  },
  chat: {
    messages: [
      { role: 'user', text: 'What actually is an eigenvalue?' },
      { role: 'mavea', text: 'How much a transformation stretches a vector — without turning it.' },
    ],
  },
  diagram: {
    label: 'Vector transform',
    equation: 'A·v = λ·v',
    vectors: [{ label: 'v' }, { label: 'λv' }],
    note: 'λ scales the vector, never turns it.',
  },
  steps: {
    stops: [
      { label: 'Mastering basis & span', state: 'done' },
      { label: 'Matrix inversion', state: 'done' },
      { label: 'Eigen-decomposition', state: 'active' },
      { label: 'SVD implementation', state: 'todo' },
    ],
  },
  recap: {
    topic: 'Linear algebra',
    metrics: [
      { label: 'Questions', value: '12' },
      { label: 'Mastery', value: '80%' },
      { label: 'Minutes', value: '24' },
      { label: 'Topics', value: '5' },
    ],
  },
  markup: {
    // A tiny inline "document page" so the gallery tile shows the pen landing on a real line.
    pageImage:
      'data:image/svg+xml,' +
      encodeURIComponent(
        "<svg xmlns='http://www.w3.org/2000/svg' width='320' height='440'>" +
          "<rect width='320' height='440' fill='white'/>" +
          "<rect x='26' y='34' width='210' height='16' rx='3' fill='rgb(30,32,40)'/>" +
          "<rect x='26' y='74' width='268' height='9' rx='3' fill='rgb(202,206,212)'/>" +
          "<rect x='26' y='92' width='250' height='9' rx='3' fill='rgb(202,206,212)'/>" +
          "<rect x='26' y='132' width='192' height='13' rx='3' fill='rgb(70,76,88)'/>" +
          "<rect x='26' y='172' width='268' height='9' rx='3' fill='rgb(202,206,212)'/>" +
          "<rect x='26' y='190' width='244' height='9' rx='3' fill='rgb(202,206,212)'/>" +
          '</svg>',
      ),
    imgW: 320,
    imgH: 440,
    rects: [{ x: 26, y: 130, w: 192, h: 16 }],
    isFigure: false,
    seed: 'sample',
    color: '#6a4fd0',
    title: 'Net revenue rose 12% to $4.2B',
    explanation:
      'The document leans on this — figure on p.3: revenue rose 12% year over year to a record $4.2B.',
  },
};

/**
 * The "longest text" sample: every field written AT (or past) its coercion ceiling, then run through
 * the real `coerceSlots` pipeline — so the toggle shows exactly the worst content a finish can
 * legally receive, not an invented stress case. This is the one-look answer to "does long text
 * still render correctly everywhere?".
 */
const LONGEST_RAW: Record<SlotKey, Record<string, unknown>> = {
  title: {
    question:
      'How do eigenvalues and eigenvectors actually explain what a matrix does to space, and why do they matter for PCA, SVD and stability analysis?',
    kicker: 'The axes a transform keeps',
  },
  outro: {
    wordmark: 'Mavéa',
    tagline: 'Talk to AI. See what it means — every single time.',
    statline: 'A 12-week linear algebra learning path',
  },
  stat: {
    value: '1,284,905.35',
    unit: 'kWh',
    label: 'Peak-hour grid demand now',
    prior: 'up from 984,112.90 kWh at the same hour last winter',
    spark: [38, 52, 60, 78, 94],
  },
  metrics: {
    items: [
      { label: 'Vector-space intuition', pct: 100 },
      { label: 'Matrix decompositions', pct: 80 },
      { label: 'Eigen-theory & spectra', pct: 40 },
      { label: 'Numerical conditioning', pct: 25 },
    ],
    next: 'Focus the next six weeks on decompositions before touching numerical stability.',
  },
  ranked: {
    title: 'Mastery ranked by topic',
    items: [
      { label: 'Vectors, span and basis', score: '100 points', pct: 100 },
      { label: 'Matrix multiplication', score: '84.5 points', pct: 84 },
      { label: 'Determinants and rank', score: '61.2 points', pct: 61 },
      { label: 'Eigen-decompositions', score: '40.8 points', pct: 41 },
      { label: 'Singular value theory', score: '12.4 points', pct: 12 },
    ],
  },
  quote: {
    quote:
      'An eigenvector is a direction the matrix refuses to turn; the eigenvalue is the price it charges to travel there — stretch, shrink or flip.',
    highlight: 'refuses to turn',
    attribution: 'Essence of linear algebra',
  },
  list: {
    title: 'The four keys',
    items: [
      'Symmetric matrices always have real eigenvalues and perpendicular eigenvectors.',
      'The determinant is the product of the eigenvalues, counted with multiplicity.',
      'A matrix is stable exactly when every eigenvalue sits inside the unit circle.',
      'PCA is nothing more than the eigen-decomposition of the covariance matrix.',
    ],
  },
  concept: {
    title:
      'The spectral theorem: why every symmetric matrix is only a rotation, a stretch along perpendicular axes, and a rotation back again',
    subtitle:
      'Once you can see the axes a transformation stretches, covariance, compression and stability all become one picture.',
    tag: 'Spectral decomposition',
  },
  conceptmap: {
    center: 'Eigen-theory',
    nodes: [
      { label: 'Vector spaces' },
      { label: 'Diagonalization' },
      { label: 'Covariance & PCA' },
      { label: 'Singular values' },
      { label: 'Stability theory' },
    ],
  },
  qa: {
    question:
      'Why does principal component analysis always pick the eigenvectors of the covariance matrix?',
    answer:
      'Because the covariance matrix is symmetric, its eigenvectors are perpendicular — they are the axes along which the data varies independently, ranked by variance.',
  },
  chat: {
    messages: [
      {
        role: 'user',
        text: 'I keep hearing that eigenvalues explain stability. What does a number have to do with a system blowing up?',
      },
      {
        role: 'mavea',
        text: 'Each step of the system multiplies its state along the eigen-directions, so the largest eigenvalue decides growth or decay.',
      },
      {
        role: 'user',
        text: 'So if every eigenvalue is smaller than one in magnitude, repeated steps shrink everything toward the origin?',
      },
      {
        role: 'mavea',
        text: 'Exactly — inside the unit circle means decay, outside means runaway growth, and right on it means the system just circles.',
      },
    ],
  },
  diagram: {
    label: 'Eigenvector transform map',
    equation: 'A·v = λ·v, det(A − λI) = 0',
    vectors: [{ label: 'v' }, { label: 'λv' }],
    note: 'The matrix scales its eigenvector by λ without ever turning it off its own line.',
  },
  steps: {
    stops: [
      { label: 'Basis, span and vectors', state: 'done' },
      { label: 'Matrix multiplication', state: 'done' },
      { label: 'Determinants and rank', state: 'done' },
      { label: 'Eigen-decomposition', state: 'active' },
      { label: 'SVD implementation', state: 'todo' },
    ],
  },
  recap: {
    topic: 'Linear algebra recap',
    metrics: [
      { label: 'Questions answered', value: '128' },
      { label: 'Topics fully covered', value: '5 of 8' },
      { label: 'Minutes in session', value: '92.5' },
      { label: 'Mastery this week', value: '80.4%' },
    ],
  },
  markup: {
    // Reuse the sample's inline page raster + rects; only the text runs at ceiling length.
    ...(SAMPLE.markup as unknown as Record<string, unknown>),
    title: 'Net revenue rose 12% year over year to a record $4.2B, ahead of guidance',
    explanation:
      'The whole argument leans on this line — the figure on page 3 shows revenue rising 12% year over year to a record $4.2B, which is what lets management raise full-year guidance while still calling the quarter conservative.',
  },
};

let n = 0;
function slide(template: TemplateId, content: SlotKey, voice = '', longest = false): ReelSlide {
  let slots: SlotsFor<SlotKey> = longest
    ? coerceSlots(content, LONGEST_RAW[content], {
        topic: 'Linear algebra',
        question: 'What are eigenvalues?',
      })
    : SAMPLE[content];
  // A finish with a heroCap is never dressed with a longer headline (assignFinish filters it out),
  // so its honest worst case IS its cap — show that, not text it can't legally receive.
  const cap = FINISH[template]?.heroCap;
  if (longest && cap && content === 'concept') {
    const c = slots as SlotsFor<'concept'>;
    slots = { ...c, title: clampText(c.title, cap) };
  }
  return {
    id: `g${n++}`,
    content,
    template,
    slots,
    voiceover: voice,
    durationMs: 3200,
  };
}

function scriptOf(slides: ReelSlide[], palette: ClipTheme): ReelScript {
  return {
    topic: 'Linear algebra',
    question: 'What are eigenvalues?',
    palette,
    vibe: 'clean',
    seed: 0,
    slides,
    durationMs: slides.reduce((a, s) => a + s.durationMs, 0),
  };
}

// The looping full reel: a clean canonical run through the content types.
const FULL_ORDER: [TemplateId, SlotKey, string][] = [
  ['title', 'title', ''],
  ['bigStat', 'stat', 'Your intuition is way up from where you started.'],
  ['knowledgeGraph', 'conceptmap', 'Everything connects back to the eigen-idea.'],
  ['takeaways', 'list', 'The key points at a glance.'],
  ['spotlightQuote', 'quote', 'The one line to remember.'],
  ['steps', 'steps', 'Your path through the material.'],
  ['outro', 'outro', ''],
];

const FINISH_IDS = Object.keys(FINISH) as TemplateId[];

type Aspect = '9:16' | '1:1' | '16:9';
const ASPECTS: { id: Aspect; label: string; ratio: number }[] = [
  { id: '9:16', label: 'Story 9:16', ratio: 9 / 16 },
  { id: '1:1', label: 'Square 1:1', ratio: 1 },
  { id: '16:9', label: 'Landscape 16:9', ratio: 16 / 9 },
];
/** Tile board height per aspect — keeps every format roughly the same on-screen footprint. */
const TILE_H: Record<Aspect, number> = { '9:16': 360, '1:1': 300, '16:9': 240 };

interface ReelAuditHit {
  tile: string;
  aspect: Aspect;
  palette: ClipTheme;
  longest: boolean;
  reason: string;
}

/** Two rAFs, not one — the first commits the layout the state change just triggered, the second
 *  lands after the browser has actually painted it (matches FitScale's own settle cadence). */
function nextPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

async function settle(): Promise<void> {
  if (typeof document !== 'undefined' && document.fonts?.ready) await document.fonts.ready;
  await nextPaint();
}

export function ReelGallery() {
  const [palette, setPalette] = useState<ClipTheme>('aurora');
  const [aspect, setAspect] = useState<Aspect>('9:16');
  // Swap every tile to ceiling-length content (through the real coercion pipeline) — the one-look
  // check that the fit tiers hold at the worst text a finish can legally receive.
  const [longest, setLongest] = useState(false);
  const ratio = ASPECTS.find((a) => a.id === aspect)!.ratio;
  const h = TILE_H[aspect];
  const w = Math.round(h * ratio);
  const full = scriptOf(
    FULL_ORDER.map(([t, c, voice]) => slide(t, c, voice, longest)),
    palette,
  );

  // Latest state, readable from the audit closure below without re-registering it on every toggle —
  // the same stale-closure fix ReelPlayer uses for `paused` (see `pausedRef` there).
  const aspectRef = useRef(aspect);
  aspectRef.current = aspect;
  const paletteRef = useRef(palette);
  paletteRef.current = palette;
  const longestRef = useRef(longest);
  longestRef.current = longest;

  // window.__reelAuditAll(): drives the gallery itself through every aspect × palette × longest
  // combination and runs auditBoard on each static finish tile, so a headless driver
  // (scripts/reel-audit.mts) gets one real-browser sweep instead of a human eyeballing every tile.
  // Only per-finish tiles carry `data-tile-id` — the looping "Full reel" preview is excluded: it
  // plays continuously (`playing` defaults true), so unlike the fixed tiles its board is never at
  // rest, and its bounding rect can't be trusted the same way mid-transition.
  useEffect(() => {
    const run = async (): Promise<ReelAuditHit[]> => {
      const flagWindow = window as unknown as { __reelAuditDone?: boolean };
      flagWindow.__reelAuditDone = false;
      const wasAspect = aspectRef.current;
      const wasPalette = paletteRef.current;
      const wasLongest = longestRef.current;
      const results: ReelAuditHit[] = [];
      for (const a of ASPECTS) {
        for (const p of PALETTES) {
          for (const isLongest of [false, true]) {
            setAspect(a.id);
            setPalette(p.id);
            setLongest(isLongest);
            await settle();
            const boards = document.querySelectorAll<HTMLElement>('[data-tile-id] .reel-board');
            boards.forEach((board) => {
              const tile = board.closest<HTMLElement>('[data-tile-id]')?.dataset.tileId ?? '?';
              for (const flag of auditBoard(board)) {
                results.push({
                  tile,
                  aspect: a.id,
                  palette: p.id,
                  longest: isLongest,
                  reason: flag.reason,
                });
              }
            });
          }
        }
      }
      setAspect(wasAspect);
      setPalette(wasPalette);
      setLongest(wasLongest);
      await settle();
      flagWindow.__reelAuditDone = true;
      return results;
    };
    (window as unknown as { __reelAuditAll?: typeof run }).__reelAuditAll = run;
    return () => {
      delete (window as unknown as { __reelAuditAll?: typeof run }).__reelAuditAll;
      delete (window as unknown as { __reelAuditDone?: boolean }).__reelAuditDone;
    };
  }, [setAspect, setPalette, setLongest]);

  return (
    <div style={ST.page}>
      <div style={ST.head}>
        <h1 style={ST.h1}>Reel finishes ({FINISH_IDS.length})</h1>
        <div style={ST.controls}>
          <ClipButton frames={QA_FRAMES} />

          <div style={ST.chips}>
            {ASPECTS.map((a) => (
              <button
                key={a.id}
                type="button"
                style={chip(aspect === a.id)}
                onClick={() => setAspect(a.id)}
              >
                {a.label}
              </button>
            ))}
          </div>
          <div style={ST.chips}>
            {PALETTES.map((p) => (
              <button
                key={p.id}
                type="button"
                style={chip(palette === p.id)}
                onClick={() => setPalette(p.id)}
              >
                <span style={{ ...ST.dot, background: p.dot }} />
                {p.label}
              </button>
            ))}
          </div>
          <div style={ST.chips}>
            <button type="button" style={chip(longest)} onClick={() => setLongest((v) => !v)}>
              Longest text
            </button>
          </div>
        </div>
      </div>

      <div style={{ ...ST.grid, gridTemplateColumns: `repeat(auto-fill, minmax(${w}px, 1fr))` }}>
        <Tile label="Full reel (looping)" w={w} h={h} wide>
          <ReelPlayer key={`${aspect}-${longest}`} script={full} loop />
        </Tile>
        {FINISH_IDS.map((id) => (
          <Tile key={id} label={id} w={w} h={h} tileId={id}>
            {/* One finish, held static (playing=false) so overflow is easy to spot. */}
            <ReelPlayer
              key={`${aspect}-${longest}`}
              script={scriptOf([slide(id, FINISH[id]!.content, '', longest)], palette)}
              playing={false}
            />
          </Tile>
        ))}
      </div>
    </div>
  );
}

function Tile({
  label,
  w,
  h,
  wide,
  tileId,
  children,
}: {
  label: string;
  w: number;
  h: number;
  wide?: boolean;
  /** Set only for the static per-finish tiles — marks them for window.__reelAuditAll() to find. */
  tileId?: string;
  children: React.ReactNode;
}) {
  // The full-reel tile spans two rows in the grid; size its board to match that height.
  const boardH = wide ? h * 2 + 8 : h;
  return (
    <div style={{ ...ST.tile, gridRow: wide ? 'span 2' : undefined }} data-tile-id={tileId}>
      <div style={{ ...ST.board, width: w, height: boardH }}>{children}</div>
      <div style={ST.cap}>{label}</div>
    </div>
  );
}

const ST: Record<string, CSSProperties> = {
  page: {
    height: '100vh',
    overflowY: 'auto',
    background: '#0a0913',
    color: '#eef2f8',
    padding: '28px 32px',
    font: '400 14px/1.4 var(--font)',
  },
  head: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 22,
    flexWrap: 'wrap',
    gap: 16,
  },
  h1: { font: '700 26px/1 var(--font)', letterSpacing: '-0.02em', margin: 0 },
  controls: { display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' },
  chips: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  dot: { width: 13, height: 13, borderRadius: '50%' },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
    gap: 18,
    alignItems: 'start',
  },
  tile: { display: 'flex', flexDirection: 'column', gap: 8 },
  board: {
    borderRadius: 18,
    overflow: 'hidden',
    boxShadow: '0 18px 50px -22px #000, 0 0 0 1px rgba(255,255,255,0.08)',
  },
  cap: { font: '500 12px/1 var(--font)', color: 'rgba(238,242,248,0.55)', letterSpacing: '0.04em' },
};

function chip(active: boolean): CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 7,
    padding: '8px 13px',
    borderRadius: 999,
    border: `1px solid ${active ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.16)'}`,
    background: active ? 'rgba(255,255,255,0.12)' : 'transparent',
    color: active ? '#fff' : 'rgba(238,242,248,0.6)',
    font: '600 13px/1 var(--font)',
    cursor: 'pointer',
  };
}
