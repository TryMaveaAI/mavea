// guided-chrome.test.tsx — the chrome the prerecorded surfaces put over the real app: the demo
// replay's cards/transport (src/demo/) and the walkthrough's welcome + end cards (src/tour/).
// Each describe below locks down one way that chrome used to fail a visitor: unreadable text on
// the pastel persona accents, a card that clipped its own controls away on a short viewport, a
// dialog that claimed modality it never enforced, a "Back to home" that went somewhere else, and
// a corpus fetch that could dead-end the walkthrough with nothing to click.
import { readFileSync } from 'fs';
import { join } from 'path';
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DemoOverlay } from '../src/demo/DemoOverlay';
import { DEMO_CAST } from '../src/demo/cast';
import type { DemoDriver } from '../src/demo/useDemoDriver';
import { TourEndCard } from '../src/tour/TourEndCard';
import { TourOverlay } from '../src/tour/TourOverlay';
import { useTourDriver, type TourDriver, type TourOps } from '../src/tour/useTourDriver';

vi.mock('../src/presence/Presence', () => ({
  Presence: () => <div data-testid="presence" />,
}));

// The driver reaches the baked scenes through this module; mocking it is the only way to make the
// fetch fail on demand (a dynamic import of a committed JSON never fails in the suite).
const { loadTourCorpus } = vi.hoisted(() => ({ loadTourCorpus: vi.fn() }));
vi.mock('../src/tour/corpus', () => ({
  loadTourCorpus,
  tourConversation: () => undefined,
  tourConversations: () => [],
}));

const read = (rel: string): string => readFileSync(join(__dirname, '..', rel), 'utf8');
/** The one CSS rule for a class selector, comments and all (the suite has no layout engine). */
const rule = (css: string, selector: string): string =>
  new RegExp(`\\${selector}\\s*\\{[^}]*\\}`).exec(css)?.[0] ?? '';

/* ── WCAG contrast over CSS color-mix(in oklab, …) ──────────────────────────────────────────── */

type Rgb = [number, number, number];

const hexToRgb = (hex: string): Rgb => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255) as Rgb;
};
const toLinear = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGamma = (c: number): number =>
  c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;

