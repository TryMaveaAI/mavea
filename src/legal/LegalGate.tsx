import {
  useRef,
  useState,
  useSyncExternalStore,
  type ReactElement,
  type ReactNode,
  type RefCallback,
} from 'react';
import {
  acceptLegalTerms,
  hasEarlierAcceptance,
  hasLegalAcceptance,
  subscribeLegalAcceptance,
} from './acceptance';
import { legalDocumentHref } from './links';
import { VOICE_DATA_NOTICE } from './voiceNotice';
import './legal-gate.css';

/** Publishes the footer's height as `--legal-gate-foot` on the root, where the document's
 *  `scroll-padding-bottom` reads it: tabbing to a link or a checkbox scrolls it into view ABOVE the
 *  sticky footer rather than under it. The footer's height moves (it drops the tick hint once both
 *  boxes are ticked, and wraps differently at every width), so it is measured, not guessed. */
const publishFooterHeight: RefCallback<HTMLElement> = (footer) => {
  if (!footer || typeof ResizeObserver === 'undefined') return;
  const root = document.documentElement;
  const observer = new ResizeObserver(([entry]) => {
    root.style.setProperty('--legal-gate-foot', `${Math.ceil(entry.borderBoxSize[0].blockSize)}px`);
  });
  observer.observe(footer);
  return () => {
    observer.disconnect();
    root.style.removeProperty('--legal-gate-foot');
  };
};

