// FlagshipShowcase — the four flagship experiences as living vignettes. Each card is a small,
// self-drawn scene in the real feature's visual language (the data inside is lifted from the same
// baked fixtures the walkthrough replays — committed claims, modules, and thought atoms), and its
// button deep-links into the walkthrough AT that chapter, so "see it live" means the actual
// feature running on the actual surface, key-free. Pure CSS/SVG — nothing here imports the heavy
// live modules, so the landing's eager bundle stays lean. Every scene shows its SUBJECT, not just
// its results: Prism keeps the document the claims fly out of, Ripple draws the change rippling,
// Watch Me Think shows the speech dissolving into structure, Atlas joins its stars into
// constellations. The closing strip names what an answer becomes afterward — deck, PDF, reel,
// flashcards, focus, memory — each one chapter-deep-linked like the vignettes.
import type { ReactElement } from 'react';
import {
  stashTourMode,
  stashTourChapter,
  stashTourSolo,
  stashOpenRipple,
} from '../../tour/tourEntry';

interface Vignette {
  id: string;
  /** The tour chapter this deep-links into. */
  chapter: string;
  name: string;
  line: string;
  scene: ReactElement;
}

/** Prism — the document itself, its evidence highlighted in place, each claim connected back to
 *  the exact span it cites (titles from the baked FOMC statement). */
function PrismScene(): ReactElement {
  const claims = [
    { x: 52, y: 18, w: 118, t: 'Federal funds rate target', fx: -74, fy: 28 },
    { x: 48, y: 50, w: 104, t: 'Drivers of elevated inflation', fx: -66, fy: 2 },
    { x: 62, y: 74, w: 112, t: 'Commitment to dual mandate', fx: -92, fy: -32 },
  ];
  const pages = ['p.1', 'p.2', 'p.3', 'p.4', 'p.5', 'p.6'];
  const cited = new Set(['p.1', 'p.3']);
  return (
    <div className="fs-scene fs-prism" aria-hidden="true">
      <span className="fs-prism-doc">
        {/* the highlights Prism paints over the cited spans */}
        <i className="fs-prism-hl" style={{ top: '24%' }} />
        <i className="fs-prism-hl short" style={{ top: '62%' }} />
      </span>
      <span className="fs-prism-region" style={{ right: '16%', bottom: '8%' }}>
        Policy stance
      </span>
      <svg className="fs-prism-thread" viewBox="0 0 200 120" preserveAspectRatio="none">
        {/* claim → the highlighted span it cites */}
        <path pathLength={1} d="M100,26 C82,28 64,33 51,40" />
        <path pathLength={1} style={{ animationDelay: '900ms' }} d="M96,62 C80,64 60,66 45,69" />
      </svg>
      {claims.map((c, i) => (
        <span
          key={c.t}
          className="fs-prism-claim"
          style={{
            left: `${c.x}%`,
            top: `${c.y}%`,
            width: c.w,
            animationDelay: `${400 + i * 340}ms`,
            ['--fx' as string]: `${c.fx}px`,
            ['--fy' as string]: `${c.fy}px`,
          }}
        >
          <i>p.{i + 1}</i>
          {c.t}
        </span>
      ))}
      <span className="fs-prism-pages">
        {pages.map((p) => (
          <i key={p} className={cited.has(p) ? 'cited' : undefined}>
            {p}
          </i>
        ))}
      </span>
    </div>
  );
}

