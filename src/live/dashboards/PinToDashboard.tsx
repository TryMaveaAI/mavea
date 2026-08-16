// PinToDashboard — the small picker shown when you tap the "+" on a Live answer card. One step:
// the sheet opens straight onto the board list, and choosing an existing board pins the card right
// then and there — the standing-check refine happens in the background (pin.ts), so there's no
// second screen and no skeleton to sit through. "New dashboard" unfolds a single compact naming
// step (prefilled name + a cadence row with its honest search-cost line) so a search-spending
// schedule is still something you saw and picked, never a silent default. The caller shows a
// brief DashPill once a pin lands; the sheet itself is gone by then.
import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { Icon } from '../../icons/icons';
import { blockLabel } from '../../canvas/blockLabel';
import type { Block } from '../../data/conversation';
import { getDashboards, whenDashboardsHydrated } from './store';
import { estimateSearchesPerMonth } from './cadence';
import { getLiveConfigV2, toModelConfig } from '../useLiveConfig';
import { displayTitle } from './format';
import { pinBlockToDashboard, type PinTarget } from './pin';
import { useFocusTrap } from '../useFocusTrap';
import type { DataCadenceMode } from './types';
import './dash-pin.css';

const CADENCE_OPTS: { v: DataCadenceMode; label: string }[] = [
  { v: '15min', label: '15M' },
  { v: 'hourly', label: '1H' },
  { v: '6h', label: '6H' },
  { v: 'daily', label: 'DAILY' },
  { v: 'manual', label: 'MANUAL' },
];

/** A board row's cadence chip: same face + heat mapping as PlanReview's presets, so how often a
 *  board spends searches reads identically everywhere it's shown. */
const CADENCE_FACE: Record<DataCadenceMode, { text: string; tone: 'fast' | 'steady' | 'calm' }> = {
  '15min': { text: '15 MIN', tone: 'fast' },
  hourly: { text: 'HOURLY', tone: 'steady' },
  '6h': { text: '6 HOURS', tone: 'steady' },
  daily: { text: 'DAILY', tone: 'calm' },
  manual: { text: 'MANUAL', tone: 'calm' },
};

