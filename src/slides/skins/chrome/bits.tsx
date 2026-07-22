// Shared slide chrome + primitives, all token-driven so one set serves every skin. Inline styles
// (never app tokens) keep each skin a self-contained fixed palette; `--accent`/`--tint` on the
// stage root make the accent a single overridable knob. Everything is sized in the 1920×1080
// design space and clips to the frame — nothing is allowed to overflow the slide.
/* eslint-disable react-refresh/only-export-components -- a primitives module: it exports layout
   constants + style/token helpers alongside the chrome components, not components exclusively. */
import type { CSSProperties, ReactNode } from 'react';
import { BandFit } from '../layouts/BandFit';
import type { SlideContext, SlideSkin } from '../types';

export const STAGE_W = 1920;
export const STAGE_H = 1080;

/** Mono/label family for kickers; falls back to the body family. */
export const kickerFont = (skin: SlideSkin): string => skin.fonts.mono ?? skin.fonts.body;

/** Display-type weight; falls back to a serif-appropriate 500 or a sans-appropriate 700. */
export const displayWeight = (skin: SlideSkin): number =>
  skin.fonts.displayWeight ?? (skin.fonts.allSerif ? 500 : 700);

/** A token tinted toward transparent — the one opacity idiom for the slide layer. */
const tintOf = (color: string, pct: number): string =>
  `color-mix(in oklab, ${color} ${pct}%, transparent)`;

/**
 * The accent in a *text* context. The bright `--accent` is reserved for fills (bars, dots, the
 * cover full stop, statement underlines); kickers/labels/numerals use this text-grade tone so a
 * low-contrast brand accent (Folio gold, Sol teal) stays legible on paper. On a dark surface the
 * skin's `darkAccent` already clears contrast.
 */
export const accentInkColor = (skin: SlideSkin, onDark?: boolean): string =>
  onDark ? skin.tokens.darkAccent : 'var(--accent-ink)';

/** Whether a skin opts into a soft Cobalt-style accent glow on its kickers/numerals. */
const hasGlow = (skin: SlideSkin): boolean => !!skin.tokens.flourish && !!skin.tokens.dark;

/** The accent glow text-shadow for skins that opt in (Cobalt) — otherwise nothing. */
const glowShadow = (skin: SlideSkin): string | undefined =>
  hasGlow(skin) ? `0 0 18px ${tintOf(skin.tokens.flourish ?? skin.tokens.accent, 35)}` : undefined;

/**
 * The shared card / tile treatment for data + comparison surfaces. Only paints
 * background/border/shadow/radius — never padding, gap, grid or type — so the fit guarantees are
 * untouched and every tile in a row is identical. Flat skins (no `elevation`) get a rule, not a
 * shadow; `glow` is the dark-skin accent ring instead of a black drop shadow.
 */
export function surfaceStyle(
  skin: SlideSkin,
  opts: { recommended?: boolean; onDark?: boolean } = {},
): CSSProperties {
  const t = skin.tokens;
  const { recommended, onDark } = opts;
  const hairline = onDark ? tintOf(t.darkInk, 16) : t.rule;
  const style: CSSProperties = {
    background: onDark ? t.darkSurface : t.card,
    borderRadius: t.radius,
    border: `1px solid ${hairline}`,
  };
  switch (t.elevation) {
    case 'soft':
      style.boxShadow = `0 2px 8px ${tintOf(t.ink, 8)}, 0 14px 34px ${tintOf(t.ink, 6)}`;
      break;
    case 'raised':
      style.boxShadow = `0 4px 12px ${tintOf(t.ink, 12)}, 0 22px 48px ${tintOf(t.ink, 10)}`;
      break;
    case 'glow':
      style.border = `1px solid ${tintOf(t.accent, 28)}`;
      style.boxShadow = `0 0 0 1px ${tintOf(t.accent, 14)}, 0 24px 60px rgba(0,0,0,0.45)`;
      break;
    case 'flat':
    default:
      // Swiss/scholarly skins stay flat: a hard rule, no shadow. Grid wants a heavier black edge.
      if (skin.id === 'grid')
        style.border = `2px solid ${onDark ? tintOf(t.darkInk, 24) : t.ruleStrong}`;
      break;
  }
  // A recommended column wears an accent top edge — the one place a card signals "pick this".
  if (recommended) style.borderTop = `3px solid var(--accent)`;
  return style;
}

