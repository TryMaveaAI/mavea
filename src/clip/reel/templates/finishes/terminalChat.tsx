// A chat as a terminal session: a window chrome over mono prompt lines (you ▸ / mavea ▸), a blinking
// caret on the last line — the "talking to a machine" aesthetic, on the dark wash.
import type { SlideProps } from '../types';
import { fitText, BODY_TIERS } from '../fitText';

export function TerminalChatSlide({ slots }: SlideProps<'chat'>) {
  const msgs = slots.messages.slice(0, 4);
  return (
    <div
      className="reel-fade"
      style={{
        width: 'calc(var(--rw) * 90)',
        maxWidth: '94%',
        borderRadius: 'calc(var(--ru) * 2.4)',
        border: '1px solid color-mix(in oklab, var(--reel-ink) 22%, transparent)',
        background: 'rgba(10,12,22,0.55)',
        overflow: 'hidden',
      }}
    >
      <style>{`@keyframes term-blink{0%,100%{opacity:1}50%{opacity:0}}`}</style>
      <div
        style={{
          display: 'flex',
          gap: 'calc(var(--rw) * 1.4)',
          padding: 'calc(var(--ru) * 1.8) calc(var(--rw) * 3)',
          borderBottom: '1px solid color-mix(in oklab, var(--reel-ink) 16%, transparent)',
        }}
      >
        {['#ff5f57', '#febc2e', '#28c840'].map((c) => (
          <span
            key={c}
            style={{
              width: 'calc(var(--ru) * 1.4)',
              height: 'calc(var(--ru) * 1.4)',
              borderRadius: '50%',
              background: c,
            }}
          />
        ))}
      </div>
      <div
        style={{
          padding: 'calc(var(--ru) * 3) calc(var(--rw) * 3.4)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'calc(var(--ru) * 2.2)',
        }}
      >
        {msgs.map((m, i) => {
          const mine = m.role === 'user';
          const last = i === msgs.length - 1;
          // Each prompt line re-sets to its message length; the window chrome stays fixed and the
          // longer lines just wrap smaller, like a real terminal at a narrower column.
          const f = fitText(m.text, BODY_TIERS);
          return (
            <div
              key={i}
              data-fit-tier={f.tier}
              style={{
                fontWeight: 500,
                fontFamily: 'var(--reel-mono)',
                color: 'var(--reel-ink)',
                animation: `reel-rise 0.4s ease-out ${i * 0.18}s both`,
                ...f.style,
              }}
            >
              <span
                style={{
                  color: mine ? 'var(--reel-accent-2)' : 'var(--reel-accent)',
                  fontWeight: 700,
                }}
              >
                {mine ? 'you ▸ ' : 'mavea ▸ '}
              </span>
              {m.text}
              {last && (
                <span
                  style={{
                    display: 'inline-block',
                    width: 'calc(var(--rw) * 1.4)',
                    height: 'calc(var(--ru) * 2.6)',
                    marginLeft: 'calc(var(--rw) * 0.8)',
                    background: 'var(--reel-accent)',
                    verticalAlign: 'text-bottom',
                    animation: 'term-blink 1s step-end infinite',
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
