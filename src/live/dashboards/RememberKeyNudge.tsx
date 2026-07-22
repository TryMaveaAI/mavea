// RememberKeyNudge — the one-time, dismissible "keep your key on this device?" ask. Dashboards
// only ever populate with a connected model, and the default (rememberKey off) means that key
// lives in memory for this tab only — surfaced once, right where the gap actually bites (a
// freshly created board's own detail page), not buried in a settings screen nobody visits until
// after a reload has already left every tracker stuck on "—".
import { type ReactElement } from 'react';
import { useLiveConfig, hasModelConfigured } from '../useLiveConfig';
import { useDashSettings, setDashSettings } from './budget';
import { hasLiveContent } from './format';
import type { Dashboard } from './types';
import './dashboards.css';

export function RememberKeyNudge({ dashboard }: { dashboard: Dashboard }): ReactElement | null {
  const [cfg, setCfg] = useLiveConfig();
  const settings = useDashSettings();

  if (
    settings.keyNudgeShown ||
    !hasModelConfigured(cfg) ||
    cfg.rememberKey ||
    !hasLiveContent(dashboard)
  ) {
    return null;
  }

  const dismiss = (): void => setDashSettings({ keyNudgeShown: true });

  return (
    <div className="card dash-key-nudge">
      <p className="dash-key-nudge-text">
        Mavéa checks this with your key, which currently lives only in this tab. Keep it on this
        device (encrypted) so checks still work after a reload?
      </p>
      <div className="dash-key-nudge-actions">
        <button
          type="button"
          className="dash-key-nudge-keep"
          onClick={() => {
            setCfg({ rememberKey: true });
            dismiss();
          }}
        >
          Keep key on this device
        </button>
        <button type="button" className="dash-key-nudge-dismiss" onClick={dismiss}>
          Not now
        </button>
      </div>
    </div>
  );
}
