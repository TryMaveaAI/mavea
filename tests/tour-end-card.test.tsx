import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TourEndCard } from '../src/tour/TourEndCard';
import { TOUR_EXTRAS } from '../src/tour/tourPlan';

vi.mock('../src/presence/Presence', () => ({
  Presence: () => <div data-testid="presence" />,
}));

describe('TourEndCard', () => {
  it('offers every corpus-backed extra and launches the selected mini-demo', () => {
    const onPlayExtra = vi.fn();
    render(<TourEndCard onStart={vi.fn()} onReplay={vi.fn()} onPlayExtra={onPlayExtra} />);

    expect(screen.getAllByRole('button', { name: /play scripted mini-demo/i })).toHaveLength(
      TOUR_EXTRAS.length,
    );
    fireEvent.click(
      screen.getByRole('button', {
        name: `Play scripted mini-demo: ${TOUR_EXTRAS[0].title}`,
      }),
    );
    expect(onPlayExtra).toHaveBeenCalledWith(TOUR_EXTRAS[0].id);
  });

  it('keeps the real-product and replay exits wired', () => {
    const onStart = vi.fn();
    const onReplay = vi.fn();
    render(<TourEndCard onStart={onStart} onReplay={onReplay} onPlayExtra={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Start Mavéa' }));
    fireEvent.click(screen.getByRole('button', { name: 'Replay the tour' }));
    expect(onStart).toHaveBeenCalledOnce();
    expect(onReplay).toHaveBeenCalledOnce();
  });

  it('names the exit honestly when the user has a saved session to resume', () => {
    render(
      <TourEndCard onStart={vi.fn()} onReplay={vi.fn()} onPlayExtra={vi.fn()} hasStoredSession />,
    );
    expect(screen.getByRole('button', { name: 'Back to your session' })).toBeVisible();
  });
});
