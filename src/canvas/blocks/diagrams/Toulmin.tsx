// Toulmin argument diagram — the six roles of a full argument laid out along their logical
// flow: the Grounds (evidence) support the Claim, licensed by the Warrant ("since …") which is
// itself propped up by the Backing ("on account of …"); the Qualifier tempers how strongly the
// Claim follows ("so, presumably, …"), and the Rebuttal names the exception that would undo it
// ("unless …"). The support structure stacks on one side and the claim on the other, joined by a
// "so" bridge; a container query flips the whole figure from a side-by-side pair on a wide card
// to a top-to-bottom stack on a narrow one, so the reading order (grounds → warrant → backing →
// so → claim → unless) survives at any width. Every field wraps as real HTML text, so a long
// warrant or a verbose rebuttal grows its own card rather than overflowing.
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { ToulminProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = ToulminProps & { delay?: number };

/** One labelled role card. `conn` is the connective word that introduces the role in the
 *  argument's flow (Since / On account of / Unless); the anchor roles (Grounds, Claim) have none. */
function Role({
  kind,
  name,
  conn,
  text,
}: {
  kind: 'grounds' | 'warrant' | 'backing' | 'claim' | 'rebuttal';
  name: string;
  conn?: string;
  text: string;
}) {
  return (
    <div className={`toul-role toul-role--${kind}`} style={{ gridArea: kind }}>
      <div className="toul-role-head">
        {conn && <span className="toul-role-conn">{conn}</span>}
        <span className="toul-role-name">{name}</span>
      </div>
      <p className="toul-role-text">{text}</p>
    </div>
  );
}

export function Toulmin({
  title,
  icon = 'proof',
  iconColor = 'var(--presence)',
  claim,
  grounds,
  warrant,
  backing,
  qualifier,
  rebuttal,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.proof;

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      {title && (
        <div className="card-eyebrow">
          <Ic className="ic" style={{ color: iconColor }} /> {title}
        </div>
      )}

      <div className="toul">
        <div className="toul-grid">
          {grounds && <Role kind="grounds" name="Grounds" text={grounds} />}
          {warrant && <Role kind="warrant" name="Warrant" conn="Since" text={warrant} />}
          {backing && <Role kind="backing" name="Backing" conn="On account of" text={backing} />}

          {/* The inference bridge — a "so" badge with the qualifier that tempers the claim, and
              an arrow that points right on a wide card, down on a narrow one (flipped in CSS). */}
          <div className="toul-bridge" style={{ gridArea: 'bridge' }} aria-hidden="true">
            <span className="toul-so">so</span>
            {qualifier && <span className="toul-qual">{qualifier}</span>}
            <span className="toul-arrow" />
          </div>

          {claim && <Role kind="claim" name="Claim" text={claim} />}
          {rebuttal && <Role kind="rebuttal" name="Rebuttal" conn="Unless" text={rebuttal} />}
        </div>
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
