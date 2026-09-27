import { useState } from 'react';
import { useAmbientPause } from '../../hooks/useInView';

const SCENES = ['Connect the dots', 'Map the idea', 'Look closer'] as const;

/** Expressive artwork sits beside the real recorded canvas, never masquerading as an answer. */
export function AnswerObservatory() {
  const [scene, setScene] = useState(0);
  const [paused, setPaused] = useState(false);
  const ref = useAmbientPause<HTMLDivElement>();
  return (
    <div className="ob-observatory" ref={ref} data-paused={paused}>
      <div className="ob-observatory-top">
        <span>
          <i /> The shape of a thought
        </span>
        <button
          type="button"
          aria-label={paused ? 'Play illustration animation' : 'Pause illustration animation'}
          onClick={() => setPaused(!paused)}
        >
          {paused ? '▶' : 'Ⅱ'}
        </button>
      </div>
      <div className="ob-universe" key={scene}>
        <svg className="ob-orbit-map" viewBox="0 0 640 560" role="img" aria-label={SCENES[scene]}>
          <defs>
            <radialGradient id="ob-core">
              <stop stopColor="var(--ob-sun-light)" />
              <stop offset=".55" stopColor="var(--ob-sun)" />
              <stop offset="1" stopColor="var(--ob-sun-edge)" />
            </radialGradient>
          </defs>
          {scene === 0 ? (
            <>
              <g className="ob-orbit-rings">
                {[110, 150, 192, 234].map((r) => (
                  <circle key={r} cx="320" cy="280" r={r} />
                ))}
                <path d="M35 280H605M320 28V530" />
              </g>
              <g className="ob-threads">
                <path
                  pathLength="1"
                  d="M130 150Q160 300 320 280T525 155M320 280Q500 275 478 420M320 280Q200 460 120 395"
                />
              </g>
              <g className="ob-core">
                <circle className="ob-core-halo" cx="320" cy="280" r="108" />
                <circle cx="320" cy="280" r="87" fill="url(#ob-core)" />
                <g className="ob-core-lines">
                  {[15, 30, 45, 60].map((r) => (
                    <ellipse key={r} cx="320" cy="280" rx="86" ry={r} />
                  ))}
                </g>
              </g>
              <g className="ob-satellite">
                <circle cx="320" cy="88" r="7" />
                <circle className="ob-satellite-halo" cx="320" cy="88" r="15" />
              </g>
              {[
                [130, 150],
                [525, 155],
                [478, 420],
                [120, 395],
              ].map(([x, y], i) => (
                <g className="ob-node" key={i}>
                  <circle cx={x} cy={y} r="20" />
                  <text x={x} y={y + 8} textAnchor="middle">
                    0{i + 1}
                  </text>
                </g>
              ))}
            </>
          ) : scene === 1 ? (
            <>
              <path className="ob-map-water" d="M400 0Q280 140 400 280T320 560H640V0Z" />
              <g className="ob-map-contours">
                {[0, 1, 2, 3, 4, 5].map((n) => (
                  <path
                    key={n}
                    d={`M${30 + n * 23} 540Q${80 + n * 10} 350 ${160 + n * 19} 300T${140 + n * 25} 20`}
                  />
                ))}
              </g>
              <path
                className="ob-map-route"
                pathLength="1"
                d="M150 400C115 350 195 290 240 305S380 305 355 210S455 130 490 170"
              />
              <circle className="ob-route-traveler" r="7" />
              {[
                [150, 400],
                [240, 305],
                [355, 210],
                [490, 170],
              ].map(([x, y], i) => (
                <g className="ob-map-stop" key={i}>
                  <circle cx={x} cy={y} r="22" />
                  <text x={x} y={y + 6} textAnchor="middle">
                    {i + 1}
                  </text>
                </g>
              ))}
            </>
          ) : (
            <>
              <rect className="ob-detail-paper" x="65" y="115" width="510" height="330" rx="12" />
              <g className="ob-map-streets">
                <path d="M95 180H540M95 250H540M95 320H540M95 390H540" />
              </g>
              <path
                className="ob-detail-trend"
                pathLength="1"
                d="M98 373L160 340L210 354L270 285L320 290L380 220L440 250L535 165"
              />
              <g className="ob-detail-lens">
                <path className="ob-lens-handle" d="M397 339L478 420" />
                <circle className="ob-lens-glass" cx="333" cy="271" r="105" />
                <path
                  className="ob-lens-trend"
                  pathLength="1"
                  d="M250 303L290 262L325 290L365 215L413 245"
                />
                <circle className="ob-detail-dot" cx="325" cy="290" r="8" />
              </g>
            </>
          )}
        </svg>
      </div>
      {scene === 0 && (
        <div className="ob-restored-notes" aria-hidden="true">
          <div className="ob-floating-note ob-note-a">
            <span className="ob-mini-label">The big picture</span>
            <strong>Start with a little curiosity.</strong>
            <svg viewBox="0 0 180 60">
              <path
                className="ob-mini-line"
                d="M4 50C20 45 20 10 40 22S66 58 85 32S114 45 132 15S160 25 176 5"
              />
            </svg>
          </div>
          <div className="ob-floating-note ob-note-b">
            <span className="ob-mini-label">An unexpected connection</span>
            <div className="ob-note-bars">
              {[45, 72, 54, 90, 64, 100, 80].map((height, index) => (
                <i key={index} style={{ height: `${height}%` }} />
              ))}
            </div>
            <span className="ob-note-hand">Follow the thread.</span>
          </div>
        </div>
      )}
      <div className="ob-observatory-bottom">
        <span className="ob-mini-label">Interactive illustration</span>
        <h2 aria-live="polite">
          {
            ['Everything is connected.', 'Take the scenic route.', 'There’s more to the story.'][
              scene
            ]
          }
        </h2>
        <div className="ob-view-controls" aria-label="Explore the illustration">
          {SCENES.map((label, i) => (
            <button
              type="button"
              key={label}
              aria-pressed={scene === i}
              onClick={() => setScene(i)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
