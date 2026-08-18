// Every animation on the captured stage, put under the recorder's clock instead of the machine's.
//
// All of the stage's motion is declarative CSS — card entrances are @starting-style transitions,
// the spotlight glide is a transform transition, the ink is CSS, and the face is pure CSSAnimation
// with no JS timer behind it. That means the browser has already built an `Animation` object for
// each one, and pausing it and assigning `currentTime` moves it to any pose we ask for. Nothing
// here touches a component, a stylesheet, or a transform on `.presence`: it seeks objects the
// stylesheet itself created.
//
// Verified in a real browser before this was built on: `host.getAnimations({subtree: true})`
// returns the stylesheet's own CSSAnimation objects, and a paused animation seeked to mid-flight
// rasterizes at THAT pose inside modern-screenshot's foreignObject clone — the clone copies
// computed style, so the seek is what it copies. (Chrome; a browser where it did not hold would
// export frozen motion rather than wrong motion, and one with no `getAnimations` never reaches
// this file — see the wall-clock fallback in capture.ts.)
//
// The one rule that makes it look right: an animation's baseline is the media time at which it was
// FIRST seen, and baselines survive re-scans. A card entrance registered when its scene lands
// starts from zero, while the face's bob — registered once, at the top of the pass, outside the
// keyed turn wrapper — keeps advancing across every scene exactly as it does live.

export interface AnimationRegistry {
  /** Re-scan the host subtree at media time `tMs`, baselining and pausing anything new. */
  refresh(tMs: number): void;
  /** Move every registered animation to media time `tMs`. */
  seek(tMs: number): void;
  /** True when anything animating inside `root` is in its active phase at the last seeked time. */
  activeInside(root: Element): boolean;
  /** True when anything animating OUTSIDE `root` (everything, when `root` is null) is in its
   *  active phase at the last seeked time — i.e. whether the static base layer can be reused. */
  activeOutside(root: Element | null): boolean;
  /** Hand the animations back to the browser's clock. */
  release(): void;
}

/** A paused animation still reports where it sits: `progress` is null outside the active phase,
 *  which is precisely "this animation cannot change the picture right now". */
function inActivePhase(animation: Animation): boolean {
  const timing = animation.effect?.getComputedTiming();
  return timing?.progress !== null && timing?.progress !== undefined;
}

/** The element an effect paints into; a pseudo-element effect reports its originating element. */
function effectTarget(animation: Animation): Element | null {
  const effect = animation.effect;
  if (!effect || !('target' in effect)) return null;
  return (effect as KeyframeEffect).target;
}

export function createAnimationRegistry(host: HTMLElement): AnimationRegistry {
  // Per-pass, so one export can never inherit another's baselines. Weak so a card that scrolled out
  // of the DOM takes its entrance animation with it.
  const baselines = new WeakMap<Animation, number>();
  let tracked: { animation: Animation; target: Element | null }[] = [];

  return {
    refresh(tMs) {
      tracked = host.getAnimations({ subtree: true }).map((animation) => {
        if (!baselines.has(animation)) {
          baselines.set(animation, tMs);
          try {
            animation.pause();
          } catch {
            /* an already-finished or cancelled animation has nothing to pause */
          }
        }
        return { animation, target: effectTarget(animation) };
      });
    },
    seek(tMs) {
      for (const { animation } of tracked) {
        try {
          animation.currentTime = tMs - (baselines.get(animation) ?? 0);
        } catch {
          /* seeking a cancelled animation throws; it paints nothing either way */
        }
      }
    },
    activeInside(root) {
      return tracked.some(
        ({ animation, target }) =>
          target !== null && root.contains(target) && inActivePhase(animation),
      );
    },
    activeOutside(root) {
      return tracked.some(
        ({ animation, target }) =>
          !(root && target && root.contains(target)) && inActivePhase(animation),
      );
    },
    release() {
      for (const { animation } of tracked) {
        try {
          animation.play();
        } catch {
          /* nothing left to resume */
        }
      }
      tracked = [];
    },
  };
}
