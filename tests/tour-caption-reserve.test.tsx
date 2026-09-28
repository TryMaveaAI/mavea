// The walkthrough caption is chrome the answer column makes ROOM for: parked over the canvas it
// covered the Study's active beat chip and the notice above the composer. It publishes the band it
// claims as --tour-h on the app shell (the column adds that to its dock reserve), claims nothing
// when docked at the top, and takes the reservation with it when it goes. jsdom has no layout, so
// the panel's height is stated here.
import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TourOverlay } from '../src/tour/TourOverlay';
import type { TourDriver } from '../src/tour/useTourDriver';

type TourChapter = NonNullable<TourDriver['chapter']>;

const PANEL_H = 148;

const driver = (over: Partial<TourDriver> = {}): TourDriver => ({
  active: true,
  started: true,
  index: 0,
  total: 3,
  chapter: { id: 'study', title: 'Guide me' } as unknown as TourChapter,
  coach: 'Guide me pulls this answer onto a desk.',
  playing: true,
  muted: true,
  done: false,
  corpusError: false,
  retryCorpus: vi.fn(),
  solo: true,
  start: vi.fn(),
  next: vi.fn(),
  prev: vi.fn(),
  jumpTo: vi.fn(),
  toggle: vi.fn(),
  toggleMute: vi.fn(),
  replay: vi.fn(),
  skip: vi.fn(),
  playExtra: vi.fn(),
  ...over,
});

function mount(d: TourDriver) {
  const app = document.createElement('div');
  app.className = 'mavea-app live-voice';
  document.body.append(app);
  const view = render(<TourOverlay driver={d} />, { container: app });
  return { app, ...view };
}

describe('the walkthrough caption reserves its band in the column', () => {
  const realOffsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight');

  beforeEach(() => {
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
      configurable: true,
      get() {
        return (this as HTMLElement).classList.contains('tourx-panel') ? PANEL_H : 0;
      },
    });
  });

  afterEach(() => {
    if (realOffsetHeight)
      Object.defineProperty(HTMLElement.prototype, 'offsetHeight', realOffsetHeight);
    document.body.replaceChildren();
  });

  it('publishes its height while the panel sits above the dock', () => {
    const { app } = mount(driver());
    // The stylesheet's --tour-gap is not loaded under jsdom, so the band is the panel alone.
    expect(app.style.getPropertyValue('--tour-h')).toBe(`${PANEL_H}px`);
  });

  it('takes the reservation back when it unmounts', () => {
    const { app, unmount } = mount(driver());
    unmount();
    expect(app.style.getPropertyValue('--tour-h')).toBe('');
  });

  it('claims nothing below while docked at the top', () => {
    const { app, rerender } = mount(driver());
    rerender(<TourOverlay driver={driver({ chapter: { id: 'ask' } as unknown as TourChapter })} />);
    expect(app.querySelector('.tourx-panel')?.classList.contains('is-top')).toBe(true);
    expect(app.style.getPropertyValue('--tour-h')).toBe('');
  });

  it('claims nothing before the walkthrough has started', () => {
    const { app } = mount(driver({ started: false }));
    expect(app.style.getPropertyValue('--tour-h')).toBe('');
  });
});
