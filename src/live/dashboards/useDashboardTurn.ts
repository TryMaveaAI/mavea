// useDashboardTurn — "talk to this dashboard" without leaving it. A thin wrapper over the real Live
// turn pipeline: it grounds the model in the dashboard's own widgets (the same `selectedBlocks` rail
// the per-element ask uses), so an answer is about THIS dashboard's real numbers and reasoning. No new
// engine — just generateLive with the dashboard as context. Honest when no model is connected: it
// points the user to Live to set one up rather than failing silently.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { LiveResult } from '../generateLive';
import { getLiveConfigV2, hasModelConfigured, toModelConfig } from '../useLiveConfig';
import type { ChatMessage } from '../providers/types';
import { projectWidgetBlock } from './project';
import type { Dashboard } from './types';

// Lazy engine, mirroring useLiveTurn's turnEngine: a static import of generateLive here would pull
// the ~580-entry catalog into the eager Dashboards-mount chunk. Loaded on the first "talk to this
// dashboard" turn instead.
const turnEngine = () => import('../generateLive');

export interface DashboardTurnState {
  /** A model is connected (a key, or a local provider) — talking will actually work. */
  ready: boolean;
  loading: boolean;
  /** The latest answer (null before the first ask). `result.error` marks a failed turn honestly. */
  result: LiveResult | null;
  /** The text of the last ask, kept for the inline transcript. */
  lastAsk: string | null;
  run: (text: string) => void;
  reset: () => void;
}

/** Is a model connected enough to answer? Provider metadata owns whether a key is required. */
function configReady(): boolean {
  return hasModelConfigured(getLiveConfigV2());
}

export function useDashboardTurn(dashboard: Dashboard): DashboardTurnState {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<LiveResult | null>(null);
  const [lastAsk, setLastAsk] = useState<string | null>(null);
  const historyRef = useRef<ChatMessage[]>([]);
  const busyRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  // Talking to one dashboard must never leak onto another: the detail view isn't remounted per
  // dashboard (same component, just a new `dashboard` prop), so a turn still in flight when the user
  // navigates to a different dashboard would otherwise land its answer — and the "add to dashboard"
  // pin — on the wrong one. Abort any in-flight turn and clear the visible transcript the moment the
  // dashboard identity changes (belt-and-suspenders alongside the caller keying its view by dashboard
  // id, so this holds even if a future caller doesn't remount).
  useEffect(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    busyRef.current = false;
    historyRef.current = [];
    setLoading(false);
    setResult(null);
    setLastAsk(null);
  }, [dashboard.id]);

  // Abort a turn still in flight on unmount (e.g. closing edit mode hides this panel).
  useEffect(() => () => abortRef.current?.abort(), []);

  const run = useCallback(
    (text: string) => {
      const ask = text.trim();
      if (!ask || busyRef.current || !configReady()) return;
      busyRef.current = true;
      setLoading(true);
      setLastAsk(ask);
      const cfg = toModelConfig(getLiveConfigV2());
      // Ground the model in this dashboard's real widgets (current projected props).
      const selectedBlocks = dashboard.widgets.map((w) => projectWidgetBlock(dashboard, w));
      const ac = new AbortController();
      abortRef.current = ac;
      turnEngine()
        .then(({ generateLive }) =>
          generateLive(ask, historyRef.current, cfg, undefined, {
            selectedBlocks,
            signal: ac.signal,
            // Search on, always — the same standing rule the refresh path applies, and for the same
            // reason: everything on a dashboard is live, sourced data. Without this the turn ran at
            // the default 'off', so generateLive fed the model its NO LIVE DATA directive and a
            // question about the very numbers on screen came back as "I don't have live access —
            // paste the values yourself", complete with input cards to type them into. That is the
            // opposite of what this surface promises, and it billed a call to say it.
            caps: { searchMode: 'realtime' },
          }),
        )
        .then((r) => {
          if (ac.signal.aborted) return;
          if (!r.error && !r.collapsed) {
            historyRef.current = [
              ...historyRef.current,
              { role: 'user' as const, content: ask },
              { role: 'assistant' as const, content: r.narration },
            ].slice(-8);
          }
          setResult(r);
        })
        .catch(() => {
          // The engine is a lazy chunk and generateLive can reject on abort — without this the whole
          // chain becomes an unhandled rejection and the dashboard reports nothing at all.
          if (ac.signal.aborted) return;
          setResult(null);
        })
        .finally(() => {
          if (ac.signal.aborted) return;
          busyRef.current = false;
          setLoading(false);
        });
    },
    [dashboard],
  );

  const reset = useCallback(() => {
    abortRef.current?.abort();
    busyRef.current = false;
    setLoading(false);
    setResult(null);
    setLastAsk(null);
  }, []);

  return { ready: configReady(), loading, result, lastAsk, run, reset };
}
