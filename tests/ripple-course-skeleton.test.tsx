import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { ShipCourse } from '../src/live/ripple/sections/ShipCourse';
import { buildShipFromPaths } from '../src/live/ripple/ingest/buildRepo';

// The curriculum is a model call that can take a few seconds. Its "building…" state has to read
// as real work in progress, not a frozen panel — a visible headline, an indeterminate progress
// sweep, and shimmering ghost lessons that preview the shape of what's coming. Regression cover
// for the loading-legibility pass (the old state was a lone pulsing dot + one line of text).

describe('ShipCourse — building skeleton', () => {
  beforeEach(() => localStorage.clear());

  const floor = () => buildShipFromPaths(['src/auth/index.ts'], 'acme/widget');

  it('shows the apparent building state (progress + ghost lessons) while the course generates', () => {
    const { container, getByText } = render(
      <ShipCourse model={floor()} altitude="working" building />,
    );
    expect(getByText(/Building your curriculum/i)).toBeTruthy();
    // the indeterminate progress sweep — the "still working" cue
    expect(container.querySelector('.ripple-progress')).toBeTruthy();
    // ghost lessons preview the curriculum's shape, so the wait doesn't read as a hang
    expect(container.querySelector('.ripple-course-skeleton--preview')).toBeTruthy();
    expect(container.querySelectorAll('.ripple-skel-lesson')).toHaveLength(4);
  });

  it('shows a guiding empty state, not a frozen skeleton, when there is nothing to build', () => {
    const { container, getByText } = render(<ShipCourse model={floor()} altitude="working" />);
    expect(container.querySelector('.ripple-course-skeleton')).toBeNull();
    expect(container.querySelectorAll('.ripple-skel-lesson')).toHaveLength(0);
    expect(getByText(/Connect a model|Couldn.t build/i)).toBeTruthy();
  });
});
