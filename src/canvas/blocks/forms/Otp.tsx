import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, ClipboardEvent, KeyboardEvent } from 'react';
import { Icon } from '../../../icons/icons';
import type { OtpProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = OtpProps & { delay?: number };

export function Otp({
  title,
  icon = 'lock',
  iconColor = 'var(--presence)',
  prompt = 'Enter the 6-digit code we sent you.',
  length = 6,
  code,
  resendLabel = "Didn't get it? Resend code",
  color = 'var(--presence)',
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.lock;
  // clamp to a finite integer in [2,8]: a NaN/fractional length would make Array(n) throw "Invalid array length"
  const n = Math.max(2, Math.min(8, Math.floor(length) || 6));
  const [digits, setDigits] = useState<string[]>(Array(n).fill(''));
  const [focusIdx, setFocusIdx] = useState<number>(-1);
  const [resent, setResent] = useState(false);
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const resentTimer = useRef<number | undefined>(undefined);

  // Clear the stored timeout on unmount so a pending "New code sent" reset can't fire late.
  useEffect(() => () => window.clearTimeout(resentTimer.current), []);

  const joined = digits.join('');
  const complete = joined.length === n && digits.every((d) => d !== '');
  const verified = complete && (code == null || joined === code);
  const errored = complete && code != null && joined !== code;

  const focusBox = (i: number) => {
    const el = refs.current[i];
    if (el) {
      el.focus();
      el.select();
    }
  };

  // No backend to call from a canvas card, so "resend" does the honest local thing: clear the
  // entry, return focus to the first box, and acknowledge briefly (never claims a code was sent).
  const resend = () => {
    setDigits(Array(n).fill(''));
    setResent(true);
    focusBox(0);
    window.clearTimeout(resentTimer.current);
    resentTimer.current = window.setTimeout(() => setResent(false), 2200);
  };

  const setAt = (i: number, v: string) => {
    setDigits((d) => {
      const next = [...d];
      next[i] = v;
      return next;
    });
  };

  const onChange = (i: number, raw: string) => {
    const v = raw.replace(/\D/g, '');
    if (!v) {
      setAt(i, '');
      return;
    }
    // accept a multi-char value (e.g. fast typing) by spilling into following boxes
    const chars = v.split('');
    setDigits((d) => {
      const next = [...d];
      let p = i;
      for (const c of chars) {
        if (p >= n) break;
        next[p] = c;
        p++;
      }
      return next;
    });
    const land = Math.min(n - 1, i + chars.length);
    focusBox(land);
  };

  const onKey = (i: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (digits[i]) {
        setAt(i, '');
      } else if (i > 0) {
        focusBox(i - 1);
        setAt(i - 1, '');
      }
      e.preventDefault();
    } else if (e.key === 'ArrowLeft' && i > 0) {
      focusBox(i - 1);
    } else if (e.key === 'ArrowRight' && i < n - 1) {
      focusBox(i + 1);
    }
  };

  const onPaste = (i: number, e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const txt = e.clipboardData
      .getData('text')
      .replace(/\D/g, '')
      .slice(0, n - i);
    if (!txt) return;
    setDigits((d) => {
      const next = [...d];
      txt.split('').forEach((c, k) => {
        if (i + k < n) next[i + k] = c;
      });
      return next;
    });
    focusBox(Math.min(n - 1, i + txt.length));
  };

  const stateColor = verified ? 'var(--insight)' : errored ? 'var(--danger)' : color;

  return (
    <div
      className="card reveal"
      style={
        {
          ['--delay' as string]: (delay || 0) + 'ms',
          ['--otp-c' as string]: stateColor,
        } as CSSProperties
      }
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      {prompt && <div className="otp-prompt dim">{prompt}</div>}

      <div className={`otp-boxes ${verified ? 'verified' : ''} ${errored ? 'errored' : ''}`}>
        {digits.map((d, i) => (
          <input
            key={i}
            ref={(el) => {
              refs.current[i] = el;
            }}
            className={`otp-box ${d ? 'filled' : ''} ${focusIdx === i ? 'is-focus' : ''}`}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={1}
            value={d}
            aria-label={`Digit ${i + 1}`}
            onChange={(e) => onChange(i, e.target.value)}
            onKeyDown={(e) => onKey(i, e)}
            onPaste={(e) => onPaste(i, e)}
            onFocus={() => setFocusIdx(i)}
            onBlur={() => setFocusIdx(-1)}
          />
        ))}
      </div>

      <div className="otp-status">
        {verified ? (
          <span className="otp-msg ok">
            <Icon.shield className="ic" /> Code verified
          </span>
        ) : errored ? (
          <span className="otp-msg err">
            <Icon.alert className="ic" /> Incorrect code — try again
          </span>
        ) : resent ? (
          <span className="otp-msg ok">
            <Icon.check className="ic" /> New code sent
          </span>
        ) : (
          <button type="button" className="otp-resend" onClick={resend}>
            <Icon.undo className="ic" /> {resendLabel}
          </button>
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
