// Structural layouts — the slides that define a skin's typographic voice most: cover, section
// divider, closing, prose, and the big quote. These are bespoke full-frame compositions (not the
// shared SlideFrame) because the references give them distinct chrome. Every headline is sized by a
// content-length tier and clamped, so real-world text never overflows (see ./fit).
import { displayWeight, Footer, kickerFont, SlideFrame } from '../chrome/bits';
import type { SlideLayout, SlideSkin } from '../types';
import { BandFit } from './BandFit';
import {
  clampStyle,
  CLOSING_TIERS,
  COVER_TIERS,
  DIVIDER_TIERS,
  PROSE_BODY_TIERS,
  PROSE_HEADING_TIERS,
  PROSE_LEDE_TIERS,
  pickTier,
  QUOTE_TIERS,
  tierIndex,
  useAutoFit,
} from './fit';

const isSerif = (skin: SlideSkin): boolean =>
  skin.fonts.allSerif || /Serif|Garamond|Newsreader|Spectral|Bodoni/.test(skin.fonts.display);

/** A tiny 2-step ladder for the cover/closing standfirst: a torture-length subtitle shrinks and
 *  gains a clamp line instead of just ellipsizing hard at a single flat size. `base` is the skin's
 *  existing short-subtitle size, so Cover and Closing keep their own distinct scale. */
const subtitleTier = (
  len: number,
  base: number,
): { size: number; line: number; maxLines: number } =>
  len > 120 ? { size: base - 8, line: 1.34, maxLines: 4 } : { size: base, line: 1.32, maxLines: 3 };

/** Header row + hairline shared by cover/closing (kicker left, secondary right). */
function HeaderRule({ skin, left, right }: { skin: SlideSkin; left?: string; right?: string }) {
  const t = skin.tokens;
  return (
    <>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          font: `700 24px/1 ${kickerFont(skin)}`,
          letterSpacing: '0.22em',
          textTransform: 'uppercase',
          color: t.muted,
          gap: 32,
        }}
      >
        <span
          style={{
            color: 'var(--accent-ink)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            // A flex item's default min-width is its content size, which silently defeats
            // text-overflow: ellipsis (the box never shrinks below the full label, so an
            // overlong real topic just overflows past the date on its right instead of
            // truncating).
            minWidth: 0,
          }}
        >
          {left}
        </span>
        {right ? <span style={{ flex: '0 0 auto' }}>{right}</span> : null}
      </div>
      <div style={{ height: 1, background: t.rule, marginTop: 22 }} />
    </>
  );
}

export const Cover: SlideLayout<'cover'> = ({ slide, skin }) => {
  const t = skin.tokens;
  const d = slide.data;
  const { idx, ref } = useAutoFit(COVER_TIERS.length, tierIndex(d.title.length, COVER_TIERS));
  const tier = COVER_TIERS[idx];
  const subTier = d.subtitle ? subtitleTier(d.subtitle.length, 42) : null;
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        padding: t.pad,
        display: 'flex',
        flexDirection: 'column',
        boxSizing: 'border-box',
        overflow: 'hidden',
      }}
    >
      <HeaderRule skin={skin} left={slide.kicker ?? skin.brand.name} right={d.date} />
      <BandFit
        slideId={slide.id}
        skinId={skin.id}
        outerStyle={{ flex: '1 1 auto', minHeight: 0 }}
        style={{
          display: 'flex',
          flexDirection: 'column',
          // Anchor the title block in the lower third — the editorial-poster composition — so a
          // short title reads as deliberate scale instead of floating in an empty frame.
          justifyContent: 'flex-end',
          gap: 36,
          paddingBottom: 48,
        }}
      >
        <div
          aria-hidden
          style={{
            width: 140,
            height: 8,
            borderRadius: t.radius > 0 ? 4 : 0,
            background: 'var(--accent)',
            marginBottom: 12,
          }}
        />
        <div
          ref={ref}
          data-fit-tier={tier.size}
          style={{
            font: `${displayWeight(skin)} ${tier.size}px/${tier.line} ${skin.fonts.display}`,
            letterSpacing: '-0.02em',
            color: t.ink,
            textWrap: 'balance',
            ...clampStyle(tier.maxLines),
          }}
        >
          {d.title}
          <span style={{ color: 'var(--accent)' }}>.</span>
        </div>
        {d.subtitle && subTier ? (
          <div
            style={{
              font: `${isSerif(skin) ? '400 italic' : '400'} ${subTier.size}px/${subTier.line} ${isSerif(skin) ? skin.fonts.display : skin.fonts.body}`,
              color: t.muted,
              maxWidth: 1280,
              ...clampStyle(subTier.maxLines),
            }}
          >
            {d.subtitle}
          </div>
        ) : null}
      </BandFit>
      <div style={{ height: 1, background: t.rule, marginBottom: 22 }} />
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          font: `600 22px/1 ${kickerFont(skin)}`,
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
          color: t.muted,
        }}
      >
        <span
          style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            minWidth: 0,
          }}
        >
          {skin.brand.tagline}
        </span>
        {d.presenter ? (
          <span style={{ flex: '0 0 auto', marginLeft: 24 }}>{d.presenter}</span>
        ) : null}
      </div>
    </div>
  );
};

