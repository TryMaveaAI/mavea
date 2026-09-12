// demo-view.test.ts — a replay opens on the view its script names. Every replay used to force
// the desk, so a visitor who watched more than one saw the same surface each time; now the
// driver re-asserts whichever view the session was written for.
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useDemoDriver } from '../src/demo/useDemoDriver';
import { DEMO_SCRIPTS } from '../src/demo/scripts';
import type { TourOps } from '../src/tour/useTourDriver';

/** Every op is a no-op except the one under observation: nothing reaches the real surface. */
function opsWatching(setViewMode: TourOps['setViewMode']): TourOps {
  const seen = { setViewMode };
  return new Proxy(seen, {
    get: (target, key) => (key in target ? target[key as keyof typeof target] : () => {}),
  }) as unknown as TourOps;
}

describe('a replay opens on the view its script names', () => {
  for (const script of DEMO_SCRIPTS) {
    it(`${script.persona} leads with the ${script.view}`, async () => {
      const setViewMode = vi.fn();
      const { result, unmount } = renderHook(() =>
        useDemoDriver({
          active: true,
          personaId: script.persona,
          startStep: 0,
          muted: true,
          ops: opsWatching(setViewMode),
        }),
      );
      await waitFor(() => expect(result.current.loadState).toBe('ready'));
      act(() => result.current.start());
      expect(setViewMode).toHaveBeenLastCalledWith(script.view);
      unmount();
    });
  }
});