/** Ripple — a change's blast radius (the worked example's real modules and verdicts). */
function RippleScene(): ReactElement {
  const nodes = [
    { x: 50, y: 50, label: 'auth-service', kind: 'change', glyph: '' },
    { x: 82, y: 30, label: 'src/api', kind: 'breaks', glyph: '▲' },
    { x: 80, y: 76, label: 'src/web', kind: 'safe', glyph: '✓', order: 1 },
    { x: 18, y: 30, label: 'tests', kind: 'untested', glyph: '·', order: 3 },
    { x: 20, y: 74, label: 'migrations', kind: 'migration', glyph: '·', order: 2 },
  ];
  return (
    <div className="fs-scene fs-ripple" aria-hidden="true">
      <svg viewBox="0 0 200 120" preserveAspectRatio="none">
        {/* the diff gutter — code went in here */}
        <path className="fs-ripple-diff add" d="M7,16 h8 M7,44 h8 M7,72 h8 M7,100 h8" />
        <path className="fs-ripple-diff del" d="M7,30 h5 M7,58 h5 M7,86 h5" />
        {/* the ripple itself, expanding once from the change */}
        <circle className="fs-ripple-ring" cx="100" cy="60" r="18" />
        <circle className="fs-ripple-ring late" cx="100" cy="60" r="18" />
        {nodes.slice(1).map((n) => {
          const x2 = n.x * 2;
          const y2 = n.y * 1.2;
          return (
            <path
              key={n.label}
              className={`fs-ripple-edge is-${n.kind}`}
              pathLength={1}
              d={`M100,60 Q${(100 + x2) / 2},${(60 + y2) / 2 - 14} ${x2},${y2}`}
            />
          );
        })}
      </svg>
      {nodes.map((n, i) => (
        <span
          key={n.label}
          className={`fs-ripple-node is-${n.kind}`}
          style={{ left: `${n.x}%`, top: `${n.y}%`, animationDelay: `${i * 220}ms` }}
        >
          {n.glyph && <i>{n.glyph}</i>}
          {n.label}
        </span>
      ))}
      {nodes
        .filter((n) => n.order)
        .map((n) => (
          <span
            key={`o-${n.label}`}
            className={`fs-ripple-order o${n.order}`}
            style={{ left: `${n.x + 8}%`, top: `${n.y - 16}%` }}
          >
            {n.order}
          </span>
        ))}
      {/* the other half of Ripple, as the scene's final beat: the ship order becomes the lesson
          sequence — numeral 1 pulses and the first dot fills, then numeral 2, dot 2. Numeral 3
          stays quiet: that lesson hasn't been reached. Mirrors the real ShipCourse progress. */}
      <span className="fs-ripple-course">
        <i aria-hidden="true">
          <b className="done d1" />
          <b className="done d2" />
          <b />
          <b />
          <b />
        </i>
        Repo course · lesson 2 of 5
      </span>
    </div>
  );
}

/** Watch Me Think — a ramble becoming a map (the walkthrough's real extracted thoughts). */
function ThinkScene(): ReactElement {
  const atoms = [
    { x: 50, y: 24, kind: 'option', t: 'Moving to Austin' },
    { x: 16, y: 58, kind: 'person', t: 'Sister' },
    { x: 78, y: 52, kind: 'fear', t: 'Starting over' },
    { x: 44, y: 80, kind: 'loop', t: 'Is it the right time?' },
  ];
  // Spoken fragments (the fixture's own words) drift from the orb toward their atom and
  // dissolve as it pops — speech becoming structure, the feature's whole pitch.
  const wisps = [
    { t: 'austin…', tx: 0, ty: -34, delay: 150 },
    { t: 'my sister…', tx: -60, ty: -2, delay: 630 },
    { t: 'right time?', tx: -12, ty: 26, delay: 1590 },
  ];
  return (
    <div className="fs-scene fs-think" aria-hidden="true">
      <svg className="fs-think-links" viewBox="0 0 200 120" preserveAspectRatio="none">
        {atoms.map((a, i) => {
          const x2 = a.x * 2;
          const y2 = a.y * 1.2;
          return (
            <path
              key={a.t}
              className="fs-think-link"
              pathLength={1}
              style={{ transitionDelay: `${300 + i * 480}ms` }}
              d={`M100,60 Q${(100 + x2) / 2 + 8},${(60 + y2) / 2 - 10} ${x2},${y2}`}
            />
          );
        })}
        {/* the tension the real mindshape draws — fear pulling against the option */}
        <path className="fs-think-tension" d="M156,62 Q136,30 108,30" />
      </svg>
      <span className="fs-think-orb" />
      {wisps.map((w) => (
        <span
          key={w.t}
          className="fs-think-wisp"
          style={{
            animationDelay: `${w.delay}ms`,
            ['--tx' as string]: `${w.tx}px`,
            ['--ty' as string]: `${w.ty}px`,
          }}
        >
          {w.t}
        </span>
      ))}
      {atoms.map((a, i) => (
        <span
          key={a.t}
          className="fs-think-atom"
          style={{ left: `${a.x}%`, top: `${a.y}%`, animationDelay: `${400 + i * 480}ms` }}
        >
          <i>{a.kind}</i>
          {a.t}
        </span>
      ))}
    </div>
  );
}

