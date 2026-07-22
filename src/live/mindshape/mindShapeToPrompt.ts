// mindShapeToPrompt.ts — fuse a settled mindshape into a single rich ask.
// "Just answer it" and "Give me next steps" hand the WHOLE map to Mavéa — the central question
// plus every want, worry, option, tradeoff, person, constraint, and the tensions between them —
// so the answer is grounded in everything the user actually said, not just the one-line center.
import type { MindAtom, MindAtomKind, MindShapeSpec } from './types';

/** Human-readable group headings, in the order they read best in a prompt. */
const GROUPS: Array<{ heading: string; kinds: MindAtomKind[] }> = [
  { heading: 'Options on the table', kinds: ['option'] },
  { heading: 'What I want', kinds: ['want', 'value'] },
  { heading: 'What worries me', kinds: ['fear', 'contradiction'] },
  { heading: 'Trade-offs', kinds: ['tradeoff'] },
  { heading: 'Constraints', kinds: ['constraint'] },
  { heading: 'People involved', kinds: ['person'] },
  { heading: 'Still open', kinds: ['open_loop', 'question'] },
  { heading: 'Things I could do', kinds: ['action'] },
];

/** One bullet per atom: the label, with the verbatim quote when it adds detail. */
function bulletFor(a: MindAtom): string {
  const quote =
    a.quote && a.quote.trim() && a.quote.trim() !== a.label ? ` ("${a.quote.trim()}")` : '';
  return `- ${a.label}${quote}`;
}

/** Build the fused-context block shared by both the answer and the plan asks. */
function contextBlock(spec: MindShapeSpec): string {
  const lines: string[] = [];

  if (spec.clusters && spec.clusters.length) {
    // Group by the person's OWN themes — the way they actually framed it — not a fixed taxonomy.
    const byId = new Map(spec.atoms.map((a) => [a.id, a]));
    const used = new Set<string>();
    for (const cluster of spec.clusters) {
      const atoms = cluster.atomIds.map((id) => byId.get(id)).filter((a): a is MindAtom => !!a);
      if (!atoms.length) continue;
      lines.push(`${cluster.label}:`);
      for (const a of atoms) {
        lines.push(bulletFor(a));
        used.add(a.id);
      }
      lines.push('');
    }
    const rest = spec.atoms.filter((a) => !used.has(a.id));
    if (rest.length) {
      lines.push('Also on my mind:');
      for (const a of rest) lines.push(bulletFor(a));
      lines.push('');
    }
  } else {
    // Fallback (older settled spec with no themes): group by the kind taxonomy.
    for (const group of GROUPS) {
      const atoms = spec.atoms.filter((a) => group.kinds.includes(a.kind));
      if (!atoms.length) continue;
      lines.push(`${group.heading}:`);
      for (const a of atoms) lines.push(bulletFor(a));
      lines.push('');
    }
  }

  // Tensions are the hero of the map — the conflicts pulling against each other.
  const tensions = spec.links.filter((l) => l.kind === 'tensions');
  if (tensions.length) {
    lines.push('Tensions I feel:');
    for (const t of tensions) {
      const from = spec.atoms.find((a) => a.id === t.from)?.label ?? '';
      const to = spec.atoms.find((a) => a.id === t.to)?.label ?? '';
      if (from && to) lines.push(`- "${from}" ${t.label || 'pulls against'} "${to}"`);
    }
    lines.push('');
  }
  return lines.join('\n').trim();
}

export type MindPromptMode = 'answer' | 'plan';

/**
 * Turn the settled map into a single prompt. `answer` asks Mavéa to weigh everything and respond;
 * `plan` asks for concrete next steps. Both run as a normal turn, so the answer comes back as a
 * full visual canvas — exactly like asking out loud, but grounded in the whole map.
 */
export function mindShapeToPrompt(spec: MindShapeSpec, mode: MindPromptMode): string {
  const center = spec.center?.trim();
  const context = contextBlock(spec);
  const head = center
    ? `I've been thinking out loud and here's what it comes down to: ${center}`
    : `I've been thinking out loud. Here's the shape of it.`;
  const ask =
    mode === 'plan'
      ? 'Pull this together and give me a concrete plan — the clear next steps, in order, that move me forward given everything above.'
      : 'Pull this together and help me with it — weigh what matters most, address the tensions head-on, and give me a clear, useful answer.';
  return [head, '', context, '', ask]
    .filter((s) => s !== undefined)
    .join('\n')
    .trim();
}
