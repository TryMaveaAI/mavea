// lastResort.ts — a safety net below React entirely.
//
// RootBoundary catches render-time throws inside the tree, but a rejected promise that nothing
// awaited, or an error thrown from a timer/event handler outside any component's render, never
// reaches it. This backstop logs it and, if the page never finished its first paint — #root is
// still empty — injects the same message React would have shown, with no dependency on React
// (it may be exactly what's broken). It is built node by node rather than parsed from a string:
// nothing here needs markup, so the backstop adds no HTML sink for the Trusted Types policy to
// vouch for, and its styling goes through the CSSOM, which the CSP does not restrict.
function styled(tag: string, css: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  node.style.cssText = css;
  if (text) node.textContent = text;
  return node;
}

function renderFallback(root: HTMLElement): void {
  const reload = styled(
    'button',
    `margin-top:4px;padding:9px 18px;border-radius:999px;border:none;background:var(--presence);
    color:var(--surface-default);font-size:14px;font-weight:600;cursor:pointer;`,
    'Reload',
  );
  reload.setAttribute('type', 'button');
  reload.setAttribute('data-reload', '');
  // Bound programmatically (never an inline `onclick=` attribute) so it runs under a CSP with no
  // `unsafe-inline` in script-src.
  reload.addEventListener('click', () => window.location.reload());
  const panel = styled(
    'div',
    `position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;
    justify-content:center;gap:12px;padding:24px;text-align:center;
    background:var(--surface-default);color:var(--text-primary);
    font:14px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;`,
  );
  panel.append(
    styled('div', 'width:40px;height:40px;border-radius:999px;background:var(--presence);'),
    styled('p', 'margin:0;font-size:17px;font-weight:600;', 'Mavéa hit a snag'),
    styled(
      'p',
      'margin:0;max-width:46ch;color:var(--text-secondary);',
      'Something went wrong loading this. A reload usually fixes it.',
    ),
    reload,
  );
  root.replaceChildren(panel);
}

let installed = false;

// Chrome and Safari both fire a genuine `error` event for this exact message whenever a
// ResizeObserver callback triggers another resize within the same frame — routine with the
// fit-to-container components all over this app (FitBox, sharedResize, SlideStage's scale-to-fit)
// and specifically Present mode's 1920x1080 stage. The browser recovers on its own (delivering the
// notification next frame); nothing broke. Logging it as "[lastResort] unhandled error" would cry
// wolf on every fit-heavy surface, so it's the one message this backstop treats as known-benign
// noise rather than a real signal something needs a reload.
const BENIGN_MESSAGE = 'ResizeObserver loop completed with undelivered notifications.';

function isBenignResizeObserverNoise(detail: unknown): boolean {
  const message = detail instanceof Error ? detail.message : String(detail);
  return message === BENIGN_MESSAGE;
}

export function installLastResort(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  const handle = (kind: string, detail: unknown): void => {
    if (isBenignResizeObserverNoise(detail)) return;
    console.error(`[lastResort] unhandled ${kind}:`, detail);
    const root = document.getElementById('root');
    if (!root || root.childElementCount > 0) return;
    renderFallback(root);
  };

  window.addEventListener('error', (e) => handle('error', e.error ?? e.message));
  window.addEventListener('unhandledrejection', (e) => handle('promise rejection', e.reason));
}
