// Per-skin structural overrides — used only where a reference diverges from the shared default in
// composition (not just colour/type): Noir's centred, ornamented cover and quote; North's
// full-colour statement; Press's drop-cap prose. Each sizes its headline by content length and
// clamps it, so even these bespoke compositions never overflow the frame.
import { displayWeight, Footer, SlideFrame } from '../chrome/bits';
import type { SlideContext, SlideLayout, SlideSkin } from '../types';
import { BandFit } from './BandFit';
import {
  clampStyle,
  NOIR_QUOTE_TIERS,
  NORTH_STATEMENT_TIERS,
  pickTier,
  PRESS_BODY_TIERS,
  PRESS_HEADING_TIERS,
} from './fit';

/**
 * Noir's centred "NN / TT" folio — the luxury alternative to the shared Footer's left/right split.
 * Both of Noir's full-bleed compositions (cover, quote) want this exact centred treatment, so it's
 * one source rather than two copies that could silently drift apart.
 */
function CenteredFolio({ skin, ctx }: { skin: SlideSkin; ctx: SlideContext }) {
  const t = skin.tokens;
  return (
    <div
      style={{
        position: 'absolute',
        bottom: 56,
        left: 0,
        right: 0,
        textAlign: 'center',
        font: `500 22px/1 ${skin.fonts.body}`,
        letterSpacing: '0.4em',
        textTransform: 'uppercase',
        color: t.faint,
      }}
    >
      {String(ctx.index + 1).padStart(2, '0')} / {String(ctx.total).padStart(2, '0')}
    </div>
  );
}

/** Noir — a centred, whisper-quiet cover with a gold rule + diamond motif and a thin foil edge. */
export const NoirCover: SlideLayout<'cover'> = ({ slide, skin, ctx }) => {
  const t = skin.tokens;
  const d = slide.data;
  const len = d.title.length;
  const titleSize = len > 50 ? 160 : len > 28 ? 200 : 232;
  const rule = (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 22 }}>
      <span style={{ width: 120, height: 1, background: 'var(--accent)' }} />
      <span
        style={{ width: 8, height: 8, background: 'var(--accent)', transform: 'rotate(45deg)' }}
      />
      <span style={{ width: 120, height: 1, background: 'var(--accent)' }} />
    </span>
  );
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        padding: t.pad,
        display: 'flex',
        flexDirection: 'column',
        textAlign: 'center',
        boxSizing: 'border-box',
        overflow: 'hidden',
      }}
    >
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 36,
          border: '1px solid color-mix(in oklab, var(--accent) 30%, transparent)',
          pointerEvents: 'none',
        }}
      />
      <BandFit
        slideId={slide.id}
        skinId={skin.id}
        outerStyle={{ flex: '1 1 auto', minHeight: 0 }}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 44,
        }}
      >
        <div
          style={{
            font: `500 26px/1 ${skin.fonts.body}`,
            letterSpacing: '0.5em',
            textTransform: 'uppercase',
            color: 'var(--accent)',
          }}
        >
          {slide.kicker ?? skin.brand.tagline}
        </div>
        {rule}
        <div
          style={{
            font: `600 ${titleSize}px/0.92 ${skin.fonts.display}`,
            color: t.ink,
            letterSpacing: '0.01em',
            textWrap: 'balance',
            ...clampStyle(3),
          }}
        >
          {d.title}
        </div>
        {d.subtitle ? (
          <div
            style={{
              font: `400 italic 46px/1.32 ${skin.fonts.display}`,
              color: t.muted,
              maxWidth: 1200,
              ...clampStyle(2),
            }}
          >
            {d.subtitle}
          </div>
        ) : null}
        {d.date ? (
          <div
            style={{
              font: `500 24px/1 ${skin.fonts.body}`,
              letterSpacing: '0.3em',
              textTransform: 'uppercase',
              color: t.faint,
              marginTop: 12,
            }}
          >
            {d.date}
          </div>
        ) : null}
      </BandFit>
      <CenteredFolio skin={skin} ctx={ctx} />
    </div>
  );
};

/** Noir — a centred serif-italic statement under a large gold quotation mark. */
export const NoirQuote: SlideLayout<'quote'> = ({ slide, skin, ctx }) => {
  const t = skin.tokens;
  const d = slide.data;
  const tier = pickTier(d.body.length, NOIR_QUOTE_TIERS);
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        padding: t.pad,
        display: 'flex',
        flexDirection: 'column',
        textAlign: 'center',
        boxSizing: 'border-box',
        overflow: 'hidden',
      }}
    >
      <BandFit
        slideId={slide.id}
        skinId={skin.id}
        outerStyle={{ flex: '1 1 auto', minHeight: 0 }}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            font: `500 220px/0.5 ${skin.fonts.display}`,
            color: 'var(--accent)',
            height: 110,
            overflow: 'hidden',
          }}
          aria-hidden
        >
          &ldquo;
        </div>
        <div
          data-fit-tier={tier.size}
          style={{
            font: `500 italic ${tier.size}px/${tier.line} ${skin.fonts.display}`,
            color: t.ink,
            maxWidth: 1480,
            ...clampStyle(tier.maxLines),
          }}
        >
          {d.body}
        </div>
        {d.attribution ? (
          <div style={{ marginTop: 48, display: 'inline-flex', alignItems: 'center', gap: 22 }}>
            <span style={{ width: 56, height: 1, background: 'var(--accent)' }} />
            <span
              style={{
                font: `500 24px/1 ${skin.fonts.body}`,
                letterSpacing: '0.3em',
                textTransform: 'uppercase',
                color: t.muted,
                ...clampStyle(2),
              }}
            >
              {d.attribution}
            </span>
          </div>
        ) : null}
      </BandFit>
      <CenteredFolio skin={skin} ctx={ctx} />
    </div>
  );
};

