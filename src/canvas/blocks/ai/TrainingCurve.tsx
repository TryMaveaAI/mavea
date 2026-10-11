import { useMemo } from 'react';
import type { CSSProperties, ReactElement } from 'react';
import { Icon } from '../../../icons/icons';
import { ticks, niceStep } from '../../lib/scale';
import { estimateTextWidth } from '../../lib/fitText';
import { useHostWidth } from '../../lib/useBoxSize';
import type { TrainingCurveProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = TrainingCurveProps & { delay?: number };

// Laid out at the card's measured width, one user unit per pixel, so the type below renders at
// exactly these sizes on a phone and on an ultrawide alike. A fixed 320-wide viewBox stretched to
// a desktop card blew its 8px labels up to 20px and the guard then had to shrink the whole figure
// into the middle of the card.
const FALLBACK_W = 320;
/** Below this the axis gutters leave no plot; a narrower host scales the figure down instead. */
const MIN_W = 240;
/** Past this a line chart only gets flatter; the figure centres instead. */
const MAX_W = 1080;
/** Two panels sit side by side once each would still be this wide. */
const MIN_COL_W = 300;
const COL_GAP = 28;
const TICK_FS = 11;
const TITLE_FS = 12;
const PAD = { l: 40, r: 12, t: 26, b: 26 };

interface PanelModel {
  yTickVals: number[];
  PW: number;
  PH: number;
  toX: (i: number) => number;
  toY: (v: number) => number;
  xTicks: { x: number; label: string }[];
  trainPath: string;
  valPath: string;
  overfitPath: string;
  bestX: number | null;
}

/** Epochs plot by VALUE when they climb, so a run logged at 1, 4, 7, 12, 20 is not drawn as
 *  five evenly spaced steps. Anything else falls back to evenly spaced positions. */
function climbs(epochs: number[]): boolean {
  return epochs.every((e, i) => Number.isFinite(e) && (i === 0 || e > epochs[i - 1]));
}

function buildPanel(
  epochs: number[],
  trainVals: number[] | undefined,
  valVals: number[] | undefined,
  panelW: number,
  panelH: number,
  bestIdx: number | null,
  isLoss: boolean,
): PanelModel | null {
  const all = [...(trainVals ?? []), ...(valVals ?? [])].filter(Number.isFinite);
  if (!all.length) return null;

  const yMax = Math.max(...all) * 1.08 || 1;
  const yTickVals = ticks(0, yMax, niceStep(yMax, Math.max(3, Math.round(panelH / 48)))).filter(
    (t) => t <= yMax,
  );
  const PW = panelW - PAD.l - PAD.r;
  const PH = panelH - PAD.t - PAD.b;
  const n = epochs.length;
  const byValue = n > 1 && climbs(epochs);
  const lo = epochs[0];
  const hi = epochs[n - 1];

  const toX = (i: number) =>
    PAD.l + (n < 2 ? PW / 2 : byValue ? ((epochs[i] - lo) / (hi - lo)) * PW : (i / (n - 1)) * PW);
  const toY = (v: number) => PAD.t + PH - (v / yMax) * PH;

  // One tick per ~70px, the first and last epochs always named so the run's span is readable.
  const target = Math.max(2, Math.floor(PW / 70));
  let xTicks: { x: number; label: string }[];
  if (byValue) {
    const inner = ticks(lo, hi, niceStep(hi - lo, target)).filter((t) => t > lo && t < hi);
    const minGap = TICK_FS * 2.4;
    const at = (v: number) => PAD.l + ((v - lo) / (hi - lo)) * PW;
    xTicks = [lo, ...inner, hi]
      .filter(
        (v, i, arr) =>
          i === 0 || i === arr.length - 1 || (at(v) - at(lo) >= minGap && at(hi) - at(v) >= minGap),
      )
      .map((v) => ({ x: at(v), label: String(v) }));
  } else {
    const skip = Math.max(1, Math.ceil(n / target));
    xTicks = epochs
      .map((ep, i) => ({ i, ep }))
      .filter(({ i }) => i % skip === 0 || i === n - 1)
      .map(({ i, ep }) => ({ x: toX(i), label: String(ep) }));
  }

  const makePath = (vals: number[]) =>
    vals
      .slice(0, n)
      .map((v, i) => `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(v).toFixed(1)}`)
      .join(' ');

  const trainPath = trainVals ? makePath(trainVals) : '';
  const valPath = valVals ? makePath(valVals) : '';

  // Overfitting zone for loss panels: shade where val diverges above train
  let overfitPath = '';
  if (isLoss && trainVals && valVals) {
    const minLen = Math.min(trainVals.length, valVals.length, n);
    const topPts: string[] = [];
    const botPts: string[] = [];
    for (let i = 0; i < minLen; i++) {
      if (valVals[i] > trainVals[i]) {
        topPts.push(`${toX(i).toFixed(1)},${toY(valVals[i]).toFixed(1)}`);
        botPts.push(`${toX(i).toFixed(1)},${toY(trainVals[i]).toFixed(1)}`);
      }
    }
    if (topPts.length >= 2) {
      overfitPath = `M${topPts.join(' L')} L${[...botPts].reverse().join(' L')} Z`;
    }
  }

  const bestX = bestIdx !== null && bestIdx >= 0 && bestIdx < n ? toX(bestIdx) : null;

  return { yTickVals, PW, PH, toX, toY, xTicks, trainPath, valPath, overfitPath, bestX };
}

function Panel({
  model,
  label,
  offsetX,
  offsetY,
}: {
  model: PanelModel;
  label: string;
  offsetX: number;
  offsetY: number;
}): ReactElement {
  const { yTickVals, PW, PH, toY, xTicks, trainPath, valPath, overfitPath, bestX } = model;
  // The "Best" flag shares the title row above the plot, where no line can run through it; it
  // is centred on its rule but never crosses the panel title or the plot's right edge.
  const titleEnd = PAD.l + estimateTextWidth(label, TITLE_FS, true) + 10;
  const bestW = estimateTextWidth('Best', TICK_FS, true);
  const bestLabelX =
    bestX === null ? 0 : Math.min(PAD.l + PW - bestW / 2, Math.max(titleEnd + bestW / 2, bestX));

  return (
    <g transform={`translate(${offsetX},${offsetY})`}>
      {yTickVals.map((t) => (
        <g key={t}>
          <line
            x1={PAD.l}
            y1={toY(t)}
            x2={PAD.l + PW}
            y2={toY(t)}
            stroke="var(--grid-line)"
            strokeWidth={0.8}
          />
          <text
            x={PAD.l - 6}
            y={toY(t) + TICK_FS * 0.35}
            textAnchor="end"
            fontSize={TICK_FS}
            fill="var(--text-muted)"
            fontFamily="inherit"
          >
            {t < 1 ? t.toFixed(2) : t.toFixed(1)}
          </text>
        </g>
      ))}

      <line
        x1={PAD.l}
        y1={PAD.t}
        x2={PAD.l}
        y2={PAD.t + PH}
        stroke="var(--grid-strong)"
        strokeWidth={1}
      />
      <line
        x1={PAD.l}
        y1={PAD.t + PH}
        x2={PAD.l + PW}
        y2={PAD.t + PH}
        stroke="var(--grid-strong)"
        strokeWidth={1}
      />

      {overfitPath && <path d={overfitPath} fill="var(--danger)" fillOpacity={0.1} />}

      {bestX !== null && (
        <g>
          <line
            x1={bestX}
            y1={PAD.t}
            x2={bestX}
            y2={PAD.t + PH}
            stroke="var(--warning)"
            strokeWidth={1.5}
            strokeDasharray="4 3"
          />
          <text
            x={bestLabelX}
            y={PAD.t - 8}
            textAnchor="middle"
            fontSize={TICK_FS}
            fill="var(--warning)"
            fontFamily="inherit"
            fontWeight="600"
          >
            Best
          </text>
        </g>
      )}

      {trainPath && (
        <path
          d={trainPath}
          fill="none"
          stroke="var(--insight)"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      {valPath && (
        <path
          d={valPath}
          fill="none"
          stroke="var(--presence)"
          strokeWidth={2}
          strokeDasharray="5 3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}

      {xTicks.map((t) => (
        <text
          key={t.x}
          x={t.x}
          y={PAD.t + PH + TICK_FS + 6}
          textAnchor="middle"
          fontSize={TICK_FS}
          fill="var(--text-muted)"
          fontFamily="inherit"
        >
          {t.label}
        </text>
      ))}

      <text
        x={PAD.l}
        y={PAD.t - 8}
        fontSize={TITLE_FS}
        fontWeight="600"
        fill="var(--text-secondary)"
        fontFamily="inherit"
      >
        {label}
      </text>
    </g>
  );
}

export function TrainingCurve({
  title = 'Training Curves',
  icon = 'sparkle',
  iconColor = 'var(--presence)',
  epochs,
  trainLoss,
  valLoss,
  trainAcc,
  valAcc,
  bestEpoch,
  lossLabel = 'Loss',
  accLabel = 'Accuracy',
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] ?? Icon.sparkle;

  const [wrapRef, measured] = useHostWidth<HTMLDivElement>();
  const W = measured ? Math.min(MAX_W, Math.max(MIN_W, Math.round(measured))) : FALLBACK_W;

  const hasLoss = trainLoss !== undefined || valLoss !== undefined;
  const hasAcc = trainAcc !== undefined || valAcc !== undefined;
  const panelCount = (hasLoss ? 1 : 0) + (hasAcc ? 1 : 0);
  const cols = panelCount > 1 && (W - COL_GAP) / 2 >= MIN_COL_W ? 2 : 1;
  const panelW = cols === 2 ? (W - COL_GAP) / 2 : W;
  const panelH = Math.round(Math.min(260, Math.max(180, panelW * 0.56)));
  const rows = Math.ceil(panelCount / cols);
  const totalH = rows * panelH;

  const bestIdx = useMemo(() => {
    if (bestEpoch === undefined) return null;
    const idx = epochs.indexOf(bestEpoch);
    return idx >= 0 ? idx : null;
  }, [bestEpoch, epochs]);

  const lossModel = useMemo(
    () => (hasLoss ? buildPanel(epochs, trainLoss, valLoss, panelW, panelH, bestIdx, true) : null),
    [epochs, trainLoss, valLoss, panelW, panelH, bestIdx, hasLoss],
  );

  const accModel = useMemo(
    () => (hasAcc ? buildPanel(epochs, trainAcc, valAcc, panelW, panelH, bestIdx, false) : null),
    [epochs, trainAcc, valAcc, panelW, panelH, bestIdx, hasAcc],
  );

  if (!epochs.length || panelCount === 0) return null;

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} />
        {title}
      </div>
      <div className="ai-curve-legend" aria-hidden="true">
        <span className="ai-curve-key">
          <i className="ai-curve-swatch is-train" />
          Train
        </span>
        <span className="ai-curve-key">
          <i className="ai-curve-swatch is-val" />
          Validation
        </span>
        {bestIdx !== null && (
          <span className="ai-curve-key">
            <i className="ai-curve-swatch is-best" />
            Best checkpoint · epoch {epochs[bestIdx]}
          </span>
        )}
      </div>
      <div ref={wrapRef} className="ai-curve-host">
        <svg
          className="ai-trainingcurve-svg"
          viewBox={`0 0 ${W} ${totalH}`}
          width={W}
          height={totalH}
          role="img"
          aria-label={title}
        >
          {lossModel && <Panel model={lossModel} label={lossLabel} offsetX={0} offsetY={0} />}
          {accModel && (
            <Panel
              model={accModel}
              label={accLabel}
              offsetX={lossModel && cols === 2 ? panelW + COL_GAP : 0}
              offsetY={lossModel && cols === 1 ? panelH : 0}
            />
          )}
        </svg>
      </div>
      {footer && (
        <div className="insight-summary" dangerouslySetInnerHTML={richInnerHtml(footer)} />
      )}
    </div>
  );
}