/** Atlas — kept topics as neighborhoods on one map (names from the tour's seeds), drawn in the
 *  same stage language as the other scenes so all four cards read as one set. */
function AtlasScene(): ReactElement {
  const dots = Array.from({ length: 22 }, (_, i) => ({
    x: 6 + ((i * 37) % 90),
    y: 8 + ((i * 53) % 84),
    size: 2 + (i % 2),
    bright: i % 7 === 3,
  }));
  const hoods = [
    { x: 26, y: 34, label: 'Money', tone: 'presence' },
    { x: 68, y: 26, label: 'Space', tone: 'blue' },
    { x: 56, y: 70, label: 'Travel', tone: 'insight' },
  ];
  return (
    <div className="fs-scene fs-atlas" aria-hidden="true">
      {hoods.map((h) => (
        <span
          key={`r-${h.label}`}
          className={'fs-atlas-region tone-' + h.tone}
          style={{ left: `${h.x}%`, top: `${h.y}%` }}
        />
      ))}
      <svg className="fs-atlas-sky" viewBox="0 0 200 120" preserveAspectRatio="none">
        {/* constellations joining each neighborhood's conversations */}
        <path className="fs-atlas-line" pathLength={1} d="M22,26 L40,20 L58,34 L44,48 L24,44" />
        <path className="fs-atlas-line" pathLength={1} d="M122,18 L142,26 L158,20 L166,38" />
        <path className="fs-atlas-line" pathLength={1} d="M96,86 L112,76 L132,88 L124,102" />
        {/* a dotted visited route between two neighborhoods */}
        <path className="fs-atlas-route" d="M52,44 C70,64 90,58 110,80" />
      </svg>
      {dots.map((d, i) => (
        <span
          key={i}
          className={'fs-atlas-dot' + (d.bright ? ' bright' : '')}
          style={{
            left: `${d.x}%`,
            top: `${d.y}%`,
            width: d.size,
            height: d.size,
            animationDelay: `${(i % 5) * 300}ms`,
          }}
        />
      ))}
      {hoods.map((h, i) => (
        <span
          key={h.label}
          className={'fs-atlas-hood tone-' + h.tone}
          style={{ left: `${h.x}%`, top: `${h.y}%`, animationDelay: `${i * 260}ms` }}
        >
          <i />
          {h.label}
        </span>
      ))}
    </div>
  );
}

const VIGNETTES: Vignette[] = [
  {
    id: 'prism',
    chapter: 'prism',
    name: 'Prism',
    line: 'Drop in a document — inspect a map of claims and return cited evidence to its page.',
    scene: <PrismScene />,
  },
  {
    id: 'ripple',
    chapter: 'ripple',
    name: 'Ripple',
    line: 'A change’s blast radius, explained aloud at the altitude you choose — or a whole repo turned into its own onboarding course.',
    scene: <RippleScene />,
  },
  {
    id: 'think',
    chapter: 'think',
    name: 'Watch Me Think',
    line: 'Ramble out loud — your half-formed thinking becomes a live map of options, fears, loops.',
    scene: <ThinkScene />,
  },
  {
    id: 'atlas',
    chapter: 'atlas',
    name: 'Atlas',
    line: 'Kept conversations become neighborhoods of thought you can wander.',
    scene: <AtlasScene />,
  },
];

