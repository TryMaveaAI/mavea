// Replay card: turn the conversation that just played into a shareable cinematic "Mavéa Story".
// The card keeps its headline; the ClipButton beneath it plays the REAL components back (and
// records them). When no spec is available it stays a quiet headline rather than a dead control.
import type { CSSProperties } from 'react';
import { Icon } from '../icons/icons';
import { ClipButton } from '../clip';
import type { ReplayProps, ConversationSpec } from '../data/conversation';

type Props = ReplayProps & { delay?: number; spec?: ConversationSpec };

export function ReplayCard({ delay, line, spec }: Props) {
  return (
    <div
      className="card replay-card reveal"
      style={{ '--delay': (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Icon.play className="ic" style={{ color: 'var(--presence-soft)' }} /> Mavéa Replay
      </div>
      <div className="insight-title" style={{ fontSize: 17, marginBottom: 14 }}>
        {line || '“I dropped in 3 statements. Mavéa showed me where my money went in 20 seconds.”'}
      </div>
      {spec && <ClipButton spec={spec} />}
    </div>
  );
}
