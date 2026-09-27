// Three documents are close enough to compare and enough to synthesize, so `#/synthesis` asks the
// reader which. Live's attach strip asked too, but every other Live door (⌘K's Prism row, the
// launcher's Prism card and the picker it opens) sent three straight into a Prism comparison. One
// count rule now decides for every door, and a door that meets three hands the reader the choice.
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { explodeRoute } from '../src/live/attachments';
import { ExplodeChoice } from '../src/live/prism/ExplodeChoice';
import { LiveApp } from '../src/live/LiveApp';
import { setLiveConfigV2, resetLiveConfig } from '../src/live/useLiveConfig';
import { clearSession } from '../src/live/session/store';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
  clearSession();
  resetLiveConfig();
});

describe('explodeRoute', () => {
  it('compares a few, asks at three, and synthesizes a pile', () => {
    expect([1, 2, 3, 4, 40].map(explodeRoute)).toEqual([
      'prism',
      'prism',
      'choose',
      'synthesis',
      'synthesis',
    ]);
  });
});

describe('ExplodeChoice', () => {
  const noop = (): void => {};

  it('offers both at three, and only the one that applies either side of it', () => {
    const { rerender } = render(<ExplodeChoice count={3} onCompare={noop} onSynthesize={noop} />);
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual([
      '⊹ Compare 3 documents',
      '⊹ Synthesize 3 sources',
    ]);
    rerender(<ExplodeChoice count={2} onCompare={noop} onSynthesize={noop} />);
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual([
      '⊹ Compare 2 documents',
    ]);
    rerender(<ExplodeChoice count={5} onCompare={noop} onSynthesize={noop} />);
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual([
      '⊹ Synthesize 5 sources',
    ]);
  });

  it('takes focus only when asked, and clears the request once it has', () => {
    const handled = vi.fn();
    const { rerender } = render(
      <ExplodeChoice count={3} onCompare={noop} onSynthesize={noop} onFocusHandled={handled} />,
    );
    expect(document.activeElement).toBe(document.body);
    rerender(
      <ExplodeChoice
        count={3}
        onCompare={noop}
        onSynthesize={noop}
        focusRequested
        onFocusHandled={handled}
      />,
    );
    expect(document.activeElement?.textContent).toBe('⊹ Compare 3 documents');
    expect(handled).toHaveBeenCalledOnce();
  });
});

describe('Live, three documents from the launcher', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('no network in test'))),
    );
  });

  it('asks the reader to compare or synthesize instead of opening a comparison', async () => {
    localStorage.setItem('mavea-live-setup-v1', '1');
    setLiveConfigV2({
      provider: 'gemini',
      models: { gemini: 'gemini-3.1-flash-lite' },
      keys: { gemini: 'test-key' },
    });
    // The Prism card opens a hidden picker; catch which input it is so the test can pick through it.
    const click = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});
    render(<LiveApp />);
    const launcher = screen.getByRole('region', { name: 'Ways to start' });
    fireEvent.click(within(launcher).getByRole('button', { name: /^Prism/ }));
    const picker = click.mock.contexts[0] as HTMLInputElement | undefined;
    expect(picker?.type).toBe('file');

    const files = ['a.txt', 'b.txt', 'c.txt'].map(
      (name) => new File([`notes in ${name}`], name, { type: 'text/plain' }),
    );
    fireEvent.change(picker!, { target: { files } });

    // The wizard hides the dock (and its attach strip) in CSS, so the choice the reader can see is
    // the one in the wizard's own staged strip.
    await waitFor(() => expect(document.querySelector('.start-with-staged')).not.toBeNull());
    const staged = within(document.querySelector<HTMLElement>('.start-with-staged')!);
    const compare = await staged.findByRole('button', { name: /^Compare 3 documents/ });
    expect(staged.getByRole('button', { name: /^Synthesize 3 sources/ })).toBeInTheDocument();
    await waitFor(() => expect(document.activeElement).toBe(compare));
    // Nothing was opened on the reader's behalf.
    expect(document.querySelector('.prism-panel')).toBeNull();
  });
});
