/** Whether the user has asked the OS to minimize motion — Focus mode then cuts instead of glides
 *  (scroll jumps, the hero swap is instant). Guarded so it's safe in tests / non-DOM contexts. */
export function prefersReducedMotion(): boolean {
  try {
    return (
      typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  } catch {
    return false;
  }
}
