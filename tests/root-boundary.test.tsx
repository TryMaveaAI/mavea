import { render, screen, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';
import { RootBoundary, SurfaceFallback } from '../src/RootBoundary';

function Bomb(): never {
  throw new Error('surface exploded');
}

describe('RootBoundary', () => {
  it('renders children when nothing has failed', () => {
    render(
      <RootBoundary>
        <p>all good</p>
      </RootBoundary>,
    );
    expect(screen.getByText('all good')).toBeInTheDocument();
  });

  it('catches a render throw and shows the branded fallback with a reload action', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <RootBoundary>
        <Bomb />
      </RootBoundary>,
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Mavéa hit a snag')).toBeInTheDocument();
    const reload = screen.getByRole('button', { name: 'Reload' });

    const reloadSpy = vi.fn();
    const original = window.location.reload;
    // jsdom's window.location.reload throws "Not implemented" unless stubbed.
    Object.defineProperty(window, 'location', {
      value: { ...window.location, reload: reloadSpy },
      writable: true,
    });
    fireEvent.click(reload);
    expect(reloadSpy).toHaveBeenCalledTimes(1);

    Object.defineProperty(window, 'location', { value: { ...window.location, reload: original } });
    spy.mockRestore();
  });

  it('shows the offline-specific message when navigator.onLine is false', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const original = Object.getOwnPropertyDescriptor(navigator, 'onLine');
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });

    render(
      <RootBoundary>
        <Bomb />
      </RootBoundary>,
    );
    expect(screen.getByText(/you're offline/i)).toBeInTheDocument();

    if (original) Object.defineProperty(navigator, 'onLine', original);
    spy.mockRestore();
  });
});

describe('SurfaceFallback', () => {
  it('renders an instant, dependency-free placeholder', () => {
    const { container } = render(<SurfaceFallback />);
    expect(container.querySelector('.surface-fallback')).toBeInTheDocument();
    expect(container.querySelector('.surface-fallback-orb')).toBeInTheDocument();
  });

  it('announces itself as a busy, polite status — not a hidden decoration', () => {
    const { container } = render(<SurfaceFallback />);
    const status = screen.getByRole('status', { name: 'Loading…' });
    expect(status).toHaveClass('surface-fallback');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveAttribute('aria-busy', 'true');
    // The pulsing orb is purely decorative; only the label should reach assistive tech.
    expect(container.querySelector('.surface-fallback-orb')).toHaveAttribute('aria-hidden', 'true');
  });
});
