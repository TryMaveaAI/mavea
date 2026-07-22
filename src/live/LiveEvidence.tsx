// LiveEvidence.tsx — the "Prove it" panel for a Live answer.
//
// The demo's EvidenceDrawer traces a claim to fabricated file rows; Live can't do that
// honestly — its grounding is real web sources. So this is Live's own receipts panel: the
// claim, an honest confidence label, and the actual sources the answer was built on, each a
// real link the user can open. It only appears when the turn was genuinely grounded (the
// lead insight is marked `prove` in generateLive only when sources exist), so the affordance
// never promises evidence we don't have. Reuses the demo's drawer chrome so it feels native.
import { type ReactElement } from 'react';
import { Icon } from '../icons/icons';
import { CONF_TITLE_UNVERIFIED } from '../canvas/trust';
import { EvidencePill } from '../canvas/provenance';
import { hostOf, safeHttpUrl } from '../lib/sourceHost';
import type { Conf, WebSource } from '../data/conversation';

interface LiveEvidenceProps {
  open: boolean;
  onClose: () => void;
  /** The headline being backed (the answer's title). */
  claim: string;
  /** The answer's confidence — already honest (an unsourced 'strong' is downgraded upstream). */
  conf?: Conf;
  /** The real web sources the answer was grounded in. */
  sources: WebSource[];
  /** Whether the user attached files for this turn — drives honest copy when sources are empty. */
  hadFiles?: boolean;
}

export function LiveEvidence({
  open,
  onClose,
  claim,
  conf,
  sources,
  hadFiles = false,
}: LiveEvidenceProps): ReactElement {
  // With no sources and no files there is nothing behind the answer — say so plainly
  // instead of dressing model knowledge up as evidence ("grounded in 0 live sources").
  const badgeTitle = sources.length
    ? 'How sure Mavéa is, based on these sources'
    : hadFiles
      ? 'How sure Mavéa is, based on your files'
      : CONF_TITLE_UNVERIFIED;
  return (
    <>
      <div
        className={'scrim' + (open ? ' show' : '')}
        role="presentation"
        onClick={onClose}
        style={{ pointerEvents: open ? 'auto' : 'none' }}
      ></div>
      {/* `inert` keeps the closed subtree unfocusable and unclickable even mid-transition —
          without it, focusing a source link in the "closed" drawer horizontally scrolls the
          overflow-hidden app shell and drags the panel into view over the topbar. */}
      <aside className={'drawer' + (open ? ' show' : '')} aria-hidden={!open} inert={!open}>
        <button className="drawer-x" onClick={onClose} aria-label="Close evidence">
          <Icon.x />
        </button>
        <div className="drawer-head">
          <div className="drawer-eyebrow">
            <Icon.shield style={{ width: 14, height: 14 }} /> Where this came from
          </div>
          <div className="drawer-claim">{claim}</div>
        </div>
        <div className="drawer-body">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 13,
              color: 'var(--text-secondary)',
            }}
          >
            <EvidencePill level={conf || 'inferred'} title={badgeTitle} />
            {sources.length > 0 ? (
              <span>
                · grounded in {sources.length} live source{sources.length === 1 ? '' : 's'}
              </span>
            ) : hadFiles ? (
              <span>· based on your attached files</span>
            ) : (
              <span>· from the model's own knowledge</span>
            )}
          </div>

          {sources.length > 0 && (
            <ul
              style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}
              aria-label="Sources"
            >
              {sources.map((s, i) => {
                const url = safeHttpUrl(s.url);
                if (!url) return null;
                return (
                  <li key={i}>
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="evidence-block evidence-src"
                    >
                      <div className="evidence-top">
                        <span className="evidence-file">
                          <Icon.globe style={{ width: 16, height: 16 }} />
                          {s.title}
                        </span>
                        <span className="evidence-loc">{hostOf(s.url) ?? s.url}</span>
                        <Icon.external style={{ width: 14, height: 14, flex: '0 0 auto' }} />
                      </div>
                      {s.snippet && <div className="evidence-quote">{s.snippet}</div>}
                    </a>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="assumption">
            <Icon.alert />
            {sources.length > 0 ? (
              <div>
                Mavéa summarized these sources — open them to read the originals, and treat anything
                labeled <b>inferred</b> as a best estimate, not a verified fact.
              </div>
            ) : hadFiles ? (
              <div>
                Mavéa answered from your attached files and its own knowledge — no live sources were
                checked. Treat anything labeled <b>inferred</b> as a best estimate, not a verified
                fact.
              </div>
            ) : (
              <div>
                This came from the model's own knowledge — nothing here was checked against live
                sources or your files. Treat it as a starting point, not verified fact.
              </div>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
