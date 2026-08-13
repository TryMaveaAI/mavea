// MindShapeLab (#/mindlab, dev only) — the settled Watch-Me-Think map on a fixed, realistic spec,
// so its layout can be judged and iterated on without a model key, a microphone, or the six typed
// thoughts it takes to reach a settle. Same harness idea as #/slidelab and #/whylab.
//
// The spec below is a real settled map (an offsite argument), kept verbatim: cards of every kind
// the layout has to place, two themes, a hero tension, and an unsaid card — the shape that exposed
// the hub/keep-out bugs.
import { useState, type CSSProperties, type ReactElement } from 'react';
import { MindShape, type MindPhase } from '../../canvas/blocks/diagrams/MindShape';
import type { MindAtom, MindCluster, MindLink, MindUnsaid } from './types';
// The face's own sizing lives in the global presence styles (main.tsx loads them for the app);
// without them here the lab would render a face at its intrinsic size and lie about the dock.
import '../../styles/presence-styles.css';
import '../../canvas/blocks/diagrams/mindshape.css';
import '../../canvas/blocks/diagrams/mindshape-world.css';

const ATOMS: MindAtom[] = [
  {
    id: 'a1',
    kind: 'open_loop',
    label: 'We still need to choose a theme for the offsite',
    quote: "we still haven't picked a theme for the team offsite",
    status: 'stable',
    confidence: 'said',
  },
  {
    id: 'a2',
    kind: 'person',
    label: 'The design team wants a beach trip',
    quote: 'design wants a beach',
    status: 'stable',
    confidence: 'said',
  },
  {
    id: 'a3',
    kind: 'person',
    label: 'The development team wants a hackathon',
    quote: 'dev wants a hackathon',
    status: 'stable',
    confidence: 'said',
  },
  {
    id: 'a4',
    kind: 'constraint',
    label: 'Travel takes up two full days because half the team is remote',
    quote: 'half the team is remote, so travel eats two of the days',
    status: 'stable',
    confidence: 'said',
  },
  {
    id: 'a5',
    kind: 'person',
    label: 'Sam advises that three days is enough time',
    quote: 'Sam ran the last one and swears three days is plenty',
    status: 'stable',
    confidence: 'said',
  },
  {
    id: 'a6',
    kind: 'constraint',
    label: 'March is cheaper before the budget resets in April',
    quote: 'the budget resets in April, so March is cheaper',
    status: 'stable',
    confidence: 'said',
  },
];

const LINKS: MindLink[] = [
  { from: 'a2', to: 'a3', kind: 'tensions', label: 'competing preferences for the…' },
  { from: 'a4', to: 'a5', kind: 'tensions', label: 'travel takes two days but the…' },
  { from: 'a1', to: 'a2', kind: 'same_thread' },
  { from: 'a6', to: 'a4', kind: 'depends_on' },
];

const CLUSTERS: MindCluster[] = [
  { id: 'c1', label: 'What we will do', atomIds: ['a1', 'a2', 'a3'], weight: 3 },
  { id: 'c2', label: 'When and how long', atomIds: ['a4', 'a5', 'a6'], weight: 2 },
];

const UNSAID: MindUnsaid = {
  label: 'A three-day trip might feel too rushed if two of those days are spent traveling.',
  why: 'You raised the travel cost twice without saying it changes the length.',
  confidence: 'maybe',
};

const CENTER =
  'How do we design a team offsite that balances competing preferences and constraints?';

/** Every count the layout has to survive: a nearly-empty map, the settled six, and a busy one. */
const SIZES = [2, 6, 12] as const;

export function MindShapeLab(): ReactElement {
  const [phase, setPhase] = useState<MindPhase>('settled');
  const [count, setCount] = useState<number>(6);
  const [withUnsaid, setWithUnsaid] = useState(true);

  const atoms = ATOMS.slice(0, Math.min(count, ATOMS.length)).concat(
    Array.from({ length: Math.max(0, count - ATOMS.length) }, (_, i) => ({
      id: `x${i}`,
      kind: 'question' as const,
      label: `An extra thought to crowd the map, number ${i + 1}`,
      quote: `extra ${i}`,
      status: 'stable' as const,
      confidence: 'said' as const,
    })),
  );
  const ids = new Set(atoms.map((a) => a.id));
  const links = LINKS.filter((l) => ids.has(l.from) && ids.has(l.to));
  const clusters = CLUSTERS.map((c) => ({
    ...c,
    atomIds: c.atomIds.filter((id) => ids.has(id)),
  })).filter((c) => c.atomIds.length > 0);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface-default)' }}>
      <div
        className="mindlab-bar"
        style={{
          position: 'fixed',
          zIndex: 100,
          top: 8,
          left: 8,
          display: 'flex',
          gap: 8,
          fontSize: 12,
        }}
      >
        {(['listening', 'settled'] as MindPhase[]).map((p) => (
          <button key={p} type="button" onClick={() => setPhase(p)} data-active={phase === p}>
            {p}
          </button>
        ))}
        {SIZES.map((n) => (
          <button key={n} type="button" onClick={() => setCount(n)} data-active={count === n}>
            {n} atoms
          </button>
        ))}
        <button type="button" onClick={() => setWithUnsaid((v) => !v)}>
          unsaid: {withUnsaid ? 'on' : 'off'}
        </button>
      </div>
      {/* MindShape renders its own .ms-canvas — matching LiveApp, which puts it straight inside the
          stage fill. Wrapping it in a second canvas here would measure the wrong box. */}
      {/* No dock or rail in the harness, so it reserves neither — the map gets the whole box, the
          way it does on a wide screen in the app. */}
      <div
        className="ms-stage-fill"
        data-phase={phase}
        style={{ ['--dock-h' as string]: '0px', ['--rail-w' as string]: '0px' } as CSSProperties}
      >
        <MindShape
          asBlock={false}
          phase={phase}
          center={CENTER}
          atoms={atoms}
          links={links}
          clusters={clusters}
          {...(withUnsaid ? { unsaid: UNSAID } : {})}
          intent="decision"
        />
      </div>
    </div>
  );
}
