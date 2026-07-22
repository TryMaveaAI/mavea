// WhyLab (#/whylab) — QA harness for the Why Machine overlay. Mounts a seed web so the spatial
// layout, the lever/prune → live re-cascade, the receipts, and the light/dark rendering can be
// eyeballed without a full Live turn. The overlay itself is what ships inside Live. Two seeds so both
// paths are covered: the GROUNDED illustrative web (precise pp deltas) and the STRUCTURAL web (T0,
// no figures) whose conclusion moves only in relative strength — the case that used to sit dead.
import { useState } from 'react';
import { WhyMachineOverlay } from './WhyMachineOverlay';
import { WHY_SEED, WHY_SEED_STRUCTURAL } from './seed';

export function WhyLab(): React.ReactElement {
  const [structural, setStructural] = useState(false);
  return (
    <>
      <div
        style={{
          position: 'fixed',
          top: 12,
          left: 12,
          zIndex: 100,
          display: 'flex',
          gap: 8,
        }}
      >
        {(
          [
            { on: false, label: 'Grounded (precise)' },
            { on: true, label: 'Structure-only (relative)' },
          ] as const
        ).map(({ on, label }) => (
          <button
            key={label}
            type="button"
            onClick={() => setStructural(on)}
            style={{
              padding: '6px 12px',
              borderRadius: 999,
              border: '1px solid var(--line)',
              cursor: 'pointer',
              font: '600 12px/1 var(--font)',
              background: structural === on ? 'var(--presence)' : 'var(--surface-elevated)',
              color: structural === on ? 'var(--surface-default)' : 'var(--text-secondary)',
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <WhyMachineOverlay
        key={structural ? 'structural' : 'grounded'}
        dag={structural ? WHY_SEED_STRUCTURAL : WHY_SEED}
      />
    </>
  );
}
