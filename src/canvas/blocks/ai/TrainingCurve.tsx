import { useMemo } from 'react';
import type { CSSProperties, ReactElement } from 'react';
import { Icon } from '../../../icons/icons';
import { ticks, niceStep } from '../../lib/scale';
import type { TrainingCurveProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = TrainingCurveProps & { delay?: number };

const W = 320;
const PAD = { l: 44, r: 16, t: 16, b: 36 };
const PW = W - PAD.l - PAD.r;

interface PanelModel {
  yMin: number;
  yMax: number;
  yTickVals: number[];
  PH: number;
  toX: (i: number) => number;
  toY: (v: number) => number;
  trainPath: string;
  valPath: string;
  overfitPath: string;
  bestX: number | null;
}

function buildPanel(
  epochs: number[],
  trainVals: number[] | undefined,
  valVals: number[] | undefined,
  panelH: number,
  bestIdx: number | null,
  isLoss: boolean,
): PanelModel | null {
  const all = [...(trainVals ?? []), ...(valVals ?? [])].filter(Number.isFinite);
  if (!all.length) return null;

  const yMin = 0;
  const yMax = Math.max(...all) * 1.08 || 1;
  const step = niceStep(yMax - yMin, 4);
  const yTickVals = ticks(yMin, yMax, step).filter((t) => t <= yMax);
  const PH = panelH - PAD.t - PAD.b;
  const n = epochs.length;

  const toX = (i: number, count: number) => PAD.l + (count > 1 ? (i / (count - 1)) * PW : PW / 2);
  const toY = (v: number) => PAD.t + PH - ((v - yMin) / (yMax - yMin)) * PH;

  const makePath = (vals: number[]) =>
    vals
      .map((v, i) => `${i === 0 ? 'M' : 'L'}${toX(i, n).toFixed(1)},${toY(v).toFixed(1)}`)
      .join(' ');

  const trainPath = trainVals ? makePath(trainVals) : '';
  const valPath = valVals ? makePath(valVals) : '';

  // Overfitting zone for loss panels: shade where val diverges above train
  let overfitPath = '';
  if (isLoss && trainVals && valVals) {
    const minLen = Math.min(trainVals.length, valVals.length);
    const topPts: string[] = [];
    const botPts: string[] = [];
    for (let i = 0; i < minLen; i++) {
      if (valVals[i] > trainVals[i]) {
        topPts.push(`${toX(i, n).toFixed(1)},${toY(valVals[i]).toFixed(1)}`);
        botPts.push(`${toX(i, n).toFixed(1)},${toY(trainVals[i]).toFixed(1)}`);
      }
    }
    if (topPts.length >= 2) {
      overfitPath = `M${topPts.join(' L')} L${[...botPts].reverse().join(' L')} Z`;
    }
  }

  const bestX = bestIdx !== null && bestIdx >= 0 && bestIdx < n ? toX(bestIdx, n) : null;

  return {
    yMin,
    yMax,
    yTickVals,
    PH,
    toX: (i) => toX(i, n),
    toY,
    trainPath,
    valPath,
    overfitPath,
    bestX,
  };
}

function Panel({
  model,
  epochs,
  label,
  offsetY,
}: {
  model: PanelModel;
  epochs: number[];
  label: string;
  offsetY: number;
}): ReactElement {
  const { yTickVals, PH, toX, toY, trainPath, valPath, overfitPath, bestX } = model;
  const n = epochs.length;

  return (
    <g transform={`translate(0,${offsetY})`}>
      {/* Y grid lines + labels */}
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
            x={PAD.l - 5}
            y={toY(t) + 4}
            textAnchor="end"
            fontSize={8}
            fill="var(--text-muted)"
            fontFamily="inherit"
          >
            {t < 1 ? t.toFixed(2) : t.toFixed(1)}
          </text>
        </g>
      ))}

      {/* Axis frame */}
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

      {/* Overfitting zone */}
      {overfitPath && <path d={overfitPath} fill="var(--danger)" fillOpacity={0.1} />}

      {/* Best epoch vertical rule */}
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
            x={bestX > W - 50 ? bestX - 3 : bestX + 3}
            y={PAD.t + 10}
            textAnchor={bestX > W - 50 ? 'end' : 'start'}
            fontSize={8}
            fill="var(--warning)"
            fontFamily="inherit"
            fontWeight="600"
          >
            Best
          </text>
        </g>
      )}

      {/* Train line */}
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

      {/* Validation line (dashed) */}
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

      {/* X-axis epoch labels */}
      {epochs.map((ep, i) => {
        const skip = Math.max(1, Math.ceil(n / 6));
        if (i % skip !== 0 && i !== n - 1) return null;
        return (
          <text
            key={ep}
            x={toX(i)}
            y={PAD.t + PH + 14}
            textAnchor="middle"
            fontSize={8}
            fill="var(--text-muted)"
            fontFamily="inherit"
          >
            {ep}
          </text>
        );
      })}

      {/* Panel label (top-left) */}
      <text
        x={PAD.l + 4}
        y={PAD.t + 12}
        fontSize={9}
        fontWeight="600"
        fill="var(--text-secondary)"
        fontFamily="inherit"
      >
        {label}
      </text>

      {/* Legend (top-right) */}
      <g transform={`translate(${W - PAD.r - 72},${PAD.t + 2})`}>
        <line x1={0} y1={5} x2={14} y2={5} stroke="var(--insight)" strokeWidth={2} />
        <text x={17} y={9} fontSize={8} fill="var(--text-muted)" fontFamily="inherit">
          Train
        </text>
        <line
          x1={0}
          y1={16}
          x2={14}
          y2={16}
          stroke="var(--presence)"
          strokeWidth={2}
          strokeDasharray="4 2"
        />
        <text x={17} y={20} fontSize={8} fill="var(--text-muted)" fontFamily="inherit">
          Val
        </text>
      </g>
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

  const hasLoss = trainLoss !== undefined || valLoss !== undefined;
  const hasAcc = trainAcc !== undefined || valAcc !== undefined;
  const panelCount = (hasLoss ? 1 : 0) + (hasAcc ? 1 : 0);

  const panelH = panelCount > 1 ? 180 : 220;
  const totalH = panelCount * panelH;

  const bestIdx = useMemo(() => {
    if (bestEpoch === undefined) return null;
    const idx = epochs.indexOf(bestEpoch);
    return idx >= 0 ? idx : null;
  }, [bestEpoch, epochs]);

  const lossModel = useMemo(
    () => (hasLoss ? buildPanel(epochs, trainLoss, valLoss, panelH, bestIdx, true) : null),
    [epochs, trainLoss, valLoss, panelH, bestIdx, hasLoss],
  );

  const accModel = useMemo(
    () => (hasAcc ? buildPanel(epochs, trainAcc, valAcc, panelH, bestIdx, false) : null),
    [epochs, trainAcc, valAcc, panelH, bestIdx, hasAcc],
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
      <svg
        viewBox={`0 0 ${W} ${totalH}`}
        width="100%"
        role="img"
        aria-label={title}
        style={{ display: 'block', overflow: 'visible' }}
      >
        {lossModel && <Panel model={lossModel} epochs={epochs} label={lossLabel} offsetY={0} />}
        {accModel && (
          <Panel
            model={accModel}
            epochs={epochs}
            label={accLabel}
            offsetY={lossModel ? panelH : 0}
          />
        )}
      </svg>
      {footer && (
        <div className="insight-summary" dangerouslySetInnerHTML={richInnerHtml(footer)} />
      )}
    </div>
  );
}
