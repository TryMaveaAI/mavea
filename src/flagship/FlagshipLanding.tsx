import { lazy, Suspense, useEffect, useState } from 'react';
import type { DemoCastMember } from '../demo/cast';
import { legalDocumentHref } from '../legal/links';
import { IS_SHOWCASE } from '../lib/runtimeMode';
import { Reveal } from './parts';
import { AnswerObservatory } from './sections/AnswerObservatory';
import './flagship.css';
import './observatory.css';

const DemoGallery = lazy(() =>
  import('./sections/DemoGallery').then((m) => ({ default: m.DemoGallery })),
);
const FeatureIndex = lazy(() =>
  import('./sections/FeatureIndex').then((m) => ({ default: m.FeatureIndex })),
);
const FeatureFilm = lazy(() =>
  import('./sections/FeatureFilm').then((m) => ({ default: m.FeatureFilm })),
);
const AnswerTheatre = lazy(() =>
  import('./sections/AnswerTheatre').then((m) => ({ default: m.AnswerTheatre })),
);
export const DEMO_ANCHOR = 'flagship-demo';
const INSTALL = 'npx @mavea/mavea@latest';
const REPO = 'https://github.com/TryMaveaAI/mavea';

interface Props {
  onPlay: (p: DemoCastMember) => void;
  onEnterLive: (seed?: string) => void;
  onDemoIntent?: () => void;
  onPlayTour: () => void;
  onViewWorld?: () => void;
}

function InstallCommand() {
  const [status, setStatus] = useState('Copy command');
  async function copy() {
    try {
      await navigator.clipboard.writeText(INSTALL);
      setStatus('Copied');
    } catch {
      setStatus('Select and copy the command');
    }
  }
  return (
    <div className="ob-install-command">
      <code>{INSTALL}</code>
      <button type="button" onClick={() => void copy()} aria-live="polite">
        {status} <span aria-hidden="true">↗</span>
      </button>
    </div>
  );
}

