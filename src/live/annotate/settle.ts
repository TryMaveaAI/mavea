// Shared measure-until-still machinery for everything that anchors to live card geometry —
// the per-card ink portals (AnnotationLayer) and the margin-note rail (MarginNoteRail). Cards
// stream in, reveal, scale under the spotlight, and re-tile on resize; anything positioned
// against them must measure until the layout is genuinely at rest, then stay armed — on the
// region's own resize/mutation/transition events — for the next movement, rather than trusting a
// one-shot delay.

const POLL_MS = 100; // how often a not-yet-settled measurement is retried while it may still be moving
const SLOW_POLL_MS = 500; // …and once a region has proven it does not come to rest (see `nextDelay`)
const MAX_FAST_POLLS = 18; // ~1.8s at the fast cadence — generous for a reveal or a takeover's entrance
const MAX_SLOW_POLLS = 12; // then ~6s of slow follow-up before a moving region is left where it is
const STABLE_STREAK = 2; // this many identical reads in a row reads as "stopped moving"
const MISSING_STREAK = 2; // two empty reads hide stale ink without blinking on a one-frame swap

/** Chrome the pen itself renders (or the badge state it stamps on the host) — mutations there
 *  are our own echo, never a reason to re-measure. Without this filter every placement would
 *  mutate the card, which would restart the poll, which would place again: a feedback loop. */
const INK_CHROME = '.ink-layer, .ink-connect-layer, .note-rail';

function isInkNode(n: Node): boolean {
  const el = n instanceof Element ? n : n.parentElement;
  return !!el?.closest(INK_CHROME);
}

/** Measure until the result's geometry (per `fingerprint`) stops changing for `STABLE_STREAK` reads
 *  in a row, reporting every successful read along the way via `onResult`. One missing read is
 *  treated as transient (a card mid-reveal or a host swapping this frame); two consecutive misses
 *  call `onMissing`, because an accordion/tab that closed must not leave its old stroke floating
 *  over blank space. Observers stay armed, so reopening the target redraws it in the new geometry.
 *
 *  Once settled, further reads are EVENT-DRIVEN: the resolved host's own resize (a card that grows
 *  from streamed content), a window resize, the host's transitions landing, and any real content
 *  mutation inside the host (a block sorting its rows, a toggle revealing more of them — neither
 *  changes the host's outer box, so only a mutation observer sees them). The timer is the bounded
 *  fallback for the movement none of those can report: geometry that changed because something
 *  OUTSIDE the host did (the grid re-tiling under it, an ancestor's transform).
 *
 *  It is bounded twice over, which is what keeps a mark on a streaming canvas from re-measuring
 *  forever. An event no longer resets the settle state, so a re-arm whose geometry reproduces what
 *  is already drawn confirms it in ONE read instead of paying a fresh two-read settle — churn that
 *  doesn't move the mark (a countdown ticking, a card growing below it) costs a single read. And a
 *  region that keeps genuinely moving spends its fast budget once, then drops to `SLOW_POLL_MS` and
 *  finally stops chaining, after which each event buys exactly one read rather than a new burst.
 *  Settling refills the budget, so a card that comes to rest is back on the fast path.
 *
 *  Returns a cleanup that stops every timer/observer it started. */
export function pollUntilSettled<T>(
  measure: () => T | null,
  fingerprint: (result: T) => string,
  hostOf: (result: T) => HTMLElement,
  onResult: (result: T) => void,
  onMissing?: () => void,
): () => void {
  let cancelled = false;
  let timer: number | undefined;
  /** Reads taken since this region last held still — the budget that decides the cadence and when
   *  to stop chaining. Only a settled read refills it; events never do. */
  let attempts = 0;
  let lastKey: string | null = null;
  let streak = 0;
  let missingStreak = 0;
  let missingReported = false;
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

  /** How long before the next read. Fast while the layout is plausibly still settling; slow once
   *  this region has burned its fast budget without ever holding still, so following a canvas that
   *  streams for ten seconds costs a fifth as much and coalesces bursts into a wider window. */
  const nextDelay = (): number => (attempts >= MAX_FAST_POLLS ? SLOW_POLL_MS : POLL_MS);

  const tick = (): void => {
    if (cancelled) return;
    const result = measure();
    if (result) {
      missingStreak = 0;
      missingReported = false;
      armHost(hostOf(result));
      const key = fingerprint(result);
      streak = key === lastKey ? streak + 1 : 1;
      lastKey = key;
      onResult(result);
      if (streak >= STABLE_STREAK) {
        attempts = 0; // at rest: the region earns its fast budget back for the next real move
        return; // settled — a later resize/mutation re-arms us
      }
    } else if (lastKey !== null) {
      missingStreak++;
      if (missingStreak >= MISSING_STREAK && !missingReported) {
        missingReported = true;
        onMissing?.();
      }
    }
    attempts++;
    // Nothing has ever landed here: the old ceiling stands. A target that hasn't resolved in ~1.8s
    // isn't going to (the model named text this card doesn't carry), and re-measuring a card that
    // will never answer is pure cost. Once something IS placed, a still-moving region is followed
    // at the slow cadence for a while longer before we leave the mark where it is.
    const ceiling = lastKey === null ? MAX_FAST_POLLS : MAX_FAST_POLLS + MAX_SLOW_POLLS;
    if (attempts >= ceiling) return; // stop polling; an armed observer can still re-measure later
    timer = window.setTimeout(tick, nextDelay());
  };

  const restart = (): void => {
    if (cancelled) return;
    window.clearTimeout(timer);
    // A mark that has NEVER placed gets its budget back, because a re-arm means the page just
    // changed and the text it is looking for may only now exist — spending a budget meant for
    // following a MOVING mark on one that has never resolved is the wrong trade. (Note: before a
    // host resolves there are no element observers armed, so the only re-arm here is a window
    // resize; this hardens the intent rather than changing the common path.)
    if (lastKey === null) attempts = 0;
    // For an ALREADY-PLACED mark this is deliberately NOT a reset of `lastKey`/`streak`/`attempts`. The settle state describes the
    // REGION, not one burst of events: an event whose re-measure reproduces the placed geometry is
    // the confirming read, so a card mutating its way through a stream settles again in one read
    // instead of restarting a two-read chain per delta — and a region that never settles can't
    // buy a fresh fast budget by mutating, which is exactly how the poll used to run at 10Hz for
    // the whole length of an answer.
    // Deferred, not synchronous: resize events arrive in bursts (a drag fires dozens per
    // second), and a measure can now include the clear-space occupancy walk — one poll-interval
    // of settling coalesces the burst into a single re-measure.
    timer = window.setTimeout(tick, nextDelay());
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