function toOklab([r, g, b]: Rgb): Rgb {
  const [R, G, B] = [toLinear(r), toLinear(g), toLinear(b)];
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function fromOklab([L, a, b]: Rgb): Rgb {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((c) => Math.min(1, Math.max(0, toGamma(c)))) as Rgb;
}

/** What `color-mix(in oklab, top <pct>%, bottom)` actually resolves to. */
function mixOklab(top: string, pct: number, bottom: string): Rgb {
  const [a, b] = [toOklab(hexToRgb(top)), toOklab(hexToRgb(bottom))];
  return fromOklab(a.map((v, i) => v * (pct / 100) + b[i] * (1 - pct / 100)) as Rgb);
}

function contrast(fg: Rgb, bg: string): number {
  const lum = ([r, g, b]: Rgb): number =>
    0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
  const [hi, lo] = [lum(fg), lum(hexToRgb(bg))].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Pull a token's value straight from the theme sheet, so a retuned palette retests itself. */
const token = (rel: string, name: string): string =>
  new RegExp(`${name}:\\s*(#[0-9a-f]{6})`).exec(read(rel))?.[1] ?? '';

describe('demo chrome — the persona accents are pastels, so nothing may sit on them raw', () => {
  const css = read('src/demo/demo.css');
  const accents = DEMO_CAST.map((member) => member.accent);
  const LIGHT = { text: token('src/styles/light-theme.css', '--text-primary'), surface: '#ffffff' };
  const DARK = { text: token('src/styles/tokens-base.css', '--text-primary'), surface: '#131925' };

  it.each(['.demox-primary', '.demox-skip'])(
    '%s darkens its accent fill enough for the white label to clear 4.5:1',
    (selector) => {
      const declaration = rule(css, selector);
      expect(declaration, `${selector} rule not found`).not.toBe('');
      expect(declaration).toMatch(/color:\s*#fff/);
      const mix = /background:\s*color-mix\(in oklab, var\(--accent\) ([\d.]+)%, (#[0-9a-f]{6})\)/
        .exec(declaration)
        ?.slice(1);
      expect(mix, `${selector} must mix its accent toward ink, not use it raw`).toBeDefined();
      const [pct, ink] = mix as [string, string];
      for (const accent of accents) {
        const filled = mixOklab(accent, Number(pct), ink);
        // A fixed ink (not a surface token) on purpose: the label is white in BOTH themes, so the
        // fill must not follow the theme.
        expect(contrast(filled, '#ffffff'), `white on ${accent} fill`).toBeGreaterThanOrEqual(4.5);
      }
    },
  );

  it.each(['.demox-badge', '.demox-card-kicker'])(
    '%s mixes its accent toward the ink of whichever theme is showing',
    (selector) => {
      const declaration = rule(css, selector);
      expect(declaration, `${selector} rule not found`).not.toBe('');
      const pct =
        /color:\s*color-mix\(in oklab, var\(--accent\) ([\d.]+)%, var\(--text-primary\)\)/.exec(
          declaration,
        )?.[1];
      expect(pct, `${selector} must mix its accent toward --text-primary`).toBeDefined();
      for (const accent of accents) {
        // Measured against the bare elevated surface: .demox-badge's own 14% accent wash shifts it
        // by a hair, and both rules share this one formula.
        for (const theme of [LIGHT, DARK]) {
          const ink = mixOklab(accent, Number(pct), theme.text);
          expect(
            contrast(ink, theme.surface),
            `${accent} on ${theme.surface}`,
          ).toBeGreaterThanOrEqual(4.5);
        }
      }
    },
  );

  it('lets the centered cards scroll instead of clipping on a short viewport', () => {
    // The start/end cards are fixed and translate-centered: without a bound, a landscape phone
    // pushes the end card's cast chips past both edges with no way to reach them.
    const declaration = rule(css, '.demox-card');
    expect(declaration).toMatch(/max-height:\s*calc\(100dvh - 32px\)/);
    expect(declaration).toMatch(/overflow-y:\s*auto/);
  });
});

/* ── The overlays themselves ────────────────────────────────────────────────────────────────── */

const demoDriver = (over: Partial<DemoDriver> = {}): DemoDriver => ({
  active: true,
  started: false,
  loadState: 'ready',
  model: null,
  reload: vi.fn(),
  index: 0,
  total: 4,
  step: null,
  note: null,
  playing: false,
  muted: false,
  done: false,
  start: vi.fn(),
  next: vi.fn(),
  prev: vi.fn(),
  jumpTo: vi.fn(),
  toggle: vi.fn(),
  toggleMute: vi.fn(),
  replay: vi.fn(),
  skip: vi.fn(),
  ...over,
});

const tourDriver = (over: Partial<TourDriver> = {}): TourDriver => ({
  active: true,
  started: false,
  index: 0,
  total: 10,
  chapter: null,
  coach: '',
  playing: false,
  muted: false,
  done: false,
  corpusError: false,
  retryCorpus: vi.fn(),
  solo: false,
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

describe('guided dialogs — aria-modal has to be backed by a real focus trap', () => {
  it('plainly labels the demo as a fictional, curated prerecorded example', () => {
    render(<DemoOverlay driver={demoDriver()} member={DEMO_CAST[0]} onExit={vi.fn()} />);
    expect(screen.getByText('Curated prerecorded example')).toBeVisible();
    expect(screen.getByText(/This fictional scenario replays prerecorded/)).toBeVisible();
  });

  it('keeps the curated label and fictional persona visible during playback', () => {
    render(
      <DemoOverlay driver={demoDriver({ started: true })} member={DEMO_CAST[0]} onExit={vi.fn()} />,
    );
    expect(screen.getByText('Curated replay')).toBeVisible();
    expect(screen.getByText('Renata · Fictional CFO')).toBeVisible();
  });

  it('the demo start card takes focus and cycles Tab within itself', () => {
    render(<DemoOverlay driver={demoDriver()} member={DEMO_CAST[0]} onExit={vi.fn()} />);
    const start = screen.getByRole('button', { name: 'Start demo' });
    const home = screen.getByRole('button', { name: 'Back to home' });
    expect(document.activeElement).toBe(start);
    fireEvent.keyDown(start, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(home);
  });

  it('the demo end card is a real dialog behind the scrim, not loose chrome', () => {
    const { container } = render(
      <DemoOverlay
        driver={demoDriver({ started: true, done: true })}
        member={DEMO_CAST[0]}
        onExit={vi.fn()}
      />,
    );
    const dialog = screen.getByRole('dialog', { name: 'End of curated replay' });
    expect(dialog).toHaveClass('demox-end');
    expect(screen.getByText(/not a live result or customer testimonial/i)).toBeVisible();
    // The scrim is what makes the ended session behind it unclickable.
    expect(container.querySelector('.demox-intro')).not.toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Try it yourself' }));
  });

  it('the walkthrough welcome card takes focus', () => {
    render(<TourOverlay driver={tourDriver()} />);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Start the tour' }));
  });

  it('the walkthrough end card takes focus', () => {
    render(<TourEndCard onStart={vi.fn()} onReplay={vi.fn()} onPlayExtra={vi.fn()} />);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Start Mavéa' }));
  });
});

describe('"Back to home" means the landing, from every card that offers it', () => {
  it('the demo start card leaves for the landing rather than the Live surface', () => {
    const onExit = vi.fn();
    render(<DemoOverlay driver={demoDriver()} member={DEMO_CAST[0]} onExit={onExit} />);
    fireEvent.click(screen.getByRole('button', { name: 'Back to home' }));
    expect(window.location.hash).toBe('#/');
    // onExit is the "try it yourself" hand-off (a reload into #/live) — the wrong destination here.
    expect(onExit).not.toHaveBeenCalled();
  });
});

describe('walkthrough corpus — an offline fetch must not dead-end the tour', () => {
  // The driver only needs its ops to exist here: the failing path never reaches a chapter, and a
  // Proxy spares the test from restating 40+ live closures.
  const noopOps = new Proxy({}, { get: () => () => undefined }) as unknown as TourOps;

  it('retries once, then reports the failure — and a retry can still recover', async () => {
    loadTourCorpus.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useTourDriver({ active: true, ops: noopOps }));

    await waitFor(() => expect(result.current.corpusError).toBe(true));
    expect(loadTourCorpus).toHaveBeenCalledTimes(2);

    loadTourCorpus.mockResolvedValue({ conversations: [] });
    act(() => result.current.retryCorpus());
    await waitFor(() => expect(result.current.corpusError).toBe(false));
    expect(loadTourCorpus).toHaveBeenCalledTimes(3);
  });

  it('shows a retry card instead of a stage that can never play', () => {
    const retryCorpus = vi.fn();
    render(<TourOverlay driver={tourDriver({ corpusError: true, retryCorpus })} />);

    expect(screen.queryByRole('button', { name: 'Start the tour' })).toBeNull();
    expect(screen.getByRole('alert')).toHaveTextContent('This walkthrough couldn’t load');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(retryCorpus).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Back to home' }));
    expect(window.location.hash).toBe('#/');
  });
});
