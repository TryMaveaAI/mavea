// RememberKeyNudge — the one-time "keep your key on this device?" ask, decided in the plan's Q&A
// as the nudge point for dashboards to survive a reload without a silently-forgotten BYOK key.
// Shows once, only when there's a connected model that ISN'T remembered and live content to lose
// on reload; "Keep key" flips rememberKey; either action marks it shown so it never re-asks.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import type { Dashboard, MetricSpec } from '../src/live/dashboards/types';

const cfg: { current: { rememberKey: boolean } } = { current: { rememberKey: false } };
const setCfg = vi.fn();
const modelConfigured = { current: true };
vi.mock('../src/live/useLiveConfig', () => ({
  useLiveConfig: () => [cfg.current, setCfg],
  hasModelConfigured: () => modelConfigured.current,
}));

const settings = { current: { keyNudgeShown: false } };
const setDashSettings = vi.fn();
vi.mock('../src/live/dashboards/budget', () => ({
  useDashSettings: () => settings.current,
  setDashSettings: (patch: Record<string, unknown>) => setDashSettings(patch),
}));

import { RememberKeyNudge } from '../src/live/dashboards/RememberKeyNudge';

const metric = (over: Partial<MetricSpec> = {}): MetricSpec => ({
  id: 'm1',
  label: 'AAPL price',
  query: 'current AAPL price',
  sourceQuote: { text: 'x', saidAt: 0 },
  lastValue: null,
  origin: 'empty',
  ...over,
});

const liveDashboard = (over: Partial<Dashboard> = {}): Dashboard =>
  ({
    id: 'd1',
    title: 'Test',
    metrics: [metric()],
    widgets: [],
    ...over,
  }) as Dashboard;

beforeEach(() => {
  cfg.current = { rememberKey: false };
  modelConfigured.current = true;
  settings.current = { keyNudgeShown: false };
  setCfg.mockClear();
  setDashSettings.mockClear();
});
afterEach(() => cleanup());

describe('RememberKeyNudge', () => {
  it('shows when a model is connected, not remembered, and the dashboard has live content', () => {
    render(<RememberKeyNudge dashboard={liveDashboard()} />);
    expect(screen.getByText(/Keep it on this device/)).toBeTruthy();
  });

  it('never shows once already shown', () => {
    settings.current = { keyNudgeShown: true };
    render(<RememberKeyNudge dashboard={liveDashboard()} />);
    expect(screen.queryByText(/Keep it on this device/)).toBeNull();
  });

  it('never shows with no model connected', () => {
    modelConfigured.current = false;
    render(<RememberKeyNudge dashboard={liveDashboard()} />);
    expect(screen.queryByText(/Keep it on this device/)).toBeNull();
  });

  it('never shows once the key is already remembered', () => {
    cfg.current = { rememberKey: true };
    render(<RememberKeyNudge dashboard={liveDashboard()} />);
    expect(screen.queryByText(/Keep it on this device/)).toBeNull();
  });

  it('never shows for a dashboard with no live content — nothing would be lost on reload', () => {
    render(<RememberKeyNudge dashboard={liveDashboard({ metrics: [], widgets: [] })} />);
    expect(screen.queryByText(/Keep it on this device/)).toBeNull();
  });

  it('"Keep key on this device" flips rememberKey and marks the nudge shown', () => {
    render(<RememberKeyNudge dashboard={liveDashboard()} />);
    fireEvent.click(screen.getByText('Keep key on this device'));
    expect(setCfg).toHaveBeenCalledWith({ rememberKey: true });
    expect(setDashSettings).toHaveBeenCalledWith({ keyNudgeShown: true });
  });

  it('"Not now" only marks the nudge shown — never touches rememberKey', () => {
    render(<RememberKeyNudge dashboard={liveDashboard()} />);
    fireEvent.click(screen.getByText('Not now'));
    expect(setCfg).not.toHaveBeenCalled();
    expect(setDashSettings).toHaveBeenCalledWith({ keyNudgeShown: true });
  });
});
