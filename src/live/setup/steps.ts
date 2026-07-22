// steps.ts, the spine of the setup wizard: the four steps, their order, and the per-step
// question + subtitle (copy-locked to the design). Kept data-only so the constellation, the Go
// checklist, and the wizard shell all read step metadata from one place instead of repeating it.

export type StepId = 'connect' | 'think' | 'remember' | 'go';

export interface StepMeta {
  id: StepId;
  /** Short label shown under each constellation disc. */
  label: string;
  /** The big two-line question above the card (first-run framing). */
  title: string;
  /** The muted one-liner under the question. */
  sub: string;
}

/** Steps in ritual order. The constellation, checklist, and "Done → next" nav all use this. */
export const STEPS: readonly StepMeta[] = [
  {
    id: 'connect',
    label: 'Connect',
    title: 'Hi. Which mind should I think with?',
    sub: 'Your key, your model. Stored here only if you choose, then sent through this deployment.',
  },
  {
    id: 'think',
    label: 'Think',
    title: 'How thorough should I be?',
    sub: 'All of this is optional, the defaults are good.',
  },
  {
    id: 'remember',
    label: 'Remember',
    title: 'Should I remember you, and how should I sound?',
    sub: 'Memory lives on this device. You can hear me first.',
  },
  {
    id: 'go',
    label: 'Go',
    title: 'What are we figuring out?',
    sub: 'Talk like you would to a friend, switch topics whenever you want.',
  },
] as const;

/** The Go-step "What are we figuring out?" headline is for a RETURNING user; a first-run
 *  finisher gets a warmer arrival line instead (the orb has just woken). */
export const GO_FIRST_RUN_TITLE = 'I’m awake.';
export const GO_FIRST_RUN_SUB = 'Set and ready, start talking, or try one of these.';

const ORDER: readonly StepId[] = STEPS.map((s) => s.id);

/** The step after `id` in ritual order, or null if it's the last one. */
export function nextStep(id: StepId): StepId | null {
  const i = ORDER.indexOf(id);
  return i >= 0 && i < ORDER.length - 1 ? ORDER[i + 1] : null;
}

/** Look up a step's metadata. */
export function stepMeta(id: StepId): StepMeta {
  return STEPS.find((s) => s.id === id) ?? STEPS[0];
}
