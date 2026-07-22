// DashPresent — the ambient "glance from across a room" view: the full tracking grid at a larger
// scale, no chrome, no interaction beyond exit. Reads ONLY already-fetched store state (the same
// useDashboardLoop mounted by DashboardsApp keeps refreshing dashboards in the background exactly
// as it does everywhere else) — this view spends nothing on its own. Scheduling, per-tile
// full-screen takeover, and OLED-drift protection are deliberately out of scope for this v1.
import { useEffect, useState, type ReactElement } from 'react';
import { useDashboards } from './useDashboards';
import { useLedger } from './useLedger';
import { useDashSettings, budgetState, type BudgetState } from './budget';
import { TrackerTile } from './tiles/TrackerTile';
import { mountTemplateSkin } from '../templates';
import './dash-present.css';
import '../../styles/templates.css';

const CLOCK_INTERVAL_MS = 30_000;
const SPOTLIGHT_INTERVAL_MS = 12_000;
const CURSOR_IDLE_MS = 3_000;

function formatResumeTime(at: number): string {
  return new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function PresentBudget({ state }: { state: BudgetState }): ReactElement {
  if (state.paused) {
    return (
      <span className="dash-present-budget dash-present-budget--paused">
        Paused · resumes {formatResumeTime(state.resumesAt)}
      </span>
    );
  }
  return (
    <span className={'dash-present-budget' + (state.amber ? ' dash-present-budget--amber' : '')}>
      {state.used}/{state.cap} searches today{state.amber ? ' · low' : ''}
    </span>
  );
}

export interface DashPresentProps {
  onClose: () => void;
}

export function DashPresent({ onClose }: DashPresentProps): ReactElement {
  const dashboards = useDashboards();
  const entries = useLedger();
  const settings = useDashSettings();

  // Present replaces the whole dashboards view — including the topbar's TemplatePicker, whose own
  // unmount would strip the chosen skin. Re-assert it here so the ambient view keeps the template
  // (and its fonts) the user picked, instead of dropping to the stock look.
  useEffect(() => mountTemplateSkin(document), []);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), CLOCK_INTERVAL_MS);
    return () => window.clearInterval(t);
  }, []);

  const [spotlight, setSpotlight] = useState<number | null>(null);
  useEffect(() => {
    if (dashboards.length < 2) {
      setSpotlight(null);
      return;
    }
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    // Reduced motion drops the spotlight effect entirely rather than keeping the cycle and just
    // skipping its transition — an ambient display nobody is actively watching has nothing to
    // gain from a silent index change, so the simplest, safest thing is to leave every tile equal.
    let timer: number | undefined;
    const apply = (reduced: boolean): void => {
      if (timer !== undefined) window.clearInterval(timer);
      if (reduced) {
        setSpotlight(null);
        return;
      }
      setSpotlight(0);
      timer = window.setInterval(() => {
        setSpotlight((i) => ((i ?? -1) + 1) % dashboards.length);
      }, SPOTLIGHT_INTERVAL_MS);
    };
    apply(query.matches);
    const onChange = (e: MediaQueryListEvent): void => apply(e.matches);
    query.addEventListener('change', onChange);
    return () => {
      query.removeEventListener('change', onChange);
      if (timer !== undefined) window.clearInterval(timer);
    };
  }, [dashboards.length]);

  const [cursorHidden, setCursorHidden] = useState(false);
  useEffect(() => {
    let idle: number | undefined;
    const wake = (): void => {
      setCursorHidden(false);
      if (idle !== undefined) window.clearTimeout(idle);
      idle = window.setTimeout(() => setCursorHidden(true), CURSOR_IDLE_MS);
    };
    wake();
    window.addEventListener('mousemove', wake);
    return () => {
      window.removeEventListener('mousemove', wake);
      if (idle !== undefined) window.clearTimeout(idle);
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const budget = budgetState(entries, settings.dailySearchBudget, now);
  const time = new Date(now).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const date = new Date(now).toLocaleDateString([], {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div
      className={'dash-present' + (cursorHidden ? ' dash-present--cursor-hidden' : '')}
      role="presentation"
      onClick={onClose}
    >
      <header className="dash-present-head">
        <div className="dash-present-clock">
          <span className="dash-present-time">{time}</span>
          <span className="dash-present-date">{date}</span>
        </div>
        <PresentBudget state={budget} />
      </header>
      <div className="dash-present-body">
        {dashboards.length === 0 ? (
          <p className="dash-present-empty">Nothing on watch yet.</p>
        ) : (
          <div className="dash-present-grid">
            {dashboards.map((d, i) => (
              <div
                key={d.id}
                className="dash-present-tile-wrap"
                data-spotlight={spotlight === null ? undefined : i === spotlight ? 'on' : 'off'}
              >
                <TrackerTile dashboard={d} now={now} paused={budget.paused} />
              </div>
            ))}
          </div>
        )}
      </div>
      <p className="dash-present-hint">Esc or click anywhere to exit</p>
    </div>
  );
}
