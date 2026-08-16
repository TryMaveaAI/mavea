// WhyLab (#/whylab) — QA harness for the Why Machine overlay. Mounts a seed web so the spatial
// layout, the lever/prune → live re-cascade, the receipts, and the light/dark rendering can be
// eyeballed without a full Live turn. The overlay itself is what ships inside Live.
//
// One seed per rung of the honesty ladder, because the readout is a different thing on each and
// all three have to be judged: GROUNDED moves the conclusion in exact pp; ILLUSTRATIVE is weighted
// and receipted exactly like it and still may not answer — a textbook web measured nothing, so
// every exact figure is withheld and only relative strength moves; STRUCTURE-ONLY has no figures
// to withhold in the first place, the case that used to sit dead.
import { useState } from 'react';
import { WhyMachineOverlay } from './WhyMachineOverlay';
import { WHY_SEED, WHY_SEED_GROUNDED, WHY_SEED_STRUCTURAL } from './seed';
import type { WhyDag } from './types';

const RUNGS: ReadonlyArray<{ id: string; label: string; dag: WhyDag }> = [
  { id: 'grounded', label: 'Grounded (exact pp)', dag: WHY_SEED_GROUNDED },
  { id: 'illustrative', label: 'Illustrative (no figures)', dag: WHY_SEED },
  { id: 'structural', label: 'Structure-only (relative)', dag: WHY_SEED_STRUCTURAL },
];

export function WhyLab(): React.ReactElement {
  const [rungId, setRungId] = useState(RUNGS[0].id);
  const rung = RUNGS.find((r) => r.id === rungId) ?? RUNGS[0];
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
        {RUNGS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => setRungId(id)}
            style={{
              padding: '6px 12px',
              borderRadius: 999,
              border: '1px solid var(--line)',
              cursor: 'pointer',
              font: '600 12px/1 var(--font)',
              background: rungId === id ? 'var(--presence)' : 'var(--surface-elevated)',
              color: rungId === id ? 'var(--surface-default)' : 'var(--text-secondary)',
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {/* Keyed so switching rungs remounts: the overlay holds its own lever state and fits the
          camera once per web, and a lever left on one seed must not carry into the next. */}
      <WhyMachineOverlay key={rung.id} dag={rung.dag} />
    </>
  );
}
