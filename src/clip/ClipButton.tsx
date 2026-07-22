// The launcher for the share experience. Drop it where a TurnFrame[] (Live) or a ConversationSpec
// (demo) is in hand; it shows a single button that opens the cinematic ShareModal. Thin on purpose
// — the picking, previewing, and recording all live in ShareModal.
import { useState } from 'react';
import { createPortal } from 'react-dom';
import type { CSSProperties } from 'react';
import type { TurnFrame } from '../live/history';
import type { ConversationSpec } from '../data/conversation';
import { framesFromSpec } from './frames';
import { AsyncSurface } from '../components/AsyncSurface';
import { createPreloadableLazy, preloadIntentProps } from '../lib/preloadableLazy';

const shareModal = createPreloadableLazy(() =>
  import('./ShareModal').then((m) => ({ default: m.ShareModal })),
);
const ShareModal = shareModal.Component;

export function ClipButton({
  frames,
  spec,
}: {
  frames?: TurnFrame[];
  spec?: ConversationSpec;
}): React.ReactElement | null {
  const [open, setOpen] = useState(false);
  const resolved: TurnFrame[] = frames ?? (spec ? framesFromSpec(spec) : []);
  if (!resolved.length) return null;

  // No model config from the demo, so the reel is composed by the deterministic director.
  return (
    <>
      <button
        type="button"
        style={LAUNCH}
        onClick={() => setOpen(true)}
        {...preloadIntentProps(shareModal.preload)}
      >
        ✨ Share as a story
      </button>
      {open &&
        createPortal(
          <AsyncSurface label="Share story" overlay>
            <ShareModal frames={resolved} onClose={() => setOpen(false)} />
          </AsyncSurface>,
          document.body,
        )}
    </>
  );
}

const LAUNCH: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  padding: '10px 18px',
  borderRadius: 'var(--r-full)',
  border: 'none',
  background: 'var(--presence)',
  color: '#fff',
  font: '650 14px/1 var(--font)',
  cursor: 'pointer',
  alignSelf: 'flex-start',
};
