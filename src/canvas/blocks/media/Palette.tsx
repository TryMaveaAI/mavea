import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { useTimeout } from '../../../hooks/useTimeout';
import type { PaletteProps } from './types';

type Props = PaletteProps & { delay?: number };

export function Palette({
  title,
  icon = 'image',
  iconColor = 'var(--presence)',
  swatches,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.image;
  const [copied, setCopied] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  // Clear the swatch highlight and the toast after their beats — both self-cancel on unmount.
  useTimeout(() => setCopied(null), copied !== null ? 900 : null);
  useTimeout(() => setToast(null), toast ? 1400 : null);

  const copy = (i: number, hex: string) => {
    setCopied(i);
    const w = window as unknown as { toast?: (m: string) => void };
    if (typeof w.toast === 'function') {
      w.toast(`Copied ${hex}`);
    } else {
      navigator.clipboard?.writeText(hex).catch(() => {});
      setToast(`Copied ${hex}`);
    }
  };

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="me-pal">
        {swatches.map((s, i) => (
          <button
            key={i}
            className={
              'me-pal-swatch' + (s.light ? ' light' : '') + (copied === i ? ' copied' : '')
            }
            style={{ background: s.hex }}
            onClick={() => copy(i, s.hex)}
            title={`Copy ${s.hex}`}
          >
            <span className="me-pal-top">
              {s.contrast && <span className="me-pal-contrast">{s.contrast}</span>}
              <span className="me-pal-copyicon">
                {copied === i ? <Icon.check /> : <Icon.layers />}
              </span>
            </span>
            <span className="me-pal-meta">
              <span className="me-pal-name">{s.name}</span>
              <span className="me-pal-hex tab-num">{copied === i ? 'Copied' : s.hex}</span>
            </span>
          </button>
        ))}
      </div>

      {toast && (
        <div className="me-pal-toast">
          <Icon.check /> {toast}
        </div>
      )}

      <div className="insight-summary" style={{ marginTop: 10 }}>
        {footer || <span className="faint">Click a swatch to copy its hex</span>}
      </div>
    </div>
  );
}
