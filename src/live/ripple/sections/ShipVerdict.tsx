// ShipVerdict.tsx — the home of Ripple: the punchy, instant answer. A verdict you can read in a
// glance (Clear to ship / Review first / Hold), the one thing actually worth checking, and the living
// impact map rippling out from the change. The ten deep sections are still there — but on demand, as
// chips — so an ordinary PR reads confident and fast instead of a half-empty wall. Reads only the
// grounded model; everything deeper is one tap away.
import type { ReactElement } from 'react';
import { ImpactMap } from '../ImpactMap';
import type { Altitude, ShipModel, ShipNode } from '../model';
import './shipverdict.css';

type Tone = 'safe' | 'watch' | 'breaks' | 'neutral';

function firstSentence(s: string): string {
  const m = /^(.*?[.!?])(\s|$)/.exec(s.trim());
  return (m?.[1] ?? s).trim();
}

export function ShipVerdict({
  model,
  altitude,
  onNavigate,
  onAsk,
}: {
  model: ShipModel;
  altitude: Altitude;
  onNavigate: (id: string) => void;
  onAsk?: (node: ShipNode) => void;
}): ReactElement {
  const { pr, gate } = model;
  const exploring = model.changes.length === 0;

  const verdict: { label: string; tone: Tone } = exploring
    ? { label: 'Explore', tone: 'neutral' }
    : gate.decision === 'pass'
      ? { label: 'Clear to ship', tone: 'safe' }
      : gate.decision === 'block'
        ? { label: 'Hold', tone: 'breaks' }
        : { label: 'Review first', tone: 'watch' };

  const scale = exploring
    ? `${Math.max(0, model.nodes.length - 1)} areas · ${pr.files ?? 0} files`
    : `+${pr.added ?? 0} −${pr.removed ?? 0} · ${pr.files ?? model.changes.length} file${(pr.files ?? model.changes.length) === 1 ? '' : 's'}`;

  const what = firstSentence(pr.summary);
  const oneThing = pr.risks[0]?.text;

  // Depth, on demand — only the chapters this model actually has. The course leads when present.
  const chips: { id: string; label: string }[] = [
    ...(model.courses?.length || model.modules.length
      ? [
          {
            id: 'onboarding',
            label: model.courses?.length
              ? `Onboard · ${model.courses.length} course${model.courses.length === 1 ? '' : 's'}`
              : 'Onboarding',
          },
        ]
      : []),
    ...(model.changes.length
      ? [
          {
            id: 'workspace',
            label: `${model.changes.length} change${model.changes.length === 1 ? '' : 's'}`,
          },
        ]
      : []),
    ...(model.cascades.length ? [{ id: 'cascade', label: 'The cascade' }] : []),
    ...(model.migration ? [{ id: 'migration', label: 'The migration' }] : []),
    ...(model.rollout.length ? [{ id: 'rollout', label: 'Safe rollout' }] : []),
    ...(model.suggestions.length
      ? [
          {
            id: 'suggestions',
            label: `${model.suggestions.length} suggestion${model.suggestions.length === 1 ? '' : 's'}`,
          },
        ]
      : []),
    ...(model.hotspots.length ? [{ id: 'hotspots', label: 'The story' }] : []),
    ...(model.incident ? [{ id: 'incident', label: 'Incident' }] : []),
    { id: 'read', label: 'Full read' },
    ...(exploring ? [] : [{ id: 'gate', label: 'The gate' }]),
  ];

  return (
    <div className="ripple-verdict">
      <div className="ripple-verdict-head" data-tone={verdict.tone}>
        <div className="ripple-verdict-top">
          <span className="ripple-verdict-badge">{verdict.label}</span>
          <span className="ripple-verdict-scale">{scale}</span>
        </div>
        <p className="ripple-verdict-what">{what}</p>
        {oneThing ? (
          <div className="ripple-verdict-one">
            <span className="ripple-verdict-one-tag">
              {exploring ? 'Where to start' : 'The one thing to check'}
            </span>
            <span className="ripple-verdict-one-text">{oneThing}</span>
          </div>
        ) : (
          !exploring && (
            <div className="ripple-verdict-one ripple-verdict-clean">
              <span className="ripple-verdict-one-tag">Reads clean</span>
              <span className="ripple-verdict-one-text">
                Nothing risky pulled to the top — review and ship.
              </span>
            </div>
          )
        )}
      </div>

      <div className="ripple-verdict-map">
        <ImpactMap
          nodes={model.nodes}
          edges={model.edges}
          altitude={altitude}
          onAsk={onAsk}
          animate
        />
      </div>

      <div className="ripple-verdict-chips" aria-label="Go deeper">
        <span className="ripple-verdict-chips-tag">Go deeper</span>
        {chips.map((c) => (
          <button
            key={c.id}
            type="button"
            className="ripple-verdict-chip"
            onClick={() => onNavigate(c.id)}
          >
            {c.label}
          </button>
        ))}
      </div>
    </div>
  );
}
