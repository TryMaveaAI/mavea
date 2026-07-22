// ConnectStep.tsx — step 1: choose the mind. A row of provider tiles, the model + API key, a
// live readiness strip ("Looks good. Session-only unless remembered; sent through this deployment.")
// with a Test
// button, and the remember-key switch. Every control writes straight through the existing config
// store (setLiveConfigV2 / setProviderField) — this is a fresh view over the same persistence.
import { useCallback, useEffect, useId, useRef, useState, type ReactElement } from 'react';
import type { ProviderId } from '../../../types/mavea';
import { VISIBLE_PROVIDERS, providerInfo, type ProviderInfo } from '../../providers';
import {
  useLiveConfig,
  setLiveConfigV2,
  setProviderField,
  getLiveConfigV2,
  toModelConfig,
} from '../../useLiveConfig';
// Import from the catalog-free leaf, not generateLive — a static import of the engine here would
// pull the whole catalog into the eager Live-mount chunk just to render a readiness dot.
import { checkLiveReady } from '../../ready';
import { ToggleRow, EyeInput } from '../controls';
import { ModelSelect } from '../ModelSelect';
import { ProviderResponsibilityNotice } from '../ProviderResponsibilityNotice';

/** How each provider presents as a tile: a one-letter badge, a short name, and the company. */
const TILE: Record<ProviderId, { badge: string; name: string; sub: string }> = {
  gemini: { badge: 'G', name: 'Gemini', sub: 'Google' },
  anthropic: { badge: 'A', name: 'Claude', sub: 'Anthropic' },
  openai: { badge: 'O', name: 'GPT', sub: 'OpenAI' },
  grok: { badge: 'X', name: 'Grok', sub: 'xAI' },
  openrouter: { badge: 'R', name: 'OpenRouter', sub: 'Many models' },
};

/** A short, honest line about how the picked provider grounds answers in live web data — so
 *  users know what real-time search to expect before they commit a key. */
const SEARCH_HINT: Record<ProviderInfo['search'], string> = {
  native: 'Real-time web search built in (grounds server-side when a question needs it).',
  app: 'Web grounding via Wikipedia, or your own Brave/Tavily search key.',
  local: 'Web grounding via Wikipedia when you ask for it.',
};

/** A hint of the key's shape per provider, so users recognize they're pasting the right thing. */
const KEY_PLACEHOLDER: Partial<Record<ProviderId, string>> = {
  anthropic: 'sk-ant-…',
  openai: 'sk-…',
  gemini: 'AIza…',
  grok: 'xai-…',
  openrouter: 'sk-or-…',
};

/** The company a key travels to (for the privacy line), from the provider's "Name · Company" label. */
function companyOf(label: string): string {
  return label.split(' · ')[1] ?? label;
}

