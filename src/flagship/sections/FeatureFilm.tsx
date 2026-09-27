import { useEffect, useState } from 'react';
import { FEATURES } from '../../live/features/registry';
import { useInView } from '../../hooks/useInView';
import { useInterval } from '../../hooks/useInterval';
import { IS_SHOWCASE } from '../../lib/runtimeMode';
import { isShowcaseChapter } from '../../showcasePolicy';
import './featureFilm.css';

const SCENES = [
  {
    id: 'deepzoom',
    title: 'There is always another scale.',
    short: 'Deep Zoom',
    chapter: 'deepzoom',
  },
  { id: 'courses', title: 'Curiosity becomes a path.', short: 'Courses', chapter: 'course' },
  { id: 'review', title: 'Make the idea stay.', short: 'Flashcards', chapter: 'review' },
  { id: 'dashboards', title: 'An answer with a tomorrow.', short: 'Dashboards', chapter: null },
  { id: 'pdf-world', title: 'Follow the claim to its source.', short: 'Prism', chapter: 'prism' },
  { id: 'ripple', title: 'See what a change touches.', short: 'Ripple', chapter: 'ripple' },
] as const;

export function FeatureFilm() {
  const [selected, setSelected] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [automatic, setAutomatic] = useState(true);
  const [hidden, setHidden] = useState(() => document.hidden);
  const [reduced, setReduced] = useState(
    () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
  );
  const [ref, visible] = useInView<HTMLElement>({ once: false, threshold: 0.15 });
  useEffect(() => {
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const motion = () => setReduced(media?.matches ?? false);
    const visibility = () => setHidden(document.hidden);
    media?.addEventListener('change', motion);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      media?.removeEventListener('change', motion);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, []);
  const running = playing && visible && !hidden && !reduced;
  useInterval(
    () => setSelected((value) => (value + 1) % SCENES.length),
    running && automatic ? 9000 : null,
  );
  const scene = SCENES[selected];
  const feature = FEATURES.find((entry) => entry.id === scene.id)!;
  const localOnly = IS_SHOWCASE && (!scene.chapter || !isShowcaseChapter(scene.chapter));
  return (
    <section
      ref={ref}
      className="feature-film"
      aria-labelledby="feature-film-title"
      data-running={running}
      data-reduced={reduced}
    >
      <div className="feature-film-heading">
        <span className="ob-eyebrow">Beyond the answer</span>
        <h2 id="feature-film-title">Six ways to follow your curiosity.</h2>
      </div>
      <div className="feature-film-controls" aria-label="Feature illustrations">
        {SCENES.map((entry, index) => (
          <button
            key={entry.id}
            type="button"
            aria-pressed={index === selected}
            onClick={() => {
              setSelected(index);
              setAutomatic(false);
              setPlaying(true);
            }}
          >
            <span>0{index + 1}</span>
            {entry.short}
          </button>
        ))}
      </div>
      <div className="feature-film-stage" data-scene={scene.id}>
        <div className="feature-film-caption">
          <span>Animated feature illustration · sample content</span>
          <button
            type="button"
            aria-pressed={!playing}
            onClick={() => setPlaying((value) => !value)}
          >
            {playing ? 'Pause film' : 'Play film'}
          </button>
        </div>
        <div key={scene.id} className="feature-film-art">
          <Scene id={scene.id} />
        </div>
        <div className="feature-film-info">
          <div>
            <h3>{scene.title}</h3>
            <p>{feature.blurb}</p>
          </div>
          <a
            href={
              localOnly
                ? '#install'
                : scene.chapter
                  ? `#/live?tour=1&ch=${scene.chapter}&solo=1`
                  : '#/dashboards'
            }
          >
            {localOnly ? 'Run locally' : `Explore ${scene.short}`} ↗
          </a>
        </div>
      </div>
    </section>
  );
}

function Scene({ id }: { id: (typeof SCENES)[number]['id'] }) {
  return (
    <svg
      viewBox="0 0 1000 500"
      role="img"
      aria-label={`${SCENES.find((entry) => entry.id === id)?.short} illustrated example`}
    >
      {id === 'deepzoom' && (
        <>
          <g className="ff-zoom-field">
            {[210, 155, 100, 45].map((radius, index) => (
              <circle
                key={radius}
                className={`ff-orbit ff-delay-${index}`}
                cx="500"
                cy="245"
                r={radius}
              />
            ))}
            <path
              className="ff-stem"
              d="M500 390V130M500 280Q350 280 390 170Q500 180 500 280M500 230Q650 230 610 120Q500 140 500 230"
            />
            <circle className="ff-nucleus" cx="500" cy="245" r="16" />
          </g>
          <text className="ff-large" x="70" y="110">
            A whole plant.
          </text>
          <text className="ff-serif" x="665" y="392">
            A single photon.
          </text>
          <path className="ff-thread" d="M80 140H260L380 210M620 270L720 335H925" />
          <text x="75" y="460">
            PLANT → LEAF → CELL → CHLOROPLAST → PHOTON
          </text>
        </>
      )}
      {id === 'courses' && (
        <>
          <path
            className="ff-path-track"
            d="M100 340C260 340 180 150 350 150S530 350 660 290S730 110 900 130"
          />
          <path
            className="ff-path-active"
            pathLength="1"
            d="M100 340C260 340 180 150 350 150S530 350 660 290S730 110 900 130"
          />
          {[
            [100, 340, 'Start here'],
            [350, 150, 'Build intuition'],
            [660, 290, 'Try it yourself'],
            [900, 130, 'Checkpoint'],
          ].map(([x, y, label], index) => (
            <g className={`ff-stop ff-delay-${index}`} key={label}>
              <circle cx={x} cy={y} r="30" />
              <text x={x} y={Number(y) + 7} textAnchor="middle">
                0{index + 1}
              </text>
              <text x={x} y={Number(y) + 64} textAnchor="middle">
                {label}
              </text>
            </g>
          ))}
          <text className="ff-serif" x="65" y="75">
            One lesson opens the next possibility.
          </text>
        </>
      )}
      {id === 'review' && (
        <>
          <g className="ff-card-back">
            <rect x="255" y="95" width="490" height="300" rx="20" />
          </g>
          <g className="ff-flashcard">
            <rect x="255" y="75" width="490" height="300" rx="20" />
            <text x="295" y="125">
              ASTRONOMY / 01
            </text>
            <g className="ff-question">
              <text className="ff-large" textAnchor="middle" x="500" y="215">
                Why does light bend?
              </text>
              <text textAnchor="middle" x="500" y="260">
                Recall before you reveal.
              </text>
            </g>
            <g className="ff-answer">
              <text className="ff-large" textAnchor="middle" x="500" y="205">
                Spacetime curves.
              </text>
              <text textAnchor="middle" x="500" y="250">
                Light follows that geometry.
              </text>
            </g>
          </g>
          <text className="ff-serif" x="500" y="450" textAnchor="middle">
            A question today. A memory tomorrow.
          </text>
        </>
      )}
      {id === 'dashboards' && (
        <>
          <g className="ff-dashboard">
            <rect x="115" y="75" width="770" height="340" rx="18" />
            <text x="155" y="120">
              YOUR RUNNING DASHBOARD
            </text>
            <text x="845" y="120" textAnchor="end">
              SAMPLE / NOT LIVE
            </text>
            <path className="ff-grid" d="M155 190H845M155 260H845M155 330H845" />
            <path
              className="ff-chart"
              pathLength="1"
              d="M155 335L235 310L310 325L390 255L465 265L540 215L615 240L695 155L770 180L845 145"
            />
            <path className="ff-scan" d="M155 145V360" />
            <circle className="ff-beacon" cx="845" cy="145" r="8" />
          </g>
          <text x="500" y="466" textAnchor="middle">
            Scheduled refreshes while Mavéa is running.
          </text>
        </>
      )}
      {id === 'pdf-world' && (
        <>
          <g className="ff-document">
            <rect x="85" y="105" width="210" height="280" rx="10" />
            <text x="110" y="148">
              SOURCE DOCUMENT
            </text>
            <path
              className="ff-document-lines"
              d="M110 180H270M110 205H270M110 230H250M110 280H270M110 305H255M110 330H270"
            />
            <path className="ff-highlight" d="M108 230H252" />
          </g>
          <path className="ff-prism" d="M475 155L560 335H390Z" />
          <path
            className="ff-thread ff-draw"
            pathLength="1"
            d="M295 230H420M530 245L680 120M540 265H680M540 285L680 400"
          />
          {[
            ['Grounded claim', 120],
            ['Quoted passage', 265],
            ['Source location', 400],
          ].map(([label, y], index) => (
            <g className={`ff-claim ff-delay-${index}`} key={label}>
              <circle cx="695" cy={y} r="10" />
              <text className="ff-large" x="725" y={Number(y) + 7}>
                {label}
              </text>
            </g>
          ))}
          <text x="90" y="450">
            FOLLOW THE THREAD BACK TO THE WORDS.
          </text>
        </>
      )}
      {id === 'ripple' && (
        <>
          {[75, 135, 200].map((radius, index) => (
            <circle
              key={radius}
              className={`ff-ripple-ring ff-delay-${index}`}
              cx="500"
              cy="250"
              r={radius}
            />
          ))}
          <path
            className="ff-thread ff-draw"
            pathLength="1"
            d="M500 250L280 130M500 250L730 105M500 250L780 365M500 250L220 370"
          />
          {[
            [500, 250, 'Changed API'],
            [280, 130, 'Callers'],
            [730, 105, 'Tests'],
            [780, 365, 'Migration'],
            [220, 370, 'UI state'],
          ].map(([x, y, label], index) => (
            <g className={`ff-node ff-delay-${index}`} key={label}>
              <rect x={Number(x) - 78} y={Number(y) - 26} width="156" height="52" rx="26" />
              <text x={x} y={Number(y) + 6} textAnchor="middle">
                {label}
              </text>
            </g>
          ))}
          <text x="500" y="475" textAnchor="middle">
            ILLUSTRATIVE DEPENDENCIES · REVIEW THE IMPACT, THEN THE CHANGE.
          </text>
        </>
      )}
    </svg>
  );
}
