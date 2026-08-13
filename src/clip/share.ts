// Get the finished clip out of the browser. This feature has no upload service, so "share" uses the Web Share API
// with a file (the native sheet on iOS/Android — the prime surface for a vertical clip) and
// "download" is an <a download> fallback for desktop. Object URLs stay alive long enough for the
// browser's download service to take ownership, then are revoked on a bounded timer.
import type { ClipResult } from './types';

/** The download extension follows the clip's actual approved container (MP4 or WebM). */
export function clipFileName(base: string, type: string): string {
  return `${base}.${type === 'video/mp4' ? 'mp4' : 'webm'}`;
}

/**
 * A file name someone can find again: the conversation's own topic plus the date. Titles are
 * arbitrary model output, so this keeps only characters that are safe in a file name on every
 * platform and bounds the length rather than trusting the input.
 */
export function videoFileBase(title: string | undefined, on: Date): string {
  const slug = (title ?? '')
    .toLowerCase()
    .normalize('NFKD')
    // Strip combining marks so "Três Dias" becomes "tres-dias" instead of losing the vowels.
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/, '');
  const day = [
    on.getFullYear(),
    String(on.getMonth() + 1).padStart(2, '0'),
    String(on.getDate()).padStart(2, '0'),
  ].join('-');
  return slug ? `mavea-${slug}-${day}` : `mavea-conversation-${day}`;
}

/** Trigger a file download for the clip Blob. `dispose` runs after the browser has had a generous
 *  ownership window, which matters when `blob` is backed by a temporary OPFS file. */
export function downloadClip(blob: Blob, filename?: string, dispose?: () => void): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || clipFileName('mavea-replay', blob.type);
  document.body.appendChild(a);
  a.click();
  a.remove();
  // A zero-delay revoke races Chromium's out-of-process download service for larger files. Keep the
  // URL briefly, while still bounding its lifetime when the user makes several exports in a row.
  // `pagehide` also removes temporary browser storage if the app closes before that timer fires.
  const cleanup = () => {
    clearTimeout(timer);
    window.removeEventListener('pagehide', cleanup);
    URL.revokeObjectURL(url);
    dispose?.();
  };
  window.addEventListener('pagehide', cleanup, { once: true });
  const timer = setTimeout(cleanup, 60_000);
}

/** Share the clip via the native sheet where supported, else fall back to a download. */
export async function shareClip(
  result: ClipResult,
  opts?: { title?: string; text?: string; filename?: string },
): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const name = opts?.filename || clipFileName('mavea-replay', result.type);
  const file = new File([result.blob], name, {
    type: result.type,
  });
  const data: ShareData = { files: [file], title: opts?.title, text: opts?.text };
  if (typeof navigator !== 'undefined' && navigator.canShare?.(data) && navigator.share) {
    try {
      await navigator.share(data);
      await result.dispose?.();
      return 'shared';
    } catch (err) {
      // Dismissing the native sheet did not hand the file to anyone. Keep ownership with the caller
      // so a ready-file UI can offer it again (or explicitly dispose it if that UI cannot reuse it).
      if ((err as DOMException)?.name === 'AbortError') {
        return 'cancelled';
      }
    }
  }
  downloadClip(result.blob, name, () => void result.dispose?.());
  return 'downloaded';
}