export const SectionDivider: SlideLayout<'sectionDivider'> = ({ slide, skin }) => {
  const t = skin.tokens;
  const d = slide.data;
  const len = d.title.length;
  const titleTier = pickTier(len, DIVIDER_TIERS);
  // Shrink the ghost numeral when the title is long, so the title column keeps a generous measure.
  const numeral = len > 80 ? 260 : len > 40 ? 320 : 420;
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: t.darkSurface,
        color: t.darkInk,
        display: 'flex',
        alignItems: 'center',
        padding: t.pad,
        boxSizing: 'border-box',
        overflow: 'hidden',
      }}
    >
      {d.number ? (
        <div
          aria-hidden
          style={{
            font: `${displayWeight(skin)} ${numeral}px/0.8 ${skin.fonts.display}`,
            color: `color-mix(in oklab, ${t.darkInk} 12%, transparent)`,
            letterSpacing: '-0.04em',
            // Shrinkable (not fixed) so a long title sharing the row doesn't get crowded out by a
            // wide numeral — the numeral is decoration, so a squeeze cropping it costs nothing.
            flex: '0 1 auto',
            minWidth: 0,
            overflow: 'hidden',
            marginRight: 80,
          }}
        >
          {d.number}
        </div>
      ) : null}
      {/* `alignSelf: stretch` gives this column the full padded frame height (the row's own
          `alignItems: center` only governs the numeral now), so BandFit has a real band to measure
          against instead of just this group's own natural, un-constrained content height. */}
      <BandFit
        slideId={slide.id}
        skinId={skin.id}
        outerStyle={{ alignSelf: 'stretch', minWidth: 0 }}
        style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}
      >
        <div
          style={{
            font: `700 24px/1 ${kickerFont(skin)}`,
            letterSpacing: '0.3em',
            textTransform: 'uppercase',
            color: t.darkAccent,
            marginBottom: 28,
          }}
        >
          {slide.kicker ?? 'Section'}
        </div>
        <div
          data-fit-tier={titleTier.size}
          style={{
            font: `${displayWeight(skin)} ${titleTier.size}px/${titleTier.line} ${skin.fonts.display}`,
            letterSpacing: '-0.02em',
            textWrap: 'balance',
            ...clampStyle(titleTier.maxLines),
          }}
        >
          {d.title}
        </div>
        {d.subtitle ? (
          <div
            style={{
              marginTop: 28,
              font: `400 ${isSerif(skin) ? 'italic ' : ''}38px/1.4 ${isSerif(skin) ? skin.fonts.display : skin.fonts.body}`,
              color: `color-mix(in oklab, ${t.darkInk} 70%, transparent)`,
              maxWidth: 1100,
              ...clampStyle(3),
            }}
          >
            {d.subtitle}
          </div>
        ) : null}
      </BandFit>
    </div>
  );
};

export const Closing: SlideLayout<'closing'> = ({ slide, skin, ctx }) => {
  const t = skin.tokens;
  const d = slide.data;
  const { idx, ref } = useAutoFit(CLOSING_TIERS.length, tierIndex(d.title.length, CLOSING_TIERS));
  const tier = CLOSING_TIERS[idx];
  const subTier = d.subtitle ? subtitleTier(d.subtitle.length, 40) : null;
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        padding: t.pad,
        display: 'flex',
        flexDirection: 'column',
        boxSizing: 'border-box',
        overflow: 'hidden',
      }}
    >
      <HeaderRule skin={skin} left={slide.kicker ?? skin.brand.name} />
      <BandFit
        slideId={slide.id}
        skinId={skin.id}
        outerStyle={{ flex: '1 1 auto', minHeight: 0 }}
        style={{
          display: 'flex',
          flexDirection: 'column',
          // Mirror the cover: the thank-you block sits low, over the footer, poster-style.
          justifyContent: 'flex-end',
          gap: 32,
          paddingBottom: 44,
        }}
      >
        <div
          aria-hidden
          style={{
            width: 140,
            height: 8,
            borderRadius: t.radius > 0 ? 4 : 0,
            background: 'var(--accent)',
            marginBottom: 8,
          }}
        />
        <div
          ref={ref}
          data-fit-tier={tier.size}
          style={{
            font: `${displayWeight(skin)} ${tier.size}px/${tier.line} ${skin.fonts.display}`,
            letterSpacing: '-0.02em',
            color: t.ink,
            textWrap: 'balance',
            ...clampStyle(tier.maxLines),
          }}
        >
          {d.title}
          <span style={{ color: 'var(--accent)' }}>.</span>
        </div>
        {d.subtitle && subTier ? (
          <div
            style={{
              font: `400 ${isSerif(skin) ? 'italic ' : ''}${subTier.size}px/${subTier.line} ${isSerif(skin) ? skin.fonts.display : skin.fonts.body}`,
              color: t.muted,
              maxWidth: 1200,
              ...clampStyle(subTier.maxLines),
            }}
          >
            {d.subtitle}
          </div>
        ) : null}
        {d.sources.length ? (
          <div
            style={{
              font: `600 22px/1.6 ${kickerFont(skin)}`,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: t.faint,
              maxWidth: 1400,
              ...clampStyle(2),
            }}
          >
            Sources — {d.sources.slice(0, 6).join(' · ')}
          </div>
        ) : null}
      </BandFit>
      <Footer skin={skin} ctx={ctx} />
    </div>
  );
};

