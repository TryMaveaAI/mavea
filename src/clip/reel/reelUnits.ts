import { createContext } from 'react';

/** Bumped by `ReelPlayer` every time it (re)computes the board's `--ru`/`--rw` design units — a
 *  layout-affecting change to CSS custom properties that no ResizeObserver or React re-render
 *  otherwise signals on its own. `FitScale` reads this to know exactly when those units actually
 *  changed and re-measure, instead of guessing with a settle loop of timers. Starts at 0 so a
 *  consumer rendered before any board has computed metrics still gets a stable, valid value. */
export const ReelUnitsVersion = createContext(0);