export function ConnectStep(): ReactElement {
  const keyFieldId = useId();
  const [cfg] = useLiveConfig();
  const info = providerInfo(cfg.provider);
  // Raw is what the user actually typed (may be empty); `model` softly falls back to the
  // provider's default for readiness checks and messaging — toModelConfig() does the same
  // fallback for the real request, so this mirrors the effective model. The input itself must
  // stay bound to `rawModel`: binding it to the defaulted `model` used to snap the field back to
  // the default the instant a backspace emptied it, making it impossible to actually clear.
  const rawModel = cfg.models[cfg.provider] ?? '';
  const model = rawModel || info.defaultModel;
  const key = cfg.keys[cfg.provider] ?? '';

  const [ready, setReady] = useState<{ llm: boolean; model: boolean; statusCode?: number } | null>(
    null,
  );
  const [checking, setChecking] = useState(false);
  const probeSeq = useRef(0);

  const probe = useCallback(async () => {
    const seq = ++probeSeq.current;
    setChecking(true);
    const r = await checkLiveReady(toModelConfig(getLiveConfigV2()), { tts: false });
    if (seq === probeSeq.current) {
      setReady({ llm: r.llm, model: r.model, statusCode: r.statusCode });
      setChecking(false);
    }
  }, []);

  // Re-probe shortly after any provider/model/key change settles (debounced, like LiveSettings).
  // Skip entirely while a required key is missing — an empty-key probe can't succeed, and its
  // stale result can otherwise win the seq race below and overwrite a valid one (e.g. selecting
  // a provider schedules an empty-key probe that fires after the key is typed and tested).
  useEffect(() => {
    if (info.needsKey && !key) {
      setReady(null);
      return;
    }
    const t = setTimeout(() => void probe(), 400);
    return () => clearTimeout(t);
  }, [cfg.provider, model, key, probe, info.needsKey]);

  // A model id is required — gateways (OpenRouter) ship no default, so the user types their own.
  const ok = !!ready?.llm && !!ready?.model && !!model;
  const tone = checking ? 'checking' : ok ? 'ok' : 'warn';
  const strong = checking
    ? 'Checking…'
    : info.needsKey && !key
      ? 'Add your API key.'
      : !model
        ? 'Choose a model.'
        : ok
          ? 'Looks good.'
          : ready?.llm
            ? 'Reachable, but the model was not found.'
            : ready?.statusCode === 401
              ? 'Invalid API key.'
              : ready?.statusCode === 403
                ? 'Key lacks permission.'
                : ready?.statusCode === 404
                  ? 'Model not found.'
                  : ready?.statusCode !== undefined
                    ? `Error ${ready.statusCode}.`
                    : 'Not reachable.';
  const rest = ok
    ? `Kept in memory unless you choose Remember; sent through this deployment to ${companyOf(info.label)} when used.`
    : '';

  return (
    <div className="step-body">
      <div className="provider-tiles" role="radiogroup" aria-label="Provider">
        {VISIBLE_PROVIDERS.map((p) => {
          const t = TILE[p.id];
          const active = p.id === cfg.provider;
          return (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={active}
              className={'provider-tile' + (active ? ' is-selected' : '')}
              onClick={() => setLiveConfigV2({ provider: p.id })}
            >
              <span className="provider-badge">{t.badge}</span>
              <span className="provider-name">{t.name}</span>
              <span className="provider-sub">{t.sub}</span>
            </button>
          );
        })}
      </div>

      <div className="field-grid">
        <div className="field-col">
          <span className="field-head">
            <span className="card-eyebrow">Model</span>
          </span>
          <ModelSelect
            key={cfg.provider}
            provider={cfg.provider}
            value={rawModel}
            onChange={(v) => setProviderField(cfg.provider, 'model', v)}
          />
          {info.modelNotes?.[model] && (
            <span className="field-helper">{info.modelNotes[model]}</span>
          )}
          <span className="field-helper">{SEARCH_HINT[info.search]}</span>
        </div>

        {info.needsKey && (
          <label className="field-col" htmlFor={keyFieldId}>
            <span className="field-head">
              <span className="card-eyebrow">API key</span>
            </span>
            <EyeInput
              id={keyFieldId}
              value={key}
              onChange={(v) => setProviderField(cfg.provider, 'key', v)}
              placeholder={KEY_PLACEHOLDER[cfg.provider] ?? 'paste your key'}
              ariaLabel="API key"
            />
            {info.keyUrl && (
              <a
                className="field-helper field-helper-link"
                href={info.keyUrl}
                target="_blank"
                rel="noreferrer noopener"
              >
                Get a key&#x2197;
              </a>
            )}
            {/* Least-privilege nudge: the key never leaves this device unencrypted, but the surest
                protection is a key that can't do much harm if it ever leaks — a spend cap and, where
                the provider allows, a scoped/restricted key bound the blast radius to near zero. */}
            <span className="field-helper">
              Tip: use a restricted, spend-capped key — if it's ever exposed, the cost and access
              stay bounded.
            </span>
          </label>
        )}
      </div>

      <div className={'status-strip ' + tone}>
        <span className="status-strip-dot" aria-hidden />
        <span className="status-strip-text">
          <strong>{strong}</strong>
          {rest && ' ' + rest}
        </span>
        <button
          type="button"
          className="status-strip-test"
          onClick={() => void probe()}
          title="Re-check the connection"
        >
          Test
        </button>
      </div>

      {info.needsKey && (
        <ToggleRow
          label="Remember this key on this device"
          on={cfg.rememberKey}
          onToggle={() => setLiveConfigV2({ rememberKey: !cfg.rememberKey })}
          note={
            cfg.rememberKey
              ? 'Saved encrypted in this browser; use only on a trusted device.'
              : 'Kept in memory only, cleared when you reload.'
          }
        />
      )}

      <ProviderResponsibilityNotice />
    </div>
  );
}
