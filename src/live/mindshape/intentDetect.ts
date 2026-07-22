// intentDetect.ts — pure function that classifies a thinking session's intent from its spec.
// No side effects, no model calls. Used to drive adaptive labels and action copy in MindShape.
import type { MindIntent, MindShapeSpec } from './types';

export function detectIntent(spec: MindShapeSpec): MindIntent {
  if (spec.atoms.length === 0) return 'general';

  let options = 0,
    open_loops = 0,
    actions = 0,
    questions = 0,
    fears = 0,
    wants = 0,
    persons = 0;

  for (const a of spec.atoms) {
    if (a.kind === 'option') options++;
    else if (a.kind === 'open_loop') open_loops++;
    else if (a.kind === 'action') actions++;
    else if (a.kind === 'question') questions++;
    else if (a.kind === 'fear') fears++;
    else if (a.kind === 'want') wants++;
    else if (a.kind === 'person') persons++;
  }

  const total = spec.atoms.length;
  const hasTension = spec.links.some((l) => l.kind === 'tensions' && !l.provisional);

  if (options >= 2 && hasTension) return 'decision';
  if (open_loops + actions >= 3) return 'planning';
  if (questions / total >= 0.4) return 'exploration';
  if ((fears + wants + persons) / total >= 0.5) return 'processing';
  return 'general';
}
