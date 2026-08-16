// EdgeEvidencePanel.tsx — the receipts behind ONE causal link. An arrow is the easiest thing on a
// canvas to over-read, so this panel always ends with what the link does NOT claim
// (NOT_REPRESENTED_AS), even when the evidence is strong. Contested means the reader sees the
// counter-evidence in the same breath as the support, never a footnote away.
//
// Props are plain data on purpose: the panel renders for a world edge, a why edge, or a fixture,
// and takes no dependency on any of their modules.
import { memo, type ReactElement } from 'react';
import { hostOf, safeHttpUrl } from '../../lib/sourceHost';
import { NOT_REPRESENTED_AS, type EdgeRelation, type EdgeStatus } from './relations';
import type { Receipt } from '../ground/types';
import './trust.css';

const STATUS_LABEL: Record<EdgeStatus, string> = {
  supported: 'SUPPORTED',
  contested: 'CONTESTED',
  provisional: 'PROVISIONAL',
};

interface EdgeEvidencePanelProps {
  relation: EdgeRelation;
  /** +1 raises the target, -1 lowers it. */
  sign: 1 | -1;
  status: EdgeStatus;
  receipts: Receipt[];
  /** Verified evidence AGAINST the claim. */
  counter?: Receipt;
  /** The link is the model's own reading, drawn faint and dashed. */
  provisional?: boolean;
}

function EdgeEvidencePanelView({
  relation,
  sign,
  status,
  receipts,
  counter,
  provisional,
}: EdgeEvidencePanelProps): ReactElement {
  return (
    <div className="tr-edge" data-status={status} data-provisional={provisional ? '1' : undefined}>
      <div className="tr-edge-head">
        <span className="tr-rel">{relation}</span>
        <span className="tr-sign" data-sign={sign}>
          <span aria-hidden="true">{sign === 1 ? '↑' : '↓'}</span>
          <span className="tr-sr">{sign === 1 ? 'raises' : 'lowers'}</span>
        </span>
        <span className="tr-badge tr-edge-badge" data-status={status}>
          {status === 'supported' && <span aria-hidden="true">✓ </span>}
          {STATUS_LABEL[status]}
        </span>
      </div>

      {receipts.map((r, i) => (
        <ReceiptView key={`${r.url ?? r.quote}:${i}`} receipt={r} />
      ))}

      {receipts.length === 0 && (
        <p className="tr-unverified">Mavéa&apos;s reading — no source, unverified.</p>
      )}

      {status === 'contested' && counter && (
        <div className="tr-counter">
          <h4 className="tr-sec-title">But:</h4>
          <ReceiptView receipt={counter} />
        </div>
      )}

      <p className="tr-not-as">Not represented as: {NOT_REPRESENTED_AS[relation]}.</p>
    </div>
  );
}

function ReceiptView({ receipt }: { receipt: Receipt }): ReactElement {
  const url = receipt.url ? safeHttpUrl(receipt.url) : null;
  const host = receipt.host ?? (receipt.url ? hostOf(receipt.url) : null);
  return (
    <figure className="tr-receipt">
      <blockquote className="tr-quote">“{receipt.quote}”</blockquote>
      {host && (
        <figcaption className="tr-host">
          {url ? (
            <a href={url} target="_blank" rel="noreferrer noopener">
              {host}
            </a>
          ) : (
            host
          )}
        </figcaption>
      )}
    </figure>
  );
}

/** Memoized: the evidence for the selected link changes when the SELECTION does, not when the
 *  reader drags the world underneath it. */
export const EdgeEvidencePanel = memo(EdgeEvidencePanelView);
