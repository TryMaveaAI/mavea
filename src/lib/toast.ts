// A transient toast rendered straight to the DOM — no React — so any module can
// fire-and-forget a confirmation (Share/Export and the like). Styling is the `.toast`
// rules in styles.css.

/** Optional toast variant — maps to a `.toast.<kind>` modifier class in CSS. */
export type ToastKind = 'info' | 'good' | 'warn' | '';

/**
 * Render a transient toast that fades in, holds, then fades out and removes
 * itself. Idempotently creates the `#mavea-toasts` host on first call. Safe to
 * call from anywhere (guards against a missing `document`, e.g. SSR/tests).
 */
export function toast(msg: string, kind?: ToastKind): void {
  if (typeof document === 'undefined') return;

  let host = document.getElementById('mavea-toasts');
  if (!host) {
    host = document.createElement('div');
    host.id = 'mavea-toasts';
    document.body.appendChild(host);
  }

  const el = document.createElement('div');
  el.className = 'toast' + (kind ? ' ' + kind : '');
  // textContent (not innerHTML) for the message so caller strings can't inject markup.
  const dot = document.createElement('span');
  dot.className = 'toast-dot';
  el.appendChild(dot);
  el.appendChild(document.createTextNode(msg));
  host.appendChild(el);

  setTimeout(() => el.classList.add('show'), 20);
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 320);
  }, 2600);
}
