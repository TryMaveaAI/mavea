// DashboardOverview — the "how this works" page (#/dashboards/overview). New users land here from the
// home tile or the empty gallery; it explains the lifecycle (talk → track → it stays live), the honest
// update model, and what runs on your own API key — then sends you into Live to start one. Static,
// token-styled, light/dark safe.
import { type ReactElement } from 'react';
import { dashHref } from './route';

const STEPS = [
  {
    n: '1',
    title: 'You ask',
    body: 'Type anything worth following — “Yankees scores”, “AAPL price”, “weather in Denver” — or talk it through in Live if it’s something you’re reasoning about.',
  },
  {
    n: '2',
    title: 'Mavéa plans it',
    body: 'It designs the live cards: which numbers to watch, which shapes fit the data (a scoreboard, a forecast, a chart), and the exact standing query each one re-runs. If what you asked is a fixed fact — something that won’t change — Mavéa just answers it once instead of tracking it.',
  },
  {
    n: '3',
    title: 'You review',
    body: 'The plan is yours before it exists — toggle pieces off, rename it, or fold it into a dashboard you already have.',
  },
  {
    n: '4',
    title: 'It stays live',
    body: 'While Mavéa is open it refreshes on the cadence you picked, shows only real fetched data, and flags anything that crosses a line you set. Dashboards due around the same time share a batch of searches rather than each firing its own, and your predictions, their grading, and the morning briefing all ride along on those same checks — no extra searches spent.',
  },
  {
    n: '5',
    title: 'You shape it',
    body: 'Drag tiles to reorder, resize, add or remove. Talk to it anytime — “add …” adds in one step. Tune how often it refreshes.',
  },
];

const ALERTS = [
  {
    tag: 'PUSH',
    accent: 'var(--insight)',
    name: 'Push notifications',
    body: 'A native browser notification — gated on a permission grant you give explicitly. There’s no push subscription or background listener, so it can only fire while Mavéa is open, same as everything else here.',
  },
];

const LAYERS = [
  {
    tag: 'FREE',
    accent: 'var(--insight)',
    name: 'What you and your conversations give it',
    body: 'The context from your conversations, the values you supply, and any later chat on the topic — all free.',
  },
  {
    tag: 'FREE',
    accent: 'var(--insight)',
    name: 'The threshold checks',
    body: 'Checking whether a number crossed a line you set is a plain comparison — it runs constantly at no cost.',
  },
  {
    tag: 'YOUR KEY',
    accent: 'var(--presence)',
    name: 'The interpretation',
    body: 'Mavéa reading the latest numbers and telling you what changed is one model call on your own key — it fires when a line you set is crossed, on a schedule you pick, or the moment you tap “Read the numbers now.” On its own, most days: none.',
  },
  {
    tag: 'BUDGET',
    accent: 'var(--warning)',
    name: 'Your daily search budget',
    body: 'You set a daily cap on automatic searches across all your dashboards together. Hit it and automatic checks pause for the day — nothing silently keeps spending. "Refresh now" and every other action you trigger yourself still works; only the on-its-own checking waits until tomorrow.',
  },
];

export function DashboardOverview(): ReactElement {
  return (
    <div className="dash-overview">
      <section className="dash-ov-hero">
        <div className="dash-ov-kicker">Dashboards</div>
        <h1 className="dash-ov-title">Ask for anything. Mavéa keeps it live.</h1>
        <p className="dash-ov-lede">
          Track anything in one sentence — scores, a price, the weather, a story — and Mavéa plans
          the live cards and keeps them current while it’s open. Set a line on any number and it
          flags the moment that line is crossed.
        </p>
        <div className="dash-ov-cta">
          <a className="dash-cta" href={dashHref.gallery}>
            Track something →
          </a>
          <a className="dash-ov-link" href="#/live">
            Or start in Live →
          </a>
        </div>
      </section>

      <section className="dash-ov-section">
        <div className="dash-ov-label">The lifecycle</div>
        <div className="dash-ov-steps">
          {STEPS.map((s) => (
            <div className="dash-ov-step" key={s.n}>
              <span className="dash-ov-step-n">{s.n}</span>
              <div className="dash-ov-step-text">
                <div className="dash-ov-step-title">{s.title}</div>
                <div className="dash-ov-step-body">{s.body}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="dash-ov-section">
        <div className="dash-ov-label">How it stays current — and what it costs</div>
        <div className="dash-ov-layers">
          {LAYERS.map((l) => (
            <div className="dash-ov-layer" key={l.name}>
              <span className="dash-ov-layer-tag" style={{ ['--tag' as string]: l.accent }}>
                {l.tag}
              </span>
              <div className="dash-ov-step-text">
                <div className="dash-ov-step-title">{l.name}</div>
                <div className="dash-ov-step-body">{l.body}</div>
              </div>
            </div>
          ))}
        </div>
        <p className="dash-ov-note">
          Mavéa never shows a made-up number, and it only refreshes while it’s open — no silent
          background billing. Each dashboard’s settings show its API usage and a reminder to check
          your model’s pricing, and your budget page shows real counts of what’s actually run —
          never an invented figure.
        </p>
      </section>

      <section className="dash-ov-section">
        <div className="dash-ov-label">Alerts</div>
        <div className="dash-ov-layers">
          {ALERTS.map((a) => (
            <div className="dash-ov-layer" key={a.name}>
              <span className="dash-ov-layer-tag" style={{ ['--tag' as string]: a.accent }}>
                {a.tag}
              </span>
              <div className="dash-ov-step-text">
                <div className="dash-ov-step-title">{a.name}</div>
                <div className="dash-ov-step-body">{a.body}</div>
              </div>
            </div>
          ))}
        </div>
        <p className="dash-ov-note">
          In-dashboard notices are on by default; push is off until you turn it on per dashboard, in
          its own settings.
        </p>
      </section>
    </div>
  );
}
