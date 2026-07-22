// A single finding: headline stat with delta, summary, source citations, and a
// confidence badge — optionally spotlit, dimmed, or backed by a "Prove it" action.
import type { ReactNode, CSSProperties } from 'react';
import { Icon } from '../icons/icons';
import { SourceChip, ConfidenceBadge, CONF_TITLE_UNVERIFIED } from './trust';
import type { InsightProps } from '../data/conversation';

type Props = InsightProps & {
  num: string;
  spotlight?: boolean;
  dimmed?: boolean;
  onProve?: () => void;
  delay?: number;
  children?: ReactNode;
};

export function InsightCard({
  num,
  title,
  summary,
  stat,
  delta,
  deltaDir,
  conf,
  sources,
  spotlight,
  dimmed,
  onProve,
  delay,
  children,
}: Props) {
  return (
    <div
      className={'card reveal' + (spotlight ? ' spotlight' : '') + (dimmed ? ' dimmed' : '')}
      style={{ '--delay': (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Icon.spark className="ic" style={{ color: 'var(--insight)' }} />
        Finding {num}
      </div>
      <div className="insight-title">{title}</div>
      {stat && (
        <div className="insight-stat">
          {/* the headline figure — Mavéa's drawn gesture underlines it while talking */}
          <span className="big tab-num" data-mark="underline">
            {stat}
          </span>
          {delta && (
            <span className={'delta ' + (deltaDir || 'up')}>
              {deltaDir === 'good' || deltaDir === 'down' ? (
                <Icon.arrowDown style={{ width: 13, height: 13 }} />
              ) : (
                <Icon.arrowUp style={{ width: 13, height: 13 }} />
              )}
              {delta}
            </span>
          )}
        </div>
      )}
      <div className="insight-summary">{summary}</div>
      {children}
      <div className="card-foot">
        <div className="card-foot-l">
          {sources && sources.map((s, i) => <SourceChip key={i} file={s.file} loc={s.loc} />)}
        </div>
        {/* Only claim "based on your files" when the card actually cites files. */}
        {conf && (
          <ConfidenceBadge
            level={conf}
            title={sources?.length ? undefined : CONF_TITLE_UNVERIFIED}
          />
        )}
      </div>
      {onProve && (
        <div style={{ marginTop: 14 }}>
          <button className="mini-btn accent" onClick={onProve}>
            <Icon.proof /> Prove it
          </button>
        </div>
      )}
    </div>
  );
}
