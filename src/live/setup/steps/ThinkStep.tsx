// ThinkStep.tsx — step 2: how Mavéa answers. Just the two most useful dials (web search and
// thinking time) — everything else defaults to great and lives in settings. Defaults
// are good, so this whole step is skippable; every control writes through the config store.
import { type ReactElement } from 'react';
import { getAdapter } from '../../providers';
import { useLiveConfig, setLiveConfigV2 } from '../../useLiveConfig';
import { SegRow } from '../controls';

export function ThinkStep(): ReactElement {
  const [cfg] = useLiveConfig();
  const caps = getAdapter(cfg.provider).capabilities;

  // Real-time is always pickable — it isn't disabled for a non-native provider, because that
  // reads as broken rather than as "this provider doesn't support it yet." The helper line below
  // carries that caveat instead: honest about it, but never a dead end.
  const searchHelper =
    cfg.searchMode === 'off'
      ? "Answers from the model's own knowledge — no web calls."
      : caps.nativeWebSearch
        ? 'Grounds fresh asks in live web results with citations, only when a question needs it.'
        : "This model has no built-in search, so Real-time won't ground anything right now. The four direct providers support it; on OpenRouter it depends on the selected model. Pick a search-capable model or leave this off.";

  return (
    <div className="step-body">
      <div className="field-block">
        <span className="card-eyebrow">Web search</span>
        <SegRow
          ariaLabel="Web search"
          value={cfg.searchMode}
          onPick={(v) => setLiveConfigV2({ searchMode: v as typeof cfg.searchMode })}
          options={[
            { value: 'off', label: 'Off', sub: 'model knowledge' },
            { value: 'realtime', label: 'Real-time', sub: 'live sources' },
          ]}
        />
        <p className="field-helper">{searchHelper}</p>
      </div>

      <div className="field-block">
        {/* Named exactly as Settings names it. It was "Answer quality" here and "Thinking time"
            there, so the dial a first-run visitor set in the wizard could not be found again by
            the name they set it under — including in the command palette. */}
        <span className="card-eyebrow">Thinking time</span>
        <SegRow
          ariaLabel="Thinking time"
          value={cfg.quality}
          onPick={(v) => setLiveConfigV2({ quality: v as typeof cfg.quality })}
          options={[
            { value: 'fast', label: 'Fast', sub: 'quickest' },
            { value: 'balanced', label: 'Balanced', sub: 'default' },
            { value: 'thorough', label: 'Thorough', sub: 'thinks more' },
          ]}
        />
        <p className="field-helper">
          Fast keeps replies snappy. Thorough buys two speculative turns per answer; Balanced
          glimpses cost up to three small calls per utterance.
        </p>
      </div>
    </div>
  );
}
