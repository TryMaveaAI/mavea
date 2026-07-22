import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { useTimeout } from '../../../hooks/useTimeout';
import { BlockEmpty } from '../../lib';
import type { BrandGuideProps, TypeSpecimen } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = BrandGuideProps & { delay?: number };

function asStr(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

// One type specimen, rendered live in its own font stack — a real installed/system font (or a
// generic CSS fallback family), never a network font load — so the row IS the preview, not just
// a description of one. A specimen missing both a name and a stack is dropped rather than shown
// as an unlabeled blank row.
function TypeRow({ spec }: { spec: TypeSpecimen }) {
  const name = asStr(spec?.name);
  const sample = asStr(spec?.sample);
  const weight = asStr(spec?.weight);
  if (!name && !sample) return null;
  return (
    <div className="brg-type-row">
      <div className="brg-type-meta">
        <span className="brg-type-name">{name || 'Untitled'}</span>
        {sample && <span className="brg-type-family faint">{sample}</span>}
        {weight && <span className="brg-type-weight">{weight}</span>}
      </div>
      <div
        className="brg-type-preview"
        style={{ fontFamily: sample || 'inherit', fontWeight: weight || undefined }}
      >
        Aa Bb Cc 123
      </div>
    </div>
  );
}

// A brand identity reference: the color palette (the same click-to-copy swatch row Palette
// uses), a live type-specimen row per typeface, and short voice/tone notes — the reference doc a
// designer hands off so every asset stays on-brand. Real-data-only: nothing here is derived.
export function BrandGuide({
  title,
  icon = 'doc',
  iconColor = 'var(--presence)',
  colors,
  typography,
  voiceNotes,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.doc;
  const [copied, setCopied] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  // Clear the swatch highlight and the toast after their beats — both self-cancel on unmount.
  useTimeout(() => setCopied(null), copied !== null ? 900 : null);
  useTimeout(() => setToast(null), toast ? 1400 : null);

  const swatches = Array.isArray(colors) ? colors : [];
  const specimens = Array.isArray(typography) ? typography : [];
  const notes = Array.isArray(voiceNotes)
    ? voiceNotes.filter((n): n is string => typeof n === 'string' && n.trim().length > 0)
    : [];

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

      {swatches.length ? (
        <div className="me-pal">
          {swatches.map((s, i) => {
            const hex = asStr(s?.hex);
            const name = asStr(s?.name) || `Color ${i + 1}`;
            return (
              <button
                key={i}
                className={
                  'me-pal-swatch' + (s?.light ? ' light' : '') + (copied === i ? ' copied' : '')
                }
                style={{ background: hex || 'var(--surface-glass-strong)' }}
                onClick={() => hex && copy(i, hex)}
                disabled={!hex}
                title={hex ? `Copy ${hex}` : name}
              >
                <span className="me-pal-top">
                  {s?.contrast && <span className="me-pal-contrast">{s.contrast}</span>}
                  <span className="me-pal-copyicon">
                    {copied === i ? <Icon.check /> : <Icon.layers />}
                  </span>
                </span>
                <span className="me-pal-meta">
                  <span className="me-pal-name">{name}</span>
                  <span className="me-pal-hex tab-num">{copied === i ? 'Copied' : hex || '—'}</span>
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <BlockEmpty message="No brand colors to show" />
      )}

      {toast && (
        <div className="me-pal-toast">
          <Icon.check /> {toast}
        </div>
      )}

      {specimens.length > 0 && (
        <div className="brg-type-stack">
          {specimens.map((spec, i) => (
            <TypeRow spec={spec} key={i} />
          ))}
        </div>
      )}

      {notes.length > 0 && (
        <ul className="brg-voice">
          {notes.map((n, i) => (
            <li key={i} className="brg-voice-item">
              {n}
            </li>
          ))}
        </ul>
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