export function PinToDashboard({
  block,
  conversationTitle,
  question,
  onClose,
  onAdded,
}: {
  block: Block;
  conversationTitle?: string;
  /** The question that produced this block — carried onto the widget as its refreshQuery, so a
   *  refresh can re-ask it (with search) and keep this card live instead of freezing it at
   *  pin-time. Omitted only when there's genuinely no ask to attach (rare). */
  question?: string;
  onClose: () => void;
  /** Fires once the widget is actually persisted, just before the sheet closes — the caller shows
   *  a brief confirmation pill from this (see DashPill), since the sheet itself is gone by then. */
  onAdded?: (dashboardId: string, dashboardTitle: string) => void;
}): ReactElement {
  // Snapshot the list once on open so it doesn't reshuffle under the cursor mid-choice.
  const [dashboards, setDashboards] = useState(() => getDashboards());
  const label = blockLabel(block);
  // With no boards at all the list would be a single "New dashboard" row — skip straight to naming.
  const [naming, setNaming] = useState(dashboards.length === 0);
  const [name, setName] = useState(() =>
    displayTitle(question?.trim() || conversationTitle || label),
  );
  const [cadence, setCadence] = useState<DataCadenceMode>('manual');

  // That snapshot can be taken before the store has anything to give: dashboards are encrypted at
  // rest, so the synchronous read returns nothing until the decrypt lands, and this sheet opens
  // from Live, whose route has no reason to wait on it. Opening quickly enough therefore hid every
  // board the user owns behind a "New dashboard" step they never asked for. Correct the snapshot
  // once — and only if it was empty, so the anti-reshuffle guarantee still holds for a real list.
  const touched = useRef(false);
  useEffect(() => {
    let live = true;
    void whenDashboardsHydrated().then(() => {
      if (!live) return;
      setDashboards((prev) => {
        if (prev.length > 0) return prev;
        const fresh = getDashboards();
        // Only un-railroad someone who hasn't started naming — yanking the step out from under a
        // half-typed name would be its own kind of rude. The Back button is there either way.
        if (fresh.length > 0 && !touched.current) setNaming(false);
        return fresh;
      });
    });
    return () => {
      live = false;
    };
  }, []);

  // Trap focus in the sheet + close on Escape — every other overlay in the app does this
  // (ExtractionPreview, Modal, Drawer…); this one was the odd one out, letting Tab and a
  // screen reader escape straight into the page behind it.
  const sheetRef = useRef<HTMLDivElement>(null);
  useFocusTrap(sheetRef, { onEscape: onClose });

  // Keep keyboard focus on the step being shown: the name box when the naming step opens (from
  // the list, or straight away on an empty gallery), the first row when Back returns to the list
  // (its previous focus target — the Back button — unmounts, which would otherwise drop focus to
  // the page body and out of the trap). Imperative, not the autoFocus prop — same pattern the
  // rest of this directory uses, so a screen reader isn't yanked without the dialog announcing.
  const nameRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (naming) nameRef.current?.focus();
    else sheetRef.current?.querySelector<HTMLElement>('.pin-row')?.focus();
  }, [naming]);

  // pinBlockToDashboard persists synchronously (the refine and first check detach into the
  // background), so a click pins, confirms, and closes in one breath — no "adding…" state.
  const pin = (target: PinTarget): void => {
    const added = pinBlockToDashboard({ block, question, target });
    if (added) onAdded?.(added.dashboardId, added.title);
    onClose();
  };

  const searchesPerMonth = estimateSearchesPerMonth(cadence);
  const hasKey = useMemo(() => !!toModelConfig(getLiveConfigV2()).apiKey, []);

  return (
    <div
      className="pin-scrim"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="button"
      tabIndex={0}
      aria-label="Close"
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') {
          if (e.key === ' ') e.preventDefault();
          onClose();
        }
      }}
    >
      <div
        className="pin-sheet"
        ref={sheetRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Add to a dashboard"
      >
        <div className="pin-head">
          <span className="pin-eyebrow">{naming ? 'New dashboard' : 'Add to dashboard'}</span>
          <span className="pin-subject">{label}</span>
        </div>

        {naming ? (
          <form
            className="pin-new-step"
            onSubmit={(e) => {
              e.preventDefault();
              pin({ new: { title: name.trim() || label, cadence } });
            }}
          >
            <label className="pin-name-field">
              <span className="pin-plan-label">Name</span>
              <input
                ref={nameRef}
                className="pin-name-input"
                value={name}
                onChange={(e) => {
                  touched.current = true;
                  setName(e.target.value);
                }}
                aria-label="Dashboard name"
              />
            </label>
            <div className="pin-plan-cadence">
              <span className="pin-plan-label">Check cadence</span>
              <div className="pin-cadence-seg" role="group" aria-label="Check cadence">
                {CADENCE_OPTS.map((o) => (
                  <button
                    key={o.v}
                    type="button"
                    className={'pin-cadence-opt' + (o.v === cadence ? ' is-active' : '')}
                    aria-pressed={o.v === cadence}
                    onClick={() => setCadence(o.v)}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
              <p className="pin-plan-estimate">
                {/* Keyless truth: nothing runs without a key, so no "on your key" claims — the
                    schedule survives and checks start on their own once one is connected. */}
                {searchesPerMonth > 0
                  ? hasKey
                    ? `≈ ${searchesPerMonth} searches/mo on your key, at this cadence.`
                    : `≈ ${searchesPerMonth} searches/mo once a key is connected in Live — parked until then.`
                  : 'No standing searches — this refreshes only when you ask.'}
              </p>
            </div>
            <div className="pin-plan-actions">
              {dashboards.length > 0 ? (
                <button type="button" className="pin-secondary" onClick={() => setNaming(false)}>
                  ← Back
                </button>
              ) : (
                <span />
              )}
              <button type="submit" className="pin-plan-confirm">
                Create · first check queued
              </button>
            </div>
          </form>
        ) : (
          <div className="pin-list" role="menu">
            <button
              type="button"
              className="pin-row pin-new"
              role="menuitem"
              onClick={() => setNaming(true)}
            >
              <span className="pin-row-ic">
                <Icon.plus />
              </span>
              <span className="pin-row-text">
                <span className="pin-row-title">New dashboard</span>
                <span className="pin-row-sub">Start one with this card</span>
              </span>
            </button>
            {dashboards.map((d) => {
              const face = CADENCE_FACE[d.cadence.data];
              return (
                <button
                  key={d.id}
                  type="button"
                  className="pin-row"
                  role="menuitem"
                  onClick={() => pin(d.id)}
                >
                  <span className="pin-row-ic">
                    <Icon.table />
                  </span>
                  <span className="pin-row-text">
                    <span className="pin-row-title">{displayTitle(d.title)}</span>
                    <span className="pin-row-sub">
                      {d.widgets.length} {d.widgets.length === 1 ? 'card' : 'cards'}
                    </span>
                  </span>
                  <span className={`pin-row-cad pin-row-cad--${face.tone}`}>{face.text}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
