// Live appearance control — one premium selector for both the topbar and Settings.
// Template and brightness remain two independent persisted choices, but they are presented
// together because people experience them as one workspace identity.
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactElement,
} from 'react';
import { applyTheme, readTheme, writeTheme, type Theme } from '../lib/theme';
import {
  TEMPLATES,
  type TemplateId,
  readTemplate,
  persistTemplate,
  applyTemplate,
  prewarmTemplateFonts,
  mountTemplateSkin,
} from './templates';
import { useLiveConfig, type LiveConfigV2 } from './useLiveConfig';
import { useFontScaleStamp } from './fontScale';

const FONT_SCALES: LiveConfigV2['fontScale'][] = ['smaller', 'normal', 'larger'];
const FONT_SCALE_LABEL: Record<LiveConfigV2['fontScale'], string> = {
  smaller: 'Smaller',
  normal: 'Normal',
  larger: 'Larger',
};

const APPEARANCE_CHANGE_EVENT = 'mavea:appearancechange';

interface AppearanceState {
  template: TemplateId;
  theme: Theme;
}

function announceAppearance(state: AppearanceState): void {
  window.dispatchEvent(
    new CustomEvent<AppearanceState>(APPEARANCE_CHANGE_EVENT, { detail: state }),
  );
}

function useAppearanceState(): {
  active: TemplateId;
  theme: Theme;
  fontScale: LiveConfigV2['fontScale'];
  pickTemplate: (id: TemplateId) => void;
  pickTheme: (theme: Theme) => void;
  pickFontScale: (scale: LiveConfigV2['fontScale']) => void;
} {
  const [active, setActive] = useState<TemplateId>(() => readTemplate());
  const [theme, setTheme] = useState<Theme>(() => readTheme());
  const [liveCfg, setLiveCfg] = useLiveConfig();
  useFontScaleStamp(liveCfg.fontScale);

  useEffect(() => {
    const sync = (event: Event): void => {
      const detail = (event as CustomEvent<AppearanceState>).detail;
      if (!detail) return;
      setActive(detail.template);
      setTheme(detail.theme);
    };
    window.addEventListener(APPEARANCE_CHANGE_EVENT, sync);
    return () => window.removeEventListener(APPEARANCE_CHANGE_EVENT, sync);
  }, []);

  const pickTemplate = useCallback((id: TemplateId) => {
    prewarmTemplateFonts(document, id);
    applyTemplate(document, id);
    persistTemplate(id);
    const next = { template: id, theme: readTheme() };
    setActive(id);
    setTheme(next.theme);
    announceAppearance(next);
  }, []);

  const pickTheme = useCallback((nextTheme: Theme) => {
    applyTheme(nextTheme);
    writeTheme(nextTheme);
    const next = { template: readTemplate(), theme: nextTheme };
    setActive(next.template);
    setTheme(nextTheme);
    announceAppearance(next);
  }, []);

  const pickFontScale = useCallback(
    (scale: LiveConfigV2['fontScale']) => setLiveCfg({ fontScale: scale }),
    [setLiveCfg],
  );

  return { active, theme, fontScale: liveCfg.fontScale, pickTemplate, pickTheme, pickFontScale };
}

function Preview({ templateId }: { templateId: TemplateId }): ReactElement {
  const template = TEMPLATES.find((candidate) => candidate.id === templateId) ?? TEMPLATES[0];
  const style = {
    '--preview-bg': template.preview.background,
    '--preview-surface': template.preview.surface,
    '--preview-ink': template.preview.ink,
    '--preview-accent': template.preview.accent,
  } as CSSProperties;
  return (
    <span
      className={`appearance-preview appearance-preview--${template.preview.geometry}`}
      style={style}
      aria-hidden="true"
    >
      <span className="appearance-preview-aa">Aa</span>
      <span className="appearance-preview-copy">
        <i />
        <i />
      </span>
      <span className="appearance-preview-data">08</span>
    </span>
  );
}

