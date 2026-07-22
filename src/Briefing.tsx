// The Briefing — Mavéa speaks first. The Demo home opens with a friendly "Good afternoon. Three
// things since yesterday." and three tinted summary cards; tapping one dives straight into that
// canvas. This is SCRIPTED demo content (deterministic, like the persona sessions and the rest of
// the demo) — a showcase of what a daily briefing feels like. It lives only on the Demo home, never
// on the Live BYOK surface, where invented "since yesterday" numbers would violate real-data-only.
import type { ComponentType, CSSProperties, SVGProps } from 'react';
import { Icon } from './icons/icons';
import { greetingFor } from './lib/greeting';
import './briefing.css';

interface BriefItem {
  /** The demo topic this card dives into. */
  topic: string;
  accent: string;
  Ic: ComponentType<SVGProps<SVGSVGElement>>;
  eyebrow: string;
  headline: string;
  detail: string;
}

// Scripted, and consistent with the demo topics each card opens (money / sleep / trip).
const ITEMS: BriefItem[] = [
  {
    topic: 'money',
    accent: 'var(--presence)',
    Ic: Icon.cart,
    eyebrow: 'Spending',
    headline: 'Spending spike resolved',
    detail: '−$310 vs last week',
  },
  {
    topic: 'sleep',
    accent: 'var(--warning)',
    Ic: Icon.moon,
    eyebrow: 'Sleep',
    headline: 'You slept 5h 40m',
    detail: '1h 20m under your goal',
  },
  {
    topic: 'trip',
    accent: 'var(--insight)',
    Ic: Icon.globe,
    eyebrow: 'Lisbon',
    headline: 'Lisbon in 11 days',
    detail: '1 task due Thursday',
  },
];

interface Props {
  /** Open a demo topic's canvas (the surface wires this to its topic intent). */
  onOpen: (topic: string) => void;
  /** Injectable for tests; defaults to the current hour. */
  hour?: number;
}

export function Briefing({ onOpen, hour }: Props) {
  const h = hour ?? new Date().getHours();
  return (
    <section className="briefing" aria-label="Your briefing">
      <h2 className="briefing-greeting">
        {greetingFor(h)}.{' '}
        <span className="briefing-greeting-sub">Three things since yesterday.</span>
      </h2>
      <div className="briefing-grid">
        {ITEMS.map((it) => (
          <button
            key={it.topic}
            type="button"
            className="briefing-card"
            style={{ ['--brief-accent' as string]: it.accent } as CSSProperties}
            onClick={() => onOpen(it.topic)}
            aria-label={`${it.headline}. Dive in.`}
          >
            <span className="briefing-icon">
              <it.Ic />
            </span>
            <span className="briefing-eyebrow">{it.eyebrow}</span>
            <span className="briefing-headline">{it.headline}</span>
            <span className="briefing-detail">{it.detail}</span>
            <span className="briefing-go">
              Dive in <Icon.chevR />
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