export function FlagshipLanding({
  onPlay,
  onEnterLive,
  onDemoIntent,
  onPlayTour,
  onViewWorld,
}: Props) {
  useEffect(() => {
    if (window.location.hash !== '#install') return;
    const page = document.getElementById('home-content');
    const install = document.getElementById('install');
    if (!page || !install) return;
    // Deferred sections can grow above the destination after the initial hash landing.
    // Keep the anchor steady until the visitor takes over scrolling or navigation.
    const align = () => install.scrollIntoView({ behavior: 'instant', block: 'start' });
    align();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(align);
    observer.observe(page);
    const stop = () => {
      observer.disconnect();
      window.removeEventListener('wheel', stop);
      window.removeEventListener('pointerdown', stop);
      window.removeEventListener('keydown', stop);
    };
    window.addEventListener('wheel', stop, { passive: true });
    window.addEventListener('pointerdown', stop);
    window.addEventListener('keydown', stop);
    return stop;
  }, []);
  return (
    <main className="ob-page" id="home-content">
      <Reveal className="ob-hero">
        <span className="ob-eyebrow ob-section-marker">01 / A thought takes shape</span>
        <div className="ob-hero-layout">
          <div className="ob-hero-copy">
            <h1 className="fl-hero-title">
              What if
              <br />
              an answer
              <br />
              had a <em>pulse?</em>
            </h1>
            <p>
              This is Mavéa. An AI that draws the answer, on a canvas you can wander through. A
              small invitation to think a little differently.
            </p>
            <div className="ob-actions">
              <button
                type="button"
                className="ob-button ob-button-primary"
                onClick={onPlayTour}
                onPointerEnter={onDemoIntent}
                onFocus={onDemoIntent}
              >
                <span className="ob-play" aria-hidden="true">
                  ▶
                </span>{' '}
                Let me explore <span aria-hidden="true">↗</span>
              </button>
              <span className="ob-caption">Opens the guided demo. No key needed.</span>
            </div>
          </div>
          <AnswerObservatory />
        </div>
        <div className="ob-hero-foot">
          <span>Canvas · Voice · Curiosity</span>
          <span>
            There’s more down here <span aria-hidden="true">↓</span>
          </span>
        </div>
      </Reveal>

      <Reveal className="ob-demos" id={DEMO_ANCHOR} onIntent={onDemoIntent}>
        <span className="ob-eyebrow ob-section-marker">02 / Choose another thread</span>
        <Suspense fallback={<p>Opening the recorded answer…</p>}>
          <AnswerTheatre />
        </Suspense>
        <Suspense fallback={<p>Loading the recorded examples…</p>}>
          <DemoGallery onPlay={onPlay} />
        </Suspense>
      </Reveal>

      <Reveal className="ob-guide-section">
        <span className="ob-eyebrow ob-section-marker">03 / Spend a moment with an idea</span>
        <div className="ob-section-copy">
          <h2>
            Pull up
            <br />
            <em>a thought.</em>
          </h2>
          <p>
            The board holds the whole answer. Click a card to open its Lens. Choose{' '}
            <strong>Guide me</strong> to bring it onto a desk, one card at a time, with notes in the
            margin.
          </p>
          <a className="ob-text-link" href="#/live?tour=1&ch=study&solo=1">
            Try Guide me <span aria-hidden="true">↗</span>
          </a>
        </div>
        <GuideIllustration />
      </Reveal>

      <Reveal className="ob-world-section">
        <span className="ob-eyebrow ob-section-marker">04 / Follow a loose thread</span>
        <div className="ob-world-art" aria-hidden="true">
          <svg viewBox="0 0 600 400">
            <g className="ob-world-orbits">
              {[0, 30, 60, 90, 120, 150].map((angle) => (
                <ellipse
                  key={angle}
                  cx="300"
                  cy="200"
                  rx="188"
                  ry="66"
                  transform={`rotate(${angle} 300 200)`}
                />
              ))}
            </g>
            <circle cx="300" cy="200" r="13" />
            <circle cx="112" cy="200" r="6" />
            <circle cx="394" cy="363" r="6" />
            <circle cx="394" cy="37" r="6" />
          </svg>
          <span className="ob-world-label">
            Everything
            <br />
            <em>touches something.</em>
          </span>
        </div>
        <div className="ob-section-copy">
          <h2>
            Stay with
            <br />
            <em>the why.</em>
          </h2>
          <p>
            A living answer opens into its causes and connections. Follow the evidence, inspect a
            part, or walk through the story. See where it takes you.
          </p>
          <button type="button" className="ob-text-link" onClick={onViewWorld ?? onPlayTour}>
            Explore a living answer <span aria-hidden="true">↗</span>
          </button>
        </div>
      </Reveal>

      <Reveal className="ob-after">
        <span className="ob-eyebrow ob-section-marker">05 / A few other doors to open</span>
        <Suspense fallback={<p>Opening the feature illustrations…</p>}>
          <FeatureFilm />
        </Suspense>
        <div className="ob-after-links">
          <a href="#/live?tour=1&ch=prism&solo=1">
            <span>↳</span>
            <strong>Where did that come from?</strong>
            <span>Prism · claims connected to document pages</span>
            <b aria-hidden="true">↗</b>
          </a>
          <a href="#/live?tour=1&ch=export&solo=1">
            <span>↳</span>
            <strong>Take the idea with you.</strong>
            <span>Presentation · a canvas becomes a deck</span>
            <b aria-hidden="true">↗</b>
          </a>
          <a href="#/live?tour=1&ch=share&solo=1">
            <span>↳</span>
            <strong>Give it a second life.</strong>
            <span>Reels · an answer becomes a vertical clip</span>
            <b aria-hidden="true">↗</b>
          </a>
        </div>
      </Reveal>

      <Reveal className="ob-feature-section" id="features" defer reserve={880}>
        <span className="ob-eyebrow ob-section-marker">06 / The field guide</span>
        <Suspense fallback={<p>Opening the field guide…</p>}>
          <FeatureIndex />
        </Suspense>
      </Reveal>

      <Reveal className="ob-install" id="install">
        <div className="ob-install-top">
          <span className="ob-eyebrow ob-section-marker">07 / Bring your own curiosity</span>
          <span className="ob-install-star" aria-hidden="true">
            ✳
          </span>
        </div>
        <h2>
          See what
          <br />
          <em>you make of it.</em>
        </h2>
        <p>
          {IS_SHOWCASE
            ? 'Mavéa runs on your machine. The demos work right away. Add your own provider key when you’re ready to ask your own questions.'
            : 'You’re already running Mavéa. Explore without a key, or connect your provider when you’re ready to ask your own questions.'}
        </p>
        {IS_SHOWCASE && <InstallCommand />}
        <p className="ob-install-note">
          {IS_SHOWCASE && (
            <>
              Node.js 22.12+ · macOS, Windows, Linux · Opens in your browser.
              <br />
            </>
          )}
          Live uses your provider’s API key and billing. Local speech services are optional.
        </p>
        <div className="ob-install-links">
          {!IS_SHOWCASE && (
            <button type="button" className="ob-button" onClick={() => onEnterLive()}>
              Open Mavéa ↗
            </button>
          )}
          {IS_SHOWCASE ? (
            <>
              <a href={`${REPO}#readme`} target="_blank" rel="noreferrer">
                Installation guide ↗
              </a>
              <a href="https://www.npmjs.com/package/@mavea/mavea" target="_blank" rel="noreferrer">
                npm ↗
              </a>
            </>
          ) : (
            <button type="button" className="ob-button" onClick={onPlayTour}>
              Take the guided tour ↗
            </button>
          )}
          <a href={REPO} target="_blank" rel="noreferrer">
            Read the source ↗
          </a>
        </div>
        {IS_SHOWCASE && (
          <p className="ob-install-note">
            This website plays recorded demos and the guided tour. Prompts and setup are available
            in the local app.
          </p>
        )}
      </Reveal>
      <footer className="ob-footer">
        <a className="ob-wordmark" href="#/">
          Mavéa<span>™</span>
        </a>
        <span>A little more curious.</span>
        <nav aria-label="Project and legal information">
          <a href={REPO} target="_blank" rel="noreferrer">
            GitHub ↗
          </a>
          <a href={`${REPO}/discussions`} target="_blank" rel="noreferrer">
            Discussions ↗
          </a>
          <a href="#/terms?from=home">Terms</a>
          <a href="#/privacy?from=home">Privacy</a>
          <a href="#/legal?from=home">Important information</a>
          <a href={legalDocumentHref('LICENSE.txt')} target="_blank" rel="noreferrer">
            Source-available license
          </a>
        </nav>
        <small>AI can make mistakes. Verify important information.</small>
      </footer>
    </main>
  );
}

