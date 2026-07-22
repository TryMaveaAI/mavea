import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { SurfaceNav } from '../src/components/SurfaceNav';

// The standalone dev surfaces (#/reel, #/slidelab) used to strand the user with no route home.
// SurfaceNav is the shared "← Back to Mavéa" bar; these lock that it always renders a link back to
// the app root (#/) so none of those surfaces can ever be a dead end.

describe('SurfaceNav', () => {
  it('renders a back-to-home link to the app root', () => {
    const { getByRole } = render(<SurfaceNav />);
    const link = getByRole('link', { name: /back to mavéa/i });
    expect(link.getAttribute('href')).toBe('#/');
  });

  it('shows an optional title alongside the back link', () => {
    const { getByText, getByRole } = render(<SurfaceNav title="Slide lab" />);
    expect(getByRole('link', { name: /back to mavéa/i })).toBeTruthy();
    expect(getByText('Slide lab')).toBeTruthy();
  });
});
