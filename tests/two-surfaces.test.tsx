import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TwoSurfaces } from '../src/flagship/sections/TwoSurfaces';

describe('the two-card section opens one door per card', () => {
  // Both cards' buttons once opened Live, so the pair read as two names for one place. The
  // no-sign-up card's promise is the key-free walkthrough; the bring-your-keys card's is Live.
  it('starts the walkthrough from the no-sign-up card and Live from the keys card', () => {
    const onEnterLive = vi.fn();
    const onPlayTour = vi.fn();
    const { getByRole, queryByRole } = render(
      <TwoSurfaces onEnterLive={onEnterLive} onPlayTour={onPlayTour} />,
    );
    fireEvent.click(getByRole('button', { name: /Take the tour/ }));
    expect(onPlayTour).toHaveBeenCalledTimes(1);
    expect(onEnterLive).not.toHaveBeenCalled();
    fireEvent.click(getByRole('button', { name: /Open Live/ }));
    expect(onEnterLive).toHaveBeenCalledTimes(1);
    expect(queryByRole('button', { name: /Open Mavéa/ })).toBeNull();
  });
});
