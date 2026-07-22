// notify.ts delivers exactly one alert channel now — Push — and it is doubly gated: the browser
// must have granted permission AND the per-dashboard Push toggle must be on. The old bug fired push
// on permission alone, so toggling Push off did nothing; these tests pin that both gates hold, and
// that an empty trigger list never touches the Notification API.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { notifyTriggered } from '../src/live/dashboards/notify';
import type { Dashboard, Tripwire } from '../src/live/dashboards/types';

const dashboard = (over: Partial<Dashboard['alerts']> = {}): Dashboard =>
  ({
    id: 'd1',
    title: 'Test dashboard',
    alerts: { inApp: true, push: true, ...over },
  }) as Dashboard;

const triggered: Tripwire[] = [
  {
    id: 't1',
    label: 'Test alert',
    metricId: '',
    comparator: 'gt',
    threshold: 0,
    state: 'TRIGGERED',
    sourceQuote: { text: '', saidAt: 0 },
  },
];

/** A stand-in Notification constructor whose static `.permission` we control, matching how
 *  notify.ts reads `Notification.permission`. Under jsdom `window === globalThis`, so stubbing the
 *  global also satisfies notify.ts's `'Notification' in window` support check. */
function stubNotification(permission: NotificationPermission): ReturnType<typeof vi.fn> {
  const ctor = vi.fn();
  (ctor as unknown as { permission: NotificationPermission }).permission = permission;
  (
    ctor as unknown as { requestPermission: () => Promise<NotificationPermission> }
  ).requestPermission = () => Promise.resolve(permission);
  vi.stubGlobal('Notification', ctor);
  return ctor;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('notifyTriggered — push channel', () => {
  it('fires a Notification when Push is on and permission is granted', () => {
    const ctor = stubNotification('granted');
    notifyTriggered(dashboard({ push: true }), triggered);
    expect(ctor).toHaveBeenCalledTimes(1);
    expect(ctor).toHaveBeenCalledWith(
      expect.stringContaining('Test dashboard'),
      expect.objectContaining({ tag: 'mavea-dash-d1-t1' }),
    );
  });

  it('does NOT fire when Push is toggled off, even with permission granted (the bug fix)', () => {
    const ctor = stubNotification('granted');
    notifyTriggered(dashboard({ push: false }), triggered);
    expect(ctor).not.toHaveBeenCalled();
  });

  it('does NOT fire when permission is denied, even with Push on', () => {
    const ctor = stubNotification('denied');
    notifyTriggered(dashboard({ push: true }), triggered);
    expect(ctor).not.toHaveBeenCalled();
  });

  it('no-ops on an empty trigger list', () => {
    const ctor = stubNotification('granted');
    notifyTriggered(dashboard({ push: true }), []);
    expect(ctor).not.toHaveBeenCalled();
  });

  it('fires once per freshly-broken line, each with its own collapse tag', () => {
    const ctor = stubNotification('granted');
    const two: Tripwire[] = [
      { ...triggered[0], id: 'a', label: 'A' },
      { ...triggered[0], id: 'b', label: 'B' },
    ];
    notifyTriggered(dashboard({ push: true }), two);
    expect(ctor).toHaveBeenCalledTimes(2);
    expect(ctor).toHaveBeenNthCalledWith(
      1,
      expect.any(String),
      expect.objectContaining({ tag: 'mavea-dash-d1-a' }),
    );
    expect(ctor).toHaveBeenNthCalledWith(
      2,
      expect.any(String),
      expect.objectContaining({ tag: 'mavea-dash-d1-b' }),
    );
  });
});
