import { type CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { RegexScopeProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = RegexScopeProps & { delay?: number };

// A regular-expression explainer: the full pattern, then a token-by-token breakdown (each
// fragment labeled and color-coded by kind), then test strings with their matched runs
// highlighted. The sample is pre-segmented into matched/unmatched runs (no regex is executed
// here), so the highlight is authored data, not a live evaluation of untrusted input.
export function RegexScope({
  title,
  icon = 'spark',
  iconColor = 'var(--presence)',
  pattern,
  flags,
  parts,
  samples,
  caption,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] ?? Icon.spark;
  const tokens = parts ?? [];

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay ?? 0) + 'ms' } as CSSProperties}
    >
      {title && (
        <div className="card-eyebrow">
          <Ic className="ic" style={{ color: iconColor }} /> {title}
        </div>
      )}

      <div className="rx-pattern">
        <span className="rx-slash">/</span>
        <span className="rx-src">{pattern}</span>
        <span className="rx-slash">/</span>
        {flags && <span className="rx-flags">{flags}</span>}
      </div>

      <div className="rx-parts">
        {tokens.map((p, i) => (
          <div key={i} className="rx-part">
            <code className={`rx-token rx-${p.kind ?? 'other'}`}>{p.token}</code>
            <span className="rx-label">{p.label}</span>
          </div>
        ))}
      </div>

      {samples && samples.length > 0 && (
        <div className="rx-samples">
          {samples.map((s, i) => (
            <div key={i} className="rx-sample">
              {s.label && <span className="rx-sample-label">{s.label}</span>}
              <code className="rx-sample-text">
                {s.segments.map((seg, j) =>
                  seg.match ? (
                    <mark
                      key={j}
                      className="rx-hit"
                      style={
                        seg.group != null
                          ? ({ ['--g' as string]: String(seg.group % 4) } as CSSProperties)
                          : undefined
                      }
                    >
                      {seg.text}
                    </mark>
                  ) : (
                    <span key={j}>{seg.text}</span>
                  ),
                )}
              </code>
            </div>
          ))}
        </div>
      )}

      {caption && <div className="term-caption">{caption}</div>}
      {footer && (
        <div
          className="insight-summary"
          style={{ marginTop: 10 }}
          dangerouslySetInnerHTML={richInnerHtml(footer)}
        />
      )}
    </div>
  );
}
