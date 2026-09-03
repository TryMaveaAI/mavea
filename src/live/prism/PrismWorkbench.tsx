import { useMemo, type ReactElement } from 'react';
import type { Attachment } from '../attachments';
import { getLiveConfigV2, hasModelConfigured, toModelConfig } from '../useLiveConfig';
import { PrismOverlay } from './PrismOverlay';

interface PrismWorkbenchProps {
  pdf: Attachment[];
  onClose: () => void;
}

/** Provider configuration belongs to the workbench, not the upload shell. Keeping this boundary
 * lazy means visiting Prism does not load provider and encrypted-key code before a file is opened. */
export function PrismWorkbench({ pdf, onClose }: PrismWorkbenchProps): ReactElement {
  // No model configured means no map: every adapter goes through the spend policy, which refuses a
  // hosted provider with no key whether or not a same-origin proxy is in front of it. Handing the
  // overlay a config anyway spent the reader's upload on the policy's internal "No model is
  // configured." and a Try again that could only fail identically; null gets them the line that
  // says what to do about it.
  const cfg = useMemo(() => {
    const stored = getLiveConfigV2();
    return hasModelConfigured(stored) ? toModelConfig(stored) : null;
  }, []);
  return <PrismOverlay pdf={pdf} cfg={cfg} onClose={onClose} />;
}