/** The eyebrow kicker over a slide ("FINDING 01", "FIG. 1"). */
export function Kicker({
  skin,
  text,
  onDark,
}: {
  skin: SlideSkin;
  text: string;
  onDark?: boolean;
}) {
  return (
    <div
      style={{
        font: `700 24px/1 ${kickerFont(skin)}`,
        letterSpacing: '0.22em',
        textTransform: 'uppercase',
        color: accentInkColor(skin, onDark),
        textShadow: glowShadow(skin),
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}
    >
      {text}
    </div>
  );
}

/** The page footer: hairline, wordmark, optional topic, "NN / TT". */
export function Footer({
  skin,
  ctx,
  onDark,
}: {
  skin: SlideSkin;
  ctx: SlideContext;
  onDark?: boolean;
}) {
  const t = skin.tokens;
  const ink = onDark ? t.darkInk : t.muted;
  const rule = onDark ? `color-mix(in oklab, ${t.darkInk} 24%, transparent)` : t.rule;
  return (
    <div style={{ flex: '0 0 auto' }}>
      <div style={{ height: 1, background: rule, marginBottom: 22 }} />
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          font: `600 22px/1 ${kickerFont(skin)}`,
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
          color: ink,
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
          {skin.brand.name}
        </span>
        <span style={{ flex: '0 0 auto', color: accentInkColor(skin, onDark) }}>
          {String(ctx.index + 1).padStart(2, '0')} / {String(ctx.total).padStart(2, '0')}
        </span>
      </div>
    </div>
  );
}

/**
 * The standard content frame: kicker on top, a flexible content area, the footer pinned at the
 * bottom — exactly the layout every reference content slide shares.
 */
export function SlideFrame({
  slideId,
  skin,
  ctx,
  kicker,
  onDark,
  children,
}: {
  slideId: string;
  skin: SlideSkin;
  ctx: SlideContext;
  kicker?: string;
  onDark?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        padding: skin.tokens.pad,
        display: 'flex',
        flexDirection: 'column',
        boxSizing: 'border-box',
        overflow: 'hidden',
      }}
    >
      {kicker ? (
        <div
          style={{
            flex: '0 0 auto',
            marginBottom: 26,
            display: 'flex',
            alignItems: 'center',
            gap: 28,
          }}
        >
          <div style={{ flex: '0 1 auto', minWidth: 0 }}>
            <Kicker skin={skin} text={kicker} onDark={onDark} />
          </div>
          <div
            aria-hidden
            style={{
              flex: '1 0 60px',
              height: 1,
              background: onDark
                ? `color-mix(in oklab, ${skin.tokens.darkInk} 24%, transparent)`
                : skin.tokens.rule,
            }}
          />
        </div>
      ) : null}
      <BandFit
        slideId={slideId}
        skinId={skin.id}
        outerStyle={{ flex: '1 1 auto', minHeight: 0 }}
        style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}
      >
        {children}
      </BandFit>
      <Footer skin={skin} ctx={ctx} onDark={onDark} />
    </div>
  );
}

/**
 * A labelled horizontal progress / proportion bar. `series: 'secondary'` paints the fill with the
 * skin's second accent (degrading to the primary accent where a skin has none) so charts and
 * roadmaps can carry a real two-tone data palette.
 */
export function Bar({
  skin,
  pct,
  height = 10,
  onDark,
  series = 'primary',
}: {
  skin: SlideSkin;
  pct: number;
  height?: number;
  onDark?: boolean;
  series?: 'primary' | 'secondary';
}) {
  const t = skin.tokens;
  const fill =
    series === 'secondary'
      ? onDark
        ? (t.accent2 ?? t.darkAccent)
        : (t.accent2 ?? 'var(--accent)')
      : onDark
        ? t.darkAccent
        : 'var(--accent)';
  return (
    <div
      style={{
        height,
        borderRadius: height,
        background: onDark ? `color-mix(in oklab, ${t.darkInk} 16%, transparent)` : t.track,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          width: `${Math.round(Math.min(1, Math.max(0, pct)) * 100)}%`,
          height: '100%',
          borderRadius: height,
          background: fill,
        }}
      />
    </div>
  );
}

/** Filled/empty rating dots on a 1..scale scale (the reference "data table" ratings). */
export function Dots({ skin, level, scale }: { skin: SlideSkin; level: number; scale: number }) {
  const t = skin.tokens;
  // On a dark skin an empty dot in `track` can vanish — give it a faint ring so the scale reads.
  const emptyRing = t.dark ? `inset 0 0 0 1px ${tintOf(t.ink, 22)}` : undefined;
  return (
    <span style={{ display: 'inline-flex', gap: 10, alignItems: 'center' }}>
      {Array.from({ length: scale }, (_, i) => (
        <span
          key={i}
          style={{
            width: 18,
            height: 18,
            borderRadius: '50%',
            background: i < level ? 'var(--accent)' : t.track,
            boxShadow: i < level ? undefined : emptyRing,
          }}
        />
      ))}
    </span>
  );
}

