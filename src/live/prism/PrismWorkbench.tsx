import { useMemo, type ReactElement } from 'react';
import type { Attachment } from '../attachments';
import { getLiveConfigV2, toModelConfig } from '../useLiveConfig';
import { PrismOverlay } from './PrismOverlay';

interface PrismWorkbenchProps {
  pdf: Attachment[];
  onClose: () => void;
}

/** Provider configuration belongs to the workbench, not the upload shell. Keeping this boundary
 * lazy means visiting Prism does not load provider and encrypted-key code before a file is opened. */
export function PrismWorkbench({ pdf, onClose }: PrismWorkbenchProps): ReactElement {
  // The same-origin proxy can inject a development key, so absence of a browser key is not a gate.
  const cfg = useMemo(() => toModelConfig(getLiveConfigV2()), []);
  return <PrismOverlay pdf={pdf} cfg={cfg} onClose={onClose} />;
}
