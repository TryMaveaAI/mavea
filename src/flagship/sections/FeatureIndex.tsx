import { useState } from 'react';
import { FEATURES, FEATURE_GROUPS, type FeatureGroup } from '../../live/features/registry';
import { IS_SHOWCASE } from '../../lib/runtimeMode';
import { isShowcaseChapter } from '../../showcasePolicy';

// Use the app's own feature metadata so this directory follows the product as it evolves.
const GROUPS = FEATURE_GROUPS.filter((group) => group !== 'Setup');
const ENTRIES = FEATURES.filter((feature) => feature.group !== 'Setup');

export function FeatureIndex() {
  const [group, setGroup] = useState<FeatureGroup | 'All'>('All');
  const shown = ENTRIES.filter((feature) => group === 'All' || feature.group === group);
  return (
    <div className="ob-feature-index">
      <div className="ob-index-heading">
        <div>
          <h2>
            There’s a lot
            <br />
            <em>in here.</em>
          </h2>
        </div>
        <p>
          Documents, thought maps, courses, code, memory, video. Pick a thread. Each “Watch” opens a
          guided example on the real surface.
        </p>
      </div>
      <div className="ob-index-filters" aria-label="Feature categories">
        {(['All', ...GROUPS] as const).map((item) => (
          <button
            type="button"
            key={item}
            aria-pressed={group === item}
            onClick={() => setGroup(item)}
          >
            {item}
          </button>
        ))}
      </div>
      <div className="ob-index-grid">
        {shown.map((feature, i) => (
          <article key={feature.id}>
            <span className="ob-index-number">{String(i + 1).padStart(2, '0')}</span>
            <div>
              <h3>{feature.id === 'study' ? 'Guide me' : feature.label}</h3>
              <p>{feature.blurb}</p>
            </div>
            {feature.tourChapter && (!IS_SHOWCASE || isShowcaseChapter(feature.tourChapter)) ? (
              <a
                href={`#/live?tour=1&ch=${feature.tourChapter}&solo=1`}
                aria-label={`Watch ${feature.id === 'study' ? 'Guide me' : feature.label}`}
              >
                Watch ↗
              </a>
            ) : (
              <span className="ob-index-local">In the local app</span>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
