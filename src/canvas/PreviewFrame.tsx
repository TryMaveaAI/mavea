// A real, clickable app rendered inside the conversation — nav, stages, columns, labels, and
// formatting are all config-driven, so one frame can be a CRM, a content tracker, and so on.
// Holds local state for the active view tab. This relies on TopicCanvas mounting with
// key={topic}: beat / spotlight re-renders preserve `view`, and only a topic change remounts.
import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../icons/icons';
import type { PreviewProps, PreviewStage } from '../data/conversation';

type Props = PreviewProps & { delay?: number };

export function PreviewFrame({
  app,
  seededFrom,
  nav,
  stages,
  rows,
  kpis,
  columns,
  groupColumns = ['Group', 'Items', 'Total'],
  pipelineLabel = 'Pipeline by stage',
  agg = 'money',
  createdNote = 'created this with Mavéa',
  activities,
  footer,
  delay,
}: Props) {
  const [view, setView] = useState(nav[0]?.label || '');
  const active = nav.find((n) => n.label === view) || nav[0];

  const fmt = (n: number) =>
    agg === 'money' ? '$' + Math.round(n / 1000) + 'k' : n.toLocaleString();
  const totalVal = rows.reduce((a, r) => a + (r.amt || 0), 0);

  // Aggregate per group and per stage in a single pass (first row's color seeds the group's color).
  const groupMap = new Map<string, { count: number; value: number; color: string }>();
  const stageCounts = new Map<string, number>();
  for (const r of rows) {
    const g = groupMap.get(r.group) ?? { count: 0, value: 0, color: r.color };
    g.count += 1;
    g.value += r.amt || 0;
    groupMap.set(r.group, g);
    stageCounts.set(r.stage, (stageCounts.get(r.stage) ?? 0) + 1);
  }
  const groups = Array.from(groupMap, ([name, g]) => ({ name, ...g }));
  const maxCount = stages.reduce((max, s) => Math.max(max, stageCounts.get(s.key) ?? 0), 1);

  const acts = activities || [];

  const StageTag = ({ s }: { s: string }) => {
    const st: PreviewStage = stages.find((x) => x.key === s) || stages[0];
    return <span className={'at-stage ' + st.kind}>{s}</span>;
  };

  return (
    <div className="card reveal" style={{ '--delay': (delay || 0) + 'ms' } as CSSProperties}>
      <div className="card-eyebrow">
        <Icon.external className="ic" style={{ color: 'var(--insight)' }} /> Live preview · your app
        <span className="preview-live">
          <span className="web-live-dot"></span>working
        </span>
      </div>
      <div className="appframe">
        <div className="appframe-bar">
          <span className="aflight"></span>
          <span className="aflight"></span>
          <span className="aflight"></span>
          <span className="afurl mono">{app.toLowerCase().replace(/\s+/g, '-')}.mavea.app</span>
        </div>
        <div className="appframe-body">
          <div className="appnav">
            <div className="appnav-brand">{app}</div>
            {nav.map((n, i) => (
              <button
                className={'appnav-item' + (view === n.label ? ' on' : '')}
                key={i}
                type="button"
                onClick={() => setView(n.label)}
              >
                {n.label}
              </button>
            ))}
          </div>
          <div className="appmain">
            <div className="appmain-top">
              <span className="appmain-title">{active?.label}</span>
              {active?.view === 'dashboard' && seededFrom && (
                <span className="appmain-sub">{seededFrom}</span>
              )}
            </div>

            {active?.view === 'dashboard' && (
              <>
                <div className="appkpis">
                  {kpis.map((k, i) => (
                    <div className="appkpi" key={i}>
                      <span className="appkpi-v tab-num">{k.v}</span>
                      <span className="appkpi-k">{k.k}</span>
                    </div>
                  ))}
                </div>
                <div className="appdash">
                  <div className="apppanel">
                    <div className="apppanel-h">{pipelineLabel}</div>
                    {stages.map((s, i) => {
                      const inStage = rows.filter((r) => r.stage === s.key);
                      const val = inStage.reduce((a, r) => a + (r.amt || 0), 0);
                      const pct = totalVal
                        ? Math.round((val / totalVal) * 100)
                        : Math.round((inStage.length / maxCount) * 100);
                      return (
                        <div className="apppipe" key={i}>
                          <span className="apppipe-l">
                            {s.key} <span className="faint">· {inStage.length}</span>
                          </span>
                          <span className="apppipe-bar">
                            <i style={{ width: Math.max(6, pct) + '%', background: s.color }}></i>
                          </span>
                          <span className="apppipe-v tab-num">
                            {totalVal ? fmt(val) : inStage.length}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="apppanel">
                    <div className="apppanel-h">Recent activity</div>
                    {acts.map((a, i) => (
                      <div className="appact" key={i}>
                        <span className="at-ava" style={{ background: a.color }}>
                          {a.who[0]}
                        </span>
                        <span className="appact-t">
                          <b>{a.who}</b> {a.what}
                        </span>
                        <span className="appact-when">{a.when}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {active?.view === 'table' && (
              <div className="apptable">
                <div className="apptable-head">
                  <span>{columns[0]}</span>
                  <span>{columns[1]}</span>
                  <span>{columns[2]}</span>
                  <span className="ta-r">{columns[3]}</span>
                </div>
                {rows.map((r, i) => (
                  <div className="apptable-row" key={i}>
                    <span className="at-name">
                      <span className="at-ava" style={{ background: r.color }}>
                        {r.name[0]}
                      </span>
                      {r.name}
                    </span>
                    <span>{r.group}</span>
                    <span>
                      <StageTag s={r.stage} />
                    </span>
                    <span className="ta-r tab-num">{r.value}</span>
                  </div>
                ))}
              </div>
            )}

            {active?.view === 'board' && (
              <div className="appboard">
                {stages.map((s, i) => (
                  <div className="appcol" key={i}>
                    <div className="appcol-h">
                      <span className="appcol-dot" style={{ background: s.color }}></span>
                      {s.key}
                      <span className="faint">{rows.filter((r) => r.stage === s.key).length}</span>
                    </div>
                    {rows
                      .filter((r) => r.stage === s.key)
                      .map((r, j) => (
                        <div className="appdeal" key={j}>
                          <div className="appdeal-n">{r.name}</div>
                          <div className="appdeal-m">
                            {r.group} · <span className="tab-num">{r.value}</span>
                          </div>
                        </div>
                      ))}
                  </div>
                ))}
              </div>
            )}

            {active?.view === 'group' && (
              <div className="apptable">
                <div className="apptable-head threecol">
                  <span>{groupColumns[0]}</span>
                  <span>{groupColumns[1]}</span>
                  <span className="ta-r">{groupColumns[2]}</span>
                </div>
                {groups.map((g, i) => (
                  <div className="apptable-row threecol" key={i}>
                    <span className="at-name">
                      <span className="at-ava" style={{ background: g.color }}>
                        {g.name[0]}
                      </span>
                      {g.name}
                    </span>
                    <span>{g.count}</span>
                    <span className="ta-r tab-num">{fmt(g.value)}</span>
                  </div>
                ))}
              </div>
            )}

            {active?.view === 'activity' && (
              <div className="appactivity">
                {acts
                  .concat([
                    {
                      who: 'You',
                      what: createdNote,
                      when: 'just now',
                      color: 'var(--presence-deep)',
                    },
                  ])
                  .map((a, i) => (
                    <div className="appact row" key={i}>
                      <span className="at-ava" style={{ background: a.color }}>
                        {a.who[0]}
                      </span>
                      <span className="appact-t">
                        <b>{a.who}</b> {a.what}
                      </span>
                      <span className="appact-when">{a.when}</span>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      </div>
      {footer && (
        <div className="insight-summary" style={{ marginTop: 12 }}>
          {footer}
        </div>
      )}
    </div>
  );
}
