import { type CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { AllocatePeopleProps, AllocateAssignment } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = AllocatePeopleProps & { delay?: number };

// A weight outside 1..5 is treated as 1 (effort defaults to "one share") so a missing or
// nonsensical value never skews the load picture. Real numbers only — nothing is invented.
function effort(weight: number | undefined): number {
  const n = Number(weight);
  return Number.isFinite(n) ? Math.min(5, Math.max(1, n)) : 1;
}

// Divide named tasks fairly among NAMED people: one column per person with their tasks and a
// load bar scaled to the busiest person, so an uneven split is obvious at a glance. Distinct from
// settleup (money owed) and plangrid (a days×slots schedule) — this answers "who does what, fairly".
export function AllocatePeople({
  title,
  icon = 'layers',
  iconColor = 'var(--presence)',
  people,
  assignments,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.layers;
  const safePeople = (people ?? []).filter((p) => typeof p === 'string' && p.trim().length > 0);
  const safeAssignments = (assignments ?? []).filter(
    (a): a is AllocateAssignment => !!a && typeof a.task === 'string' && typeof a.who === 'string',
  );

  // Bucket tasks under their owner, keeping the people order the caller gave. An assignment whose
  // `who` is not one of the named people still gets a column, appended after the known people, so a
  // typo never silently drops a task.
  const order: string[] = [...safePeople];
  const byPerson = new Map<string, AllocateAssignment[]>();
  for (const name of order) byPerson.set(name, []);
  for (const a of safeAssignments) {
    if (!byPerson.has(a.who)) {
      byPerson.set(a.who, []);
      order.push(a.who);
    }
    byPerson.get(a.who)!.push(a);
  }

  const loadOf = (name: string): number =>
    (byPerson.get(name) ?? []).reduce((sum, a) => sum + effort(a.weight), 0);
  const maxLoad = order.reduce((m, name) => Math.max(m, loadOf(name)), 0);

  if (order.length === 0) return null;

  return (
    <div
      className="card reveal alp-card"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="alp-grid">
        {order.map((name) => {
          const tasks = byPerson.get(name) ?? [];
          const load = loadOf(name);
          const pct = maxLoad > 0 ? Math.round((load / maxLoad) * 100) : 0;
          const lead = maxLoad > 0 && load === maxLoad;
          return (
            <div key={name} className={`alp-col${lead ? ' alp-col--lead' : ''}`}>
              <div className="alp-col-head">
                <span className="alp-name">{name}</span>
                <span className="alp-count">
                  {tasks.length} {tasks.length === 1 ? 'task' : 'tasks'}
                </span>
              </div>

              <div
                className="alp-load"
                role="img"
                aria-label={`Load ${load} of ${maxLoad}`}
                title={`Load ${load}`}
              >
                <span className="alp-load-fill" style={{ width: pct + '%' }} />
              </div>

              {tasks.length > 0 ? (
                <ul className="alp-tasks">
                  {tasks.map((a, i) => {
                    const w = effort(a.weight);
                    return (
                      <li key={i} className="alp-task">
                        <span className="alp-task-label">{a.task}</span>
                        {a.weight != null && (
                          <span
                            className="alp-task-wt"
                            aria-label={`effort ${w} of 5`}
                            title={`Effort ${w}/5`}
                          >
                            {Array.from({ length: 5 }, (_, d) => (
                              <span
                                key={d}
                                className={`alp-pip${d < w ? ' alp-pip--on' : ''}`}
                                aria-hidden
                              />
                            ))}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <div className="alp-empty">No tasks yet</div>
              )}
            </div>
          );
        })}
      </div>

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
