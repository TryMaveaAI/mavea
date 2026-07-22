// The figure layout: a rich canvas component (a Sankey, a state machine, a candlestick, a code
// listing) shown at full fidelity on stage — themed to the deck skin and scaled to fit the frame —
// instead of being flattened to bars. The heading and caption are set in the deck's own type; the
// visual comes from `canvas/embed`. The presentation cousin of the document's figure section.
import { useContext } from 'react';
import { FigureEmbed, type FigurePalette } from '../../../canvas/embed';
import { parsePadding } from '../../../export/paginate/geometry';
import { SlideFrame, STAGE_H, STAGE_W } from '../chrome/bits';
import { FigureStatic } from '../figureMotion';
import type { SlideLayout, SlideSkin } from '../types';
import { clampStyle, titleTier } from './fit';

const displayWeight = (skin: SlideSkin): number =>
  skin.fonts.displayWeight ?? (skin.fonts.allSerif ? 500 : 700);

/** Adapt the slide skin's palette to the shared figure-embed token bridge. */
function paletteFor(skin: SlideSkin): FigurePalette {
  const t = skin.tokens;
  return {
    dark: !!t.dark,
    paper: t.paper,
    ink: t.ink,
    muted: t.muted,
    faint: t.faint,
    accent: t.accent,
    accentInk: t.accentInk,
    accent2: t.accent2,
    tint: t.tint,
    rule: t.rule,
    ruleStrong: t.ruleStrong,
    track: t.track,
    card: t.card,
    font: skin.fonts.body,
    mono: skin.fonts.mono,
  };
}

export const Figure: SlideLayout<'figure'> = ({ slide, skin, ctx }) => {
  const t = skin.tokens;
  const d = slide.data;
  // Static (frozen) for a raster capture; the live preview / Present stage flips this so figures
  // animate in and stay interactive.
  const frozen = useContext(FigureStatic);
  const pad = parsePadding(skin.tokens.pad);
  const head = d.heading ? titleTier(d.heading.length) : null;
  // The content band the figure may occupy: the frame minus the kicker/footer chrome and the
  // heading/caption we stack around it. FigureEmbed scales the real component to fit this height,
  // so it can never overflow the 1920×1080 frame.
  const reserved = 150 + (head ? 160 : 0) + (d.caption ? 80 : 0);
  const frame = {
    w: STAGE_W - pad.left - pad.right,
    h: Math.max(380, STAGE_H - pad.top - pad.bottom - reserved),
  };
  return (
    <SlideFrame slideId={slide.id} skin={skin} ctx={ctx} kicker={slide.kicker}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 30, minWidth: 0 }}>
        {head ? (
          <div
            data-fit-tier={head.size}
            style={{
              font: `${displayWeight(skin)} ${head.size}px/${head.line} ${skin.fonts.display}`,
              letterSpacing: '-0.015em',
              color: t.ink,
              ...clampStyle(head.maxLines),
            }}
          >
            {d.heading}
          </div>
        ) : null}
        <div style={{ display: 'flex', justifyContent: 'center', minWidth: 0 }}>
          {/* Width-capped diagrams may enlarge (bounded) so the stage frame reads full, not empty. */}
          <FigureEmbed
            block={d.block}
            palette={paletteFor(skin)}
            frame={frame}
            frozen={frozen}
            maxUpscale={1.6}
          />
        </div>
        {d.caption ? (
          <div
            style={{
              font: `400 italic 28px/1.4 ${skin.fonts.body}`,
              color: t.faint,
              ...clampStyle(2),
            }}
          >
            {d.caption}
          </div>
        ) : null}
      </div>
    </SlideFrame>
  );
};
