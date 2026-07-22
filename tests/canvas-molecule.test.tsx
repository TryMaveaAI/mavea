import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { normalizeMolecule } from '../src/canvas/blocks/learn/smiles';
import { MolecularStructure } from '../src/canvas/blocks/learn/MolecularStructure';

// The accuracy of a molecule comes from real geometry, not hand-placed atoms: a SMILES string
// is parsed by OpenChemLib into atom coordinates, which normalizeMolecule maps into the renderer's
// 0..100 space. These lock the pure coordinate transform (the part we own) and the component's
// render contract. The engine call itself is network-lazy and stubbed out under test, so the
// SMILES path deterministically shows its fallback here — the success render is the same draw
// code the manual-atoms case exercises.

describe('normalizeMolecule — coordinate transform', () => {
  it('returns null for an empty atom list', () => {
    expect(normalizeMolecule([], [])).toBeNull();
  });

  it('scales atoms into the padded 0..100 canvas and preserves bonds', () => {
    const geo = normalizeMolecule(
      [
        { el: 'C', x: 0, y: 0, isCarbon: true },
        { el: 'O', x: 1, y: 0, isCarbon: false },
      ],
      [{ from: 0, to: 1, order: 1 }],
    );
    expect(geo).not.toBeNull();
    // Every coordinate stays inside the [12, 88] layout box (PAD = 12).
    for (const a of geo!.atoms) {
      expect(a.x).toBeGreaterThanOrEqual(12);
      expect(a.x).toBeLessThanOrEqual(88);
      expect(a.y).toBeGreaterThanOrEqual(12);
      expect(a.y).toBeLessThanOrEqual(88);
    }
    expect(geo!.bonds).toEqual([{ from: 0, to: 1, order: 1 }]);
  });

  it('marks carbons implicit (skeletal vertices) and keeps heteroatom labels', () => {
    const geo = normalizeMolecule(
      [
        { el: 'C', x: 0, y: 0, isCarbon: true },
        { el: 'O', x: 1, y: 0, isCarbon: false },
      ],
      [],
    );
    expect(geo!.atoms[0].implicit).toBe(true); // carbon → bare vertex
    expect(geo!.atoms[1].implicit).toBeUndefined(); // oxygen → labelled
  });

  it('flips the Y axis (chemistry is y-up, SVG is y-down)', () => {
    const geo = normalizeMolecule(
      [
        { el: 'C', x: 0, y: 0, isCarbon: true }, // lower in chemistry coords
        { el: 'N', x: 0, y: 1, isCarbon: false }, // higher in chemistry coords
      ],
      [],
    );
    // After the flip, the chem-low atom sits LOWER on screen (larger SVG y) than the chem-high one.
    expect(geo!.atoms[0].y).toBeGreaterThan(geo!.atoms[1].y);
  });

  it('carries a formal charge through to the label', () => {
    const geo = normalizeMolecule([{ el: 'N', x: 0, y: 0, isCarbon: false, charge: '+' }], []);
    expect(geo!.atoms[0].charge).toBe('+');
  });
});

describe('MolecularStructure — render contract', () => {
  it('draws manual atoms: bonds as lines, heteroatoms labelled', () => {
    const { container } = render(
      <MolecularStructure
        title="Ethanol"
        atoms={[
          { el: 'C', x: 25, y: 60, implicit: true },
          { el: 'O', x: 75, y: 60 },
        ]}
        bonds={[{ from: 0, to: 1 }]}
      />,
    );
    expect(container.querySelector('.lr-mol-svg')).not.toBeNull();
    expect(container.querySelector('.lr-mol-bond')).not.toBeNull();
    // The oxygen is labelled; the implicit carbon is not.
    expect(screen.getByText('O')).toBeTruthy();
    expect(screen.queryByText('C')).toBeNull();
  });

  it('shows a fallback (not a wrong drawing) when the SMILES engine is unavailable', async () => {
    // Under test the engine never loads, so the SMILES path resolves to no geometry — the
    // component must degrade to an honest message rather than render something inaccurate.
    render(<MolecularStructure title="Aspirin" smiles="CC(=O)Oc1ccccc1C(=O)O" />);
    expect(await screen.findByText(/couldn.t render this structure/i)).toBeTruthy();
  });
});
