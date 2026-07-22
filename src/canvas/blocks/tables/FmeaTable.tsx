import type { CSSProperties, ReactNode } from 'react';
import { Icon } from '../../../icons/icons';
import { BlockEmpty } from '../../lib';
import type { FmeaTableProps, FmeaItem } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = FmeaTableProps & { delay?: number };

/** Loose 1..10 input → a real integer in range. Missing/garbage reads as the lowest score (1)
 *  rather than dramatizing an unscored factor into the worst-case RPN. */
function clampScore(v: unknown): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(10, Math.round(n)));
}

function scoreColor(n: number): string {
  if (n >= 7) return 'var(--danger)';
  if (n >= 4) return 'var(--warning)';
  return 'var(--insight)';
}

/** RPN's own conventional bands (severity × occurrence × detection, so its ceiling is 1000). */
function rpnColor(rpn: number): string {
  if (rpn >= 200) return 'var(--danger)';
  if (rpn >= 80) return 'var(--warning)';
  return 'var(--insight)';
}

interface Scored {
  item: FmeaItem;
  severity: number;
  occurrence: number;
  detection: number;
  rpn: number;
}

function MetaLine({ children }: { children: ReactNode }) {
  return <div className="fma-meta">{children}</div>;
}

// A Failure Mode and Effects Analysis: one row per failure mode, RPN (severity × occurrence ×
// detection) always computed here — never trusted from the caller — rows auto-sorted descending
// by it, with a thin danger rule marking the top 1–3 as "fix these first". Manufacturing,
// reliability/quality engineering — "what could fail, and which failure matters most".
export function FmeaTable({
  title,
  icon = 'alert',
  iconColor = 'var(--warning)',
  items,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.alert;
  const valid = (Array.isArray(items) ? items : []).filter(
    (it) => it && typeof it.failureMode === 'string' && it.failureMode.trim().length > 0,
  );

  const scored: Scored[] = valid
    .map((item) => {
      const severity = clampScore(item.severity);
      const occurrence = clampScore(item.occurrence);
      const detection = clampScore(item.detection);
      return { item, severity, occurrence, detection, rpn: severity * occurrence * detection };
    })
    .sort((a, b) => b.rpn - a.rpn);

  const priorityCount = Math.min(3, scored.length);

  return (
    <div
      className="card reveal tbl"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      {scored.length === 0 ? (
        <BlockEmpty message="No failure modes to analyze" />
      ) : (
        <div className="fma-list">
          {scored.flatMap((s, i) => {
            const pct = Math.max(0, Math.min(100, (s.rpn / 1000) * 100));
            const row = (
              <div
                key={i}
                className="fma-row m-stagger-item m-fade-rise"
                style={{ ['--i' as string]: i } as CSSProperties}
              >
                <div className="fma-top">
                  <div className="fma-name">
                    <span className="fma-mode">{s.item.failureMode}</span>
                    {s.item.owner && <span className="fma-owner">{s.item.owner}</span>}
                  </div>
                  <div className="fma-sod">
                    <span
                      className="fma-badge"
                      style={{ ['--fma-c' as string]: scoreColor(s.severity) } as CSSProperties}
                      title="Severity"
                    >
                      S {s.severity}
                    </span>
                    <span
                      className="fma-badge"
                      style={{ ['--fma-c' as string]: scoreColor(s.occurrence) } as CSSProperties}
                      title="Occurrence"
                    >
                      O {s.occurrence}
                    </span>
                    <span
                      className="fma-badge"
                      style={{ ['--fma-c' as string]: scoreColor(s.detection) } as CSSProperties}
                      title="Detection"
                    >
                      D {s.detection}
                    </span>
                  </div>
                  <div className="fma-rpn-wrap">
                    <span
                      className="fma-rpn tab-num"
                      style={{ ['--fma-rc' as string]: rpnColor(s.rpn) } as CSSProperties}
                    >
                      {s.rpn}
                    </span>
                    <span className="fma-rpn-label">RPN</span>
                  </div>
                </div>

                {(s.item.cause || s.item.effect) && (
                  <MetaLine>
                    {s.item.cause && (
                      <span>
                        <b>Cause</b> {s.item.cause}
                      </span>
                    )}
                    {s.item.effect && (
                      <span>
                        <b>Effect</b> {s.item.effect}
                      </span>
                    )}
                  </MetaLine>
                )}

                <div className="fma-track">
                  <div
                    className="fma-fill"
                    style={{ width: `${pct}%`, background: rpnColor(s.rpn) }}
                  />
                </div>

                {(s.item.currentControl || s.item.action) && (
                  <MetaLine>
                    {s.item.currentControl && (
                      <span>
                        <b>Control</b> {s.item.currentControl}
                      </span>
                    )}
                    {s.item.action && (
                      <span className="fma-action">
                        <b>Action</b> {s.item.action}
                      </span>
                    )}
                  </MetaLine>
                )}
              </div>
            );

            // Marks off the priority zone once, right after the last of the top 1–3 rows — only
            // when something actually follows it (a trailing rule with nothing under it is noise).
            if (i === priorityCount - 1 && priorityCount < scored.length) {
              return [row, <div key={`rule-${i}`} className="fma-priority-rule" />];
            }
            return [row];
          })}
        </div>
      )}

      {footer && (
        <div
          className="insight-summary"
          style={{ marginTop: 12 }}
          dangerouslySetInnerHTML={richInnerHtml(footer)}
        />
      )}
    </div>
  );
}
