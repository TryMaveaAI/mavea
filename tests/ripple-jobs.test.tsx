// ripple-jobs.test.tsx — Ripple's two-job spine + courses made first-class. The rail groups sections
// into "Understand" and "Ship the change", and Courses is now its OWN top-level entry (no longer buried
// under a generic "Onboarding"), so a reader can SEE the curriculum and open it directly.
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { SEED_SHIP } from '../src/live/ripple/seed';
import { RippleOverlay } from '../src/live/ripple/RippleOverlay';

afterEach(() => cleanup());
beforeEach(() => {
  try {
    localStorage.clear(); // first-run: the worked example opens plainly (no auto intake)
  } catch {
    /* ignore */
  }
});

describe('two-job rail + first-class courses', () => {
  it('labels both job clusters for a change that also has a curriculum', () => {
    const { getByText } = render(<RippleOverlay model={SEED_SHIP} onClose={() => undefined} />);
    expect(getByText('Ship the change')).toBeTruthy();
    expect(getByText('Understand')).toBeTruthy();
  });

  it('shows a dedicated "Courses" entry and opens the curriculum directly', async () => {
    const { getAllByRole, getByText } = render(
      <RippleOverlay model={SEED_SHIP} onClose={() => undefined} />,
    );
    const courses = getAllByRole('button', { name: /^Courses$/i });
    expect(courses.length).toBeGreaterThan(0);
    fireEvent.click(courses[0]!);
    // The curriculum surface (not a buried sub-tab).
    await waitFor(() => expect(getByText(/Guided curriculum/i)).toBeTruthy());
  });
});
