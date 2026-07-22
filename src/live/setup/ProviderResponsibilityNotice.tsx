import type { ReactElement } from 'react';

/** Conspicuous, plain-language responsibility notice shared by first-run Connect and Settings.
 * This is product disclosure, not a substitute for jurisdiction-specific Terms reviewed by counsel. */
export function ProviderResponsibilityNotice(): ReactElement {
  return (
    <aside
      className="provider-responsibility"
      aria-label="Provider billing, data sharing, and AI output responsibility"
    >
      <strong>Before you connect</strong>
      <p>
        You provide the API keys or connected accounts, and those providers bill you directly under
        their own terms. Each model, web-search, speech, or connected-service request can consume
        your quota or incur a third-party charge; automatic and cadence-based features can repeat
        those requests while Mavéa is open. AI output can be incomplete, inaccurate, offensive, or
        unsafe; accuracy, quality, and availability are not guaranteed. Verify important information
        independently. Mavéa is not medical, legal, financial, safety, or other professional advice,
        or an emergency or monitoring service. To the fullest extent permitted by law, Mavéa and its
        outputs are provided “as is,” without warranties; you use them at your own risk, and Mavéa
        is not responsible for decisions, actions, losses, harm, or provider charges arising from
        their use.
      </p>
      <p>
        Anything you type, paste, attach, or upload—including work-related, personal, identifiable,
        confidential, sensitive, or regulated information—may be sent to the model, search, or
        connected provider you select. Submit it only when you are authorized to share it and when
        you accept that provider’s processing and retention practices; Mavéa does not control those
        third parties.
      </p>
      <p>
        Choosing Remember stores an encrypted copy of provider and search keys in this browser,
        sealed with a device-bound key when browser cryptography is available; otherwise they remain
        session-only. Encryption at rest is a convenience, not a security guarantee: an unlocked,
        shared, lost, or compromised device, browser profile, or extension can still expose or
        misuse keys, and Mavéa is not responsible for key theft, unauthorized use, or resulting
        charges. Keeping keys secure is your responsibility — use restricted, revocable keys with
        spending caps on trusted devices you control, revoke a key with its provider immediately if
        you suspect exposure, and monitor your provider account. Keys pass through this deployment’s
        request proxy when used; settings exports exclude them.
      </p>
      <nav className="provider-responsibility-links" aria-label="Terms and privacy documents">
        <a className="provider-responsibility-link" href="#/terms?from=live">
          Terms
        </a>
        <a className="provider-responsibility-link" href="#/privacy?from=live">
          Privacy
        </a>
        <a className="provider-responsibility-link" href="#/legal?from=live">
          Read all important information →
        </a>
      </nav>
    </aside>
  );
}
