import { useId, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { Icon } from '../../../icons/icons';
import type { SwitchVariant, VariantSwitchProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = VariantSwitchProps & { delay?: number };

/** One variant's body as clean paragraphs. `paragraphs` is loose model JSON: a lone string
 *  instead of an array is the common near-miss and still reads as one paragraph, anything else
 *  degrades to the no-text line. A throw here would take the whole card with it — BlockBoundary's
 *  fallback is `null`, so a crashed block leaves no message behind, just a hole. */
function bodyParagraphs(variant: SwitchVariant | undefined): string[] {
  const raw: readonly unknown[] = Array.isArray(variant?.paragraphs)
    ? variant.paragraphs
    : typeof variant?.paragraphs === 'string'
      ? [variant.paragraphs]
      : [];
  return raw.filter((p): p is string => typeof p === 'string' && p.trim() !== '');
}

// The same answer re-framed along ONE axis — warmer/firmer, shorter/longer, for an exec or for a
// five-year-old — with only the chosen framing on screen. compose/variants stacks every version at
// once, which is right for three subject lines and unreadable for three multi-paragraph rewrites;
// tabs switches between different SECTIONS, not between sayings of the same thing. Body text is
// paragraphs, deliberately: no nested blocks, so there is nothing here the coercer can't rebuild.
export function VariantSwitch({
  title,
  icon = 'sliders',
  iconColor = 'var(--presence)',
  axis,
  subject,
  variants,
  defaultVariant = 0,
  accent = 'var(--presence)',
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.sliders;
  // A non-array `variants` (an object keyed by label, a lone string) must not reach `.filter`,
  // and a variant with no label would render an unnamed chip nobody can tell apart.
  const all: readonly SwitchVariant[] = Array.isArray(variants) ? variants : [];
  const list = all.filter((v) => !!v && typeof v.label === 'string' && v.label.trim() !== '');
  const [active, setActive] = useState(() => Math.max(0, Math.round(defaultVariant) || 0));
  const chipRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const uid = useId();
  const panelId = `${uid}-panel`;
  const soloLabelId = `${uid}-solo`;
  const tabId = (i: number): string => `${uid}-tab-${i}`;

  // Clamp at RENDER, not just on init: props are re-supplied data, and a variant list that
  // shrank between renders would otherwise leave `active` pointing past the end.
  const idx = list.length ? Math.min(active, list.length - 1) : 0;
  const cur = list[idx];
  const paras = bodyParagraphs(cur);
  // One variant is not a choice: no tablist, so the panel is a plain named region instead of a
  // tabpanel pointing at a tab that was never rendered.
  const tabbed = list.length > 1;

  // WAI-ARIA tablist keyboard nav, matching the family's tabs block: arrows wrap, Home/End jump
  // to the ends, focus follows selection, and the roving tabindex keeps the strip one Tab stop.
  const onChipKey = (e: KeyboardEvent<HTMLButtonElement>, i: number): void => {
    let next: number;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (i + 1) % list.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp')
      next = (i - 1 + list.length) % list.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = list.length - 1;
    else return;
    e.preventDefault();
    setActive(next);
    chipRefs.current[next]?.focus();
  };

  return (
    <div
      className="card reveal lay-vs"
      style={
        {
          ['--delay' as string]: (delay || 0) + 'ms',
          ['--vs-acc' as string]: accent,
        } as CSSProperties
      }
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      {subject && <p className="lay-vs-subject">{subject}</p>}

      {list.length === 0 ? (
        <div className="lay-vs-empty faint">
          <Icon.eyeOff className="ic" /> No versions to switch between.
        </div>
      ) : (
        <>
          {/* One variant is not a choice — show its body without a switch that can't move. */}
          {tabbed && (
            <div className="lay-vs-switch">
              {axis && <span className="lay-vs-axis">{axis}</span>}
              <div className="lay-vs-chips" role="tablist" aria-label={axis || 'Versions'}>
                {list.map((v, i) => {
                  // `?? null`, not a bare lookup: a model can hand back an icon name that isn't
                  // in the set, and rendering `undefined` as a component throws the whole canvas.
                  const VIc = (v.icon && Icon[v.icon]) ?? null;
                  return (
                    <button
                      key={i}
                      ref={(el) => {
                        chipRefs.current[i] = el;
                      }}
                      id={tabId(i)}
                      role="tab"
                      type="button"
                      className={`lay-vs-chip ${i === idx ? 'on' : ''}`}
                      aria-selected={i === idx}
                      aria-controls={panelId}
                      tabIndex={i === idx ? 0 : -1}
                      onClick={() => setActive(i)}
                      onKeyDown={(e) => onChipKey(e, i)}
                    >
                      {VIc && <VIc className="ic lay-vs-chip-ic" />}
                      <span>{v.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* The panel scrolls (max-height + overflow-y) and holds no focusable content, so it
              takes a tabindex of its own — without it a keyboard-only reader can reach the chips
              but never scroll a long rewrite. That is the WAI-ARIA tabs pattern's own advice for
              a panel with nothing focusable inside it. */}
          <div
            className="lay-vs-panel"
            key={idx}
            id={panelId}
            role={tabbed ? 'tabpanel' : 'group'}
            aria-labelledby={tabbed ? tabId(idx) : soloLabelId}
            tabIndex={0}
          >
            {!tabbed && (
              <span className="lay-vs-solo-label" id={soloLabelId}>
                {cur?.label}
              </span>
            )}
            {paras.length === 0 ? (
              <p className="lay-vs-para faint">No text for this version.</p>
            ) : (
              paras.map((p, i) => (
                <p
                  key={i}
                  className="lay-vs-para m-stagger-item m-fade-rise"
                  style={{ ['--i' as string]: i } as CSSProperties}
                >
                  {p}
                </p>
              ))
            )}
          </div>

          {/* Typed check, not truthiness: a model that answers with an object here would print
              "[object Object]" at best and throw as a React child at worst. */}
          {typeof cur?.when === 'string' && cur.when.trim() !== '' && (
            <p className="lay-vs-when faint">
              <Icon.spark className="ic lay-vs-when-ic" />
              {cur.when}
            </p>
          )}
        </>
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
