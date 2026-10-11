import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Presence } from '../../presence/Presence';
import { useVoiceEnergySink } from '../../voice/voiceEnergy';
import { Icon } from '../../icons/icons';
import { applyTheme, readTheme, type Theme } from '../../lib/theme';
import {
  RETENTION,
  LAUNCH_STEPS,
  retentionScenario,
  retentionPath,
  exampleForQuestion,
  type StudioScene,
  type StudioView,
} from './model';
import './studio.css';

const SCENE_TITLES: Record<StudioScene, string> = {
  growth: 'Growth signals',
  launch: 'The next 21 days',
};
const SCENE_HISTORY: Record<StudioScene, string> = {
  growth: 'Where growth really lives',
  launch: 'A launch with intention',
};

const VIEWS: { id: StudioView; label: string }[] = [
  { id: 'canvas', label: 'Canvas' },
  { id: 'compare', label: 'Compare' },
  { id: 'connections', label: 'Connections' },
];

function RetentionChart({
  lift,
  week,
  onWeek,
}: {
  lift: number;
  week: number;
  onWeek: (week: number) => void;
}) {
  const gradient = `studio-fill-${useId().replace(/\W/g, '')}`;
  const projected = retentionScenario(lift);
  return (
    <div className="studio-chart">
      <svg
        viewBox="0 0 800 330"
        role="img"
        aria-label={`Example retention: ${RETENTION[week]} percent at week ${week}, with a scenario of ${Math.round(projected[week])} percent.`}
      >
        <defs>
          <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" className="studio-fill-top" />
            <stop offset="100%" className="studio-fill-bottom" />
          </linearGradient>
        </defs>
        {[0, 25, 50, 75, 100].map((value) => (
          <g key={value}>
            <line
              className="studio-grid-line"
              x1="60"
              x2="720"
              y1={280 - value * 2.2}
              y2={280 - value * 2.2}
            />
            <text className="studio-axis" x="52" y={285 - value * 2.2} textAnchor="end">
              {value}%
            </text>
          </g>
        ))}
        <path d={`${retentionPath(projected)} L 720 280 L 60 280 Z`} fill={`url(#${gradient})`} />
        <path className="studio-line studio-line-scenario" d={retentionPath(projected)} />
        <path className="studio-line studio-line-baseline" d={retentionPath(RETENTION)} />
        <line
          className="studio-crosshair"
          x1={60 + week * 82.5}
          x2={60 + week * 82.5}
          y1="48"
          y2="280"
        />
        <circle
          className="studio-point studio-point-scenario"
          cx={60 + week * 82.5}
          cy={280 - projected[week] * 2.2}
          r="6"
        />
        <circle
          className="studio-point studio-point-baseline"
          cx={60 + week * 82.5}
          cy={280 - RETENTION[week] * 2.2}
          r="5"
        />
        {[0, 2, 4, 6, 8].map((i) => (
          <text key={i} className="studio-axis" x={60 + i * 82.5} y="310" textAnchor="middle">
            Week {i}
          </text>
        ))}
      </svg>
      <div className="studio-week-picker" aria-label="Inspect a week">
        {RETENTION.map((_, i) => (
          <button
            key={i}
            type="button"
            aria-label={`Inspect week ${i}`}
            aria-pressed={week === i}
            onClick={() => onWeek(i)}
          >
            <span>{i}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function Connections({ scene, onEvidence }: { scene: StudioScene; onEvidence: () => void }) {
  const nodes =
    scene === 'growth'
      ? [
          ['First experience', 'The moment value becomes real'],
          ['Activation', 'A reason to come back'],
          ['Retention', 'A habit worth keeping'],
          ['Compounding growth', 'More value from the same audience'],
        ]
      : [
          ['Customer signal', 'Start with a problem that matters'],
          ['Smallest promise', 'One useful, complete workflow'],
          ['Focused beta', 'Learn with a small audience'],
          ['Confident launch', 'Expand after the signal is clear'],
        ];
  return (
    <div className="studio-connections">
      <div className="studio-orbit" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <p className="studio-kicker">THE THREAD THAT CONNECTS IT</p>
      <h3>
        Nothing happens
        <br />
        in isolation.
      </h3>
      <div className="studio-node-chain">
        {nodes.map(([title, detail], i) => (
          <button type="button" key={title} onClick={onEvidence}>
            <span className="studio-node-number">0{i + 1}</span>
            <strong>{title}</strong>
            <span>{detail}</span>
            {i < nodes.length - 1 && (
              <span className="studio-node-link" aria-hidden="true">
                ↓
              </span>
            )}
          </button>
        ))}
      </div>
      <p className="studio-small">
        An illustrative relationship map. Open a node to inspect the assumptions.
      </p>
    </div>
  );
}

export function StudioLab() {
  const [theme, setTheme] = useState<Theme>(readTheme);
  const [scene, setScene] = useState<StudioScene>('growth');
  const [view, setView] = useState<StudioView>('canvas');
  const [lift, setLift] = useState(20);
  const [week, setWeek] = useState(8);
  const [welcome, setWelcome] = useState(false);
  const [evidence, setEvidence] = useState(false);
  const [presenting, setPresenting] = useState(false);
  const [query, setQuery] = useState('');
  const [notice, setNotice] = useState('');
  const [saved, setSaved] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const voiceSinkRef = useVoiceEnergySink();
  const evidenceRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (evidence) {
      evidenceRef.current?.scrollIntoView({ block: 'nearest' });
      evidenceRef.current?.focus({ preventScroll: true });
    }
  }, [evidence]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setPresenting(false);
        setNavOpen(false);
      }
    };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, []);
  const [selectedStep, setSelectedStep] = useState(1);
  const [history, setHistory] = useState<StudioScene[]>(['growth']);
  const scenarioRef = useRef<HTMLInputElement>(null);
  const composerRef = useRef<HTMLInputElement>(null);
  const projected = retentionScenario(lift);
  const improvement = Math.round(projected[week] - RETENTION[week]);
  const heading = SCENE_TITLES[scene];
  useEffect(() => {
    if (mainRef.current) mainRef.current.scrollTop = 0;
  }, [scene, welcome]);
  function openScene(next: StudioScene) {
    setNavOpen(false);
    setScene(next);
    setWelcome(false);
    setView('canvas');
    setEvidence(false);
    setSaved(false);
    setNotice('');
    setHistory((current) => (current.includes(next) ? current : [...current, next]));
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    const next = exampleForQuestion(query.trim());
    if (next) {
      openScene(next);
      setQuery('');
    } else
      setNotice(
        'This design preview has two sample worlds. Try “explore growth” or “plan a launch”. Connected Live can answer your own questions.',
      );
  }
  function exportView() {
    const text =
      scene === 'growth'
        ? `Mavéa · Growth signals\nDesign preview — illustrative data\n\nWeek ${week} baseline retention: ${RETENTION[week]}%\nScenario retention: ${Math.round(projected[week])}%\nAssumed lift at week 8: ${lift} percentage points\n\nThis scenario is an assumption, not a forecast.\n`
        : `Mavéa · The next 21 days\nDesign preview — illustrative plan\n\n${LAUNCH_STEPS.map((step) => `${step.day}: ${step.title} — ${step.detail}`).join('\n')}\n`;
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `mavea-${scene}-example.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
    setSaved(true);
  }
  function toggleTheme() {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    applyTheme(next);
  }
  return (
    <div className={`studio-app${presenting ? ' studio-presenting' : ''}`}>
      <a
        className="studio-skip"
        href="#/studiolab"
        onClick={(event) => {
          event.preventDefault();
          mainRef.current?.focus();
        }}
      >
        Skip to canvas
      </a>
      <aside className="studio-rail" aria-label="Workspace navigation">
        <a className="studio-brand" href="#/studiolab" aria-label="Mavéa design studio">
          <span className="studio-brand-mark" aria-hidden="true">
            m<span>·</span>
          </span>
          <span>mavéa</span>
        </a>
        <button
          className="studio-new"
          type="button"
          onClick={() => {
            setWelcome(true);
            setNotice('');
            setEvidence(false);
          }}
        >
          <Icon.plus aria-hidden="true" />
          New space <span>↗</span>
        </button>
        <div className="studio-rail-section">
          <span className="studio-kicker">YOUR WORKSPACE</span>
          <button
            type="button"
            className={!welcome ? 'is-active' : ''}
            onClick={() => {
              setWelcome(false);
              setEvidence(false);
            }}
          >
            <Icon.screen aria-hidden="true" />
            Live canvas <span className="studio-live-dot" />
          </button>
          <button
            type="button"
            onClick={() => {
              setWelcome(true);
              setNotice('');
            }}
          >
            <Icon.layers aria-hidden="true" />
            Explore spaces
          </button>
        </div>
        <div className="studio-rail-section studio-moments">
          <span className="studio-kicker">IN THIS SESSION</span>
          {history.map((item, i) => (
            <button
              type="button"
              key={item}
              aria-current={!welcome && scene === item ? 'page' : undefined}
              onClick={() => openScene(item)}
            >
              <span className="studio-moment-dot" />
              <span>
                {SCENE_HISTORY[item]}
                <small>
                  0{i + 1} · {item === 'growth' ? 'Interactive model' : 'Living plan'}
                </small>
              </span>
            </button>
          ))}
        </div>
        <div className="studio-rail-bottom">
          <span className="studio-local">
            <Icon.lock aria-hidden="true" />
            An example, on your device
          </span>
          <a href="#/live">
            Open connected Live <span>↗</span>
          </a>
          <div className="studio-profile">
            <span>A</span>
            <div>
              Your workspace<small>Room to think bigger.</small>
            </div>
          </div>
        </div>
      </aside>
      <div className="studio-workspace">
        <header className="studio-topbar">
          <div className="studio-mobile-navigation">
            <button
              type="button"
              className="studio-icon-button"
              aria-label="Open workspace navigation"
              aria-expanded={navOpen}
              onClick={() => setNavOpen((value) => !value)}
            >
              <Icon.menu aria-hidden="true" />
            </button>
            {navOpen && (
              <nav aria-label="Compact workspace navigation">
                <button
                  type="button"
                  onClick={() => {
                    setWelcome(true);
                    setNavOpen(false);
                    setEvidence(false);
                  }}
                >
                  New space
                </button>
                {history.map((item) => (
                  <button type="button" key={item} onClick={() => openScene(item)}>
                    {SCENE_TITLES[item]}
                  </button>
                ))}
                <a href="#/live">Open connected Live ↗</a>
              </nav>
            )}
          </div>
          <div className="studio-breadcrumb">
            <span>Workspace</span>
            <span>/</span>
            <strong>{welcome ? 'A fresh start' : heading}</strong>
          </div>
          <div className="studio-top-actions">
            <span className="studio-preview-label">DESIGN PREVIEW</span>
            <button
              type="button"
              className="studio-icon-button"
              onClick={toggleTheme}
              aria-label={theme === 'light' ? 'Preview dark theme' : 'Preview light theme'}
            >
              {theme === 'light' ? <Icon.moon /> : <Icon.sun />}
            </button>
            <button
              type="button"
              className="studio-present-button"
              aria-label={presenting ? 'Exit presentation' : 'Present'}
              aria-pressed={presenting}
              onClick={() => setPresenting((value) => !value)}
            >
              <Icon.screen aria-hidden="true" />
              <span>{presenting ? 'Exit presentation' : 'Present'}</span>
            </button>
            {!welcome && (
              <button type="button" className="studio-save" onClick={exportView}>
                <Icon.export aria-hidden="true" />
                <span>{saved ? 'Download again' : 'Save view'}</span>
              </button>
            )}
          </div>
        </header>
        <main ref={mainRef} className="studio-main" id="studio-content" tabIndex={-1}>
          {welcome ? (
            <div className="studio-welcome">
              <span className="studio-kicker">
                <span className="studio-live-dot" /> A LITTLE CURIOSITY GOES A LONG WAY
              </span>
              <h1>
                What’s on
                <br />
                your <em>mind?</em>
              </h1>
              <p>
                Bring a question. Leave with something
                <br />
                you can see, understand, and use.
              </p>
              <div className="studio-welcome-presence">
                <Presence state="idle" emotion="curious" />
              </div>
              <div className="studio-start-options">
                <button type="button" onClick={() => openScene('growth')}>
                  <span className="studio-option-icon">
                    <Icon.chart />
                  </span>
                  <span className="studio-kicker">MAKE A DECISION</span>
                  <strong>
                    Find the growth
                    <br />
                    you’re overlooking.
                  </strong>
                  <span>
                    Explore an interactive model <span>↗</span>
                  </span>
                </button>
                <button type="button" onClick={() => openScene('launch')}>
                  <span className="studio-option-icon">
                    <Icon.spark />
                  </span>
                  <span className="studio-kicker">MAKE A PLAN</span>
                  <strong>
                    Turn a big idea
                    <br />
                    into a next step.
                  </strong>
                  <span>
                    Explore a living roadmap <span>↗</span>
                  </span>
                </button>
              </div>
              <span className="studio-small">
                Two authored examples. No account, keys, or model calls.
              </span>
            </div>
          ) : (
            <>
              <div className="studio-scene-intro">
                <div>
                  <p className="studio-kicker">
                    <span className="studio-live-dot" /> A QUESTION BECOMES A WORLD
                  </p>
                  <h1>
                    {scene === 'growth' ? (
                      <>
                        Your next growth lever
                        <br />
                        is <em>already here.</em>
                      </>
                    ) : (
                      <>
                        Big ambition.
                        <br />
                        <em>Small, deliberate steps.</em>
                      </>
                    )}
                  </h1>
                  <p>
                    {scene === 'growth'
                      ? 'You don’t need a bigger audience yet. Give the people arriving a reason to stay.'
                      : 'A good launch isn’t a single moment. It’s a sequence of promises you can keep.'}
                  </p>
                </div>
                <div className="studio-scene-index">
                  <span>0{scene === 'growth' ? 1 : 2}</span>
                  <span>
                    INSIGHT
                    <br />
                    IN FOCUS
                  </span>
                </div>
              </div>
              <div className="studio-scene-layout">
                <section className="studio-canvas-panel" aria-label="Interactive answer">
                  <div className="studio-panel-top">
                    <div className="studio-view-tabs" aria-label="Answer representation">
                      {VIEWS.map((item) => (
                        <button
                          type="button"
                          key={item.id}
                          aria-pressed={view === item.id}
                          onClick={() => setView(item.id)}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                    <span className="studio-example-tag">ILLUSTRATIVE DATA</span>
                  </div>
                  {view === 'connections' ? (
                    <Connections scene={scene} onEvidence={() => setEvidence(true)} />
                  ) : scene === 'growth' ? (
                    <>
                      <div className="studio-chart-heading">
                        <div>
                          <span className="studio-kicker">
                            {view === 'compare' ? 'TWO POSSIBLE FUTURES' : 'THE COMPOUNDING EFFECT'}
                          </span>
                          <h2>Make the first week matter.</h2>
                        </div>
                        <span className="studio-chart-glyph" aria-hidden="true">
                          ↗
                        </span>
                      </div>
                      {view === 'compare' ? (
                        <div className="studio-comparison">
                          <div>
                            <span className="studio-kicker">KEEP THINGS AS THEY ARE</span>
                            <strong>
                              {RETENTION[week]}
                              <small>%</small>
                            </strong>
                            <p>People still active at week {week}</p>
                            <div className="studio-compare-track">
                              <span style={{ width: `${RETENTION[week]}%` }} />
                            </div>
                            <span>Current example cohort</span>
                          </div>
                          <div>
                            <span className="studio-kicker">CHANGE THE FIRST EXPERIENCE</span>
                            <strong>
                              {Math.round(projected[week])}
                              <small>%</small>
                            </strong>
                            <p>People still active at week {week}</p>
                            <div className="studio-compare-track">
                              <span style={{ width: `${projected[week]}%` }} />
                            </div>
                            <span>With your assumed improvement</span>
                          </div>
                        </div>
                      ) : (
                        <RetentionChart lift={lift} week={week} onWeek={setWeek} />
                      )}
                      <div className="studio-chart-footer">
                        <div className="studio-legend">
                          <span>
                            <i />
                            Current experience
                          </span>
                          <span>
                            <i />
                            Your scenario
                          </span>
                        </div>
                        <span>People retained · example cohort</span>
                      </div>
                      <div className="studio-takeaway">
                        <span className="studio-takeaway-icon">
                          <Icon.spark aria-hidden="true" />
                        </span>
                        <p>
                          <strong>
                            {improvement > 0
                              ? `${improvement} more people stay for every 100 who arrive.`
                              : 'The same experience leads to the same outcome.'}
                          </strong>
                          <span>
                            {improvement > 0
                              ? 'Explore the upside before you spend more on acquisition.'
                              : 'Move the scenario slider to explore a different outcome.'}
                          </span>
                        </p>
                        <button
                          type="button"
                          aria-label="Inspect the model assumptions"
                          onClick={() => setEvidence(true)}
                        >
                          ↗
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="studio-chart-heading">
                        <div>
                          <span className="studio-kicker">FROM IDEA TO SOMETHING REAL</span>
                          <h2>A launch you can learn from.</h2>
                        </div>
                        <span className="studio-chart-glyph" aria-hidden="true">
                          ↗
                        </span>
                      </div>
                      {view === 'compare' ? (
                        <div className="studio-launch-compare">
                          <article>
                            <span className="studio-kicker">ONE BIG REVEAL</span>
                            <h3>Build. Launch. Hope.</h3>
                            <p>All the learning arrives after the work is done.</p>
                          </article>
                          <article>
                            <span className="studio-kicker">SMALL LOOPS</span>
                            <h3>Ask. Build. Learn.</h3>
                            <p>Every step makes the next decision a little clearer.</p>
                          </article>
                        </div>
                      ) : (
                        <div className="studio-roadmap">
                          {LAUNCH_STEPS.map((step, i) => (
                            <button
                              type="button"
                              key={step.title}
                              className={selectedStep === i ? 'is-selected' : ''}
                              aria-pressed={selectedStep === i}
                              onClick={() => setSelectedStep(i)}
                            >
                              <span className="studio-roadmap-node">
                                {i === 0 ? '✓' : `0${i + 1}`}
                              </span>
                              <span className="studio-kicker">DAY {step.day}</span>
                              <strong>{step.title}</strong>
                              <span>{step.detail}</span>
                              <span className="studio-roadmap-state">
                                {i === 0
                                  ? 'The foundation'
                                  : i === selectedStep
                                    ? 'In focus'
                                    : 'Explore this step'}{' '}
                                ↗
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                      <div className="studio-takeaway">
                        <span className="studio-takeaway-icon">
                          <Icon.spark aria-hidden="true" />
                        </span>
                        <p>
                          <strong>{LAUNCH_STEPS[selectedStep].title}</strong>
                          <span>
                            {LAUNCH_STEPS[selectedStep].detail}. Focus on this before moving ahead.
                          </span>
                        </p>
                        <button
                          type="button"
                          aria-label="Inspect the plan assumptions"
                          onClick={() => setEvidence(true)}
                        >
                          ↗
                        </button>
                      </div>
                    </>
                  )}
                  <div className="studio-panel-bottom">
                    <button
                      type="button"
                      onClick={() => setEvidence((value) => !value)}
                      aria-expanded={evidence}
                    >
                      <Icon.layers aria-hidden="true" />
                      Behind this answer <span>↗</span>
                    </button>
                    <span>A model to explore, not a prediction.</span>
                  </div>
                </section>
                <aside className="studio-companion" aria-label="Mavéa’s perspective">
                  <div className="studio-companion-presence">
                    <Presence state="showing" emotion="curious" />
                  </div>
                  <p className="studio-kicker">MAVÉA’S PERSPECTIVE</p>
                  <h2>
                    {scene === 'growth' ? (
                      <>
                        The interesting part
                        <br />
                        is <em>what comes next.</em>
                      </>
                    ) : (
                      <>
                        Momentum comes
                        <br />
                        from <em>less, done well.</em>
                      </>
                    )}
                  </h2>
                  <p className="studio-perspective-copy">
                    {scene === 'growth'
                      ? 'The first week is where people decide whether to return. A better start can change the entire curve.'
                      : 'Make the next step small enough to finish, and useful enough to learn from. The plan can grow with you.'}
                  </p>
                  {scene === 'growth' ? (
                    <div className="studio-scenario">
                      <div>
                        <Icon.sliders aria-hidden="true" />
                        <span>Try a different future</span>
                      </div>
                      <label htmlFor="studio-lift">
                        Retention improvement{' '}
                        <strong>
                          +{lift}
                          <small> pts</small>
                        </strong>
                      </label>
                      <input
                        ref={scenarioRef}
                        id="studio-lift"
                        type="range"
                        min="0"
                        max="30"
                        value={lift}
                        onChange={(event) => {
                          setLift(Number(event.target.value));
                          setSaved(false);
                        }}
                      />
                      <div className="studio-range-labels">
                        <span>No change</span>
                        <span>+30 points</span>
                      </div>
                      <p>
                        Adjust the assumption.
                        <br />
                        Watch the answer change.
                      </p>
                    </div>
                  ) : (
                    <div className="studio-step-detail">
                      <span className="studio-kicker">YOUR NEXT MOVE</span>
                      <strong>{LAUNCH_STEPS[selectedStep].title}</strong>
                      <p>{LAUNCH_STEPS[selectedStep].detail}</p>
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedStep((value) => (value + 1) % LAUNCH_STEPS.length)
                        }
                      >
                        Explore the next step <span>→</span>
                      </button>
                    </div>
                  )}
                  <button
                    type="button"
                    className="studio-evidence-link"
                    onClick={() => setEvidence((value) => !value)}
                  >
                    <span className="studio-evidence-dot" />
                    <span>
                      Show your thinking<small>Assumptions & example data</small>
                    </span>
                    <span>↗</span>
                  </button>
                </aside>
              </div>
              {evidence && (
                <section
                  ref={evidenceRef}
                  tabIndex={-1}
                  className="studio-evidence"
                  aria-label="Model evidence"
                >
                  <div>
                    <span className="studio-kicker">AN ANSWER YOU CAN INSPECT</span>
                    <button
                      type="button"
                      className="studio-icon-button"
                      aria-label="Close evidence"
                      onClick={() => setEvidence(false)}
                    >
                      <Icon.x />
                    </button>
                  </div>
                  <h2>Here’s what this rests on.</h2>
                  <p>
                    This is an authored design example, not an analysis of your business. Nothing
                    here was fetched or generated.
                  </p>
                  {scene === 'growth' ? (
                    <>
                      <div className="studio-data-table">
                        <table>
                          <caption>Illustrative cohort retention and your scenario</caption>
                          <thead>
                            <tr>
                              <th scope="col">Week</th>
                              {RETENTION.map((_, i) => (
                                <th key={i} scope="col">
                                  {i}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            <tr>
                              <th scope="row">Baseline</th>
                              {RETENTION.map((value, i) => (
                                <td key={i}>{value}%</td>
                              ))}
                            </tr>
                            <tr>
                              <th scope="row">Scenario</th>
                              {projected.map((value, i) => (
                                <td key={i}>{Math.round(value)}%</td>
                              ))}
                            </tr>
                          </tbody>
                        </table>
                      </div>
                      <p className="studio-small">
                        Scenario = baseline + {lift} × (week / 8)<sup>0.6</sup>, capped at 100%. The
                        lift is an assumption you control; the model doesn’t establish causality.
                      </p>
                    </>
                  ) : (
                    <p>
                      The 21-day schedule and audience sizes are illustrative. Real timing depends
                      on your team, the product, and what customers tell you.
                    </p>
                  )}
                </section>
              )}
              <div className="studio-next-questions">
                <span>Keep exploring</span>
                <button
                  type="button"
                  onClick={() => {
                    if (scene === 'growth') {
                      scenarioRef.current?.focus();
                      setLift(10);
                    } else setSelectedStep(0);
                  }}
                >
                  {scene === 'growth' ? 'What if we start smaller?' : 'Where do we begin?'}{' '}
                  <span>↗</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEvidence(true);
                  }}
                >
                  {scene === 'growth' ? 'Show me the evidence' : 'What are we assuming?'}{' '}
                  <span>↗</span>
                </button>
                <button
                  type="button"
                  onClick={() => openScene(scene === 'growth' ? 'launch' : 'growth')}
                >
                  {scene === 'growth' ? 'Turn this into a plan' : 'Explore the growth model'}{' '}
                  <span>↗</span>
                </button>
              </div>
            </>
          )}
        </main>
        <div className="studio-conversation">
          <div className="studio-composer-wrap">
            <div className="studio-composer-presence" ref={voiceSinkRef}>
              <Presence state="idle" />
            </div>
            <form className="studio-composer" onSubmit={submit}>
              <label className="studio-sr-only" htmlFor="studio-query">
                Explore a sample question
              </label>
              <input
                ref={composerRef}
                id="studio-query"
                value={query}
                maxLength={500}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={
                  welcome
                    ? 'Start with “explore growth” or “plan a launch”…'
                    : 'Follow your curiosity. Try “plan a launch”…'
                }
              />
              <button
                type="button"
                className="studio-icon-button studio-voice"
                aria-label="About voice in this design preview"
                onClick={() =>
                  setNotice(
                    'The connected product supports voice. This design preview uses authored examples and does not access your microphone.',
                  )
                }
              >
                <Icon.mic aria-hidden="true" />
              </button>
              <button
                type="submit"
                className="studio-submit"
                aria-label="Explore sample question"
                disabled={!query.trim()}
              >
                <Icon.arrowUp aria-hidden="true" />
              </button>
            </form>
          </div>
          {notice ? (
            <div className="studio-notice" role="status">
              <span>{notice}</span>
              <button type="button" aria-label="Dismiss notice" onClick={() => setNotice('')}>
                <Icon.x />
              </button>
            </div>
          ) : (
            <p className="studio-composer-note">
              <span className="studio-live-dot" /> A space for your thinking.
              <span>Interactive design concept · sample content</span>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
