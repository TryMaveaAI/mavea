// smiles.ts — turn a SMILES string into skeletal-structure geometry our renderer can draw.
//
// Why this exists: a language model reliably recalls a compound's SMILES string (ibuprofen is
// "CC(C)Cc1ccc(cc1)C(C)C(=O)O"), but it cannot place 33 atoms at correct 2-D coordinates by
// hand — that produces the random blobs freehand SVG gives. So the model supplies only the
// SMILES, and OpenChemLib (a real cheminformatics engine) computes accurate atom positions and
// bonds. We then draw those with our own MolecularStructure component, so the result is precise
// AND on-brand. Same "headless library, our pixels" pattern as KaTeX / Leaflet.
//
// OpenChemLib (BSD-3, ~1 MB pure-JS ESM, no WASM) is loaded lazily via a dynamic import() on first
// use, so it's code-split into its own chunk and chemistry pays for the engine only when it's
// actually drawn.
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { MoleculeAtom, MoleculeBond } from './types';

export interface MoleculeGeometry {
  atoms: MoleculeAtom[];
  bonds: MoleculeBond[];
  /** Molecular formula with unicode subscripts, derived from the parsed structure. */
  formula?: string;
}

// Raw geometry as it comes out of the engine — chemistry convention (y points up), bond length ≈ 1.
interface RawAtom {
  el: string;
  x: number;
  y: number;
  isCarbon: boolean;
  charge?: string;
}
interface RawBond {
  from: number;
  to: number;
  order: 1 | 2 | 3;
}

// Layout box: atoms land inside [PAD, 100-PAD] on the renderer's 0..100 canvas.
const PAD = 12;
const SPAN = 100 - PAD * 2;

const SUBSCRIPTS = ['₀', '₁', '₂', '₃', '₄', '₅', '₆', '₇', '₈', '₉'];
const toSubscript = (s: string): string => s.replace(/\d/g, (d) => SUBSCRIPTS[+d]);

function chargeLabel(n: number): string | undefined {
  if (!n) return undefined;
  const mag = Math.abs(n) > 1 ? String(Math.abs(n)) : '';
  return n > 0 ? `${mag}+` : `${mag}−`; // U+2212 minus, matches the renderer's notation
}

/**
 * Scale/center raw engine coordinates into the renderer's 0..100 space and flip the Y axis
 * (chemistry is y-up, SVG is y-down). Carbons become implicit vertices (skeletal style). Pure
 * and synchronous so it can be unit-tested without the engine. Returns null for empty input.
 */
export function normalizeMolecule(
  rawAtoms: RawAtom[],
  rawBonds: RawBond[],
): MoleculeGeometry | null {
  if (!rawAtoms.length) return null;

  const xs = rawAtoms.map((a) => a.x);
  const ys = rawAtoms.map((a) => a.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const w = maxX - minX || 1;
  const h = maxY - minY || 1;
  const scale = SPAN / Math.max(w, h); // uniform — preserve the molecule's aspect ratio
  const offX = PAD + (SPAN - w * scale) / 2;
  const offY = PAD + (SPAN - h * scale) / 2;

  const atoms: MoleculeAtom[] = rawAtoms.map((a) => {
    const atom: MoleculeAtom = {
      el: a.el,
      x: offX + (a.x - minX) * scale,
      y: offY + (maxY - a.y) * scale, // flip Y here
    };
    if (a.isCarbon) atom.implicit = true; // skeletal: carbons are bare vertices
    if (a.charge) atom.charge = a.charge;
    return atom;
  });

  const bonds: MoleculeBond[] = rawBonds.map((b) => ({ from: b.from, to: b.to, order: b.order }));
  return { atoms, bonds };
}

let oclPromise: Promise<any | null> | null = null;

/** Lazy-load OpenChemLib once per session. Returns null if unavailable or under test, so callers
 *  fall back gracefully without ever hitting the network. */
function loadOCL(): Promise<any | null> {
  // Skip the import in unit tests — the SMILES path is covered by mocks + the pure normalizer
  // above. Demos that carry a `smiles` prop then render the honest fallback in jsdom.
  if (import.meta.env?.MODE === 'test') return Promise.resolve(null);
  if (oclPromise) return oclPromise;
  oclPromise = import('openchemlib').then((m: any) => m.default ?? m).catch(() => null);
  return oclPromise;
}

const clampOrder = (n: number): 1 | 2 | 3 => (n === 2 ? 2 : n === 3 ? 3 : 1);

/**
 * Parse a SMILES string into renderable skeletal geometry via OpenChemLib. Returns null on an
 * invalid string or when the engine can't be loaded — the component then shows a fallback.
 */
export async function smilesToMolecule(smiles: string): Promise<MoleculeGeometry | null> {
  const OCL = await loadOCL();
  if (!OCL) return null;

  let mol: any;
  try {
    mol = OCL.Molecule.fromSmiles(smiles); // fromSmiles auto-generates 2-D coordinates
  } catch {
    return null;
  }
  if (!mol) return null;

  const n: number = mol.getAllAtoms();
  if (!n) return null;

  // Keep every atom so bond indices stay aligned (normal SMILES carries no explicit hydrogens).
  const rawAtoms: RawAtom[] = [];
  for (let i = 0; i < n; i++) {
    const atomicNo: number = mol.getAtomicNo(i);
    rawAtoms.push({
      el: mol.getAtomLabel(i),
      x: mol.getAtomX(i),
      y: mol.getAtomY(i),
      isCarbon: atomicNo === 6,
      charge: chargeLabel(mol.getAtomCharge(i)),
    });
  }

  const rawBonds: RawBond[] = [];
  const bn: number = mol.getAllBonds();
  for (let b = 0; b < bn; b++) {
    rawBonds.push({
      from: mol.getBondAtom(0, b),
      to: mol.getBondAtom(1, b),
      order: clampOrder(mol.getBondOrder(b)),
    });
  }

  const geo = normalizeMolecule(rawAtoms, rawBonds);
  if (!geo) return null;

  // The engine's formula is more reliable than a hand-typed one (it counts implicit hydrogens).
  try {
    const f = mol.getMolecularFormula?.()?.formula;
    if (f) geo.formula = toSubscript(f);
  } catch {
    /* formula is a nicety — never fail the structure over it */
  }
  return geo;
}
