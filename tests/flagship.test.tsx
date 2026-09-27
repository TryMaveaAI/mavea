import { render, fireEvent, waitFor } from '@testing-library/react';
import { FlagshipLanding } from '../src/flagship/FlagshipLanding';
import { chapterById } from '../src/tour/tourPlan';

const runtime = vi.hoisted(() => ({ IS_SHOWCASE: false }));
vi.mock('../src/lib/runtimeMode', () => runtime);
afterEach(() => {
  runtime.IS_SHOWCASE = false;
});

function setup() {
  const onPlay = vi.fn();
  const onEnterLive = vi.fn();
  const onPlayTour = vi.fn();
  const onViewWorld = vi.fn();
  return {
    onPlay,
    onEnterLive,
    onPlayTour,
    onViewWorld,
    ...render(
      <FlagshipLanding
        onPlay={onPlay}
        onEnterLive={onEnterLive}
        onPlayTour={onPlayTour}
        onViewWorld={onViewWorld}
      />,
    ),
  };
}

describe('the observatory homepage', () => {
  it('numbers every top-level section once in reading order', async () => {
    const { container } = setup();
    await waitFor(() => {
      const labels = [...container.querySelectorAll('.ob-section-marker')];
      expect(labels.map((label) => label.textContent?.slice(0, 2))).toEqual([
        '01',
        '02',
        '03',
        '04',
        '05',
        '06',
        '07',
      ]);
      for (const label of labels) {
        expect(label.closest('.fl-section')?.querySelector('.ob-section-marker')).toBe(label);
      }
    });
  });
  it('keeps a demo exit aligned with installation as deferred content loads', () => {
    window.location.hash = '#install';
    const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView');
    const scroll = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scroll,
    });
    let resize = () => {};
    const disconnect = vi.fn();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: () => void) {
          resize = callback;
        }
        observe() {}
        disconnect = disconnect;
      },
    );
    try {
      const { unmount } = setup();
      expect(scroll).toHaveBeenCalledWith({ behavior: 'instant', block: 'start' });
      const before = scroll.mock.calls.length;
      resize();
      expect(scroll.mock.calls.length).toBe(before + 1);
      fireEvent.wheel(window);
      expect(disconnect).toHaveBeenCalled();
      unmount();
    } finally {
      window.location.hash = '';
      if (original) Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', original);
      else Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
      vi.unstubAllGlobals();
    }
  });
  it('invites exploration without a prompt composer', () => {
    const { getByRole, onPlayTour, queryByRole } = setup();
    expect(getByRole('heading', { level: 1 })).toHaveTextContent('What ifan answerhad a pulse?');
    expect(queryByRole('textbox')).toBeNull();
    fireEvent.click(getByRole('button', { name: /Let me explore/ }));
    expect(onPlayTour).toHaveBeenCalledOnce();
  });

  it('keeps the animated hero and one recorded player below it', async () => {
    const { container } = setup();
    await waitFor(
      () => expect(container.querySelector('.ob-demos .answer-theatre')).toBeInTheDocument(),
      { timeout: 5000 },
    );
    expect(container.querySelectorAll('.answer-theatre')).toHaveLength(1);
    expect(container.querySelector('.ob-observatory')).toBeInTheDocument();
  });

  it('shows all four actual recorded sessions and hands off the chosen persona', async () => {
    const { container, onPlay } = setup();
    await waitFor(() => expect(container.querySelectorAll('.fl-demo-card')).toHaveLength(4));
    fireEvent.click(container.querySelector('.fl-demo-card')!);
    expect(onPlay.mock.calls[0][0].id).toBe('pm');
  });

  it('lets readers inspect the guide illustration without starting a live call', () => {
    const { getByRole, getByText, onEnterLive } = setup();
    fireEvent.click(getByRole('button', { name: 'What stands out' }));
    expect(getByRole('heading', { name: 'What stands out' })).toBeInTheDocument();
    expect(getByText('The interesting part is right here.')).toBeInTheDocument();
    expect(onEnterLive).not.toHaveBeenCalled();
  });

  it('only deep-links to existing tour chapters and offers the living answer', () => {
    const { container, getByRole, onViewWorld } = setup();
    for (const link of container.querySelectorAll<HTMLAnchorElement>('a[href*="ch="]')) {
      const query = new URLSearchParams(link.hash.split('?')[1]);
      expect(chapterById(query.get('ch')!)).toBeTruthy();
      expect(query.get('solo')).toBe('1');
    }
    fireEvent.click(getByRole('button', { name: /Explore a living answer/ }));
    expect(onViewWorld).toHaveBeenCalledOnce();
  });

  it('copies the installation command and reports clipboard failure honestly', async () => {
    runtime.IS_SHOWCASE = true;
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    try {
      const { getByRole } = setup();
      fireEvent.click(getByRole('button', { name: /Copy command/ }));
      await waitFor(() => expect(getByRole('button', { name: /Copied/ })).toBeInTheDocument());
      expect(writeText).toHaveBeenCalledWith('npx @mavea/mavea@latest');
      writeText.mockRejectedValueOnce(new Error('permission denied'));
      fireEvent.click(getByRole('button', { name: /Copied/ }));
      await waitFor(() =>
        expect(getByRole('button', { name: /Select and copy/ })).toBeInTheDocument(),
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('offers app entry and a tour locally instead of installation instructions', () => {
    const { getByRole, queryByRole, queryByText, onEnterLive, onPlayTour } = setup();
    expect(queryByText('npx @mavea/mavea@latest')).toBeNull();
    expect(queryByRole('button', { name: /Copy command/ })).toBeNull();
    expect(queryByRole('link', { name: /Installation guide/ })).toBeNull();
    expect(queryByRole('link', { name: /^npm/ })).toBeNull();
    fireEvent.click(getByRole('button', { name: /Open Mavéa/ }));
    expect(onEnterLive).toHaveBeenCalledOnce();
    fireEvent.click(getByRole('button', { name: /Take the guided tour/ }));
    expect(onPlayTour).toHaveBeenCalledOnce();
  });
});
