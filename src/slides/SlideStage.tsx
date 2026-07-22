// Two ways to put a slide on screen, sharing one fixed-size canvas:
//   • SlideCanvas — the slide at its true 1920×1080 design size (a `.slide-page` block). Layouts
//     transcribe reference pixel values directly into it; raster + vector print capture it 1:1.
//   • SlideStage — wraps SlideCanvas in a transform-scale so the same DOM fits a tiny preview or a
//     full-screen Present stage. Preview/Present scale; raster/print don't — so the PDF matches.
import { type CSSProperties, useLayoutEffect, useRef, useState } from 'react';
import type { Slide } from './model/Slide';
import { Decor, STAGE_H, STAGE_W } from './skins/chrome/bits';
import { FigureStatic } from './skins/figureMotion';
import { SHARED_LAYOUTS } from './skins/layouts';
import { computeStageFit } from './stageFit';
import type { SlideContext, SlideSkin } from './skins/types';

/** Resolve a skin's override or the shared default for a slide, and render it. */
function SlideBody({ slide, skin, ctx }: { slide: Slide; skin: SlideSkin; ctx: SlideContext }) {
  // The map is keyed by kind; the resolved component's props match the slide's kind by construction.
  const Layout = (skin.layouts[slide.kind] ?? SHARED_LAYOUTS[slide.kind]) as React.FC<{
    slide: Slide;
    skin: SlideSkin;
    ctx: SlideContext;
  }>;
  return <Layout slide={slide} skin={skin} ctx={ctx} />;
}

export type SlideCanvasProps = {
  slide: Slide;
  skin: SlideSkin;
  ctx: SlideContext;
  /** Override accent (export accent picker). Sets --accent/--tint on the slide root. */
  accent?: string;
  style?: CSSProperties;
};

/** A slide at its true 1920×1080 size — the unit raster + print capture, and the filmstrip scales. */
export function SlideCanvas({ slide, skin, ctx, accent, style }: SlideCanvasProps) {
  const t = skin.tokens;
  const tint = accent ? `color-mix(in oklab, ${accent} 12%, ${t.paper})` : t.tint;
  // `--accent` is the bright fill knob; `--accent-ink` is the text-grade tone (a darker tint of the
  // accent that stays legible as small text on paper). An export override drives both.
  const vars = {
    '--accent': accent ?? t.accent,
    '--tint': tint,
    '--accent-ink': accent ?? t.accentInk ?? t.accent,
  } as CSSProperties;
  return (
    <div
      className="slide-page"
      style={{
        ...vars,
        position: 'relative',
        width: STAGE_W,
        height: STAGE_H,
        background: t.paper,
        color: t.ink,
        overflow: 'hidden',
        fontFamily: skin.fonts.body,
        // Keep slide colours stable regardless of the app's light/dark scheme.
        colorScheme: t.dark ? 'dark' : 'light',
        ...style,
      }}
    >
      <Decor skin={skin} />
      <div style={{ position: 'absolute', inset: 0, zIndex: 1 }}>
        <SlideBody slide={slide} skin={skin} ctx={ctx} />
      </div>
    </div>
  );
}

export type SlideStageProps = SlideCanvasProps & {
  /** 'fit' (default) auto-scales to the container; a number is an explicit scale. */
  scale?: number | 'fit';
  className?: string;
};

/** A slide scaled to fit its parent (preview / Present / filmstrip). */
export function SlideStage({
  slide,
  skin,
  ctx,
  accent,
  scale = 'fit',
  className,
  style,
}: SlideStageProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [auto, setAuto] = useState(typeof scale === 'number' ? scale : 0.2);

  useLayoutEffect(() => {
    if (scale !== 'fit') {
      setAuto(scale);
      return;
    }
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => setAuto(computeStageFit(el.clientWidth, el.clientHeight));
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [scale]);

  return (
    <div
      ref={wrapRef}
      className={className}
      style={{
        position: 'relative',
        width: '100%',
        height: scale === 'fit' ? '100%' : STAGE_H * auto,
        overflow: 'hidden',
        // Centers the scaled stage in its frame. This matters once the scale is capped at 1 (a
        // container roomier than the design canvas, e.g. Present on an ultrawide/4K display) —
        // without centering, the letterboxed slide would sit pinned to the top-left corner instead
        // of sitting evenly in the middle of its frame.
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        ...style,
      }}
    >
      <div style={{ width: STAGE_W, height: STAGE_H, flex: 'none', transform: `scale(${auto})` }}>
        {/* A scaled stage is the live preview / Present surface (never the raster) — let embedded
            figures animate in and stay interactive here. */}
        <FigureStatic.Provider value={false}>
          <SlideCanvas slide={slide} skin={skin} ctx={ctx} accent={accent} />
        </FigureStatic.Provider>
      </div>
    </div>
  );
}
