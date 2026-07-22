import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { HtmlString } from '../../../data/conversation';
import type { ThoughtrecordProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = ThoughtrecordProps & { delay?: number };

// Clamp to the standard 0–100 CBT intensity scale; anything unusable (missing, NaN, negative,
// past 100) is treated as "not given" rather than drawn as a broken bar.
function clampIntensity(n: number | undefined): number | null {
  if (n == null || !Number.isFinite(n)) return null;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function EvidenceColumn({
  label,
  items,
  accent,
  mark,
}: {
  label: string;
  items: HtmlString[];
  accent: string;
  mark: 'alert' | 'check';
}) {
  const Mark = mark === 'check' ? Icon.check : Icon.alert;
  return (
    <div className="tr-ev-col" style={{ ['--te' as string]: accent } as CSSProperties}>
      <div className="tr-ev-head">
        <Mark className="ic" style={{ color: accent, width: 13, height: 13 }} />
        <span>{label}</span>
        <span className="tr-ev-count tab-num">{items.length}</span>
      </div>
      {items.length === 0 ? (
        <p className="tr-ev-empty faint">None noted</p>
      ) : (
        <ul className="tr-ev-list">
          {items.map((it, i) => (
            <li
              key={i}
              className="tr-ev-item m-stagger-item m-fade-rise"
              style={{ ['--i' as string]: i } as CSSProperties}
            >
              <Mark className="ic tr-ev-mark" style={{ color: accent }} />
              <span className="tr-ev-text" dangerouslySetInnerHTML={richInnerHtml(it)} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// A full CBT thought record — the moment, the automatic thought, the evidence weighed on both
// sides, and the balanced thought that comes out the other side. A vertical stack of warm cards
// (situation → thought → evidence → shift → balanced thought → before/after), never a literal
// 7-column worksheet table: that layout is standard on paper but overflows every phone width.
export function Thoughtrecord({
  title = 'Thought record',
  icon = 'spark',
  iconColor = 'var(--presence)',
  situation,
  automaticThought,
  emotion,
  emotionIntensity,
  evidenceFor = [],
  evidenceAgainst = [],
  alternativeThought,
  outcomeEmotion,
  outcomeIntensity,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.spark;
  const startPct = clampIntensity(emotionIntensity);
  const endPct = clampIntensity(outcomeIntensity);
  const hasEvidence = evidenceFor.length > 0 || evidenceAgainst.length > 0;
  const hasShift = Boolean(alternativeThought);
  const hasOutcome = Boolean(outcomeEmotion) || endPct != null;
  const altDelay = (delay || 0) + 140;

  return (
    <div
      className="card reveal tr-card"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      {situation && (
        <div className="tr-block tr-situation">
          <div className="tr-tag">The situation</div>
          <p className="tr-body" dangerouslySetInnerHTML={richInnerHtml(situation)} />
        </div>
      )}

      <div className="tr-block tr-thought">
        <div className="tr-row-head">
          <span className="tr-tag">The automatic thought</span>
          <span className="tr-emo-chip">
            {emotion}
            {startPct != null && <span className="tr-emo-pct tab-num">{startPct}%</span>}
          </span>
        </div>
        {automaticThought && (
          <p className="tr-quote">
            <Icon.quote className="ic tr-quote-ic" style={{ width: 14, height: 14 }} />
            <span dangerouslySetInnerHTML={richInnerHtml(automaticThought)} />
          </p>
        )}
        {startPct != null && (
          <div className="tr-meter" aria-label={`felt ${startPct} of 100`}>
            <span className="tr-meter-fill" style={{ width: startPct + '%' }} />
          </div>
        )}
      </div>

      {hasEvidence && (
        <div className="tr-block tr-evidence">
          <div className="tr-tag">Weighing the evidence</div>
          <div className="tr-ev-grid">
            <EvidenceColumn
              label="Feeds the thought"
              items={evidenceFor}
              accent="var(--warning)"
              mark="alert"
            />
            <div className="tr-ev-divider" />
            <EvidenceColumn
              label="Complicates it"
              items={evidenceAgainst}
              accent="var(--insight)"
              mark="check"
            />
          </div>
        </div>
      )}

      {hasShift && (
        <div className="tr-shift" aria-hidden="true">
          <span className="tr-shift-line" />
          <Icon.spark className="ic tr-shift-ic" style={{ width: 13, height: 13 }} />
          <span className="tr-shift-line" />
        </div>
      )}

      {alternativeThought && (
        <div
          className="tr-block tr-alt m-fade-rise"
          style={{ ['--delay' as string]: altDelay + 'ms' } as CSSProperties}
        >
          <div className="tr-tag tr-tag--true">The balanced thought</div>
          <p className="tr-alt-text" dangerouslySetInnerHTML={richInnerHtml(alternativeThought)} />
        </div>
      )}

      {hasOutcome && (
        <div className="tr-outcome">
          <div className="tr-outcome-chip">
            <span className="tr-outcome-label">Felt</span>
            <span className="tr-outcome-emo">{emotion}</span>
            {startPct != null && <span className="tr-outcome-pct tab-num">{startPct}%</span>}
          </div>
          <Icon.chevR className="ic tr-outcome-arrow" style={{ width: 14, height: 14 }} />
          <div className="tr-outcome-chip tr-outcome-chip--after">
            <span className="tr-outcome-label">Now</span>
            <span className="tr-outcome-emo">{outcomeEmotion || emotion}</span>
            {endPct != null && <span className="tr-outcome-pct tab-num">{endPct}%</span>}
          </div>
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
