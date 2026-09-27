// revealAboveKeyboard.ts — keeps a focused field in sight above a phone's on-screen keyboard.
//
// The wizard is a fixed shell whose step scrolls inside `.setup-stage`, and most phone browsers now
// shrink only the VISUAL viewport when the keyboard opens — the layout does not move, so nothing
// scrolls the stage for us and a field low on the step (the API key, ~770px down at 390x844) sits
// under the keys it is waiting on. While a field inside the element is focused, every visual
// viewport resize re-checks it and centres it in the stage if the keyboard has covered it.
import type { RefCallback } from 'react';

/** A React 19 ref callback: attach it to the element wrapping the field. Its cleanup removes every
 *  listener it added, including the viewport one a blur would normally remove. */
export const revealAboveKeyboard: RefCallback<HTMLElement> = (field) => {
  const viewport = typeof window === 'undefined' ? null : window.visualViewport;
  if (!field || !viewport) return;

  const reveal = (): void => {
    if (!field.contains(document.activeElement)) return;
    const box = field.getBoundingClientRect();
    const top = viewport.offsetTop;
    const bottom = top + viewport.height;
    if (box.bottom > bottom || box.top < top) {
      field.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  };
  const onFocus = (): void => {
    reveal();
    viewport.addEventListener('resize', reveal);
  };
  const onBlur = (): void => {
    viewport.removeEventListener('resize', reveal);
  };

  field.addEventListener('focusin', onFocus);
  field.addEventListener('focusout', onBlur);
  return () => {
    field.removeEventListener('focusin', onFocus);
    field.removeEventListener('focusout', onBlur);
    viewport.removeEventListener('resize', reveal);
  };
};