function GuideIllustration() {
  const [selected, setSelected] = useState(0);
  const cards = ['The whole picture', 'What stands out', 'A question to keep'];
  return (
    <div className="ob-guide-art">
      <div className="ob-guide-top">
        <span>Guide me</span>
        <span>Illustrated preview · {selected + 1} / 3</span>
      </div>
      <div className="ob-guide-desk">
        <div className="ob-guide-paper" key={selected}>
          <span className="ob-eyebrow">A closer look</span>
          <h3>{cards[selected]}</h3>
          {selected === 0 && (
            <svg
              viewBox="0 0 340 180"
              role="img"
              aria-label="Illustrative comparison of six values"
            >
              <path className="ob-chart-grid" d="M20 35H320 M20 75H320 M20 115H320" />
              {[42, 67, 53, 101, 84, 120].map((height, i) => (
                <rect key={i} x={30 + i * 48} y={140 - height} width="24" height={height} rx="3" />
              ))}
              <ellipse className="ob-ink-circle" cx="284" cy="67" rx="31" ry="64" />
            </svg>
          )}
          {selected === 1 && (
            <svg
              className="ob-guide-network"
              viewBox="0 0 340 180"
              role="img"
              aria-label="An illustrative connection from a cause through a change to an outcome"
            >
              <path d="M70 90Q130 15 170 90T270 90" pathLength="1" />
              {[70, 170, 270].map((x, i) => (
                <g key={x}>
                  <circle cx={x} cy="90" r={i === 1 ? 29 : 20} />
                  <text x={x} y="148" textAnchor="middle">
                    {['A cause', 'A change', 'An outcome'][i]}
                  </text>
                </g>
              ))}
            </svg>
          )}
          {selected === 2 && (
            <div className="ob-guide-question">
              <span aria-hidden="true">?</span>
              <p>
                What would have to change
                <br />
                for a different outcome?
              </p>
              <div>
                <span>Assumptions</span>
                <span>Evidence</span>
                <span>Alternatives</span>
              </div>
            </div>
          )}
          <span className="ob-caption">
            {selected === 0 ? 'Illustrative data' : 'Illustrative explanation'}
          </span>
        </div>
        <aside className="ob-margin-note">
          <span aria-hidden="true">↙</span>
          {
            [
              'Look at the pattern, then the exception.',
              'The interesting part is right here.',
              'What would change your mind?',
            ][selected]
          }
        </aside>
      </div>
      <div className="ob-guide-controls" aria-label="Preview cards">
        {cards.map((card, i) => (
          <button
            type="button"
            key={card}
            aria-label={card}
            aria-pressed={selected === i}
            onClick={() => setSelected(i)}
          >
            <span>0{i + 1}</span>
            {card}
          </button>
        ))}
      </div>
    </div>
  );
}
