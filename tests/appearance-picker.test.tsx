import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppearanceSettings, TemplatePicker } from '../src/live/TemplatePicker';

describe('premium Appearance selector', () => {
  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.template;
    delete document.documentElement.dataset.theme;
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: { load: vi.fn().mockResolvedValue([]) },
    });
  });

  afterEach(() => {
    cleanup();
    delete document.documentElement.dataset.template;
    delete document.documentElement.dataset.theme;
  });

  it('opens as an identity gallery and commits template and brightness independently', async () => {
    render(<TemplatePicker />);
    const trigger = screen.getByRole('button', { name: /choose appearance/i });
    fireEvent.click(trigger);

    const dialog = screen.getByRole('dialog', { name: 'Choose your workspace' });
    expect(within(dialog).getAllByRole('radio')).toHaveLength(6);
    expect(within(dialog).getByText('Generalist')).toBeTruthy();
    expect(within(dialog).getByText('Storyteller')).toBeTruthy();

    fireEvent.click(within(dialog).getByRole('radio', { name: /Ink, Editor/i }));
    expect(localStorage.getItem('mavea-template')).toBe('ink');
    expect(document.documentElement.dataset.template).toBe('ink');
    expect(within(dialog).getByRole('radio', { name: /Ink, Editor/i })).toHaveAttribute(
      'aria-checked',
      'true',
    );

    fireEvent.click(within(dialog).getByRole('button', { name: 'Light' }));
    expect(localStorage.getItem('mavea-theme')).toBe('light');
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(trigger).toHaveAttribute(
      'aria-label',
      expect.stringMatching(/Ink, Editor, light mode/i),
    );

    await waitFor(() => expect(document.fonts.load).toHaveBeenCalled());
  });

  it('supports roving arrow, Home/End, Escape, and focus restoration', async () => {
    render(<TemplatePicker />);
    const trigger = screen.getByRole('button', { name: /choose appearance/i });
    fireEvent.click(trigger);
    const dialog = screen.getByRole('dialog');
    const options = within(dialog).getAllByRole('radio');
    // Opens on the CURRENT selection, wherever that sits — asserting index 0 quietly assumed the
    // app's default skin was the first chip, and moved the moment that default changed.
    const at = options.findIndex((o) => o.getAttribute('aria-checked') === 'true');
    expect(at).toBeGreaterThanOrEqual(0);
    const last = options.length - 1;
    expect(at).toBeLessThan(last);

    await waitFor(() => expect(options[at]).toHaveFocus());
    fireEvent.keyDown(options[at], { key: 'ArrowRight' });
    expect(options[at + 1]).toHaveFocus();
    fireEvent.keyDown(options[at + 1], { key: 'End' });
    expect(options[last]).toHaveFocus();
    fireEvent.keyDown(options[last], { key: 'Home' });
    expect(options[0]).toHaveFocus();

    act(() => fireEvent.keyDown(window, { key: 'Escape' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('opens the mobile sheet at its visible close control without scrolling to a lower selection', async () => {
    localStorage.setItem('mavea-template', 'marquee');
    const previousMatchMedia = window.matchMedia;
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockReturnValue({ matches: true }),
    });

    try {
      render(<TemplatePicker />);
      fireEvent.click(screen.getByRole('button', { name: /choose appearance/i }));

      await waitFor(() =>
        expect(
          within(screen.getByRole('dialog')).getByRole('button', { name: 'Close appearance' }),
        ).toHaveFocus(),
      );
    } finally {
      Object.defineProperty(window, 'matchMedia', {
        configurable: true,
        value: previousMatchMedia,
      });
    }
  });

  it('closes on outside input and keeps the selected identity persisted', () => {
    render(<TemplatePicker />);
    const trigger = screen.getByRole('button', { name: /choose appearance/i });
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('radio', { name: /Console, Operator/i }));
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(localStorage.getItem('mavea-template')).toBe('console');
  });

  it('sets the reading text size independently of the workspace/brightness choice', () => {
    render(<TemplatePicker />);
    fireEvent.click(screen.getByRole('button', { name: /choose appearance/i }));
    const dialog = screen.getByRole('dialog');

    const larger = within(dialog).getByRole('button', { name: 'Larger' });
    fireEvent.click(larger);
    expect(larger).toHaveAttribute('aria-pressed', 'true');
    expect(JSON.parse(localStorage.getItem('mavea-live-v2') ?? '{}').fontScale).toBe('larger');
    // Picking a size doesn't disturb the workspace/theme choice made alongside it.
    expect(localStorage.getItem('mavea-template')).toBeNull();
  });

  it('reuses the same state and controls inside Settings', () => {
    render(
      <>
        <TemplatePicker />
        <AppearanceSettings />
      </>,
    );
    const settings = screen.getByText('Appearance').closest<HTMLElement>('.appearance-panel')!;
    fireEvent.click(within(settings).getByRole('radio', { name: /Paper, Scholar/i }));
    fireEvent.click(within(settings).getByRole('button', { name: 'Light' }));

    expect(localStorage.getItem('mavea-template')).toBe('paper');
    expect(localStorage.getItem('mavea-theme')).toBe('light');
    expect(
      screen.getByRole('button', { name: /current: Paper, Scholar, light mode/i }),
    ).toBeTruthy();
  });

  it('lets the keyboard walk the workspaces inside Settings, not only in the topbar', () => {
    // The roving tabindex leaves five of six with no tab stop, and moveFocus preventDefaults the
    // arrow either way — so without option refs the embedded gallery was unreachable by keyboard.
    render(<AppearanceSettings />);
    const checked = screen.getByRole('radio', { name: /Paper, Scholar/i });
    checked.focus();
    fireEvent.keyDown(checked, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(screen.getByRole('radio', { name: /Daylight, Planner/i }));
  });

  it('stamps the chosen reading size on the root wherever the control is offered', () => {
    // Only LiveApp used to stamp it, so on Dashboards and Courses "Larger" lit up and changed
    // nothing on the page.
    const { unmount } = render(<AppearanceSettings />);
    fireEvent.click(screen.getByRole('button', { name: 'Larger' }));
    expect(document.documentElement.dataset.fontScale).toBe('larger');
    unmount();
    expect(document.documentElement.dataset.fontScale).toBeUndefined();
  });
});
