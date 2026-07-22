// The presence — the aurora jelly (deliberately unnamed). A jellyfish body carrying living light: a soft bell whose
// gradient IS the mood (indigo calm, teal verified, rose delight, embers when dim) hanging four
// tentacle curtains of light that carry the state — beads of data race up inside them while she
// works, one sweeps out and points when she finds something, and for earned moments they curl
// up short and draw a glyph beneath her. The face is two sparkly eyes, blush cheeks and a
// ripple smile; speaking opens the mouth against the live voice energy. Every animation is CSS
// off the data-state / data-emotion / data-gaze attributes (presence-canvas.css), which keeps
// the DOM here deliberately minimal and static. Never apply an inline transform to .presence
// or an ancestor — it would fight the bob / swell / blink keyframes.
//
// Geometry is shared with the static brand marks (./geometry — one source of truth, so a
// mark can never drift into a lookalike); ALL color lives in CSS (the gradient stops
// included), so moods, templates, themes and personalities retint her without touching the
// DOM. In the eyes, the round sparkly ball sits inside .blink so the lid squash never fights
// the emotion scaling on .eye.
import { memo, useId } from 'react';
import { SpeakerOffIcon } from '../icons/coreIcons';
import type { PresenceState, Emotion, Gaze } from '../types/mavea';
import {
  BELL,
  BELL_SHEEN,
  TENTS,
  SHORTS,
  POINT,
  EYES,
  EYE_Y,
  EYE_R,
  SMILE,
  CHEEKS,
  GLYPH_QUESTION,
  GLYPH_HEART,
  GLYPH_IDEA,
  GLYPH_CHECK,
} from './geometry';

export interface PresenceProps {
  state?: PresenceState;
  emotion?: Emotion;
  gaze?: Gaze;
  muted?: boolean;
  hidden?: boolean;
}

function PresenceImpl({
  state = 'idle',
  emotion = 'neutral',
  gaze = 'center',
  muted = false,
  hidden = false,
}: PresenceProps) {
  // Two faces can mount at once (the Live layer + the thinking-map centre); duplicate SVG ids
  // would cross-wire their bell fills. useId is unique per instance, but React's «r0» format
  // breaks inside url(#…) — strip to a plain token.
  const uid = useId().replace(/\W/g, '');
  const bellGrad = `mascot-bell-${uid}`;

  return (
    <div
      className={'presence' + (hidden ? ' is-hidden' : '')}
      data-state={state}
      data-emotion={emotion}
      data-gaze={gaze}
      role="img"
      aria-label={`Mavéa presence — ${state}`}
    >
      <div className="aura"></div>

      <svg className="mascot" viewBox="0 0 200 220" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient
            id={bellGrad}
            x1="40"
            y1="60"
            x2="160"
            y2="104"
            gradientUnits="userSpaceOnUse"
          >
            <stop className="bell-stop s1" offset="0" />
            <stop className="bell-stop s2" offset="0.5" />
            <stop className="bell-stop s3" offset="1" />
          </linearGradient>
        </defs>

        <g className="jelly">
          {/* curtains of light, behind the bell — smooth ribbons at rest, bead tubes at work */}
          <g className="curtains long">
            {TENTS.map((d, i) => (
              <g className={`curtain c${i + 1}`} key={i}>
                <path className="tube" d={d} pathLength={100} />
                <path className="strand" d={d} pathLength={100} />
                <path className="beads" d={d} pathLength={100} />
                <path className="shimmer" d={d} pathLength={100} />
              </g>
            ))}
          </g>
          <g className="curtains short">
            {SHORTS.map((d, i) => (
              <g className={`curtain c${i + 1}`} key={i}>
                <path className="tube" d={d} pathLength={100} />
                <path className="strand" d={d} pathLength={100} />
              </g>
            ))}
          </g>
          {/* acting: one tentacle sweeps out and points at the thing she did */}
          <g className="curtain found">
            <path className="tube" d={POINT} pathLength={100} />
            <path className="strand" d={POINT} pathLength={100} />
            <path className="beads" d={POINT} pathLength={100} />
            <circle className="found-dot" cx="152" cy="144" r="6" />
          </g>

          <g className="glyph question">
            <path className="stroke" d={GLYPH_QUESTION} pathLength={100} />
            <circle className="dot" cx="100" cy="186" r="4" />
          </g>
          <g className="glyph heart">
            <path className="stroke" d={GLYPH_HEART} pathLength={100} />
          </g>
          <g className="glyph idea">
            <circle className="halo" cx="100" cy="163" r="15" />
            {GLYPH_IDEA.map((d, i) => (
              <path className="stroke" d={d} pathLength={100} key={i} />
            ))}
          </g>
          <g className="glyph check">
            <path className="stroke" d={GLYPH_CHECK} pathLength={100} />
          </g>

          <g className="bell">
            <path className="bell-body" d={BELL} fill={`url(#${bellGrad})`} />
            <path className="bell-sheen" d={BELL_SHEEN} />
            <path className="band b1" d="M52 74 C70 62 130 62 148 74" />
            <path className="band b2" d="M58 56 C76 46 124 46 142 56" />

            <g className="face">
              {CHEEKS.map(({ side, cx, cy }) => (
                <ellipse className={`cheek ${side}`} cx={cx} cy={cy} rx={8} ry={5} key={side} />
              ))}
              <path className="brow l" d="M70 61 Q80 57 90 61" />
              <path className="brow r" d="M110 61 Q120 57 130 61" />

              <g className="eyes">
                {EYES.map(({ side, x, crescent, closed }) => (
                  <g className={`eye ${side}`} key={side}>
                    <g className="blink">
                      <circle className="ball" cx={x} cy={EYE_Y} r={EYE_R} />
                      <circle className="pupil" cx={x} cy={EYE_Y + 0.7} r={5.2} />
                      <circle className="glint g1" cx={x + 2.5} cy={EYE_Y - 2.7} r={2.3} />
                      <circle className="glint g2" cx={x - 2} cy={EYE_Y + 3.1} r={1.2} />
                    </g>
                    <path className="crescent" d={crescent} />
                    <path className="closed" d={closed} />
                  </g>
                ))}
              </g>

              <g className="mouth">
                <path className="smile" d={SMILE} />
                <path className="frown" d="M92 96 Q100 91 108 96" />
                <circle className="oo" cx="100" cy="92.5" r="4" />
                <g className="mouth-open">
                  <path className="mouth-fill" d="M89 86 Q100 100 111 86 Z" />
                  <path className="tongue" d="M93 95 Q100 99 107 95" />
                </g>
              </g>
            </g>
          </g>

          {/* celebrate chrome + the sleepy drift — hidden until their moment */}
          <g className="sparks">
            <path d="M36 44 L36 56 M30 50 L42 50" />
            <path d="M166 34 L166 46 M160 40 L172 40" />
            <path d="M174 84 L182 84" />
          </g>
          <g className="zzz">
            <text x="148" y="36">
              z
            </text>
            <text x="160" y="22">
              z
            </text>
          </g>
        </g>
      </svg>

      {muted && (
        <div className="muted-badge" title="Mavéa's voice is muted">
          <SpeakerOffIcon />
        </div>
      )}
    </div>
  );
}

// memo: choreography re-renders of the parent don't re-reconcile the face when props are unchanged.
// Animation is CSS-driven off data-*, so this is a pure perf nicety — it does not change the DOM.
export const Presence = memo(PresenceImpl);
