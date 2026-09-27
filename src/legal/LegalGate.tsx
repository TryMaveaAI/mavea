import {
  useRef,
  useState,
  useSyncExternalStore,
  type ReactElement,
  type ReactNode,
  type RefCallback,
} from 'react';
import { acceptLegalTerms, hasLegalAcceptance, subscribeLegalAcceptance } from './acceptance';
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
          <span className="legal-gate-kicker">Updated legal acknowledgement</span>
          <h1 id="legal-gate-title">Before using connected features</h1>
          <p id="legal-gate-summary">
            Mavéa uses AI and third-party services you choose. It cannot guarantee output, privacy,
            security, or availability.
          </p>

          <ul className="legal-gate-points">
            <li>
              AI can be wrong. Verify important information and do not use it as professional or
              emergency help.
            </li>
            <li>
              <strong>{VOICE_DATA_NOTICE.title}.</strong> {VOICE_DATA_NOTICE.body}
            </li>
            <li>
              <strong>A file you upload is sent, not just read locally.</strong> Prompts, documents,
              code, images and context pass through this deployment to the providers you select —
              including a work document, anything confidential or personal, and anything belonging
              to someone else. Those providers handle it under their own terms, which may include
              keeping it or using it to train their models. The people who publish Mavéa do not
              control that and, as far as the law allows, are not liable for it. Only upload what
              you are allowed to share with them.
            </li>
            <li>
              <strong>A connected repository is read the same way.</strong> If you connect a code
              host, the files, docs, diffs, and issues a feature reads can be sent to your model
              provider — including from a <strong>private</strong> repository, your employer's or a
              client's, if the access you grant can reach one. Grant the narrowest scope that works,
              and only connect what you may disclose.
            </li>
            <li>
              <strong>Your key is stored only in this browser and sent with each request.</strong>{' '}
              It passes through this deployment's proxy to the provider you chose. Any extension or
              software with access to this browser can read it; Mavéa cannot prevent that. Use a
              restricted, spend-capped key you can revoke.
            </li>
            <li>
              All provider charges are your sole responsibility. Mavéa does not charge you or pay
              providers on your behalf — use of your API keys and accounts is billed to you under
              each provider's own pricing and terms. Set a spending cap in your provider's dashboard
              before you start — it is the one limit that holds even if a key is ever misused.
            </li>
            <li>
              You are responsible for credentials, permission to submit content, connected actions,
              and what you share.
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
                I am at least 18 years old. I have read and agree to the Terms of Use and PolyForm
                Noncommercial License 1.0.0, and I have read and acknowledge the Privacy Notice,
                Disclaimer, and Important Information notice.
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
