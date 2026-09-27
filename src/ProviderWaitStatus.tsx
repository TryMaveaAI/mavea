// ProviderWaitStatus.tsx — the app shell's one line for a provider backoff no surface is showing.
//
// A 429/503/529 makes the adapter wait and re-send. The Live turn and the world say so in place;
// every other feature reports through providers/wait, and this is where the reader hears about it,
// on whichever route they are on. Nothing renders while nothing waits.
//
// A backoff very often starts while an overlay is open (Prism, a course, the Library), so the line
// has to beat every overlay twice over. Seen: the pill goes to the top layer as a manual popover,
// above any z-index an overlay can take. Heard: an open `aria-modal` hides everything outside it
// from a screen reader, live regions included, so the spoken line is placed INSIDE the topmost one.
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
} from 'react';
import { createPortal } from 'react-dom';
import { subscribeProviderWait, type ProviderWait } from './live/providers/wait';

/** The bands a surface keeps at the bottom of the viewport, each published by its owner onto the
 *  app shell (the dock, a replay's transport, the walkthrough's caption, the phone rail). The pill
 *  lives outside that shell, so it cannot inherit them. */
const BOTTOM_BANDS = ['--dock-h', '--demo-h', '--tour-h', '--mobile-rail-h'] as const;

/** How long a new live region sits empty before it speaks: a region created already holding its
 *  words is not reliably announced, so it has to exist in the tree before they change. */
export const ANNOUNCE_DELAY_MS = 150;

/** The bands as the pill's own custom properties (`--dock-h` → `--wait-dock-h`), copied as the
 *  shell resolved them. Copied, not parsed: a band can be an expression (the phone rail is
 *  `calc(44px + 1px)`), which a number parse reads as nothing — the stylesheet adds them up. */
function bottomBands(): CSSProperties | undefined {
  const app = document.querySelector<HTMLElement>('.mavea-app');
  if (!app) return undefined;
  const style = getComputedStyle(app);
  const bands: Record<string, string> = {};
  for (const band of BOTTOM_BANDS) {
    const value = style.getPropertyValue(band).trim();
    if (value) bands[`--wait-${band.slice(2)}`] = value;
  }
  return bands as CSSProperties;
}

/** The overlay a screen reader is currently confined to, if any: the last open `aria-modal` in
 *  document order, which is the one stacked on top. */
function modalHost(): HTMLElement | null {
  const open = Array.from(document.querySelectorAll<HTMLElement>('[aria-modal="true"]')).filter(
    (el) => el.isConnected && !el.closest('[hidden],[inert],[aria-hidden="true"]'),
  );
  return open.at(-1) ?? null;
}

function canPopover(el: HTMLElement): boolean {
  return typeof el.showPopover === 'function' && typeof el.hidePopover === 'function';
}

export function ProviderWaitStatus(): ReactElement {
  const [wait, setWait] = useState<ProviderWait | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [bands, setBands] = useState<CSSProperties>();
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [said, setSaid] = useState('');
  const pillRef = useRef<HTMLDivElement>(null);
  const waiting = wait !== null;

  useEffect(() => subscribeProviderWait(setWait), []);

  // A countdown only while something waits; idle means no timer at all. The same tick re-reads the
  // bottom bands, since the composer grows and a replay's transport comes and goes.
  useEffect(() => {
    if (!waiting) return;
    const tick = (): void => {
      setNow(Date.now());
      setBands(bottomBands());
    };
    tick();
    const timer = window.setInterval(tick, 1_000);
    return () => window.clearInterval(timer);
  }, [waiting]);

  // Into the top layer while it waits, out of it the moment the wait ends. A browser without the
  // popover API keeps the plain fixed pill. Before paint, so the pill never shows a frame outside
  // the top layer.
  useLayoutEffect(() => {
    const pill = pillRef.current;
    if (!waiting || !pill || !canPopover(pill)) return;
    pill.showPopover();
    // Hiding a popover that is already hidden (say, removed with its tree) is a no-op, not a throw.
    return () => pill.hidePopover();
  }, [waiting]);

  // Follow the reader into whichever modal opens or closes while the wait lasts.
  useEffect(() => {
    if (!waiting) {
      setHost(null);
      return;
    }
    const follow = (): void => setHost(modalHost());
    follow();
    const watch = new MutationObserver(follow);
    watch.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['aria-modal', 'hidden', 'inert', 'aria-hidden'],
    });
    return () => watch.disconnect();
  }, [waiting]);

  // Said once per wait (and again if the reader moves into another overlay), never counted down
  // aloud: a number read out every second drowns whatever the reader was listening to.
  const until = wait?.until;
  useEffect(() => {
    setSaid('');
    if (until === undefined) return;
    const timer = window.setTimeout(() => {
      const seconds = Math.max(0, Math.ceil((until - Date.now()) / 1_000));
      setSaid(
        seconds > 0
          ? `Your provider asked Mavéa to wait. Retrying in ${seconds} seconds.`
          : 'Your provider asked Mavéa to wait. Retrying now.',
      );
    }, ANNOUNCE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [until, host]);

  const seconds = wait ? Math.max(0, Math.ceil((wait.until - now) / 1_000)) : 0;
  return (
    <>
      <div
        ref={pillRef}
        className="provider-wait"
        popover="manual"
        aria-hidden="true"
        style={bands}
      >
        {wait && (
          <span className="toast show">
            <span className="toast-dot" />
            {seconds > 0
              ? `Your provider asked Mavéa to wait — retrying in ${seconds}s`
              : 'Your provider asked Mavéa to wait — retrying now'}
          </span>
        )}
      </div>
      {waiting &&
        createPortal(
          <span key={host ? 'modal' : 'page'} className="provider-wait-said" role="status">
            {said}
          </span>,
          host ?? document.body,
        )}
    </>
  );
}
