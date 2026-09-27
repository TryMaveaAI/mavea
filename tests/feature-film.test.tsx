import { fireEvent, render, screen } from '@testing-library/react';
import { FeatureFilm } from '../src/flagship/sections/FeatureFilm';
import { chapterById } from '../src/tour/tourPlan';

it('shows six distinct feature scenes with truthful labels and working destinations', () => {
  const { container } = render(<FeatureFilm />);
  for (const name of ['Deep Zoom', 'Courses', 'Flashcards', 'Dashboards', 'Prism', 'Ripple']) {
    fireEvent.click(screen.getByRole('button', { name: new RegExp(name) }));
    expect(screen.getByRole('img', { name: `${name} illustrated example` })).toBeInTheDocument();
    const link = screen.getByRole('link', { name: new RegExp(`Explore ${name}`) });
    const hash = link.getAttribute('href')!;
    if (name === 'Dashboards') expect(hash).toBe('#/dashboards');
    else expect(chapterById(new URLSearchParams(hash.split('?')[1]).get('ch')!)).toBeTruthy();
  }
  expect(container.textContent).toContain('Animated feature illustration · sample content');
});

it('supports explicit pause', () => {
  const { container } = render(<FeatureFilm />);
  fireEvent.click(screen.getByRole('button', { name: 'Pause film' }));
  expect(container.querySelector('.feature-film')).toHaveAttribute('data-running', 'false');
  expect(screen.getByRole('button', { name: 'Play film' })).toBeInTheDocument();
});

it('respects reduced motion and removes its listeners on unmount', () => {
  const remove = vi.fn();
  vi.stubGlobal('matchMedia', () => ({
    matches: true,
    addEventListener: vi.fn(),
    removeEventListener: remove,
  }));
  try {
    const { container, unmount } = render(<FeatureFilm />);
    expect(container.querySelector('.feature-film')).toHaveAttribute('data-reduced', 'true');
    expect(container.querySelector('.feature-film')).toHaveAttribute('data-running', 'false');
    unmount();
    expect(remove).toHaveBeenCalledWith('change', expect.any(Function));
  } finally {
    vi.unstubAllGlobals();
  }
});
