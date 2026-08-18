// Small building blocks shared across the landing sections: a scroll-reveal wrapper and a
// centered section header. Keeping these here keeps each section file focused on its own content.
import { useState, type CSSProperties, type ReactNode } from 'react';
import { useAmbientPause, useInView } from '../hooks/useInView';

/** A landing section that fades/rises in the first time it scrolls into view. `onIntent` (optional)
 *  fires the first time the user reaches toward this section — hover, focus, or touch — used to warm
 *  a lazy resource just before it's needed (e.g. the demo section prefetches the demo content).
 *
 *  Two observers on the same element, deliberately: MOUNT fires 480px early so the lazy chunk
 *  imports and lays out before the visitor arrives, while the `.in` REVEAL fires only when the
 *  section actually approaches the viewport — every section carries a one-shot entrance
 *  choreography, and a single early observer would play it 480px offscreen to nobody. */
export function Reveal({
  children,
  className,
  id,
  onIntent,
  defer = false,
  reserve = 480,
}: {
  children: ReactNode;
  className?: string;
  id?: string;
  onIntent?: () => void;
  /** Keep expensive below-fold children unmounted until the section is near the viewport. */
  defer?: boolean;
  /** Stable placeholder height while deferred, preventing scroll jumps during lazy import. */
  reserve?: number;
}) {
  const [intent, setIntent] = useState(false);
  const shared = {
    // The landing scrolls in the presence stage, not the window — without the scroller as
    // the observer root, rootMargin never applies and every section mounts black-first at
    // the viewport edge.
    nearestScrollRoot: defer,
    // The only non-deferred section is the above-the-fold hero, whose position is known by
    // construction. Deferred sections can wait for IntersectionObserver: reading nine section
    // rects in layout effects forced the browser to lay out the entire long landing before its
    // first paint on slow CPUs.
    initiallyVisible: !defer,
    measureInitial: false,
  };
  const [mountRef, nearView] = useInView<HTMLElement>({
    rootMargin: defer ? '480px 0px' : undefined,
    threshold: defer ? 0 : undefined,
    ...shared,
  });
  const [revealRef, inView] = useInView<HTMLElement>(shared);
  // The entrance is a one-way door (`useInView` defaults to once), so `inView` above can't answer
  // "is this section on screen RIGHT NOW" — which is the question the section's ambient loops need.
  // A scrolled-past section keeps animating otherwise: sixteen infinite loops live in the landing's
  // lower sections alone, and nobody is looking at any of them.
  const ambientRef = useAmbientPause<HTMLElement>();
  const active = !defer || nearView || intent;
  const signalIntent = () => {
    if (defer) setIntent(true);
    onIntent?.();
  };
  return (
    <section
      ref={(el) => {
        mountRef.current = el;
        revealRef.current = el;
        ambientRef.current = el;
      }}
      id={id}
      className={
        'fl-section fl-reveal' +
        (inView ? ' in' : '') +
        (defer ? ' fl-deferred' : '') +
        (className ? ' ' + className : '')
      }
      style={defer ? ({ '--fl-reserve': `${reserve}px` } as CSSProperties) : undefined}
      onPointerEnter={signalIntent}
      onFocusCapture={signalIntent}
      onTouchStart={signalIntent}
    >
      {active ? children : null}
    </section>
  );
}

/** The eyebrow + serif title (+ optional sub) that opens most sections. */
export function SectionHead({
  eyebrow,
  children,
  sub,
}: {
  eyebrow: string;
  children: ReactNode;
  sub?: ReactNode;
}) {
  return (
    <div className="fl-head">
      <div className="fl-eyebrow">{eyebrow}</div>
      <h2 className="fl-title">{children}</h2>
      {sub && <p className="fl-sub">{sub}</p>}
    </div>
  );
}
