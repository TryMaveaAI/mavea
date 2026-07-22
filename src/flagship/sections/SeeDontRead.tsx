// "Stop reading paragraphs. Start seeing answers." — the thesis, argued by transformation.
// One shot: the wall of text piles up line by line, a highlighter sweeps the four lines where
// the numbers are buried, then those lines hand off — dimming as the chart on the right grows a
// bar for each and the headline figure counts itself up. The wall ends receded; the seen answer
// ends lit. Reduced motion and the lite tier land on the finished frame.
//
// The multi-second choreography is gated on the section being GENUINELY in view (its own
// observer at a 0.3 threshold), NOT on the outer `.fl-reveal.in` fade — that one fires when the
// section barely peeks in from the bottom, so with content-visibility the one-shot could play
// entirely off-screen and the viewer would only ever catch the finished frame.
import { useEffect, useState } from 'react';
import { useInView } from '../../hooks/useInView';
import { SectionHead } from '../parts';

const TEXT_LINES = [
  { w: '100%' },
  { w: '94%', data: true },
  { w: '97%' },
  { w: '88%', data: true },
  { w: '100%' },
  { w: '91%', data: true },
  { w: '96%' },
  { w: '70%', data: true },
  { w: '82%' },
];
const SEEN_BARS = ['42%', '54%', '48%', '70%', '100%'];

/** Count 0 → target once the choreography starts; the count-up is garnish, so reduced motion
 *  and the lite tier read the final number immediately. */
function useCountUp(target: number, delayMs: number, durationMs: number, active: boolean) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!active) return;
    if (
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ||
      document.documentElement.dataset.perf === 'lite'
    ) {
      setValue(target);
      return;
    }
    let raf = 0;
    let startTs = 0;
    const tick = (ts: number) => {
      if (!startTs) startTs = ts;
      const t = Math.min(1, (ts - startTs) / durationMs);
      setValue(target * (1 - (1 - t) ** 3));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    const timer = window.setTimeout(() => {
      raf = requestAnimationFrame(tick);
    }, delayMs);
    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(raf);
    };
  }, [active, target, delayMs, durationMs]);
  return value;
}

export function SeeDontRead() {
  // Fires when a third of the comparison is on screen — the choreography (and the count-up) then
  // plays where the viewer can actually watch it. nearestScrollRoot keeps the hook's arrival
  // fallback watching the presence stage, which is what actually scrolls.
  const [compareRef, playing] = useInView<HTMLDivElement>({
    threshold: 0.3,
    nearestScrollRoot: true,
  });
  const stat = useCountUp(23.8, 1100, 900, playing);
  return (
    <>
      <SectionHead eyebrow="Why it feels different">
        Stop reading paragraphs.
        <br />
        <em className="fl-grad">Start seeing answers.</em>
      </SectionHead>

      <div className={'fl-compare' + (playing ? ' sd-play' : '')} ref={compareRef}>
        <div className="fl-compare-wall">
          <div className="fl-compare-label">The usual answer · a wall of text</div>
          <div className="fl-wall-lines">
            {TEXT_LINES.map((line, i) => (
              <div
                key={i}
                className={'fl-wall-line' + (line.data ? ' data' : '')}
                style={{ width: line.w, ['--wl-i' as string]: String(i) }}
              />
            ))}
          </div>
          <div className="fl-compare-hand">…still reading?</div>
        </div>

        <div className="fl-compare-seen">
          <div className="fl-compare-label accent">Mavéa · the same answer, seen</div>
          <div className="fl-seen-stat">
            <span className="fl-seen-num">${stat.toFixed(1)}M</span>
            <span className="fl-seen-delta">▲ 18%</span>
          </div>
          <div className="fl-seen-cap">Q3 revenue · best quarter on record</div>
          <div className="fl-seen-bars">
            {SEEN_BARS.map((h, i) => (
              <div
                key={i}
                className={'fl-seen-bar' + (h === '100%' ? ' peak' : '')}
                style={{ ['--h' as string]: h, ['--sb-i' as string]: String(i) }}
              />
            ))}
          </div>
          <div className="fl-seen-note">Illustrative numbers</div>
        </div>
      </div>
    </>
  );
}
