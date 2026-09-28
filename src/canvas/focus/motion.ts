/** Whether the user has asked the OS to minimize motion — motion then cuts instead of
 *  gliding. Guarded so it's safe in tests / non-DOM contexts. */
export function prefersReducedMotion(): boolean {
  try {
    return (
      typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  } catch {
    return false;
  }
}
