// Side-by-side decision matrix: options across the top, criteria down the side,
// winning cells ticked, with one option flagged as the recommendation.
import { Fragment } from 'react';
import { richInnerHtml } from '../lib/richText';
import type { CSSProperties } from 'react';
import { Icon } from '../icons/icons';
import type { CompareProps } from '../data/conversation';

type Props = CompareProps & { delay?: number };

export function ComparisonMatrix({ eyebrow, options, criteria, recommendation, delay }: Props) {
  return (
    <div className="card reveal" style={{ '--delay': (delay || 0) + 'ms' } as CSSProperties}>
      <div className="card-eyebrow">
        <Icon.layers className="ic" style={{ color: 'var(--presence-soft)' }} />{' '}
        {eyebrow || 'Side by side'}
      </div>
      <div
        className="cmp"
        style={{
          gridTemplateColumns: `minmax(0, 1.1fr) repeat(${options.length}, minmax(0, 1fr))`,
        }}
      >
        <div className="cmp-corner"></div>
        {options.map((o, i) => (
          // The recommended option (pick) is the flagged emphasis — Mavéa's gesture circles it.
          <div
            className={'cmp-opt' + (o.pick ? ' pick' : '')}
            data-mark={o.pick ? 'circle' : undefined}
            key={i}
          >
            <div className="cmp-opt-name">{o.name}</div>
            {o.sub && <div className="cmp-opt-sub">{o.sub}</div>}
            {o.pick && (
              <div className="cmp-pick">
                <Icon.check style={{ width: 12, height: 12 }} /> Mavéa's pick
              </div>
            )}
          </div>
        ))}
        {criteria.map((c, ci) => (
          <Fragment key={ci}>
            <div className="cmp-crit">{c.label}</div>
            {c.cells.map((cell, i) => (
              <div
                className={
                  'cmp-val' +
                  (cell.win ? ' win' : '') +
                  (options[i] && options[i].pick ? ' in-pick' : '')
                }
                key={i}
              >
                {cell.win && (
                  <span className="cmp-tick">
                    <Icon.check style={{ width: 11, height: 11 }} />
                  </span>
                )}
                <span>{cell.v}</span>
              </div>
            ))}
          </Fragment>
        ))}
      </div>
      {recommendation && (
        <div className="cmp-rec">
          <Icon.sparkle style={{ width: 16, height: 16, color: 'var(--insight)', flexShrink: 0 }} />
          <span dangerouslySetInnerHTML={richInnerHtml(recommendation)} />
        </div>
      )}
    </div>
  );
}
