// blanks — "The Blank Space" block: an answer Mavéa rendered with intentional holes because some
// values are the user's to give (a real deadline, today's energy, what would make an option a no).
// Each hole is a shared BlankSlot, so it looks and fills identically whether it lands here or, later,
// inline inside another block. In Live the slots wire into the fill→refine loop via BlankFillContext;
// in the scripted Demo there is no context, so each slot just keeps its own local value.
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { BlankSlot } from '../../lib';
import type { BlanksProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = BlanksProps & { delay?: number };

export function Blanks({
  title,
  icon = 'edit',
  iconColor = 'var(--presence)',
  intro,
  slots,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.edit;
  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>
      {intro && <p className="blanks-intro">{intro}</p>}
      <div className="blanks-grid">
        {slots.map((b) => (
          <BlankSlot key={b.key} blank={b} />
        ))}
      </div>
      {footer && (
        <div
          className="insight-summary"
          style={{ marginTop: 14 }}
          dangerouslySetInnerHTML={richInnerHtml(footer)}
        />
      )}
    </div>
  );
}
