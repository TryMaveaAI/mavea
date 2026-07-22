import { useState, useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { ToaststackProps, ToastSpec, ToastKind } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = ToaststackProps & { delay?: number; maxToasts?: number };

const KIND: Record<ToastKind, { c: string; icon: keyof typeof Icon }> = {
  success: { c: 'var(--insight)', icon: 'check' },
  error: { c: 'var(--danger)', icon: 'alert' },
  info: { c: 'var(--presence)', icon: 'bell' },
  warning: { c: 'var(--warning)', icon: 'alert' },
};

interface Live extends ToastSpec {
  id: number;
}

const DEFAULT_POOL: ToastSpec[] = [
  { kind: 'success', title: 'Saved', desc: 'Your changes are live.' },
  { kind: 'info', title: 'Sync started', desc: 'Pulling the latest data…' },
  { kind: 'warning', title: 'Storage at 84%', desc: 'Consider archiving old runs.' },
  { kind: 'error', title: 'Upload failed', desc: 'Connection dropped — retry?' },
];

export function Toaststack({
  title,
  icon = 'bell',
  iconColor = 'var(--presence)',
  toasts,
  pool,
  duration = 4200,
  pushLabel = 'Push toast',
  footer,
  delay,
  maxToasts = 4,
}: Props) {
  const Ic = Icon[icon] || Icon.bell;
  // clamp so a huge toasts/pool array can't blow out the stack — 1..8 keeps the card legible
  const cap = Math.max(1, Math.min(maxToasts, 8));
  // Model-authored timing is untrusted runtime input. Negative delays trigger platform warnings,
  // while multi-day values retain effects/timers pointlessly; 0 disables and one minute is ample.
  const safeDuration = Number.isFinite(duration) ? Math.max(0, Math.min(duration, 60_000)) : 4200;
  const nextId = useRef(toasts.length);
  const poolRef = useRef(pool && pool.length ? pool : toasts.length ? toasts : DEFAULT_POOL);
  const poolIdx = useRef(0);
  const [live, setLive] = useState<Live[]>(() =>
    toasts.slice(0, cap).map((t, i) => ({ ...t, id: i })),
  );
  // toasts beyond the cap at mount time — surfaced as a count, not silently dropped
  const overflow = Math.max(0, toasts.length - cap);

  const dismiss = (id: number) => setLive((p) => p.filter((t) => t.id !== id));

  // auto-dismiss the oldest toast on a timer when a duration is set
  useEffect(() => {
    if (!safeDuration || live.length === 0) return;
    const oldest = live[live.length - 1];
    const h = window.setTimeout(() => dismiss(oldest.id), safeDuration);
    return () => window.clearTimeout(h);
  }, [live, safeDuration]);

  const push = () => {
    const base = poolRef.current[poolIdx.current % poolRef.current.length];
    poolIdx.current += 1;
    setLive((p) => [{ ...base, id: nextId.current++ }, ...p].slice(0, cap));
  };

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="ts-stage">
        {live.length === 0 && (
          <div className="ts-empty faint">No notifications — push one below.</div>
        )}
        {live.map((t, idx) => {
          const k = KIND[t.kind || 'info'];
          const TIc = Icon[t.icon || k.icon] || Icon[k.icon];
          return (
            <div
              key={t.id}
              className="ts-toast"
              style={{ ['--ts-c' as string]: k.c } as CSSProperties}
            >
              {/* top toast (idx 0) is the most recent — the called-out datum in the stack */}
              <span className="ts-icon" {...(idx === 0 ? { 'data-mark': 'circle' } : {})}>
                <TIc />
              </span>
              <span className="ts-body">
                <span className="ts-title">{t.title}</span>
                {t.desc && (
                  <span className="ts-desc" dangerouslySetInnerHTML={richInnerHtml(t.desc)} />
                )}
              </span>
              <button
                type="button"
                className="ts-x"
                onClick={() => dismiss(t.id)}
                aria-label="Dismiss"
              >
                <Icon.x />
              </button>
              {!!safeDuration && (
                <span
                  className="ts-progress"
                  style={{ animationDuration: safeDuration + 'ms' } as CSSProperties}
                />
              )}
            </div>
          );
        })}
      </div>

      {overflow > 0 && (
        <div className="faint" style={{ fontSize: 12, marginTop: -6, marginBottom: 12 }}>
          +{overflow} more queued — dismiss one to surface the next
        </div>
      )}

      <button type="button" className="ts-push" onClick={push}>
        <Icon.plus /> {pushLabel}
      </button>

      {footer && (
        <div
          className="insight-summary"
          style={{ marginTop: 14 }}
          dangerouslySetInnerHTML={richInnerHtml(footer)}
        />
      )}
    </div>
  );
}
