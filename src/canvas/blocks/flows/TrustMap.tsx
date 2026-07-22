import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { TrustMapProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = TrustMapProps & { delay?: number };

// A privacy / data-flow map. Each row reads left to right as data → location → access: WHAT a kind
// of data is, WHERE it is stored, and WHO can see it — the three questions someone actually means by
// "where does my data go?". An optional retention tag rides under the location (how long it sticks
// around), and an optional security checklist sits below as honest pass/gap rows. Stateless and
// hover-free so it reads identically on a phone, in Focus mode, and in a Replay capture; it only
// ever shows what was mapped, never an invented assurance.
export function TrustMap({
  title,
  icon = 'shield',
  iconColor = 'var(--presence)',
  flows,
  checklist,
  note,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.shield;
  const rows = flows ?? [];
  const checks = checklist ?? [];

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <ul className="trm-flows">
        {rows.map((f, i) => (
          <li className="trm-row" key={i}>
            <span className="trm-part trm-data">
              <span className="trm-part-lbl">Data</span>
              <span className="trm-part-val">{f.data}</span>
            </span>

            <span className="trm-arrow" aria-hidden="true">
              <Icon.send className="ic trm-arrow-ic" style={{ width: 13, height: 13 }} />
            </span>

            <span className="trm-part trm-loc">
              <span className="trm-part-lbl">Stored in</span>
              <span className="trm-part-val">{f.location}</span>
              {f.retention && (
                <span className="trm-retention">
                  <Icon.clock className="ic trm-ret-ic" style={{ width: 11, height: 11 }} />
                  {f.retention}
                </span>
              )}
            </span>

            <span className="trm-arrow" aria-hidden="true">
              <Icon.eye className="ic trm-arrow-ic" style={{ width: 13, height: 13 }} />
            </span>

            <span className="trm-part trm-access">
              <span className="trm-part-lbl">Seen by</span>
              <span className="trm-part-val">{f.access}</span>
            </span>
          </li>
        ))}
      </ul>

      {checks.length > 0 && (
        <div className="trm-checklist">
          <div className="trm-checklist-h">Security checklist</div>
          <ul className="trm-checks">
            {checks.map((c, i) => {
              const ok = c.ok !== false;
              const CheckIc = ok ? Icon.check : Icon.alert;
              return (
                <li className={'trm-check' + (ok ? ' is-ok' : ' is-gap')} key={i}>
                  <CheckIc className="ic trm-check-ic" style={{ width: 14, height: 14 }} />
                  <span className="trm-check-lbl">{c.label}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {note && (
        <div className="trm-note">
          <Icon.lock className="ic trm-note-ic" style={{ width: 13, height: 13 }} />
          <span>{note}</span>
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
