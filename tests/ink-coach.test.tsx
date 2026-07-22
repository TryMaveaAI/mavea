import { afterEach, beforeEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { InkBar } from '../src/live/annotate/InkBar';

const noop = (): void => {};
const KEY = 'mavea-ink-hint-seen';

function mount(over: Partial<Parameters<typeof InkBar>[0]> = {}) {
  return render(<InkBar armed={false} pins={[]} onUndo={noop} onSend={noop} {...over} />);
}

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe('InkBar — one-time ink coach (discoverability)', () => {
  it('shows the coach on a fresh canvas (unseen, not armed, no marks)', () => {
    const { container } = mount();
    expect(container.querySelector('.ink-coach')).not.toBeNull();
    expect(container.querySelector('.ink-bar')?.classList.contains('coaching')).toBe(true);
    // (the Mark toggle now lives in the composer control row, not in this bar)
  });

  it('does not show when already seen', () => {
    localStorage.setItem(KEY, '1');
    expect(mount().container.querySelector('.ink-coach')).toBeNull();
  });

  it('retires the coach (and remembers it) when the user arms Mark', () => {
    const { container, rerender } = mount();
    expect(container.querySelector('.ink-coach')).not.toBeNull();
    rerender(<InkBar armed pins={[]} onUndo={noop} onSend={noop} />);
    expect(container.querySelector('.ink-coach')).toBeNull();
    expect(localStorage.getItem(KEY)).toBe('1');
  });

  it('dismissing it hides it for good across mounts', () => {
    const { container } = mount();
    fireEvent.click(container.querySelector('.ink-coach-x')!);
    expect(container.querySelector('.ink-coach')).toBeNull();
    expect(localStorage.getItem(KEY)).toBe('1');
    cleanup();
    expect(mount().container.querySelector('.ink-coach')).toBeNull();
  });
});
