// Three documents are close enough to compare and enough to synthesize, so `#/synthesis` asks the
// reader which. Live's attach strip asked too, but every other Live door (⌘K's Prism row, the
// launcher's Prism card and the picker it opens) sent three straight into a Prism comparison. One
// count rule now decides for every door, and a door that meets three hands the reader the choice.
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { explodeRoute, explodeSources, type Attachment } from '../src/live/attachments';
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

const file = (name: string, mime: string): Attachment => ({ name, mime, data: '', size: 1 });
const texts = (n: number): Attachment[] =>
  Array.from({ length: n }, (_, i) => file(`t${i}.txt`, 'text/plain'));

describe('explodeSources', () => {
  it('counts a PDF or a picture only on a model that can see it', () => {
    const staged = [...texts(2), file('p.pdf', 'application/pdf'), file('i.png', 'image/png')];
    const seeing = explodeSources(staged, true);
    expect([seeing.docs.length, seeing.readable.length]).toEqual([4, 3]);
    const blind = explodeSources(staged, false);
    expect([blind.docs.length, blind.readable.length]).toEqual([2, 2]);
  });
});

describe('ExplodeChoice', () => {
  const noop = (): void => {};
  const sourcesOf = (n: number) => explodeSources(texts(n), true);

  it('offers both at three, and only the one that applies either side of it', () => {
    const { rerender } = render(
      <ExplodeChoice sources={sourcesOf(3)} onCompare={noop} onSynthesize={noop} />,
    );
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual([
      '⊹ Compare 3 documents',
      '⊹ Synthesize 3 sources',
    ]);
    expect(screen.getByRole('group', { name: 'Map 3 documents' })).toBeInTheDocument();
    rerender(<ExplodeChoice sources={sourcesOf(2)} onCompare={noop} onSynthesize={noop} />);
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual([
      '⊹ Compare 2 documents',
    ]);
    rerender(<ExplodeChoice sources={sourcesOf(5)} onCompare={noop} onSynthesize={noop} />);
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual([
      '⊹ Synthesize 5 sources',
    ]);
  });

  it('takes focus only when asked, and clears the request once it has', () => {
    const handled = vi.fn();
    const { rerender } = render(
      <ExplodeChoice
        sources={sourcesOf(3)}
        onCompare={noop}
        onSynthesize={noop}
        onFocusHandled={handled}
      />,
    );
    expect(document.activeElement).toBe(document.body);
    rerender(
      <ExplodeChoice
        sources={sourcesOf(3)}
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

  const txt = (...names: string[]): File[] =>
    names.map((name) => new File([`notes in ${name}`], name, { type: 'text/plain' }));

  /** The returning hub, with the Prism card's hidden picker caught so a test can pick through it. */
  function openHub(): { pick: (files: File[]) => void } {
    localStorage.setItem('mavea-live-setup-v1', '1');
    setLiveConfigV2({
      provider: 'gemini',
      models: { gemini: 'gemini-3.1-flash-lite' },
      keys: { gemini: 'test-key' },
    });
    const click = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});
    render(<LiveApp />);
    const launcher = screen.getByRole('region', { name: 'Ways to start' });
    fireEvent.click(within(launcher).getByRole('button', { name: /^Prism/ }));
    const picker = click.mock.contexts[0] as HTMLInputElement | undefined;
    expect(picker?.type).toBe('file');
    return { pick: (files) => fireEvent.change(picker!, { target: { files } }) };
  }

  it('asks the reader to compare or synthesize instead of opening a comparison', async () => {
    openHub().pick(txt('a.txt', 'b.txt', 'c.txt'));

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

  // "Choose a different file" appended, so one staged file plus three picked counted four in the
  // strip (Synthesis, which the strip never shows) while the picker's door counted three and asked
  // for a choice nobody drew: nothing opened at all.
  it('replaces the staged file when the reader chooses different ones, and asks about those', async () => {
    const hub = openHub();
    hub.pick(txt('first.txt'));
    await waitFor(() => expect(document.querySelector('.start-with-staged')).not.toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'Choose a different file' }));
    hub.pick(txt('a.txt', 'b.txt', 'c.txt'));

    const strip = document.querySelector<HTMLElement>('.start-with-staged')!;
    await waitFor(() =>
      expect(within(strip).queryByRole('button', { name: /^Compare 3 documents/ })).not.toBeNull(),
    );
    expect(strip.querySelectorAll('.start-with-files li')).toHaveLength(3);
    expect(strip.textContent).not.toMatch(/first\.txt/);
    await waitFor(() => expect(document.activeElement?.textContent).toBe('⊹ Compare 3 documents'));
    expect(document.activeElement?.closest('.start-with-staged')).toBe(strip);
  });
});