/** What an answer becomes after it lands — every entry is a shipped surface with its own tour
 *  chapter, so each chip is a deep link, not a promise. */
const AFTER_THE_ANSWER = [
  { label: 'Present it', detail: 'a full deck, ten looks', chapter: 'present' },
  { label: 'Print it', detail: 'a typeset PDF, ten templates', chapter: 'export' },
  { label: 'Reel it', detail: 'a vertical clip built to share', chapter: 'share' },
  {
    label: 'Flashcards',
    detail: 'saved from answers, scheduled for review',
    chapter: 'flashcards',
  },
  { label: 'Focus', detail: 'one card at a time', chapter: 'focus' },
  { label: 'Memory', detail: 'local, opt-in, yours', chapter: 'memory' },
];

/** Every tour chapter these cards deep-link into (Ripple excluded — it opens its own overlay).
 *  Exported so a test can assert each id still resolves to a real chapter: a chapter rename
 *  would otherwise turn a button into a silent dead link with no failing test. */
export const SHOWCASE_TOUR_CHAPTERS: string[] = [
  ...VIGNETTES.filter((v) => v.id !== 'ripple').map((v) => v.chapter),
  ...AFTER_THE_ANSWER.map((f) => f.chapter),
];

export function FlagshipShowcase({
  onEnterLive,
}: {
  onEnterLive: (seed?: string) => void;
}): ReactElement {
  // "Open scripted demo" reads as one self-contained clip, so every chapter plays SOLO — it
  // shows that one thing and returns to the end card, rather than a core chapter (prism, share)
  // dropping the visitor into the middle of the full tour and continuing through it.
  const openChapter = (chapter: string): void => {
    stashTourMode();
    stashTourSolo();
    stashTourChapter(chapter);
    onEnterLive();
  };
  const seeIt = (v: { id: string; chapter: string }): void => {
    // Ripple was cut from the walkthrough (to keep the tour fast), so it has no chapter to deep-link.
    // Open its own live overlay instead — an honest preview that actually shows Ripple, not a silent
    // drop onto chapter 1. The other three vignettes deep-link their real tour chapters as before.
    if (v.id === 'ripple') {
      stashOpenRipple();
      onEnterLive();
      return;
    }
    openChapter(v.chapter);
  };
  return (
    <section className="fs-root" aria-label="Flagship experiences">
      <div className="fl-eyebrow">The flagships</div>
      <h2 className="fl-h2">
        Four ways to inspect
        <br />
        more than an answer.
      </h2>
      <div className="fs-grid">
        {VIGNETTES.map((v) => (
          <article key={v.id} className="fs-card">
            {v.scene}
            <div className="fs-card-body">
              <h3 className="fs-card-name">{v.name}</h3>
              <p className="fs-card-line">{v.line}</p>
              <button type="button" className="fs-card-cta" onClick={() => seeIt(v)}>
                Open scripted demo <span aria-hidden="true">→</span>
              </button>
            </div>
          </article>
        ))}
      </div>
      {/* One quiet line, labels only — the detail rides in the tooltip and the chapter itself.
          Everything else is reachable through Explore and ⌘K; a landing page doesn't have to
          say every feature's name out loud. */}
      <div className="fs-after">
        <span className="fs-after-kicker">And when the answer lands —</span>
        {AFTER_THE_ANSWER.map((f) => (
          <button
            key={f.label}
            type="button"
            className="fs-after-item"
            title={f.detail}
            onClick={() => openChapter(f.chapter)}
          >
            {f.label}
          </button>
        ))}
      </div>
    </section>
  );
}