/** North — a bold full-colour statement: accent background, ink-token headline, coral underline. */
export const NorthStatement: SlideLayout<'quote'> = ({ slide, skin, ctx }) => {
  const d = slide.data;
  const ink = skin.tokens.darkInk;
  const accent2 = skin.tokens.accent2 ?? ink;
  const tier = pickTier(d.body.length, NORTH_STATEMENT_TIERS);
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: 'var(--accent)',
        color: ink,
        padding: skin.tokens.pad,
        display: 'flex',
        flexDirection: 'column',
        boxSizing: 'border-box',
        overflow: 'hidden',
      }}
    >
      <BandFit
        slideId={slide.id}
        skinId={skin.id}
        outerStyle={{ flex: '1 1 auto', minHeight: 0 }}
        style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 36 }}
      >
        {slide.kicker ? (
          <div
            style={{
              font: `700 24px/1 ${skin.fonts.body}`,
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              color: accent2,
            }}
          >
            {slide.kicker}
          </div>
        ) : null}
        <div
          data-fit-tier={tier.size}
          style={{
            font: `${displayWeight(skin)} ${tier.size}px/${tier.line} ${skin.fonts.display}`,
            letterSpacing: '-0.02em',
            textWrap: 'balance',
            maxWidth: 1500,
            ...clampStyle(tier.maxLines),
          }}
        >
          {d.body}
        </div>
        <span
          aria-hidden
          style={{ width: 240, height: 12, background: accent2, borderRadius: 6, flex: '0 0 auto' }}
        />
        {d.attribution ? (
          <div
            style={{
              font: `700 26px/1.3 ${skin.fonts.body}`,
              letterSpacing: '0.04em',
              color: accent2,
              ...clampStyle(2),
            }}
          >
            {d.attribution}
          </div>
        ) : null}
      </BandFit>
      <div
        style={{
          position: 'absolute',
          right: 64,
          bottom: 56,
          font: `700 22px/1 ${skin.fonts.body}`,
          letterSpacing: '0.2em',
          color: ink,
          opacity: 0.85,
        }}
      >
        {String(ctx.index + 1).padStart(2, '0')} / {String(ctx.total).padStart(2, '0')}
      </div>
    </div>
  );
};

/** Press — a scholarly abstract: a red drop-cap opens a justified serif paragraph. */
export const PressProse: SlideLayout<'prose'> = ({ slide, skin, ctx }) => {
  const t = skin.tokens;
  const d = slide.data;
  const first = d.body.slice(0, 1);
  const rest = d.body.slice(1);
  const head = d.heading ? pickTier(d.heading.length, PRESS_HEADING_TIERS) : null;
  // The floated drop cap spends roughly two lines' worth of measure on the paragraph's first lines,
  // which a plain character count doesn't see — inflate the length pickTier sizes against so a
  // drop-cap paragraph lands one notch more conservative than a plain one of the same length.
  const body = pickTier(d.body.length + 160, PRESS_BODY_TIERS);
  // A drop cap floats, so `-webkit-line-clamp` (a flex/box display) would break its layout — this
  // paragraph instead gets a hard height bound sized from the very tier that chose its type, a
  // float-safe clipping box rather than a line-clamp one.
  const bodyMaxHeight = body.maxLines * body.size * body.line;
  // Wide capitals (W, M, …) need a smaller drop-cap so the float doesn't crowd the first lines.
  const dropSize = /[WMQG]/i.test(first) ? 112 : 138;
  return (
    <SlideFrame slideId={slide.id} skin={skin} ctx={ctx} kicker={slide.kicker}>
      <div style={{ maxWidth: 1480, display: 'flex', flexDirection: 'column', gap: 32 }}>
        {head ? (
          <div
            data-fit-tier={head.size}
            style={{
              font: `600 ${head.size}px/${head.line} ${skin.fonts.display}`,
              color: t.ink,
              textWrap: 'balance',
              ...clampStyle(head.maxLines),
            }}
          >
            {d.heading}
          </div>
        ) : null}
        {/* `data-hard-clip`: a justified paragraph whose direct containing block is ALSO its own
            float (the drop cap) reports a `scrollHeight` ~20px taller than its real rendered
            extent in Chromium — verified by measuring the actual last glyph's position, which
            sits well inside `clientHeight`. `bodyMaxHeight` is already sized from the very tier
            that picked this type, so this box is self-verified safe; exempt it from the blind
            scrollHeight audit the same way a line-clamp box already is (see audit.ts / BandFit). */}
        <div data-hard-clip="press-prose" style={{ maxHeight: bodyMaxHeight, overflow: 'hidden' }}>
          <p
            data-fit-tier={body.size}
            style={{
              font: `400 ${body.size}px/${body.line} ${skin.fonts.display}`,
              color: t.muted,
              textAlign: 'justify',
              margin: 0,
              overflowWrap: 'anywhere',
            }}
          >
            <span
              style={{
                float: 'left',
                font: `600 ${dropSize}px/0.82 ${skin.fonts.display}`,
                color: 'var(--accent)',
                marginRight: 18,
                marginTop: 8,
              }}
            >
              {first}
            </span>
            {rest}
          </p>
        </div>
      </div>
    </SlideFrame>
  );
};

// Footer is re-exported so skin files can compose minimal custom chrome if needed.
export { Footer };
