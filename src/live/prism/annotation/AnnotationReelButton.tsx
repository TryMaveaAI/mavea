// "Share reel" in Prism's footer: turn the marked-up pages into a shareable vertical video. Uses the
// annotations the reader recorded this session; if there aren't enough, it auto-builds a guided tour
// of the document's key claims (offscreen renders, no model call). The built ReelScript is handed
// straight to ShareModal (which skips the director for a prebuilt script).
import { useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ReactElement } from 'react';
import type { ModelConfig } from '../../../types/mavea';
import type { Attachment } from '../../attachments';
import type { Placed } from '../layout';
import type { PrismSpec } from '../types';
import type { Verdict } from '../veracity';
import type { ReelScript } from '../../../clip/reel/reelScript';
import { toast } from '../../../lib/toast';
import type { AnnotationStep } from './steps';
import { AsyncSurface } from '../../../components/AsyncSurface';
import { createPreloadableLazy, preloadIntentProps } from '../../../lib/preloadableLazy';

const shareModal = createPreloadableLazy(() =>
  import('../../../clip/ShareModal').then((m) => ({ default: m.ShareModal })),
);
const ShareModal = shareModal.Component;

export function AnnotationReelButton({
  steps,
  spec,
  pdfs,
  cfg,
  placed,
  verdicts,
}: {
  /** The live record of annotations (a ref, so the latest is read on click). */
  steps: { readonly current: AnnotationStep[] };
  spec: PrismSpec;
  pdfs: readonly Attachment[];
  cfg: ModelConfig | null;
  placed?: readonly Placed[];
  verdicts?: ReadonlyMap<string, Verdict>;
}): ReactElement {
  const [busy, setBusy] = useState(false);
  const [script, setScript] = useState<ReelScript | null>(null);

  const open = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const [{ autoAnnotationSteps }, { buildAnnotationReel }] = await Promise.all([
        import('./annotationAuto'),
        import('../../../clip/reel/annotationReel'),
        shareModal.preload(),
      ]);
      const recorded = steps.current;
      const use =
        recorded.length >= 1
          ? recorded.slice()
          : await autoAnnotationSteps(spec, pdfs, { placed, verdicts, max: 6 });
      if (!use.length) {
        toast('Turn on Annotate, then ask a question or tap a claim to mark it up', 'warn');
        return;
      }
      setScript(buildAnnotationReel(use, { fileName: spec.fileName }));
    } finally {
      setBusy(false);
    }
  }, [busy, steps, spec, pdfs, placed, verdicts]);

  return (
    <>
      <button
        type="button"
        className="prism-foot-btn"
        disabled={busy}
        onClick={open}
        title="Make a shareable reel of the marked-up pages"
        {...preloadIntentProps(shareModal.preload)}
      >
        {busy ? 'Preparing…' : 'Share reel'}
      </button>
      {script &&
        createPortal(
          <AsyncSurface label="Annotation reel" overlay>
            <ShareModal script={script} cfg={cfg ?? undefined} onClose={() => setScript(null)} />
          </AsyncSurface>,
          document.body,
        )}
    </>
  );
}
