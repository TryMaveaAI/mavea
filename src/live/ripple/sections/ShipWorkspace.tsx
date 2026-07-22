// ShipWorkspace.tsx — the PR-review workspace: a three-pane reading surface that turns a wall of
// diff into one change at a time. LEFT is the change list grouped by subsystem; CENTER is the
// selected change — Mavéa's read, the annotated diff, and why the line is here; RIGHT is the blast:
// how many files it touches, what calls into it, and the risks worth pausing on. All status/risk
// color routes through the shared Ripple helpers so the five-status vocabulary stays consistent.
import { useEffect, useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import type { DiffLine } from '../../../data/conversation';
import { riskVar } from '../colors';
import type { CallerStatus, ChangeLink, ShipChange } from '../model';
import type { SectionProps } from './types';
import './shipWorkspace.css';

/** A caller's status, in the shared token vocabulary — updated reads as a clean change, breaks as
 *  danger, untested as a muted unknown, affected as a touched-but-fine downstream. */
function callerVar(status: CallerStatus): string {
  switch (status) {
    case 'updated':
      return 'var(--insight)';
    case 'breaks':
      return 'var(--danger)';
    case 'affected':
      return 'var(--presence)';
    case 'untested':
    default:
      return 'var(--text-muted)';
  }
}

/** The gutter sign for a diff line, matching its kind. */
function diffSign(t: DiffLine['t']): string {
  if (t === 'add') return '+';
  if (t === 'del') return '−';
  return '';
}

/** Group the changes by subsystem, preserving first-seen order so the list reads top-to-bottom the
 *  way the model authored it. */
function groupBySubsystem(changes: ShipChange[]): { subsystem: string; items: ShipChange[] }[] {
  const groups: { subsystem: string; items: ShipChange[] }[] = [];
  const byName = new Map<string, ShipChange[]>();
  for (const change of changes) {
    let bucket = byName.get(change.subsystem);
    if (!bucket) {
      bucket = [];
      byName.set(change.subsystem, bucket);
      groups.push({ subsystem: change.subsystem, items: bucket });
    }
    bucket.push(change);
  }
  return groups;
}

export function ShipWorkspace({ model }: SectionProps): ReactElement {
  const { changes } = model;
  const groups = useMemo(() => groupBySubsystem(changes), [changes]);

  // Land on the most urgent change: the first that breaks, else the first overall. The model is
  // hand-authored to always have at least one change, but guard the empty case for real diffs.
  const defaultId = useMemo(
    () => (changes.find((c) => c.risk === 'breaks') ?? changes[0])?.id,
    [changes],
  );
  const [selectedId, setSelectedId] = useState(defaultId);
  // Change ids are always c0, c1, … regardless of content, so a stale selectedId left over from a
  // PREVIOUS diff/repo can silently collide with an unrelated change once a new one is analyzed. Land
  // on the most urgent change again when the actual file set changes; don't reset on every in-place
  // enrichment merge of the SAME diff (same files), which would yank the reader off their selection.
  const fileSetKey = changes.map((c) => c.file).join('\n');
  useEffect(() => {
    setSelectedId(defaultId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileSetKey]);
  const selected = changes.find((c) => c.id === selectedId) ?? changes[0];

  if (!selected) {
    return (
      <div className="ripple-ws-empty">
        No changes in this diff — nothing for the workspace to read.
      </div>
    );
  }

  const { diff } = selected;
  const blastOutside = selected.blastOutside ?? 0;

  return (
    <div className="ripple-ws">
      {/* ── LEFT: the change list, grouped by subsystem ── */}
      <nav className="ripple-ws-col ripple-ws-list" aria-label="Changes in this pull request">
        {groups.map((group) => (
          <div className="ripple-ws-group" key={group.subsystem}>
            <div className="ripple-ws-group-head">
              <span className="ripple-eyebrow">{group.subsystem}</span>
              <span className="ripple-ws-group-count">{group.items.length}</span>
            </div>
            {group.items.map((change) => {
              const active = change.id === selected.id;
              const flagged = change.risk === 'breaks' || change.risk === 'watch';
              return (
                <button
                  type="button"
                  key={change.id}
                  className="ripple-ws-row"
                  data-active={active}
                  aria-current={active ? 'true' : undefined}
                  onClick={() => setSelectedId(change.id)}
                >
                  <span
                    className="ripple-ws-row-dot"
                    style={{ background: riskVar(change.risk) }}
                    aria-hidden="true"
                  />
                  <span className="ripple-ws-row-title">{change.title}</span>
                  <span className="ripple-ws-row-file">{change.file}</span>
                  {flagged && (
                    <span
                      className="ripple-ws-row-badge"
                      style={{
                        color: riskVar(change.risk),
                        background: `color-mix(in oklab, ${riskVar(change.risk)} 15%, transparent)`,
                      }}
                    >
                      {change.risk === 'breaks' ? 'BREAKS' : 'WATCH'}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      {/* ── CENTER: the selected change in detail ── */}
      <div className="ripple-ws-col ripple-ws-detail">
        <h3 className="ripple-ws-detail-title">{selected.title}</h3>

        <div className="ripple-ws-block">
          <span className="ripple-eyebrow">Mavéa&rsquo;s read</span>
          <p>{selected.intent}</p>
        </div>

        <div className="ripple-ws-diff">
          <div className="ripple-ws-diff-head">
            <span className="ripple-ws-diff-file">{diff.file}</span>
            <span className="ripple-ws-diff-stat">
              <span className="ripple-ws-diff-add">+{diff.add}</span>
              <span className="ripple-ws-diff-del">&minus;{diff.del}</span>
            </span>
          </div>
          <div className="ripple-ws-diff-body">
            {diff.lines.map((line, i) => (
              // Diff lines have no stable id; index is stable here — the list never reorders, it
              // only swaps wholesale when a different change is selected.
              <div className="ripple-ws-diff-line" data-t={line.t ?? 'ctx'} key={i}>
                <span className="ripple-ws-diff-sign" aria-hidden="true">
                  {diffSign(line.t)}
                </span>
                {/* Rendered as text content, not HTML: these are verbatim source lines. */}
                <span className="ripple-ws-diff-code">{line.c}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="ripple-ws-block ripple-ws-why">
          <span className="ripple-eyebrow">Why it&rsquo;s here</span>
          <p>{selected.why}</p>
        </div>
      </div>

      {/* ── RIGHT: cause & effect ── */}
      <aside className="ripple-ws-col ripple-ws-aside" aria-label="Cause and effect">
        <div className="ripple-ws-section">
          <span className="ripple-eyebrow">Cause &amp; effect</span>
          <div className="ripple-ws-tiles">
            <div className="ripple-ws-tile">
              <span className="ripple-ws-tile-num">{selected.blastFiles ?? 0}</span>
              <span className="ripple-ws-tile-label">files affected</span>
            </div>
            <div className="ripple-ws-tile" data-alarm={blastOutside > 0}>
              <span className="ripple-ws-tile-num">{blastOutside}</span>
              <span className="ripple-ws-tile-label">outside this PR</span>
            </div>
          </div>
        </div>

        <div className="ripple-ws-section">
          <span className="ripple-eyebrow">What depends on this</span>
          {selected.links.length > 0 ? (
            <div className="ripple-ws-callers">
              {selected.links.map((link) => (
                <Caller key={`${link.name}:${link.ref}`} link={link} />
              ))}
            </div>
          ) : (
            <p className="ripple-ws-empty">
              Nothing else calls into this change — it&rsquo;s a leaf.
            </p>
          )}
        </div>

        {selected.risks && selected.risks.length > 0 && (
          <div className="ripple-ws-section">
            <span className="ripple-eyebrow">Risk notes</span>
            <div className="ripple-ws-risks">
              {selected.risks.map((risk, i) => (
                <div
                  className="ripple-ws-risk"
                  key={i}
                  style={{
                    background: `color-mix(in oklab, ${riskVar(risk.level)} 10%, transparent)`,
                    border: `1px solid color-mix(in oklab, ${riskVar(risk.level)} 28%, transparent)`,
                  }}
                >
                  <span
                    className="ripple-ws-risk-dot"
                    style={{ background: riskVar(risk.level) }}
                    aria-hidden="true"
                  />
                  <span className="ripple-ws-risk-text">{risk.text}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}

/** One caller row in the cause-&-effect list. A cross-repo caller is the dangerous kind — the diff
 *  can't see it — so its badge is annotated "· OUTSIDE PR". */
function Caller({ link }: { link: ChangeLink }): ReactElement {
  const color = callerVar(link.status);
  const outside = link.scope === 'cross-repo';
  return (
    <div className="ripple-ws-caller">
      <span className="ripple-ws-caller-main">
        <span className="ripple-ws-caller-name">{link.name}</span>
        <span className="ripple-ws-caller-ref">{link.ref}</span>
      </span>
      <span
        className="ripple-ws-caller-badge"
        style={{
          color,
          background: `color-mix(in oklab, ${color} 15%, transparent)`,
        }}
      >
        {link.status.toUpperCase()}
        {outside ? ' · OUTSIDE PR' : ''}
      </span>
    </div>
  );
}