/** An optional paper finish (warm tooth / linen weave), kept ultra-faint and raster-safe. */
function TextureOverlay({ skin }: { skin: SlideSkin }) {
  const t = skin.tokens;
  if (!t.texture) return null;
  const image =
    t.texture === 'linen'
      ? `repeating-linear-gradient(45deg, ${tintOf(t.ink, 3)} 0 1px, transparent 1px 6px),` +
        `repeating-linear-gradient(-45deg, ${tintOf(t.ink, 2.5)} 0 1px, transparent 1px 6px)`
      : `repeating-linear-gradient(0deg, ${tintOf(t.ink, 2.2)} 0 1px, transparent 1px 5px)`;
  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 0,
        backgroundImage: image,
      }}
    />
  );
}

/** Decorative background per skin — texture finish + the skin's signature geometry. Layout-inert. */
export function Decor({ skin }: { skin: SlideSkin }) {
  const t = skin.tokens;
  const ds = t.decorStrength ?? 1;
  // Decor opacity scaled by the skin's strength, so near-invisible patterns (Cobalt dots, Grid
  // rules) can be pushed up without touching the skins that are already balanced.
  const mix = (color: string, pct: number): string => tintOf(color, Math.min(100, pct * ds));
  const accent2 = t.accent2 ?? t.accent;
  const base: CSSProperties = {
    position: 'absolute',
    inset: 0,
    pointerEvents: 'none',
    zIndex: 0,
    overflow: 'hidden',
  };

  const shapes = (() => {
    switch (skin.decor) {
      case 'geo':
        return (
          <div style={base} aria-hidden>
            <div
              style={{
                position: 'absolute',
                top: -260,
                right: -220,
                width: 760,
                height: 760,
                borderRadius: '50%',
                background: `radial-gradient(closest-side, ${mix(t.accent, 14)}, transparent)`,
              }}
            />
            <div
              style={{
                position: 'absolute',
                bottom: -120,
                right: 180,
                width: 420,
                height: 420,
                borderRadius: 60,
                transform: 'rotate(18deg)',
                border: `2px solid ${mix(accent2, 42)}`,
              }}
            />
          </div>
        );
      case 'organic':
        return (
          <div style={base} aria-hidden>
            <div
              style={{
                position: 'absolute',
                top: -240,
                right: -160,
                width: 720,
                height: 720,
                borderRadius: '50%',
                background: `radial-gradient(closest-side, ${mix(t.accent, 16)}, transparent)`,
              }}
            />
            <div
              style={{
                position: 'absolute',
                bottom: -200,
                right: 260,
                width: 460,
                height: 460,
                borderRadius: '46% 54% 60% 40%',
                background: `radial-gradient(closest-side, ${mix(accent2, 34)}, transparent 78%)`,
              }}
            />
          </div>
        );
      case 'playful':
        return (
          <div style={base} aria-hidden>
            <div
              style={{
                position: 'absolute',
                top: 120,
                right: 220,
                width: 180,
                height: 180,
                borderRadius: '50%',
                background: accent2,
                opacity: 0.9,
              }}
            />
            <div
              style={{
                position: 'absolute',
                top: 260,
                right: 120,
                width: 120,
                height: 120,
                borderRadius: '50%',
                background: t.accent,
              }}
            />
            <div
              style={{
                position: 'absolute',
                bottom: -120,
                left: -80,
                width: 420,
                height: 420,
                borderRadius: '50%',
                background: `radial-gradient(closest-side, ${mix(t.accent, 18)}, transparent)`,
              }}
            />
          </div>
        );
      case 'dots':
        return (
          <div
            style={{
              ...base,
              backgroundImage: `radial-gradient(${mix(accent2, 22)} 1.6px, transparent 1.7px)`,
              backgroundSize: '48px 48px',
            }}
            aria-hidden
          />
        );
      case 'grid': {
        // A true module grid: 12 columns × 6 rows on integer pixels (1920/160, 1080/180), drawn as
        // background gradients so the lines stay crisp through the rasterizer.
        const line = mix(t.ruleStrong, 9);
        return (
          <div
            style={{
              ...base,
              backgroundImage:
                `repeating-linear-gradient(90deg, ${line} 0 1px, transparent 1px 160px),` +
                `repeating-linear-gradient(0deg, ${line} 0 1px, transparent 1px 180px)`,
            }}
            aria-hidden
          />
        );
      }
      default:
        return null;
    }
  })();

  return (
    <>
      <TextureOverlay skin={skin} />
      {shapes}
    </>
  );
}
