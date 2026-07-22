// BiasVariance — the canonical bias/variance tradeoff diagram: training error falling as a
// model gets more complex, test error following it down and then turning back up as the model
// starts memorizing noise. Two curves plotted straight through the caller's own three parallel
// arrays; nothing here fits a curve or extrapolates a value the caller didn't supply.
import { useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { scaleLinear, niceDomain, extent } from '../../lib/scale';
import { usePathDraw } from '../../lib/motion';
import type { BiasVarianceProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = BiasVarianceProps & { delay?: number };

const W = 320;
const H = 220;
const PAD = { l: 38, r: 16, t: 14, b: 34 };
const DOT_MAX = 40; // above this many samples, dots would clutter — show lines only

const TRAIN_COLOR = 'var(--insight)';
const TEST_COLOR = 'var(--danger)';

export function BiasVariance({
  title,
  icon = 'chart',
  iconColor = 'var(--presence)',
  complexity,
  trainError,
  testError,
  sweetSpot,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.chart;
  const [hot, setHot] = useState<'train' | 'test' | null>(null);
  const trainRef = useRef<SVGPathElement>(null);
  const testRef = useRef<SVGPathElement>(null);

  const geom = useMemo(() => {
    const n = Math.min(complexity?.length ?? 0, trainError?.length ?? 0, testError?.length ?? 0);
    if (n === 0) return null;

    const xs = complexity.slice(0, n);
    const trainYs = trainError.slice(0, n);
    const testYs = testError.slice(0, n);

    const exX = extent(sweetSpot !== undefined ? [...xs, sweetSpot] : xs);
    const exY = extent([...trainYs, ...testYs]);
    if (!exX || !exY) return null;

    const [xMin, xMax] = niceDomain(exX[0], exX[1]);
    const [yMin, yMax] = niceDomain(Math.min(0, exY[0]), exY[1]);

    const plotL = PAD.l;
    const plotR = W - PAD.r;
    const plotT = PAD.t;
    const plotB = H - PAD.b;
    const sx = scaleLinear([xMin, xMax], [plotL, plotR]);
    const sy = scaleLinear([yMin, yMax], [plotB, plotT]);

    const trainPts = xs.map((x, i) => ({ x: sx(x), y: sy(trainYs[i]) }));
    const testPts = xs.map((x, i) => ({ x: sx(x), y: sy(testYs[i]) }));
    const trainD = trainPts.map((p, i) => `${i ? 'L' : 'M'}${p.x},${p.y}`).join('');
    const testD = testPts.map((p, i) => `${i ? 'L' : 'M'}${p.x},${p.y}`).join('');

    const sweetX = sweetSpot !== undefined ? sx(sweetSpot) : null;
    const bandHalf = (plotR - plotL) * 0.035;

    return {
      sx,
      sy,
      plotL,
      plotR,
      plotT,
      plotB,
      trainPts,
      testPts,
      trainD,
      testD,
      sweetX,
      bandHalf,
      showDots: n <= DOT_MAX,
      xTicks: sx.ticks(5),
      yTicks: sy.ticks(4),
    };
  }, [complexity, trainError, testError, sweetSpot]);

  usePathDraw(trainRef, { delay: delay ?? 0 });
  usePathDraw(testRef, { delay: (delay ?? 0) + 90 });

  return (
    <div
      className="card reveal c2"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title || 'Bias-variance tradeoff'}
      </div>

      {geom ? (
        <div className="bv-wrap" onMouseLeave={() => setHot(null)}>
          <svg
            role="img"
            aria-label={title || 'bias-variance tradeoff'}
            viewBox={`0 0 ${W} ${H}`}
            className="bv-svg"
          >
            {geom.yTicks.map((t, i) => (
              <line
                key={`gy${i}`}
                x1={geom.plotL}
                y1={geom.sy(t)}
                x2={geom.plotR}
                y2={geom.sy(t)}
                className="bv-grid"
              />
            ))}

            {geom.sweetX !== null && (
              <g>
                <rect
                  x={geom.sweetX - geom.bandHalf}
                  y={geom.plotT}
                  width={geom.bandHalf * 2}
                  height={geom.plotB - geom.plotT}
                  className="bv-sweet-band"
                />
                <line
                  x1={geom.sweetX}
                  y1={geom.plotT}
                  x2={geom.sweetX}
                  y2={geom.plotB}
                  className="bv-sweet-line"
                />
                <text
                  x={geom.sweetX}
                  y={geom.plotT - 4}
                  textAnchor="middle"
                  className="bv-sweet-lbl"
                >
                  sweet spot
                </text>
              </g>
            )}

            <line
              x1={geom.plotL}
              y1={geom.plotB}
              x2={geom.plotR}
              y2={geom.plotB}
              className="bv-axis"
            />
            {geom.xTicks.map((t, i) => (
              <text
                key={`xt${i}`}
                x={geom.sx(t)}
                y={geom.plotB + 13}
                textAnchor="middle"
                className="bv-tick"
              >
                {t}
              </text>
            ))}

            <path
              ref={trainRef}
              d={geom.trainD}
              fill="none"
              className="bv-curve"
              style={{
                stroke: TRAIN_COLOR,
                opacity: hot && hot !== 'train' ? 0.25 : 1,
                strokeWidth: hot === 'train' ? 3 : 2,
              }}
              onMouseEnter={() => setHot('train')}
            />
            <path
              ref={testRef}
              d={geom.testD}
              fill="none"
              className="bv-curve"
              style={{
                stroke: TEST_COLOR,
                opacity: hot && hot !== 'test' ? 0.25 : 1,
                strokeWidth: hot === 'test' ? 3 : 2,
              }}
              onMouseEnter={() => setHot('test')}
            />
            {geom.showDots &&
              geom.trainPts.map((p, i) => (
                <circle
                  key={`dt${i}`}
                  cx={p.x}
                  cy={p.y}
                  r={2.2}
                  fill={TRAIN_COLOR}
                  className="m-scale-in"
                  style={
                    { ['--delay' as string]: `${(delay ?? 0) + 260 + i * 18}ms` } as CSSProperties
                  }
                />
              ))}
            {geom.showDots &&
              geom.testPts.map((p, i) => (
                <circle
                  key={`de${i}`}
                  cx={p.x}
                  cy={p.y}
                  r={2.2}
                  fill={TEST_COLOR}
                  className="m-scale-in"
                  style={
                    { ['--delay' as string]: `${(delay ?? 0) + 350 + i * 18}ms` } as CSSProperties
                  }
                />
              ))}

            <text x={geom.plotL} y={H - 6} textAnchor="start" className="bv-zone-lbl">
              underfitting
            </text>
            <text x={geom.plotR} y={H - 6} textAnchor="end" className="bv-zone-lbl">
              overfitting
            </text>
            <text
              x={0}
              y={0}
              textAnchor="middle"
              className="bv-axlbl"
              transform={`translate(12, ${(geom.plotT + geom.plotB) / 2}) rotate(-90)`}
            >
              Error
            </text>
            <text
              x={(geom.plotL + geom.plotR) / 2}
              y={geom.plotB + 26}
              textAnchor="middle"
              className="bv-axlbl"
            >
              Model complexity →
            </text>
          </svg>

          <div className="bv-legend">
            <button
              className={'bv-leg' + (hot === 'train' ? ' on' : '')}
              onMouseEnter={() => setHot('train')}
              onMouseLeave={() => setHot(null)}
            >
              <i style={{ background: TRAIN_COLOR }} />
              Training error
            </button>
            <button
              className={'bv-leg' + (hot === 'test' ? ' on' : '')}
              onMouseEnter={() => setHot('test')}
              onMouseLeave={() => setHot(null)}
            >
              <i style={{ background: TEST_COLOR }} />
              Test error
            </button>
          </div>
        </div>
      ) : (
        <div className="bv-empty">Provide complexity, trainError, and testError arrays.</div>
      )}

      {footer && (
        <div
          className="insight-summary"
          style={{ marginTop: 10 }}
          dangerouslySetInnerHTML={richInnerHtml(footer)}
        />
      )}
    </div>
  );
}
