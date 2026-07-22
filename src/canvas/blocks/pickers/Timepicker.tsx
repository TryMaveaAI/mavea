import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { TimepickerProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = TimepickerProps & { delay?: number };

const pad = (n: number) => (n < 10 ? '0' + n : '' + n);

export function Timepicker({
  title,
  icon = 'clock',
  iconColor = 'var(--presence)',
  label = 'Time',
  format = 12,
  hour,
  minute = 30,
  meridiem = 'AM',
  step = 5,
  color = 'var(--presence)',
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.clock;
  // floor step so a degenerate step={0} can't drive minute math to NaN / divide-by-zero
  const safeStep = step > 0 ? step : 1;
  const hMax = format === 12 ? 12 : 23;
  const hMin = format === 12 ? 1 : 0;
  // clamp an out-of-range `hour` prop into the active format's window (e.g. hour=15 in 12h
  // mode, or a negative hour) instead of rendering it verbatim — mirrors Numberstepper's
  // clamp(value) init, which this component skipped despite defining wrapH for later use
  const clampH = (v: number) => Math.min(hMax, Math.max(hMin, v));
  // wrap a negative/overflowing `minute` prop into 0-59 before init too — JS's `%` doesn't
  // wrap negatives, so an unwrapped negative minute slips past pad()'s single-digit check
  // and prints a malformed value like "0-10"
  const wrapMInit = (v: number) => ((v % 60) + 60) % 60;
  const [h, setH] = useState<number>(clampH(hour != null ? hour : format === 12 ? 9 : 9));
  const [m, setM] = useState<number>(wrapMInit(Math.round(minute / safeStep) * safeStep));
  const [mer, setMer] = useState<'AM' | 'PM'>(meridiem);

  const wrapH = (v: number) => (v > hMax ? hMin : v < hMin ? hMax : v);
  const wrapM = (v: number) => (v > 59 ? 0 : v < 0 ? 60 - safeStep : v);

  const stepH = (d: number) => setH((v) => wrapH(v + d));
  const stepM = (d: number) => setM((v) => wrapM((((v + d * safeStep) % 60) + 60) % 60));

  const display = format === 12 ? `${pad(h)}:${pad(m)} ${mer}` : `${pad(h)}:${pad(m)}`;

  const Col = ({
    val,
    up,
    down,
    aria,
  }: {
    val: string;
    up: () => void;
    down: () => void;
    aria: string;
  }) => (
    <div className="tp-col" aria-label={aria}>
      <button type="button" className="tp-step" onClick={up} aria-label={`Increase ${aria}`}>
        <Icon.chevR className="tp-step-ic up" />
      </button>
      <div className="tp-cell tab-num">{val}</div>
      <button type="button" className="tp-step" onClick={down} aria-label={`Decrease ${aria}`}>
        <Icon.chevR className="tp-step-ic down" />
      </button>
    </div>
  );

  return (
    <div
      className="card reveal"
      style={
        { ['--delay' as string]: (delay || 0) + 'ms', ['--pk-c' as string]: color } as CSSProperties
      }
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      {label && <label className="pk-label">{label}</label>}

      <div className="tp-readout tab-num" style={{ color }}>
        {display}
      </div>

      <div className="tp-cols">
        <Col val={pad(h)} up={() => stepH(1)} down={() => stepH(-1)} aria="hours" />
        <span className="tp-colon">:</span>
        <Col val={pad(m)} up={() => stepM(1)} down={() => stepM(-1)} aria="minutes" />
        {format === 12 && (
          <div className="tp-mer">
            <button
              type="button"
              className={`tp-mer-btn ${mer === 'AM' ? 'on' : ''}`}
              onClick={() => setMer('AM')}
            >
              AM
            </button>
            <button
              type="button"
              className={`tp-mer-btn ${mer === 'PM' ? 'on' : ''}`}
              onClick={() => setMer('PM')}
            >
              PM
            </button>
          </div>
        )}
      </div>

      {footer && (
        <div
          className="insight-summary"
          style={{ marginTop: 12 }}
          dangerouslySetInnerHTML={richInnerHtml(footer)}
        />
      )}
    </div>
  );
}
