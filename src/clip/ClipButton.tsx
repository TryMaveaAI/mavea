// The launcher for Video Studio. Drop it where a TurnFrame[] (Live) or a ConversationSpec (demo) is
// in hand; selection, preview, and encoding all stay inside the lazy ShareModal.
import { useState } from 'react';
import { createPortal } from 'react-dom';
import type { TurnFrame } from '../live/history';
import type { ConversationSpec } from '../data/conversation';
import { framesFromSpec } from './frames';
import { AsyncSurface } from '../components/AsyncSurface';
import { createPreloadableLazy, preloadIntentProps } from '../lib/preloadableLazy';
import './clip-button.css';

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
        className="clip-launch"
        onClick={() => setOpen(true)}
        {...preloadIntentProps(shareModal.preload)}
      >
        ✨ Make a video
      </button>
      {open &&
        createPortal(
          <AsyncSurface label="Make a video" overlay>
            <ShareModal frames={resolved} onClose={() => setOpen(false)} />
          </AsyncSurface>,
          document.body,
        )}
    </>
  );
}
