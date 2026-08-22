import { useState, useSyncExternalStore, type ReactElement, type ReactNode } from 'react';
import { acceptLegalTerms, hasLegalAcceptance, subscribeLegalAcceptance } from './acceptance';
import { legalDocumentHref } from './links';
import { VOICE_DATA_NOTICE } from './voiceNotice';
import './legal-gate.css';

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

  if (bypass || accepted) return <>{children}</>;

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
            Prompts, files, code, and context may also pass through this deployment to the providers
            you select.
          </li>
          <li>
            <strong>A connected repository is read the same way.</strong> If you connect a code
            host, the files, docs, diffs, and issues a feature reads can be sent to your model
            provider — including from a <strong>private</strong> repository, if the access you grant
            can reach one. Grant the narrowest scope that works, and only connect what you may
            disclose.
          </li>
          <li>
            All provider charges are your sole responsibility. Mavéa does not charge you or pay
            providers on your behalf — use of your API keys and accounts is billed to you under each
            provider's own pricing and terms. Most provider dashboards let you track usage and set a
            spending cap.
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

        <label className="legal-gate-consent">
          <input
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
            type="checkbox"
            checked={speechChecked}
            onChange={(event) => setSpeechChecked(event.target.checked)}
          />
          <span>
            I understand that if I use listening features, microphone audio and the resulting
            transcripts leave this device to the speech endpoint and model provider I select, that
            those operators may log or retain them under their own terms, and that I alone am
            responsible for avoiding sensitive conversations and for obtaining any consent required
            from other people before listening starts.
          </span>
        </label>

        {error && (
          <p className="legal-gate-error" role="alert">
            {error}
          </p>
        )}

        <div className="legal-gate-actions">
          <a className="legal-gate-back" href="#/">
            Back to home
          </a>
          <button type="button" disabled={!checked || !speechChecked} onClick={continueToProduct}>
            Continue to Mavéa
          </button>
        </div>
      </section>
    </main>
  );
}
