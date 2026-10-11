// LogicGates circuit logic: which gates the board reports as outputs, and the level every gate
// settles at for a given set of inputs.
import type { LogicGate, LogicGateKind, LogicOutput } from './types';

/** A logic level, or null for "not knowable from what was drawn". */
export type Level = 0 | 1 | null;

/** Evaluate one gate from its already-resolved input values. NOT/buffers read the first input.
 *  A gate naming a source that is not on the board has no level: the unresolved reference is
 *  reported as unknown rather than read as a 0, which would be a bit the diagram invented. A
 *  fabricated 0 propagates — it colours this gate's wire, prints on the output pin, and feeds
 *  every gate downstream — so one dangling name could put a confident Y=0 on a card whose own
 *  truth table highlights the row saying 1. */
function evalGate(kind: LogicGateKind, vals: Level[]): Level {
  if (!vals.length || vals.some((v) => v === null)) return null;
  const bits = vals as (0 | 1)[];
  const all1 = bits.every((v) => v === 1);
  const any1 = bits.some((v) => v === 1);
  const ones = bits.reduce<number>((a, v) => a + v, 0);
  const odd = ones % 2 === 1;
  switch (kind) {
    case 'AND':
      return all1 ? 1 : 0;
    case 'NAND':
      return all1 ? 0 : 1;
    case 'OR':
      return any1 ? 1 : 0;
    case 'NOR':
      return any1 ? 0 : 1;
    case 'XOR':
      return odd ? 1 : 0;
    case 'XNOR':
      return odd ? 0 : 1;
    case 'NOT':
      return vals[0] === 1 ? 0 : 1;
    default:
      return 0;
  }
}

/** One pin on the right edge: the declared output, or a gate whose result feeds nothing else. */
export interface OutputPin {
  from: string;
  label: string;
}

/** The declared output first, then every gate no other gate reads. A half adder's carry is an
 *  AND that feeds nothing; without its own pin it was drawn ending in mid-air, its result shown
 *  nowhere, though it is half of what the circuit computes. A gate's id is the only name the
 *  schema gives it, so its pin carries that. */
export function outputPins(gates: LogicGate[], output?: LogicOutput): OutputPin[] {
  const read = new Set(gates.flatMap((g) => g.inputs));
  const pins: OutputPin[] = output ? [{ from: output.from, label: output.label ?? 'Y' }] : [];
  for (const g of gates) {
    if (read.has(g.id) || g.id === output?.from) continue;
    pins.push({ from: g.id, label: g.id.charAt(0).toUpperCase() + g.id.slice(1) });
  }
  return pins;
}

/** Every source's level for one assignment of the inputs, resolved by recursion so gate order
 *  in the array does not matter. A cycle or a dangling name yields null, never a guessed bit. */
export function evaluateCircuit(
  gates: LogicGate[],
  inputLevels: ReadonlyMap<string, Level>,
): Map<string, Level> {
  const byId = new Map(gates.map((g) => [g.id, g]));
  const out = new Map<string, Level>(inputLevels);
  const visiting = new Set<string>();
  const levelOf = (id: string): Level => {
    if (out.has(id)) return out.get(id)!;
    const g = byId.get(id);
    if (!g || visiting.has(id)) return null;
    visiting.add(id);
    const n = g.kind === 'NOT' ? 1 : g.inputs.length;
    const v = evalGate(g.kind, g.inputs.slice(0, n).map(levelOf));
    visiting.delete(id);
    out.set(id, v);
    return v;
  };
  for (const g of gates) levelOf(g.id);
  return out;
}
