// DemoOverlay — the curated replay's chrome, deliberately lighter than the walkthrough's: a slim
// scenario banner, a bottom transport (step dots, play/pause,
// exit), and the occasional one-line beat caption. No coach voice, no spotlight scrim — the
// answers' own narration and reveal walks ARE the show; this overlay only frames them. It
// renders OVER the real Live surface and is pointer-transparent except for its own controls.
import { useRef, type ReactElement } from 'react';
import { Icon } from '../icons/icons';
import { useFocusTrap } from '../live/useFocusTrap';
import type { DemoDriver } from './useDemoDriver';
import { DEMO_CAST, type DemoCastMember } from './cast';
import { launchDemo } from './demoEntry';
import './demo.css';

function isEmojiAvatar(avatar: string): boolean {
  return /\p{Extended_Pictographic}/u.test(avatar);
}

/** Leave the replay for the marketing landing — the same destination the error card offers. */
function backToHome(): void {
  window.location.hash = '#/';
}

export function DemoOverlay({
  driver,
  member,
  onExit,
}: {
  driver: DemoDriver;
  member: DemoCastMember;
  /** Leave the demo into the real surface (clean reload — see endTourToApp). */
  onExit: () => void;
}): ReactElement | null {
  // The start and end cards are the replay's only modal moments — each sits on the .demox-intro
  // scrim, so keyboard focus has to move into the card and stay there while it's up (otherwise Tab
  // walks straight into the session behind the scrim, which the pointer can't even reach).
  const cardRef = useRef<HTMLDivElement>(null);
  const modal = driver.active && driver.loadState === 'ready' && (!driver.started || driver.done);
  useFocusTrap(cardRef, { active: modal });

  if (!driver.active) return null;
  const accentStyle = { ['--accent' as string]: member.accent };

  if (driver.loadState === 'loading') {
    return (
      <div className="demox" aria-live="polite">
        <div className="demox-load" style={accentStyle}>
          <Icon.spinner className="demox-spinner" />
          Loading curated replay…
        </div>
      </div>
    );
  }

  if (driver.loadState === 'error') {
    return (
      <div className="demox" aria-live="polite">
        <div className="demox-card" style={accentStyle} role="alert">
          <p className="demox-card-title">This demo couldn&rsquo;t load</p>
          <p className="demox-card-body">
            The curated prerecorded example did not come through. Check your connection and try
            again.
          </p>
          <div className="demox-card-actions">
            <button type="button" className="demox-primary" onClick={driver.reload}>
              Retry
            </button>
            <button type="button" className="demox-ghost" onClick={backToHome}>
              Back to home
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!driver.started) {
    return (
      <div className="demox demox-intro" aria-live="polite">
        <div
          ref={cardRef}
          className="demox-card demox-start"
          style={accentStyle}
          role="dialog"
          aria-modal="true"
          aria-labelledby="demox-start-title"
        >
          <span className={'demox-avatar' + (isEmojiAvatar(member.avatar) ? ' emoji' : '')}>
            {member.avatar}
          </span>
          <span className="demox-card-kicker">Curated prerecorded example</span>
          <p id="demox-start-title" className="demox-card-title">
            Watch: {member.useCase}
          </p>
          <p className="demox-card-body">
            This fictional scenario replays prerecorded, model-generated answers with curated
            feature choreography. Pause or move between steps at any time.
          </p>
          <div className="demox-card-actions">
            <button type="button" className="demox-primary" onClick={driver.start}>
              Start demo
            </button>
            <button type="button" className="demox-ghost" onClick={backToHome}>
              Back to home
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (driver.done) {
    // Every other curated replay — the end card is how the non-hero scenarios stay reachable.
    const others = DEMO_CAST.filter((p) => p.id !== member.id);
    return (
      <div className="demox demox-intro" aria-live="polite">
        <div
          ref={cardRef}
          className="demox-card demox-end"
          style={accentStyle}
          role="dialog"
          aria-modal="true"
          aria-labelledby="demox-end-title"
        >
          <span className={'demox-avatar' + (isEmojiAvatar(member.avatar) ? ' emoji' : '')}>
            {member.avatar}
          </span>
          <p id="demox-end-title" className="demox-card-title">
            End of curated replay
          </p>
          <p className="demox-card-body">
            These model-generated answers were prerecorded, then replayed with curated feature
            choreography. The scenario is illustrative, not a live result or customer testimonial.
            Try your own question with your selected provider.
          </p>
          <div className="demox-card-actions">
            <button type="button" className="demox-primary" onClick={onExit}>
              Try it yourself
            </button>
            <button type="button" className="demox-ghost" onClick={driver.replay}>
              Replay
            </button>
          </div>
          <div className="demox-others" role="group" aria-label="More curated replays">
            {others.map((p) => (
              <button
                key={p.id}
                type="button"
                className="demox-other"
                style={{ ['--accent' as string]: p.accent }}
                onClick={() => launchDemo(p.id)}
                title={`${p.name} · ${p.role}`}
              >
                <span className={'demox-other-avatar' + (isEmojiAvatar(p.avatar) ? ' emoji' : '')}>
                  {p.avatar}
                </span>
                {p.useCase}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="demox" aria-live="polite">
      {/* What this replay shows (the fictional persona is supporting detail) — top-left. */}
      <div className="demox-banner" style={accentStyle}>
        <span className={'demox-avatar' + (isEmojiAvatar(member.avatar) ? ' emoji' : '')}>
          {member.avatar}
        </span>
        <span className="demox-who">
          <span className="demox-name">{member.useCase}</span>
          <span className="demox-role">
            {member.name} · {member.role}
          </span>
        </span>
        <span className="demox-badge">Curated replay</span>
      </div>

      {/* One-line beat caption ("Renata pins the bridge…"), only while a beat performs. */}
      {driver.note && (
        <div className="demox-note" key={driver.note} style={accentStyle}>
          {driver.note}
        </div>
      )}

      {/* Transport — bottom-center, above the composer. */}
      <div className="demox-panel" style={accentStyle} role="group" aria-label="Demo controls">
        <button
          type="button"
          className="demox-btn"
          onClick={driver.prev}
          disabled={driver.index === 0}
          aria-label="Previous step"
        >
          <Icon.chevL className="demox-ic" />
        </button>
        <button
          type="button"
          className="demox-btn demox-play"
          onClick={driver.toggle}
          aria-label={driver.playing ? 'Pause autoplay' : 'Turn on autoplay'}
        >
          {driver.playing ? (
            <Icon.pause className="demox-ic" />
          ) : (
            <Icon.play className="demox-ic" />
          )}
        </button>
        <button
          type="button"
          className="demox-btn demox-mute"
          onClick={driver.toggleMute}
          aria-label={driver.muted ? 'Turn narration on' : 'Mute narration'}
          aria-pressed={driver.muted}
          title={driver.muted ? 'Turn narration on' : 'Mute narration'}
        >
          {driver.muted ? (
            <Icon.speakerOff className="demox-ic" />
          ) : (
            <Icon.speaker className="demox-ic" />
          )}
        </button>
        <button type="button" className="demox-btn" onClick={driver.next} aria-label="Next step">
          <Icon.chevR className="demox-ic" />
        </button>
        <div className="demox-dots" role="tablist" aria-label="Steps">
          {Array.from({ length: driver.total }, (_, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={i === driver.index}
              aria-label={`Step ${i + 1}`}
              className={'demox-dot' + (i === driver.index ? ' is-active' : '')}
              onClick={() => driver.jumpTo(i)}
            />
          ))}
        </div>
        <button
          type="button"
          className="demox-skip"
          onClick={onExit}
          aria-label="Exit demo, try it yourself"
        >
          <span className="demox-skip-full">Exit, try it yourself</span>
          <span className="demox-skip-short" aria-hidden="true">
            Exit
          </span>
        </button>
      </div>
    </div>
  );
}
