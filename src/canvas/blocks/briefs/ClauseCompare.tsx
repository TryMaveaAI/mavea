import { BriefFrame, ScopeNote } from './BriefFrame';
import type { ClauseCompareProps } from './types';

export function ClauseCompare({
  left,
  right,
  differences,
  jurisdiction,
  ...frame
}: ClauseCompareProps & { delay?: number }) {
  return (
    <BriefFrame {...frame} className="brf-clauses">
      <div className="brf-clause-pair">
        <section>
          <h3>{left.label}</h3>
          <p>{left.text}</p>
        </section>
        <section>
          <h3>{right.label}</h3>
          <p>{right.text}</p>
        </section>
      </div>
      <div className="brf-differences">
        {differences.map((difference, index) => (
          <article key={index}>
            <div className="brf-row-title">
              <strong>{difference.topic}</strong>
              {difference.risk && (
                <span className={`brf-risk brf-risk--${difference.risk}`}>
                  {difference.risk} risk
                </span>
              )}
            </div>
            <p>{difference.change}</p>
          </article>
        ))}
      </div>
      <ScopeNote>
        Summary only—review the full text with a qualified professional
        {jurisdiction ? ` in ${jurisdiction}` : ''}.
      </ScopeNote>
    </BriefFrame>
  );
}