function AppearancePanel({
  active,
  theme,
  fontScale,
  embedded = false,
  onPickTemplate,
  onPickTheme,
  onPickFontScale,
  onClose,
  optionRefs,
}: {
  active: TemplateId;
  theme: Theme;
  fontScale: LiveConfigV2['fontScale'];
  embedded?: boolean;
  onPickTemplate: (id: TemplateId) => void;
  onPickTheme: (theme: Theme) => void;
  onPickFontScale: (scale: LiveConfigV2['fontScale']) => void;
  onClose?: () => void;
  optionRefs?: React.MutableRefObject<Array<HTMLButtonElement | null>>;
}): ReactElement {
  const headingId = useId();

  const moveFocus = (event: ReactKeyboardEvent<HTMLButtonElement>, index: number): void => {
    let next: number;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown')
      next = (index + 1) % TEMPLATES.length;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp')
      next = (index - 1 + TEMPLATES.length) % TEMPLATES.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = TEMPLATES.length - 1;
    else return;
    event.preventDefault();
    optionRefs?.current[next]?.focus();
  };

  return (
    <div
      className={`appearance-panel${embedded ? ' is-embedded' : ''}`}
      role={embedded ? undefined : 'dialog'}
      aria-modal={embedded ? undefined : true}
      aria-labelledby={headingId}
    >
      <div className="appearance-head">
        <div>
          <h2 id={headingId}>{embedded ? 'Appearance' : 'Choose your workspace'}</h2>
          <p>A visual identity for how you think.</p>
        </div>
        {onClose && (
          <button
            type="button"
            className="appearance-close"
            onClick={onClose}
            aria-label="Close appearance"
          >
            ×
          </button>
        )}
      </div>

      <div className="appearance-mode" aria-label="Color mode">
        <span>Color mode</span>
        <div className="appearance-segmented">
          {(['light', 'dark'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              aria-pressed={theme === mode}
              className={theme === mode ? 'is-active' : ''}
              onClick={() => onPickTheme(mode)}
            >
              <span className={`appearance-mode-icon is-${mode}`} aria-hidden="true" />
              {mode === 'light' ? 'Light' : 'Dark'}
            </button>
          ))}
        </div>
      </div>

      <div className="appearance-mode" aria-label="Text size">
        <span>Text size</span>
        <div className="appearance-segmented is-triple">
          {FONT_SCALES.map((scale) => (
            <button
              key={scale}
              type="button"
              aria-pressed={fontScale === scale}
              className={fontScale === scale ? 'is-active' : ''}
              onClick={() => onPickFontScale(scale)}
            >
              {FONT_SCALE_LABEL[scale]}
            </button>
          ))}
        </div>
      </div>

      <div className="appearance-grid" role="radiogroup" aria-label="Workspace themes">
        {TEMPLATES.map((template, index) => (
          <button
            key={template.id}
            ref={(node) => {
              if (optionRefs) optionRefs.current[index] = node;
            }}
            type="button"
            role="radio"
            aria-label={`${template.label}, ${template.persona}. ${template.tagline} Best for ${template.bestFor}.`}
            aria-checked={template.id === active}
            tabIndex={template.id === active ? 0 : -1}
            className={`appearance-option${template.id === active ? ' is-active' : ''}`}
            onClick={() => onPickTemplate(template.id)}
            onKeyDown={(event) => moveFocus(event, index)}
            // Warm only the faces of the template being considered — opening the picker used to
            // load EVERY template's faces (~600KB) up front. Hover covers the pointer, focus
            // covers arrow-key browsing, and a straight click still prewarms inside
            // onPickTemplate itself; FontFaceSet.load resolves instantly for already-loaded faces.
            onPointerEnter={() => prewarmTemplateFonts(document, template.id)}
            onFocus={() => prewarmTemplateFonts(document, template.id)}
          >
            <Preview templateId={template.id} />
            <span className="appearance-option-copy">
              <span className="appearance-option-title">
                <strong>{template.label}</strong>
                <em>{template.persona}</em>
              </span>
              <span className="appearance-option-tagline">{template.tagline}</span>
              <span className="appearance-option-best">
                Best for {template.bestFor.toLowerCase()}
              </span>
              <span className="appearance-option-font">{template.preview.fontRole}</span>
            </span>
            <span className="appearance-check" aria-hidden="true">
              ✓
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function TemplatePicker({
  triggerClassName = 'topbar-icon-btn',
}: { triggerClassName?: string } = {}): ReactElement {
  const { active, theme, fontScale, pickTemplate, pickTheme, pickFontScale } = useAppearanceState();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => mountTemplateSkin(document), []);

  const close = useCallback(() => {
    setOpen(false);
    requestAnimationFrame(() => triggerRef.current?.focus());
  }, []);

  useEffect(() => {
    if (!open) return;
    const selected = TEMPLATES.findIndex((template) => template.id === active);
    requestAnimationFrame(() => {
      const mobile = window.matchMedia?.('(max-width: 720px)').matches ?? false;
      if (mobile) {
        rootRef.current
          ?.querySelector<HTMLButtonElement>('.appearance-close')
          ?.focus({ preventScroll: true });
        return;
      }
      optionRefs.current[Math.max(0, selected)]?.focus({ preventScroll: true });
    });

    const onDown = (event: PointerEvent): void => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) close();
    };
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== 'Tab' || !rootRef.current) return;
      const focusable = Array.from(
        rootRef.current.querySelectorAll<HTMLButtonElement>('button:not([disabled])'),
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [active, close, open]);

  const current = TEMPLATES.find((template) => template.id === active) ?? TEMPLATES[0];

  return (
    <div className="tpl-picker appearance-picker" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className={`${triggerClassName} tpl-btn appearance-trigger`}
        onClick={() => setOpen((value) => !value)}
        title={`Appearance: ${current.label} · ${current.persona} · ${theme === 'light' ? 'Light' : 'Dark'}`}
        aria-label={`Choose appearance (current: ${current.label}, ${current.persona}, ${theme} mode)`}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <span className="appearance-mark" aria-hidden="true">
          <i style={{ background: current.preview.accent }} />
          <i style={{ background: current.preview.surface }} />
        </span>
      </button>
      {open && (
        <>
          <button
            className="appearance-backdrop"
            type="button"
            onClick={close}
            aria-label="Close appearance"
          />
          <AppearancePanel
            active={active}
            theme={theme}
            fontScale={fontScale}
            onPickTemplate={pickTemplate}
            onPickTheme={pickTheme}
            onPickFontScale={pickFontScale}
            onClose={close}
            optionRefs={optionRefs}
          />
        </>
      )}
    </div>
  );
}

/** The same identity gallery, embedded in Settings rather than duplicated as a second design. */
export function AppearanceSettings(): ReactElement {
  const { active, theme, fontScale, pickTemplate, pickTheme, pickFontScale } = useAppearanceState();
  // Without these the roving tabindex leaves five of the six templates with no tab stop AND no
  // arrow path (moveFocus preventDefaults either way), so the workspace was unreachable from the
  // keyboard in Settings even though it works in the topbar picker.
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  return (
    <AppearancePanel
      embedded
      optionRefs={optionRefs}
      active={active}
      theme={theme}
      fontScale={fontScale}
      onPickTemplate={pickTemplate}
      onPickTheme={pickTheme}
      onPickFontScale={pickFontScale}
    />
  );
}
