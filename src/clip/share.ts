// Get the finished clip out of the browser. This feature has no upload service, so "share" uses the Web Share API
// with a file (the native sheet on iOS/Android — the prime surface for a vertical clip) and
// "download" is an <a download> fallback for desktop. Both revoke their object URL right after use.
import type { ClipResult } from './types';

function extFor(type: string): string {
  if (type.includes('mp4')) return 'mp4';
  return 'webm';
}

/** Trigger a file download for the clip Blob. */
export function downloadClip(blob: Blob, filename?: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || `mavea-replay.${extFor(blob.type)}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // revoke after the click has been dispatched
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Share the clip via the native sheet where supported, else fall back to a download. */
export async function shareClip(
  result: ClipResult,
  opts?: { title?: string; text?: string },
): Promise<'shared' | 'downloaded'> {
  const file = new File([result.blob], `mavea-replay.${extFor(result.type)}`, {
    type: result.type,
  });
  const data: ShareData = { files: [file], title: opts?.title, text: opts?.text };
  if (typeof navigator !== 'undefined' && navigator.canShare?.(data) && navigator.share) {
    try {
      await navigator.share(data);
      return 'shared';
    } catch (err) {
      // user dismissing the sheet is not an error
      if ((err as DOMException)?.name === 'AbortError') return 'shared';
    }
  }
  downloadClip(result.blob);
  return 'downloaded';
}
