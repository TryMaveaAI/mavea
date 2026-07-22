// "No account. Your engine." — the two facts that remove the last objections: there is nothing
// to sign up for (no account backend exists), and Live runs on the visitor's own keys. Each card
// closes its pitch with a real, factual chip row before the CTA — the right shows the actual
// provider registry, the left states the shipped key/session policy in the same words
// HonestByDesign uses — so the two cards read as one balanced pair rather than the live card
// being the only one with something to point at.
// The live tag's accent modifier is named "live", NOT "presence": the latter is the bare class
// name the talking face/orb owns (presence-canvas.css sizes it to --face-size), so reusing it
// here forced this tag into a 180px square and blew a huge gap into the card above the title.
// Import from the adapter-free './info' leaf, NOT the barrel: the landing is eager, and the barrel
// pulls every provider adapter + the component catalog (~300 KB) we must keep off first paint.
import { VISIBLE_PROVIDERS } from '../../live/providers/info';
import { SectionHead } from '../parts';

const INSTANT_CHIPS = ['No sign-up', 'No install', 'Key-free tour', 'Keys session-only'];

export function TwoSurfaces({ onEnterLive }: { onEnterLive: (seed?: string) => void }) {
  return (
    <>
      <SectionHead eyebrow="Yours in seconds">
        No account. <em>Your engine.</em>
      </SectionHead>

      <div className="fl-surfaces">
        <div className="fl-surface">
          <div className="fl-surface-tag insight">Instant · no sign-up</div>
          <div className="fl-surface-title">Nothing to sign up for</div>
          <p className="fl-surface-body">
            No account, no waitlist, no install. The tour and demos run key-free; Live starts the
            moment you paste a key.
          </p>
          <div className="fl-surface-chips">
            {INSTANT_CHIPS.map((chip) => (
              <span key={chip} className="fl-surface-chip">
                {chip}
              </span>
            ))}
          </div>
          <button type="button" className="fl-ghost-btn" onClick={() => onEnterLive()}>
            Open Mavéa →
          </button>
        </div>

        <div className="fl-surface live">
          <div className="fl-surface-tag live">Live · your model</div>
          <div className="fl-surface-title">Bring your own keys</div>
          <p className="fl-surface-body">
            Anthropic, OpenAI, Gemini, Grok, OpenRouter. Same beautiful canvas, your engine.
          </p>
          <div className="fl-surface-chips">
            {VISIBLE_PROVIDERS.map((p) => (
              <span key={p.id} className="fl-surface-chip fl-model-chip">
                {p.label}
              </span>
            ))}
          </div>
          <button type="button" className="fl-ghost-btn live" onClick={() => onEnterLive()}>
            Open Live →
          </button>
        </div>
      </div>
    </>
  );
}
