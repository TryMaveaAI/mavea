// ProvenanceCard.tsx — the receipt behind one figure. It is deliberately not a modal: the reader
// keeps reading the canvas underneath (aria-modal="false"), so the proof sits beside the claim
// rather than replacing it. Every section renders only when it has real content — an empty
// "SOURCE" heading is a promise the world can't keep.
//
// A calculated figure is walkable: each input is a button that re-targets this same card and drops
// a breadcrumb, so "where did 30 come from" ends at a receipted number or at an honest dead end.
import { useEffect, useRef, useState, type ReactElement } from 'react';
import { hostOf, safeHttpUrl } from '../../lib/sourceHost';
import { useFocusTrap } from '../useFocusTrap';
import { formulaWithLabels, rawOf, STATUS_LABEL, userFileLine } from './display';
import { placeCard } from './place';
import { statusOf } from './types';
import type { TrustRegistry, UsedInRef } from './registry';

/** The card's own box. Placement runs before paint, so the geometry has to be declared, not
 *  measured — the width is exact and the height is the worst case the CSS allows. */
const CARD_W = 320;
const CARD_MAX_H = 340;
/** More derivation rows than a reader will scan; the rest collapse to a count. */
const MAX_INPUT_ROWS = 8;

interface ProvenanceCardProps {
  registry: TrustRegistry;
  valueId: string;
  anchorRect: DOMRect;
  /** Ids walked through to get here, oldest first. */
  trail: readonly string[];
  hinted: boolean;
  onMarkHinted: () => void;
  onDrill: (valueId: string) => void;
  onBack: () => void;
  onNavigate?: (ref: UsedInRef) => void;
  onDismiss: () => void;
}

export function ProvenanceCard({
  registry,
  valueId,
  anchorRect,
  trail,
  hinted,
  onMarkHinted,
  onDrill,
  onBack,
  onNavigate,
  onDismiss,
}: ProvenanceCardProps): ReactElement | null {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, { onEscape: onDismiss });

  // Capture the hint at mount: marking it read immediately would pull the line out from under a
  // reader mid-sentence.
  const [showHint] = useState(!hinted);
  useEffect(() => onMarkHinted(), [onMarkHinted]);

  // Drilling swaps the card's contents without remounting it, so the button the reader just pressed
  // disappears and focus falls to <body> — outside the trap. Hand it to the card, which re-announces
  // the value it now describes.
  const firstRender = useRef(true);
  useEffect(() => {
    if (!firstRender.current) ref.current?.focus({ preventScroll: true });
    firstRender.current = false;
  }, [valueId]);

  useEffect(() => {
    const onDown = (e: MouseEvent): void => {
      const node = ref.current;
      if (node && e.target instanceof Node && !node.contains(e.target)) onDismiss();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [onDismiss]);

  const value = registry.values.get(valueId);
  if (!value) return null;

  const status = statusOf(value);
  const scope = value.scope;
  const usedIn = registry.usedIn.get(valueId) ?? [];
  const receipt = value.kind === 'grounded' ? value.resolution.receipt : null;
  const userFile = value.kind === 'grounded' && value.resolution.tier === 'T1';
  const url = receipt?.url ? safeHttpUrl(receipt.url) : null;
  // An unsafe scheme still names its source — the host reads as text, never as a link.
  const host = receipt ? (receipt.host ?? (receipt.url ? hostOf(receipt.url) : null)) : null;
  const inputs = value.kind === 'calculated' ? value.calc.inputs : [];
  const shown = inputs.slice(0, MAX_INPUT_ROWS);
  const hiddenCount = inputs.length - shown.length;
  const parent = trail.length > 0 ? registry.values.get(trail[trail.length - 1]) : undefined;
  const { left, top } = placeCard(
    anchorRect,
    { w: CARD_W, h: CARD_MAX_H },
    { w: window.innerWidth, h: window.innerHeight },
  );

  return (
    <div
      ref={ref}
      className="tr-card"
      role="dialog"
      aria-modal="false"
      aria-label={`Where ${value.label} came from`}
      tabIndex={-1}
      style={{ left, top, width: CARD_W, maxHeight: CARD_MAX_H }}
    >
      <header className="tr-head">
        {parent && (
          <button
            type="button"
            className="tr-back"
            onClick={onBack}
            aria-label={`Back to ${parent.label}`}
          >
            ‹ back<span className="tr-back-to"> to {parent.label}</span>
          </button>
        )}
        <span className="tr-badge" data-status={status}>
          {STATUS_LABEL[status]}
        </span>
        <p className="tr-figure">{rawOf(value)}</p>
        <p className="tr-label">{value.label}</p>
      </header>

      {receipt && (
        <section className="tr-sec">
          <h3 className="tr-sec-title">SOURCE</h3>
          {receipt.quote && <blockquote className="tr-quote">“{receipt.quote}”</blockquote>}
          {userFile ? (
            <p className="tr-host">{userFileLine(receipt)}</p>
          ) : (
            host && (
              <p className="tr-host">
                {url ? (
                  <a href={url} target="_blank" rel="noreferrer noopener">
                    {host}
                  </a>
                ) : (
                  host
                )}
                {receipt.date && <span className="tr-date"> · {receipt.date}</span>}
              </p>
            )
          )}
        </section>
      )}

      {scope && (scope.region || scope.period || scope.unit) && (
        <section className="tr-sec">
          <h3 className="tr-sec-title">SCOPE</h3>
          <p className="tr-chips">
            {[scope.region, scope.period, scope.unit]
              .filter((chip): chip is string => !!chip)
              .map((chip) => (
                <span key={chip} className="tr-chip">
                  {chip}
                </span>
              ))}
          </p>
        </section>
      )}

      {value.kind === 'calculated' && (
        <section className="tr-sec">
          <h3 className="tr-sec-title">CALCULATION</h3>
          <p className="tr-formula">
            {formulaWithLabels(value.calc.formula, (id) => registry.values.get(id)?.label)}
          </p>
          <ul className="tr-inputs">
            {shown.map((id) => {
              const input = registry.values.get(id);
              return (
                <li key={id}>
                  {input ? (
                    <button type="button" className="tr-input" onClick={() => onDrill(id)}>
                      <span className="tr-input-label">{input.label}</span>
                      <span className="tr-input-val">{rawOf(input)}</span>
                    </button>
                  ) : (
                    <span className="tr-input tr-input-missing">{id}</span>
                  )}
                </li>
              );
            })}
          </ul>
          {hiddenCount > 0 && <p className="tr-more">…and {hiddenCount} more</p>}
          {value.calc.note && <p className="tr-note">{value.calc.note}</p>}
        </section>
      )}

      {usedIn.length > 0 && (
        <section className="tr-sec">
          <h3 className="tr-sec-title">USED IN</h3>
          <ul className="tr-used">
            {usedIn.map((r) => (
              <li key={`${r.surface}:${r.id}:${r.label}`}>
                {onNavigate ? (
                  <button type="button" className="tr-usedin" onClick={() => onNavigate(r)}>
                    {r.label}
                  </button>
                ) : (
                  <span className="tr-usedin tr-usedin-flat">{r.label}</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {value.kind === 'illustrative' && (
        <p className="tr-caveat">
          Illustrative — shows the shape, not a measured fact. {value.resolution.illustrative}
        </p>
      )}

      {showHint && <p className="tr-hint">Any figure like this one opens its own receipt.</p>}
    </div>
  );
}