/**
 * Split a prose body into an opening lede sentence and the remainder. The lede only splits out
 * when both halves are substantial — a short body stays whole and simply renders at lede scale,
 * so a one-liner never leaves a stranded fragment.
 */
function splitLede(body: string): { lede: string; rest?: string } {
  const t = body.trim();
  const m = t.match(/^[\s\S]{20,200}?[.!?](?=\s)/);
  if (!m) return { lede: t };
  const lede = m[0].trim();
  const rest = t.slice(m[0].length).trim();
  if (rest.length < 80) return { lede: t };
  return { lede, rest };
}

export const Prose: SlideLayout<'prose'> = ({ slide, skin, ctx }) => {
  const t = skin.tokens;
  const d = slide.data;
  const head = d.heading ? pickTier(d.heading.length, PROSE_HEADING_TIERS) : null;
  // The lede treatment spends vertical budget, so it only applies while the whole body still fits
  // beside it; the longest bodies keep the plain block that shows every character.
  const { lede, rest } = d.body.length <= 560 ? splitLede(d.body) : { lede: d.body };
  const asLede = !!rest || d.body.length <= 260;
  const ledeTier = pickTier(lede.length, PROSE_LEDE_TIERS);
  const bodyTier = pickTier((rest ?? d.body).length, PROSE_BODY_TIERS);
  return (
    <SlideFrame slideId={slide.id} skin={skin} ctx={ctx} kicker={slide.kicker}>
      <div style={{ maxWidth: 1480, display: 'flex', flexDirection: 'column', gap: 32 }}>
        <div
          aria-hidden
          style={{
            width: 110,
            height: 6,
            borderRadius: t.radius > 0 ? 3 : 0,
            background: 'var(--accent)',
          }}
        />
        {head ? (
          <div
            data-fit-tier={head.size}
            style={{
              font: `${displayWeight(skin)} ${head.size}px/${head.line} ${skin.fonts.display}`,
              letterSpacing: '-0.015em',
              color: t.ink,
              textWrap: 'balance',
              ...clampStyle(head.maxLines),
            }}
          >
            {d.heading}
          </div>
        ) : null}
        {asLede ? (
          <div
            data-fit-tier={ledeTier.size}
            style={{
              font: `${isSerif(skin) ? '400' : '500'} ${ledeTier.size}px/${ledeTier.line} ${isSerif(skin) ? skin.fonts.display : skin.fonts.body}`,
              letterSpacing: '-0.005em',
              color: t.ink,
              textWrap: 'balance',
              ...clampStyle(ledeTier.maxLines),
            }}
          >
            {lede}
          </div>
        ) : null}
        {rest || !asLede ? (
          <div
            data-fit-tier={bodyTier.size}
            style={{
              font: `${skin.fonts.bodyWeight ?? 400} ${bodyTier.size}px/${bodyTier.line} ${skin.fonts.body}`,
              color: t.muted,
              ...clampStyle(bodyTier.maxLines),
            }}
          >
            {rest ?? d.body}
          </div>
        ) : null}
      </div>
    </SlideFrame>
  );
};

export const Quote: SlideLayout<'quote'> = ({ slide, skin, ctx }) => {
  const t = skin.tokens;
  const d = slide.data;
  const { idx, ref } = useAutoFit(QUOTE_TIERS.length, tierIndex(d.body.length, QUOTE_TIERS));
  const tier = QUOTE_TIERS[idx];
  return (
    <SlideFrame slideId={slide.id} skin={skin} ctx={ctx} kicker={slide.kicker}>
      <div
        style={{
          maxWidth: 1520,
          margin: '0 auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 36,
        }}
      >
        <div
          style={{
            font: `${displayWeight(skin)} 180px/0.4 ${skin.fonts.display}`,
            color: 'var(--accent)',
            height: 80,
            overflow: 'hidden',
          }}
          aria-hidden
        >
          &ldquo;
        </div>
        <div
          ref={ref}
          data-fit-tier={tier.size}
          style={{
            font: `${isSerif(skin) ? 'italic ' : ''}${displayWeight(skin)} ${tier.size}px/${tier.line} ${skin.fonts.display}`,
            color: t.ink,
            letterSpacing: '-0.01em',
            textWrap: 'balance',
            ...clampStyle(tier.maxLines),
          }}
        >
          {d.body}
        </div>
        {d.attribution ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 24, marginTop: 12 }}>
            <span style={{ width: 64, height: 2, background: t.ink, flex: '0 0 auto' }} />
            <span
              style={{
                font: `600 24px/1.3 ${kickerFont(skin)}`,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: t.muted,
                ...clampStyle(2),
              }}
            >
              {d.attribution}
            </span>
          </div>
        ) : null}
      </div>
    </SlideFrame>
  );
};
