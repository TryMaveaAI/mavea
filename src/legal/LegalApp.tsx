import type { ReactElement } from 'react';
import { LegalPageShell } from './LegalPageShell';

const DISCLOSURES = [
  {
    title: 'AI output needs human review',
    body: 'AI output can be incomplete, inaccurate, outdated, internally inconsistent, biased, offensive, unsafe, or fabricated. A citation, quotation, calculation, forecast, confidence indicator, source highlight, or polished visual is not proof that a result is correct. Check original sources and have a qualified person review consequential decisions.',
  },
  {
    title: 'Not professional or emergency help',
    body: 'Mavéa is not a provider of medical, legal, financial, tax, mental-health, safety, or other professional advice. It is not an emergency, crisis, or monitoring service. If someone may be in danger, contact local emergency services or an appropriate crisis service now.',
  },
  {
    title: 'Third-party providers process requests',
    body: 'Prompts, attachments, conversation context, search requests, and connected-app data may be sent to the AI provider, search provider, or connected service you select so the requested feature can work. Their terms, privacy practices, retention rules, availability, and billing apply. You are responsible for provider charges, and Mavéa does not control third-party services.',
  },
  {
    title: 'Remembered keys remain your responsibility',
    body: 'Provider and search keys are secrets. With Remember off, Mavéa keeps them in memory only until reload. With Remember on, Mavéa stores encrypted ciphertext in this browser using a device-bound key when browser cryptography is available; otherwise keys remain session-only. Encryption at rest is a convenience, not a guarantee against an unlocked, shared, lost, or compromised device, browser profile, extension, same-origin app code, deployment, or provider. Keys pass through this deployment’s same-origin request proxy when used. Use restricted, revocable keys on a trusted device, rotate or revoke them if exposure is possible, and monitor your provider account. Settings exports exclude provider and search keys.',
  },
  {
    title: 'Protect sensitive and confidential information',
    body: 'Local storage describes where Mavéa saves information on this device; it does not mean requests sent to a selected provider stay local. Anything you type, paste, attach, or upload may be transmitted to selected providers. Do not submit passwords, secrets, work-related or personal material, identifiable information, confidential information, regulated data, or another person’s information unless you are authorized to share it and accept the providers’ processing and retention practices.',
  },
  {
    title: 'A connected repository leaves with your request',
    body: 'Connecting a code host lets Mavéa read what the access you grant can reach — files, documentation, diffs, commit messages, and issues — and send the relevant parts to the model provider you selected, under that provider\u2019s own retention and processing terms. A private repository is not handled differently from a public one: if the token or OAuth scope can read private code, private code can leave your control. Grant the narrowest scope that makes the feature work, prefer read-only and a repository allowlist where your host offers one, use a dedicated account on a shared deployment, revoke connections you no longer use, and do not connect a repository you are not permitted to disclose.',
  },
  {
    title: 'Use content you have the right to use',
    body: 'Only upload, transform, publish, or share material you have the rights and permission to use. AI output may not be unique, may resemble other material, may include protected content, or may not qualify for copyright protection. Mavéa does not guarantee ownership or non-infringement; review output before publishing or commercial use.',
  },
  {
    title: 'Review actions before they leave Mavéa',
    body: 'Connected apps, exports, code suggestions, generated messages, and other actions can affect external systems or people. Check the destination, content, permissions, and consequences before confirming or using them. You are responsible for actions you take and material you share.',
  },
] as const;

/** Plain-language, product-wide disclosures. This is deliberately a tiny standalone route so
 * every public surface can link here without adding legal copy to its normal JavaScript payload. */
export function LegalApp(): ReactElement {
  return (
    <LegalPageShell
      page="important"
      kicker="Before you rely on an answer"
      title="Important information"
      intro={
        <p>
          Mavéa uses AI models and connected services selected by you. These plain-language notices
          apply across Live, Courses, Deep Zoom, Prism, Ripple, Reels, exports, and connected apps.
        </p>
      }
    >
      <div className="legal-grid">
        {DISCLOSURES.map((item, index) => (
          <section className="legal-item" key={item.title}>
            <span className="legal-number" aria-hidden>
              {String(index + 1).padStart(2, '0')}
            </span>
            <div>
              <h2>{item.title}</h2>
              <p>{item.body}</p>
            </div>
          </section>
        ))}
      </div>

      <aside className="legal-warranty" aria-label="Warranty and responsibility notice">
        <strong>Service and responsibility</strong>
        <p>
          Features, providers, sources, and results can change, fail, or become unavailable. To the
          fullest extent permitted by law, Mavéa and its outputs are provided “as is” and “as
          available,” without warranties, and Mavéa is not responsible for decisions, actions,
          losses, harm, unauthorized submissions, credential misuse, provider charges, or
          third-party processing or retention arising from their use. You use the service and its
          outputs at your own risk. Nothing here limits rights or liability that cannot legally be
          limited.
        </p>
      </aside>

      <p className="legal-fineprint">
        This notice does not replace the terms and privacy notices of the providers and connected
        services you choose.
      </p>
    </LegalPageShell>
  );
}
