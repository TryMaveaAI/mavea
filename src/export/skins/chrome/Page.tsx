// The page sheet every skin shares: a fixed flex column (Letter or A4) that paints the skin's
// paper, exposes --accent/--tint as CSS variables (so the modal's accent override flows to every
// section for free), pins the footer to the bottom, and stacks the content column between header
// and footer. Skins never reimplement this — they fill the slots.
import type { ReactNode } from 'react';
import { pageSize, SECTION_GAP, type PageFormat } from '../../paginate/geometry';
import type { TemplateSkin } from '../types';

/** Inline-style type that also permits CSS custom properties. */
type Style = React.CSSProperties & Record<`--${string}`, string | number>;

export function Page({
  skin,
  header,
  footer,
  accent,
  format,
  children,
}: {
  skin: TemplateSkin;
  header: ReactNode;
  footer: ReactNode;
  /** Per-export accent override (defaults to the skin's signature accent). */
  accent?: string;
  /** Letter (the default) or A4 — see export-print.css's `data-format` gate for the print path. */
  format: PageFormat;
  children: ReactNode;
}) {
  const t = skin.tokens;
  const size = pageSize(format);
  // `--tint` is the wash of `--accent`, so an override has to carry its own wash with it — left at
  // the skin's value, overridden accent text lands on chips mixed from the ORIGINAL accent. Only a
  // genuinely different accent derives one: the modal always passes an accent (its own default
  // being the skin's), and each skin's authored tint is hand-tuned, so it must survive untouched.
  const tint =
    accent && accent !== t.accent ? `color-mix(in oklab, ${accent} 10%, ${t.pageBg})` : t.tint;
  const style: Style = {
    width: size.width,
    // A HARD box (not minHeight): pagination + the re-measure loop guarantee content fits, so the
    // sheet stays exactly one page and rasterizes 1:1 — a too-tall page would have grown and then
    // been squashed into the fixed PDF page, distorting the whole sheet.
    height: size.height,
    boxSizing: 'border-box',
    // backgroundColor, not the `background` shorthand: the shorthand resets backgroundImage/
    // backgroundSize on every render, so mixing it with those two longhands here made React warn
    // on every skin switch (Terminal's dot-grid pageBgImage vs. every other skin's plain color).
    backgroundColor: t.pageBg,
    backgroundImage: t.pageBgImage,
    backgroundSize: t.pageBgSize,
    borderLeft: t.pageBorderLeft,
    color: t.ink,
    fontFamily: skin.fonts.body,
    padding: t.padding,
    borderRadius: t.radius,
    display: 'flex',
    flexDirection: 'column',
    position: 'relative',
    overflow: 'hidden',
    '--accent': accent ?? t.accent,
    '--tint': tint,
  };
  return (
    <section
      className="ex-page"
      data-dark={t.dark ? '1' : undefined}
      data-format={format === 'a4' ? 'a4' : undefined}
      style={style}
    >
      {header}
      <div
        className="ex-content"
        style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: SECTION_GAP }}
      >
        {children}
      </div>
      {footer}
    </section>
  );
}
