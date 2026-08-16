// WorldLab (#/worldlab, dev only) — the living-answer surface on the WHOLE scenario corpus, so the
// morph between the three representations, the provenance cards, the edge receipts and the what-if
// lanes can be judged on any of the hundred authored worlds without a model key or a real turn.
// Same harness idea as #/whylab and #/mindlab: one fixed spec at a time, the whole viewport, no
// rail and no dock.
//
// The pick lives in the HASH (`#/worldlab?s=<id>`), not in component state alone: a defect found on
// `chain-rainforest` is then a link a colleague can open, it survives the reload that follows every
// CSS edit, and scripts/world-audit.mts drives the same corpus by walking those URLs.
import { useEffect, useRef, useState, type ReactElement } from 'react';
import { WorldOverlay } from './WorldOverlay';
import {
  ALL_WORLD_SCENARIOS,
  SCENARIO_BATCHES,
  allWorldScenario,
  type WorldScenario,
} from './scenarios/index';
import './worldLab.css';

const ROUTE = '#/worldlab';
/** The world the surface itself ships with — the one everything else is judged against. */
const DEFAULT_ID = 'seed-2008';
/** …and the scenario behind it. Resolved rather than assumed, so a corpus that renamed the seed
 *  opens on its first world instead of on nothing. */
const SEED: WorldScenario = allWorldScenario(DEFAULT_ID) ?? ALL_WORLD_SCENARIOS[0];

/** Which batch each scenario came from, first claimant winning exactly as `ALL_WORLD_SCENARIOS`
 *  de-duplicates — so the picker's groups can never disagree with the list it is grouping. */
const BATCH_OF: ReadonlyMap<string, string> = (() => {
  const owner = new Map<string, string>();
  for (const batch of SCENARIO_BATCHES) {
    for (const s of batch.scenarios) if (!owner.has(s.id)) owner.set(s.id, batch.name);
  }
  return owner;
})();

/** The scenario named by `#/worldlab?s=<id>`, or the seed when the hash names nothing we have. A
 *  stale link is a dead end nobody debugs, so an unknown id falls back rather than rendering empty. */
function readScenarioId(): string {
  if (typeof window === 'undefined') return DEFAULT_ID;
  const query = window.location.hash.split('?')[1] ?? '';
  const asked = new URLSearchParams(query).get('s');
  return asked && allWorldScenario(asked) ? asked : DEFAULT_ID;
}

/** Does this scenario answer to what was typed? Id, label and note all match, because the note is
 *  where the shape lives ("deep narrow chain") and the shape is usually what a QA pass is after. */
function matches(scenario: WorldScenario, needle: string): boolean {
  if (!needle) return true;
  const q = needle.toLowerCase();
  return (
    scenario.id.toLowerCase().includes(q) ||
    scenario.label.toLowerCase().includes(q) ||
    scenario.note.toLowerCase().includes(q)
  );
}

/** Is the keystroke aimed at something that is collecting text? The bracket keys walk the corpus,
 *  but only when nobody is typing them into the filter. */
function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.tagName !== 'string') return false;
  return (
    el.isContentEditable ||
    el.tagName === 'INPUT' ||
    el.tagName === 'TEXTAREA' ||
    el.tagName === 'SELECT'
  );
}

export function WorldLab(): ReactElement {
  const [id, setId] = useState(readScenarioId);
  const [filter, setFilter] = useState('');

  const scenario = allWorldScenario(id) ?? SEED;
  const matched = ALL_WORLD_SCENARIOS.filter((s) => matches(s, filter));
  // The current scenario stays in the list even when the filter excludes it: the <select> has to
  // have an option to be showing, and a picker that silently un-picks what is on screen lies.
  const visible = matched.includes(scenario) ? matched : [scenario, ...matched];
  const at = visible.indexOf(scenario);

  // The hash is the source of truth, so Back/Forward and a pasted link land where they should.
  // Writing it also drives this state (the hashchange handler reads it straight back), which is
  // why `select` sets both: the event is asynchronous and the picker must not lag it.
  const select = (next: string): void => {
    setId(next);
    window.location.hash = `${ROUTE}?s=${next}`;
  };
  /** Walk the list on screen, wrapping — end to end and straight round again is the whole point. */
  const step = (delta: number): void => {
    const next = visible[(at + delta + visible.length) % visible.length];
    if (next) select(next.id);
  };

  // Read-through refs (the motion.ts idiom) so the one keydown listener never re-subscribes as the
  // pick moves — a listener that churns on every scenario is the bug this harness exists to find.
  const stepRef = useRef(step);
  stepRef.current = step;

  useEffect(() => {
    const onHash = (): void => setId(readScenarioId());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== '[' && e.key !== ']') return;
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      e.preventDefault();
      stepRef.current(e.key === ']' ? 1 : -1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="wl-root">
      <div className="wl-bar">
        <input
          className="wl-filter"
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="filter by id, label or shape"
          aria-label="Filter scenarios"
        />
        <select
          className="wl-pick"
          value={scenario.id}
          onChange={(e) => select(e.target.value)}
          aria-label="Scenario"
        >
          {SCENARIO_BATCHES.map((batch) => {
            const inBatch = visible.filter((s) => BATCH_OF.get(s.id) === batch.name);
            return inBatch.length === 0 ? null : (
              <optgroup key={batch.name} label={batch.name}>
                {inBatch.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </optgroup>
            );
          })}
        </select>
        <span className="wl-count">
          {at + 1}/{visible.length}
        </span>
        {/* The bracket keys are the fast path; the buttons are how anyone discovers they exist. */}
        <button
          type="button"
          className="wl-step"
          onClick={() => step(-1)}
          aria-label="Previous scenario"
        >
          [
        </button>
        <button
          type="button"
          className="wl-step"
          onClick={() => step(1)}
          aria-label="Next scenario"
        >
          ]
        </button>
        <code className="wl-id">{scenario.id}</code>
        <span className="wl-note" title={scenario.note}>
          {scenario.note}
        </span>
      </div>
      {/* Keyed so switching scenarios remounts: the overlay holds its own levers, selection and
          camera fit, and a lever left on one world must not carry into the next. */}
      <div className="wl-stage">
        <WorldOverlay key={scenario.id} spec={scenario.spec} />
      </div>
    </div>
  );
}
