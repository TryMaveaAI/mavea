// beats.ts — the feature choreography a demo step can perform after its answer settles. Every
// beat maps 1:1 onto a TourOps closure LiveApp already exposes to the walkthrough, which is
// the point: a demo can only ever show a feature the real surface actually has. Adding a beat
// kind here means wiring a real op — there is no way to fake one.
//
// `atMs` is measured from WALK-QUIET (the moment the answer's own narration and reveal walk
// finish), never from step entry — beats decorate the answer, they don't talk over it.

export type DemoBeat =
  /** Enter Room, move shared attention across real objects, and optionally hold the first few
   *  together — the spatial "these" gesture, performed through the production selection seam. */
  | { kind: 'room'; atMs: number; connect?: number }
  /** Pin the answer's first card via its Ask affordance (the point-and-ask gesture). */
  | { kind: 'pin'; atMs: number }
  /** Drag the answer's bend-it dial — every derived number recomputes live. Skipped (and
   *  flagged at bake) if the step's frame carries no `spec.bend`. */
  | { kind: 'bend'; atMs: number }
  /** Arm the pen and draw a real highlighter mark across the first card. */
  | { kind: 'mark'; atMs: number }
  /** Let Mavéa's real answer-annotation Pen draw on the current answer. */
  | { kind: 'pen'; atMs: number }
  /** Enter Focus mode; with `walk`, spotlight the cards one by one. */
  | { kind: 'focus'; atMs: number; walk?: boolean }
  /** Enter the spatial Canvas and fly the camera across the first few cards. */
  | { kind: 'canvas'; atMs: number }
  /** Open the export studio; optionally flip to a format and pick a template. */
  | { kind: 'export'; atMs: number; format?: 'presentation' | 'document' }
  /** Open the living dashboard; with `settings`, flip to its refresh-cadence panel. */
  | { kind: 'dashboard'; atMs: number; settings?: boolean }
  /** Turn the first card into a flashcard (the capture flow). */
  | { kind: 'flashcards'; atMs: number }
  /** Present the answer full screen. */
  | { kind: 'present'; atMs: number }
  /** Open the share reel. */
  | { kind: 'share'; atMs: number }
  /** Open the ⌘K command palette. */
  | { kind: 'palette'; atMs: number };

// Execution (mapping each beat onto its TourOps calls) lives in runBeat.ts — this file stays
// pure data so scripts.ts and the baker can import it without touching the surface.
