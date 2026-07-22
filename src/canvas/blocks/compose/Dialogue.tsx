import { type CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { DialogueProps, DialogueLine } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = DialogueProps & { delay?: number };

// Alternate speaker accent: odd lines use --presence, even use --text-secondary.
// This matches the .dg-speaker/:nth-child(even) rule in styles.css so the
// colour swap works even without the CSS selector (e.g. snapshot tests).
function speakerColor(index: number): string {
  return index % 2 === 0 ? 'var(--presence)' : 'var(--text-secondary)';
}

function Line({ line, index, lead }: { line: DialogueLine; index: number; lead?: boolean }) {
  return (
    // Ordered authored content — lead flags the first line as the honest salient entry
    <div className="dg-line" {...(lead ? { 'data-mark': 'underline' } : {})}>
      {/* Speaker label: all-caps monospace-weight column, alternating accent */}
      <div className="dg-speaker" style={{ color: speakerColor(index) }} aria-label={line.speaker}>
        {line.speaker}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="dg-text">{line.text}</div>
        {line.note && <div className="dg-note">{line.note}</div>}
      </div>
    </div>
  );
}

export function Dialogue({
  title,
  icon = 'chat',
  iconColor = 'var(--presence)',
  context,
  lines,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] ?? Icon.chat;
  // Guard against a partially-constructed block arriving without lines.
  const dialogue = lines ?? [];

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay ?? 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      {/* Scene/setting description — subdued italic via .dg-ctx */}
      {context && <div className="dg-ctx">{context}</div>}

      <div className="dg-lines">
        {dialogue.map((line, i) => (
          <Line key={i} line={line} index={i} lead={i === 0} />
        ))}
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
