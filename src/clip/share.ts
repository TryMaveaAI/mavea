// Get the finished clip out of the browser. This feature has no upload service — the clip lands
// as a plain <a download>. (A Web Share button was tried and cut: desktop Chrome/Edge expose
// navigator.share but refuse file payloads, so it silently fell through to this same download
// while pretending to share.) Object URLs stay alive long enough for the browser's download
// service to take ownership, then are revoked on a bounded timer.

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