export function LegalGate({
  children,
  bypass = false,
}: {
  children: ReactNode;
  bypass?: boolean;
}): ReactElement {
  // Acceptance is a live external store, never a one-shot mount check: accepting in THIS tab
  // dismisses the gate (the accept notifies), and accepting in ANOTHER tab dismisses a gate
  // already on screen here (the 'storage' event notifies) — no stale gate demanding a reload.
  const accepted = useSyncExternalStore(subscribeLegalAcceptance, hasLegalAcceptance);
  const [checked, setChecked] = useState(false);
  // "Changed" only to someone who accepted an earlier version; a first visit has nothing to update.
  const [returning] = useState(hasEarlierAcceptance);
  // Listening is confirmed on its own rather than folded into the general acknowledgement: it can
  // pick up people who never opened Mavéa, so it deserves its own deliberate tick.
  const [speechChecked, setSpeechChecked] = useState(false);
  const [error, setError] = useState('');
  const generalRef = useRef<HTMLInputElement>(null);
  const speechRef = useRef<HTMLInputElement>(null);

  if (bypass || accepted) return <>{children}</>;

  const remaining = Number(!checked) + Number(!speechChecked);

  // Continue lives in the sticky footer, so it is on screen from the first paint — but while a box
  // is unticked it is disabled, and a disabled button explains nothing. The hint beside it takes
  // the reader to the statement still waiting for a tick, however far down the page it sits.
  const showNextConsent = (): void => {
    const box = !checked ? generalRef.current : speechRef.current;
    if (!box) return;
    box.closest('label')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    box.focus({ preventScroll: true });
  };

  const continueToProduct = (): void => {
    if (!checked || !speechChecked) return;
    if (!acceptLegalTerms()) {
      setError(
        'Mavéa could not save your acknowledgement in this browser. Enable local storage and try again.',
      );
      return;
    }
    setError(''); // the accept's own notify flips `accepted`; nothing else to set here
  };

  return (
    <main className="legal-gate">
      <section
        className="legal-gate-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="legal-gate-title"
        aria-describedby="legal-gate-summary"
      >
        <div className="legal-gate-body">
          <span className="legal-gate-kicker">
            {returning ? 'Our terms have changed' : 'Welcome to Mavéa'}
          </span>
          <h1 id="legal-gate-title">Before using connected features</h1>
          <p id="legal-gate-summary">
            Mavéa relies on artificial intelligence and on third-party services you select. It is
            provided without any guarantee of accuracy, privacy, security, or availability.
          </p>

          <ul className="legal-gate-points">
            <li>
              <strong>AI output may be inaccurate.</strong> You must independently verify any
              information before relying on it. Mavéa does not provide professional advice,
              including medical, legal, or financial advice, and must not be used in an emergency.
            </li>
            <li>
              <strong>{VOICE_DATA_NOTICE.title}.</strong> {VOICE_DATA_NOTICE.body}
            </li>
            <li>
              <strong>Uploaded files are transmitted to your providers.</strong> Prompts, documents,
              code, images, and context are sent through this deployment to the providers you
              select, including any work, confidential, personal, or third-party material. Those
              providers process such content under their own terms, which may permit retention or
              use for model training. Mavéa&apos;s maintainers do not control that processing and,
              to the extent permitted by law, are not liable for it. You may upload only content you
              are authorized to share.
            </li>
            <li>
              <strong>Connected repositories are transmitted in the same way.</strong> If you
              connect a code host, the files, documentation, diffs, and issues a feature reads may
              be sent to your model provider, including content from a <strong>private</strong>,
              employer, or client repository that your granted access can reach. Grant only the
              narrowest access necessary, and connect only content you have the right to share under
              applicable law and any agreement that governs it.
            </li>
            <li>
              <strong>
                Your API key is stored only in this browser and sent with each request.
              </strong>{' '}
              It passes through this deployment&apos;s proxy to the provider you select. Any browser
              extension or other software with access to this browser may be able to read it, and
              Mavéa cannot prevent this. Use a restricted, spend-limited key that you can revoke.
            </li>
            <li>
              <strong>You are solely responsible for all usage charges.</strong> Each request you
              make, including answers, searches, and voice, runs on your own provider account and
              may incur fees, which that provider bills to you under its own pricing and terms.
              Mavéa&apos;s maintainers do not bill you or pay providers on your behalf and, to the
              extent permitted by law, are not liable for and will not reimburse any such charges.
              We strongly recommend setting a spending limit with your provider before first use; it
              is the only safeguard that applies even if your key is misused.
            </li>
            <li>
              <strong>You are responsible for your use of Mavéa,</strong> including your
              credentials, your right to submit content, any connected actions you take, and
              anything you share.
            </li>
          </ul>

          <nav className="legal-gate-links" aria-label="Documents to review">
            <a href="#/terms?from=live" target="_blank" rel="noreferrer noopener">
              Terms of use
            </a>
            <a href="#/privacy?from=live" target="_blank" rel="noreferrer noopener">
              Privacy notice
            </a>
            <a href={legalDocumentHref('DISCLAIMER.md')} target="_blank" rel="noreferrer noopener">
              Disclaimer
            </a>
            <a href="#/legal?from=live" target="_blank" rel="noreferrer noopener">
              Important information
            </a>
            <a href={legalDocumentHref('LICENSE.txt')} target="_blank" rel="noreferrer noopener">
              License
            </a>
          </nav>

          <div className="legal-gate-consents">
            <label className="legal-gate-consent">
              <input
                ref={generalRef}
                type="checkbox"
                checked={checked}
                onChange={(event) => setChecked(event.target.checked)}
              />
              <span>
                I am at least 18 years old. I have read and understand the points above, I agree to
                the Terms of Use and PolyForm Noncommercial License 1.0.0, and I have read and
                acknowledge the Privacy Notice, Disclaimer, and Important Information notice.
              </span>
            </label>

            <label className="legal-gate-consent">
              <input
                ref={speechRef}
                type="checkbox"
                checked={speechChecked}
                onChange={(event) => setSpeechChecked(event.target.checked)}
              />
              <span>
                I understand that if I use listening features, microphone audio goes to the
                speech-to-text endpoint this deployment uses (on this computer by default, but
                possibly a remote one), that transcripts may go to the model provider I select, that
                remote operators may log or retain them under their own terms, and that I alone am
                responsible for avoiding sensitive conversations and for obtaining any consent
                required from other people before listening starts.
              </span>
            </label>
          </div>

          {error && (
            <p className="legal-gate-error" role="alert">
              {error}
            </p>
          )}
        </div>

        {/* Pinned to the bottom of the window while the card runs past it: the way forward is
            visible on the first paint at every size, and every word above stays in the page. */}
        <footer className="legal-gate-foot" ref={publishFooterHeight}>
          {remaining > 0 && (
            <button type="button" className="legal-gate-hint" onClick={showNextConsent}>
              {remaining === 2 ? 'Tick both boxes to continue' : 'Tick one more box to continue'}
              <span aria-hidden>↓</span>
            </button>
          )}
          <div className="legal-gate-actions">
            <a className="legal-gate-back" href="#/">
              Back to home
            </a>
            <button
              type="button"
              className="legal-gate-continue"
              disabled={remaining > 0}
              onClick={continueToProduct}
            >
              Continue to Mavéa
            </button>
          </div>
        </footer>
      </section>
    </main>
  );
}
