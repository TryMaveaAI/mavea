import { useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { RoutingProps } from './types';
import { richInnerHtml } from '../../../lib/richText';
import { wireGeometry, type WireGeometry } from './routingWires';

type Props = RoutingProps & { delay?: number };

export function Routing({
  title,
  icon = 'share',
  iconColor = 'var(--presence)',
  query,
  classifier = 'router',
  choices,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.share;
  const takenIdx = Math.max(
    0,
    choices.findIndex((c) => c.taken),
  );
  // default selection highlights the taken path; clicking inspects another branch
  const [sel, setSel] = useState<number>(takenIdx);

  const selected = choices[sel];

  const wiresRef = useRef<SVGSVGElement>(null);
  const sourceRef = useRef<HTMLDivElement>(null);
  const queryRef = useRef<HTMLDivElement>(null);
  const choicesRef = useRef<HTMLDivElement>(null);
  const [wires, setWires] = useState<WireGeometry | null>(null);

  useLayoutEffect(() => {
    const svg = wiresRef.current;
    const list = choicesRef.current;
    const source = queryRef.current ?? sourceRef.current;
    if (!svg || !list || !source) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const next = wireGeometry(
        svg.getBoundingClientRect(),
        source.getBoundingClientRect(),
        [...list.children].map((el) => el.getBoundingClientRect()),
      );
      setWires((prev) =>
        prev &&
        next &&
        prev.height === next.height &&
        prev.from === next.from &&
        prev.to.every((y, i) => y === next.to[i])
          ? prev
          : next,
      );
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
    ro?.observe(svg);
    ro?.observe(list);
    list.addEventListener('scroll', schedule, { passive: true });
    return () => {
      if (frame) cancelAnimationFrame(frame);
      ro?.disconnect();
      list.removeEventListener('scroll', schedule);
    };
  }, [choices.length, query]);

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="ai-ro">
        <div className="ai-ro-source" ref={sourceRef}>
          {query && (
            <div className="ai-ro-query" ref={queryRef}>
              {query}
            </div>
          )}
          <div className="ai-ro-classifier">
            <Icon.sparkle className="ic" style={{ color: iconColor }} /> {classifier}
          </div>
        </div>

        <svg
          ref={wiresRef}
          className="ai-ro-wires"
          viewBox={`0 0 40 ${wires?.height ?? 100}`}
          preserveAspectRatio="none"
          aria-hidden
        >
          {choices.map((c, i) => {
            // Until the first measure lands, an even split stands in so nothing flashes empty.
            const from = wires?.from ?? 50;
            const y = wires?.to[i] ?? ((i + 0.5) / choices.length) * 100;
            const on = c.taken;
            return (
              <path
                key={i}
                d={`M0 ${from} C 20 ${from}, 20 ${y}, 40 ${y}`}
                fill="none"
                stroke={on ? c.color || 'var(--insight)' : 'var(--grid-strong)'}
                strokeWidth={on ? 2.4 : 1.4}
                strokeDasharray={on ? '0' : '3 3'}
              />
            );
          })}
        </svg>

        <div className="ai-ro-choices" ref={choicesRef}>
          {choices.map((c, i) => {
            const cc = c.color || (c.taken ? 'var(--insight)' : 'var(--text-muted)');
            return (
              <button
                key={i}
                className={
                  'ai-ro-choice' + (c.taken ? ' is-taken' : '') + (sel === i ? ' is-sel' : '')
                }
                style={{ ['--c' as string]: cc } as CSSProperties}
                onClick={() => setSel(i)}
              >
                <span className="ai-ro-choice-top">
                  <span className="ai-ro-choice-label">{c.label}</span>
                  {c.taken && (
                    <span className="ai-ro-taken">
                      <Icon.check className="ic" />
                    </span>
                  )}
                </span>
                {c.sub && <span className="ai-ro-choice-sub">{c.sub}</span>}
                {typeof c.score === 'number' && (
                  <span className="ai-ro-choice-meter">
                    <span style={{ width: `${c.score * 100}%`, background: cc }} />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {selected && selected.reason && (
        <div
          className="ai-ro-reason"
          style={
            {
              ['--c' as string]:
                selected.color || (selected.taken ? 'var(--insight)' : 'var(--presence)'),
            } as CSSProperties
          }
        >
          <Icon.quote className="ic" />
          <span>
            <strong>{selected.label}</strong> —{' '}
            <span dangerouslySetInnerHTML={richInnerHtml(selected.reason)} />
          </span>
        </div>
      )}

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
