// Shared measure-until-still machinery for everything that anchors to live card geometry —
// the per-card ink portals (AnnotationLayer) and the margin-note rail (MarginNoteRail). Cards
// stream in, reveal, scale under the spotlight, and re-tile on resize; anything positioned
// against them must poll until the layout is genuinely at rest, then stay armed for the next
// movement, rather than trusting a one-shot delay.

const POLL_MS = 100; // how often a not-yet-settled measurement is retried
const MAX_POLLS = 18; // ~1.8s ceiling — generous for a reveal transition or a takeover's entrance
const STABLE_STREAK = 2; // this many identical reads in a row reads as "stopped moving"

/** Chrome the pen itself renders (or the badge state it stamps on the host) — mutations there
 *  are our own echo, never a reason to re-measure. Without this filter every placement would
 *  mutate the card, which would restart the poll, which would place again: a feedback loop. */
const INK_CHROME = '.ink-layer, .ink-connect-layer, .note-rail';

function isInkNode(n: Node): boolean {
  const el = n instanceof Element ? n : n.parentElement;
  return !!el?.closest(INK_CHROME);
}

/** Poll `measure` until its result's geometry (per `fingerprint`) stops changing for
 *  `STABLE_STREAK` reads in a row, or `MAX_POLLS` is exhausted — reporting every successful read
 *  along the way via `onResult`, never a null. That's the core of the contract: a caller's placed
 *  result is only ever REPLACED by a fresh, real placement, never cleared just because one attempt
 *  found nothing yet (a card mid-reveal, a host not mounted this tick). Also re-arms on the
 *  resolved host's own resize (a card that grows from streamed content), on a window resize, and
 *  on any real content mutation inside the host (a block sorting its rows, a toggle revealing
 *  more of them — neither changes the host's outer box, so only a mutation observer sees them),
 *  restarting the settle count rather than trusting a blind one-shot re-check. Returns a cleanup
 *  that stops every timer/observer it started. */
export function pollUntilSettled<T>(
  measure: () => T | null,
  fingerprint: (result: T) => string,
  hostOf: (result: T) => HTMLElement,
  onResult: (result: T) => void,
): () => void {
  let cancelled = false;
  let timer: number | undefined;
  let attempts = 0;
  let lastKey: string | null = null;
  let streak = 0;
  let ro: ResizeObserver | undefined;
  let transitionHost: HTMLElement | undefined;
  let mo: MutationObserver | undefined;

  const armHost = (host: HTMLElement): void => {
    if (!ro && typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => restart());
      ro.observe(host);
    }
    // Transforms move a card without resizing it — the spotlight's scale, a reveal's translate —
    // so the ResizeObserver never fires for them. A geometry captured mid-transition would stay
    // wrong forever; re-arming when the host's transition lands heals it.
    if (!transitionHost) {
      transitionHost = host;
      host.addEventListener('transitionend', restart);
    }
    // Content can move INSIDE the host without changing its outer box or firing a transition —
    // a chart re-sorting its rows, a trace expanding inside its own capped scroller. The marks
    // anchor to text, so a re-measure lands them on the moved rows; only a mutation observer
    // notices the move. Our own echo is filtered out: ink chrome mutations and the badge
    // state/duration SpotInk stamps onto the host itself.
    if (!mo && typeof MutationObserver !== 'undefined') {
      const significant = (m: MutationRecord): boolean => {
        if (isInkNode(m.target)) return false;
        if (m.type === 'attributes') {
          return !(
            m.target === host &&
            (m.attributeName === 'style' || m.attributeName === 'data-inking')
          );
        }
        if (m.type === 'childList') {
          const touched = [...Array.from(m.addedNodes), ...Array.from(m.removedNodes)];
          return touched.some((n) => !isInkNode(n));
        }
        return true;
      };
      mo = new MutationObserver((muts) => {
        if (muts.some(significant)) restart();
      });
      mo.observe(host, { subtree: true, childList: true, attributes: true, characterData: true });
    }
  };

  const tick = (): void => {
    if (cancelled) return;
    attempts++;
    const result = measure();
    if (result) {
      armHost(hostOf(result));
      const key = fingerprint(result);
      streak = key === lastKey ? streak + 1 : 1;
      lastKey = key;
      onResult(result);
      if (streak >= STABLE_STREAK) return; // settled — a later resize/mutation re-arms us
    }
    if (attempts >= MAX_POLLS) return; // give up cleanly; whatever's already placed stays placed
    timer = window.setTimeout(tick, POLL_MS);
  };

  const restart = (): void => {
    if (cancelled) return;
    attempts = 0;
    lastKey = null;
    streak = 0;
    window.clearTimeout(timer);
    // Deferred, not synchronous: resize events arrive in bursts (a drag fires dozens per
    // second), and a measure can now include the clear-space occupancy walk — one poll-interval
    // of settling coalesces the burst into a single re-measure.
    timer = window.setTimeout(tick, POLL_MS);
  };

  timer = window.setTimeout(tick, POLL_MS);
  window.addEventListener('resize', restart);

  return () => {
    cancelled = true;
    window.clearTimeout(timer);
    window.removeEventListener('resize', restart);
    ro?.disconnect();
    mo?.disconnect();
    transitionHost?.removeEventListener('transitionend', restart);
  };
}

/** Prefer the LAST match that's actually rendered: when two surfaces hold the same block (the
 *  story stage floating over the live canvas during an export, or a card swap's outgoing twin),
 *  the most recently mounted one — the one actually on top — is the card the pen should touch.
 *  But a later DOM match can just as easily be a hidden/detached leftover twin mid-transition, so
 *  skip anything with no rendered box before falling back to it. Where layout can't say either
 *  way (jsdom, or nothing on the list has ever laid out), this degrades to the plain last match. */
export function lastVisible(hosts: ArrayLike<HTMLElement>): HTMLElement | null {
  for (let i = hosts.length - 1; i >= 0; i--) {
    const r = hosts[i].getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return hosts[i];
  }
  return hosts[hosts.length - 1] ?? null;
}
