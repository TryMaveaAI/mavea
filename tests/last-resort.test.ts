import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const fresh = () => import('../src/lib/lastResort');

describe('installLastResort', () => {
  let root: HTMLDivElement;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetModules();
    root = document.createElement('div');
    root.id = 'root';
    document.body.appendChild(root);
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    root.remove();
    errorSpy.mockRestore();
  });

  it('injects the fallback and wires a working reload button when #root never painted', async () => {
    const { installLastResort } = await fresh();
    installLastResort();
    window.dispatchEvent(new ErrorEvent('error', { error: new Error('boom'), message: 'boom' }));

    expect(root.childElementCount).toBeGreaterThan(0);
    expect(root.textContent).toContain('Mavéa hit a snag');

    const reloadSpy = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { ...window.location, reload: reloadSpy },
      writable: true,
    });
    root.querySelector<HTMLButtonElement>('[data-reload]')!.click();
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  it('leaves #root untouched once React has actually mounted something', async () => {
    root.innerHTML = '<div class="mavea-app">already rendered</div>';
    const { installLastResort } = await fresh();
    installLastResort();
    window.dispatchEvent(new ErrorEvent('error', { error: new Error('late error') }));

    expect(root.textContent).toBe('already rendered');
  });

  it('reacts to an unhandled promise rejection the same way as a thrown error', async () => {
    const { installLastResort } = await fresh();
    installLastResort();
    const event = new Event('unhandledrejection') as PromiseRejectionEvent & {
      reason?: unknown;
    };
    Object.defineProperty(event, 'reason', { value: new Error('rejected'), configurable: true });
    window.dispatchEvent(event);

    expect(root.childElementCount).toBeGreaterThan(0);
  });

  it('is idempotent — calling install twice registers each listener only once', async () => {
    const { installLastResort } = await fresh();
    const addSpy = vi.spyOn(window, 'addEventListener');
    installLastResort();
    const callsAfterFirst = addSpy.mock.calls.length;
    installLastResort();
    expect(addSpy.mock.calls.length).toBe(callsAfterFirst);
    addSpy.mockRestore();
  });

  it('ignores the benign ResizeObserver notification-loop message — no log, no fallback', async () => {
    root.innerHTML = '<div class="mavea-app">already rendered</div>';
    const { installLastResort } = await fresh();
    installLastResort();
    const message = 'ResizeObserver loop completed with undelivered notifications.';
    window.dispatchEvent(new ErrorEvent('error', { error: new Error(message), message }));
    window.dispatchEvent(new ErrorEvent('error', { message })); // some engines report string-only

    expect(errorSpy).not.toHaveBeenCalledWith('[lastResort] unhandled error:', expect.anything());
    expect(root.textContent).toBe('already rendered');
  });

  it('still treats a real error as unhandled even when the wording merely mentions ResizeObserver', async () => {
    const { installLastResort } = await fresh();
    installLastResort();
    window.dispatchEvent(
      new ErrorEvent('error', {
        error: new Error('ResizeObserver callback threw a real exception'),
      }),
    );

    expect(errorSpy).toHaveBeenCalledWith(
      '[lastResort] unhandled error:',
      expect.objectContaining({ message: 'ResizeObserver callback threw a real exception' }),
    );
    expect(root.childElementCount).toBeGreaterThan(0);
  });
});
