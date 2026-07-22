// Small shared building blocks the archetype renderers compose: the "FIG. 1 — TITLE ———"
// section header and a couple of label helpers. Token-driven so they read correct in every
// skin; accent comes through the inherited --accent CSS variable set by Page.
import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { TemplateSkin } from '../types';

/** The label/eyebrow family — mono where the skin has one, else its body face. */
function labelFont(skin: TemplateSkin): string {
  return skin.fonts.mono ?? skin.fonts.body;
}

/** The scale to shrink a natural-width line of text into the box it was actually given: never
 *  above 1 (this only shrinks, never enlarges), and 1 whenever either side hasn't measured yet
 *  (SSR/jsdom, or the frame before layout has run) — same guard shape as embed/fitScale.ts. */
function lineScale(naturalW: number, availW: number): number {
  if (!(naturalW > 0) || !(availW > 0)) return 1;
  return Math.min(1, availW / naturalW);
}

/**
 * A single line of text that must never wrap and must never overflow its box, for content whose
 * length isn't bounded by construction (a real heading, a computed stat) — unlike plain
 * `white-space: nowrap`, which stops the wrap but lets the text spill past its container instead.
 *
 * The outer element is an ordinary flex/grid child, so the surrounding layout (the global
 * `min-width: 0` net included) sizes its box exactly as it would size any other label — that box
 * width, read after mount, is the "available width". The inner element forces `nowrap` so its
 * `scrollWidth` is the text's true, unbroken natural width regardless of how narrow the outer box
 * got squeezed to. Scaling the inner down to fit is a `transform`, which CSS excludes from layout
 * sizing entirely — so this changes nothing about the outer box's own size or any sibling's
 * position; only the text's own paint shrinks.
 *
 * The `data-fit-line` marker exists for the overflow audit (export/lab/audit.ts): a `transform:
 * scale()` shrinks what's PAINTED, not the outer span's own `scrollWidth`, which keeps reporting
 * `inner`'s full unscaled width — a correctly-fitted line and a genuinely-clipped one are
 * indistinguishable by box measurement alone, so the audit exempts this marker the same way it
 * exempts `.figure-embed`'s own scale-to-fit frame.
 */
export function FitLine({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  const outerRef = useRef<HTMLSpanElement>(null);
  const innerRef = useRef<HTMLSpanElement>(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;
    const measure = () => setScale(lineScale(inner.scrollWidth, outer.clientWidth));
    measure();
    // A live skin swap changes the font (inner's natural width) and a page-format swap changes the
    // column (outer's available width) — neither touches `children`, so the effect above wouldn't
    // otherwise re-fire and a scale computed for the OLD font/width would be left applied to the
    // NEW one, under-shrinking the line into real overflow. Re-measuring on any genuine size change
    // (the same technique FigureEmbed uses for its own scale-to-fit) keeps this correct across a
    // live switch, not just on first mount — ResizeObserver reports each box's untransformed layout
    // size, so it sees inner's true natural width even while `scale` is actively shrinking its paint.
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(outer);
    ro.observe(inner);
    return () => ro.disconnect();
  }, [children]);

  return (
    <span ref={outerRef} data-fit-line style={{ ...style, display: 'block', overflow: 'hidden' }}>
      <span
        ref={innerRef}
        style={{
          display: 'inline-block',
          whiteSpace: 'nowrap',
          transformOrigin: 'left',
          transform: scale < 1 ? `scale(${scale})` : undefined,
        }}
      >
        {children}
      </span>
    </span>
  );
}

/** The ruled section header: an optional "FIG. N" accent tag, the title, and a hairline fill. */
export function SectionHeading({
  skin,
  label,
  fig,
  trailing,
}: {
  skin: TemplateSkin;
  label?: string;
  /** A figure number ("1") → renders an accent "FIG. 1" prefix like the reference. */
  fig?: string;
  /** Optional right-aligned note before the rule fills (e.g. "SCALE 1–3"). */
  trailing?: string;
}) {
  if (!label && !fig && !trailing) return null;
  const mono = labelFont(skin);
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 16 }}>
      {fig && (
        <span
          style={{
            font: `600 11px/1 ${mono}`,
            letterSpacing: '.14em',
            color: 'var(--accent)',
            // "FIG. N" is a short, fixed-format tag (a figure counter), never arbitrary content —
            // it keeps a hard nowrap + flexShrink:0 so it is never touched by the row's shrink
            // distribution, unlike `label` below, which is real (unbounded) heading text and
            // absorbs that shrink via FitLine instead.
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
        >
          FIG. {fig}
        </span>
      )}
      {label && (
        <FitLine
          style={{
            font: `600 11px/1 ${mono}`,
            letterSpacing: '.14em',
            textTransform: 'uppercase',
            color: skin.tokens.ink,
          }}
        >
          {label}
        </FitLine>
      )}
      <span style={{ flex: 1, height: 1, background: skin.tokens.rule }} />
      {trailing && (
        <span
          style={{
            font: `500 10px/1 ${mono}`,
            letterSpacing: '.06em',
            color: skin.tokens.faint,
            // Always a short, fixed-format tag too ("SCALE 1–3", a figure kind like "SANKEY") —
            // same reasoning as `fig` above.
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
        >
          {trailing}
        </span>
      )}
    </div>
  );
}

/** A subtle italic caption under a figure (the reference's footnote line). */
export function Caption({ skin, text }: { skin: TemplateSkin; text: string }) {
  return (
    <p
      style={{
        margin: '14px 0 0',
        fontSize: 12.5,
        lineHeight: 1.5,
        color: skin.tokens.muted,
        fontStyle: 'italic',
      }}
    >
      {text}
    </p>
  );
}
