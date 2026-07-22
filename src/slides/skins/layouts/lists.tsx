// List layouts: numbered agenda, the process/checklist steps row, and the horizontal roadmap.
// Steps and phases use equal-width columns (capped upstream at 5) so they never crowd; the agenda
// is a ruled vertical list. Type is sized by the column count and clamped, so long labels and dense
// steps stay inside the 1920×1080 frame.
import { Bar, displayWeight, kickerFont, SlideFrame } from '../chrome/bits';
import type { SlideLayout } from '../types';
import { AGENDA_ITEM_TIERS, clampStyle, pickTier, titleTier } from './fit';

export const Agenda: SlideLayout<'agenda'> = ({ slide, skin, ctx }) => {
  const t = skin.tokens;
  const d = slide.data;
  const head = titleTier(d.title.length);
  return (
    <SlideFrame slideId={slide.id} skin={skin} ctx={ctx} kicker={slide.kicker}>
      <div
        style={{
          flex: '1 1 auto',
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 40,
          minWidth: 0,
        }}
      >
        <div
          data-fit-tier={head.size}
          style={{
            font: `${displayWeight(skin)} ${head.size}px/${head.line} ${skin.fonts.display}`,
            letterSpacing: '-0.015em',
            color: t.ink,
            ...clampStyle(head.maxLines),
          }}
        >
          {d.title}
        </div>
        <div
          style={{
            flex: '1 1 auto',
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            borderBottom: `1px solid ${t.rule}`,
          }}
        >
          {d.items.map((it, i) => {
            const item = pickTier(it.title.length, AGENDA_ITEM_TIERS);
            return (
              <div
                key={i}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '120px 1fr auto',
                  gap: 32,
                  alignItems: 'center',
                  padding: '22px 0',
                  minHeight: 84,
                  // Rows share the leftover band equally, so a three-item agenda fills the frame
                  // with generous ruled rows instead of pooling empty space beneath the list.
                  flex: '1 1 0',
                  borderTop: `${i === 0 ? 2 : 1}px solid ${i === 0 ? t.ruleStrong : t.rule}`,
                  minWidth: 0,
                  boxSizing: 'border-box',
                }}
              >
                <span
                  style={{
                    font: `${displayWeight(skin)} 54px/1 ${skin.fonts.display}`,
                    color: 'var(--accent-ink)',
                  }}
                >
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span
                  style={{
                    font: `600 ${item.size}px/${item.line} ${skin.fonts.body}`,
                    color: t.ink,
                    minWidth: 0,
                    ...clampStyle(item.maxLines),
                  }}
                >
                  {it.title}
                </span>
                {it.sub ? (
                  <span
                    style={{
                      font: `400 26px/1.2 ${skin.fonts.body}`,
                      color: t.muted,
                      textAlign: 'right',
                      maxWidth: 560,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {it.sub}
                  </span>
                ) : (
                  <span />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </SlideFrame>
  );
};

export const Process: SlideLayout<'process'> = ({ slide, skin, ctx }) => {
  const t = skin.tokens;
  const d = slide.data;
  const n = Math.max(1, d.steps.length);
  const head = d.title ? titleTier(d.title.length) : null;
  // Scale per-step type with the column count: a two/three-step row earns display scale so it
  // owns the frame, while five columns tighten so they never crush their bodies.
  const titleSize = n <= 3 ? 42 : 32;
  const bodySize = n <= 3 ? 30 : n >= 5 ? 24 : 27;
  const bodyLines = n <= 3 ? 6 : 3;
  const numeralSize = n <= 3 ? 128 : 96;
  // A checklist whose items are bare titles reads best as a two-column ruled list at reading
  // scale — a single row of tiny check chips strands the rest of the frame.
  const asList = !!d.checks && n >= 4 && !d.steps.some((s) => s.body);
  return (
    <SlideFrame slideId={slide.id} skin={skin} ctx={ctx} kicker={slide.kicker}>
      <div
        style={{
          flex: '1 1 auto',
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 48,
          minWidth: 0,
        }}
      >
        {head ? (
          <div
            data-fit-tier={head.size}
            style={{
              font: `${displayWeight(skin)} ${head.size}px/${head.line} ${skin.fonts.display}`,
              letterSpacing: '-0.015em',
              color: t.ink,
              ...clampStyle(head.maxLines),
            }}
          >
            {d.title}
          </div>
        ) : null}
        {asList ? (
          <div
            style={{
              flex: '1 1 auto',
              minHeight: 0,
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              columnGap: 96,
              alignContent: 'center',
              minWidth: 0,
            }}
          >
            {d.steps.map((s, i) => {
              const done = s.status === 'done';
              return (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 28,
                    padding: '30px 0',
                    borderTop: `1px solid ${t.rule}`,
                    minWidth: 0,
                  }}
                >
                  <span
                    style={{
                      width: 56,
                      height: 56,
                      borderRadius: '50%',
                      display: 'grid',
                      placeItems: 'center',
                      flex: '0 0 auto',
                      background: done ? 'var(--accent)' : 'transparent',
                      border: done ? 'none' : `2px solid ${t.rule}`,
                      color: done ? (skin.tokens.dark ? t.ink : '#fff') : t.muted,
                      font: `700 30px/1 ${skin.fonts.body}`,
                    }}
                  >
                    {done ? '✓' : ''}
                  </span>
                  <span
                    style={{
                      font: `500 36px/1.25 ${skin.fonts.body}`,
                      color: t.ink,
                      minWidth: 0,
                      ...clampStyle(2),
                    }}
                  >
                    {s.title}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <div
            style={{
              flex: '1 1 auto',
              minHeight: 0,
              display: 'grid',
              gridTemplateColumns: `repeat(${n}, 1fr)`,
              alignContent: 'center',
              gap: 40,
              minWidth: 0,
            }}
          >
            {d.steps.map((s, i) => {
              const done = s.status === 'done';
              const marker = d.checks ? (done ? '✓' : '') : String(i + 1);
              return (
                <div
                  key={i}
                  style={{
                    minWidth: 0,
                    borderTop: `2px solid ${t.ruleStrong}`,
                    paddingTop: 28,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 16,
                  }}
                >
                  {d.checks ? (
                    <span
                      style={{
                        width: 56,
                        height: 56,
                        borderRadius: '50%',
                        display: 'grid',
                        placeItems: 'center',
                        background: done ? 'var(--accent)' : 'transparent',
                        border: done ? 'none' : `2px solid ${t.rule}`,
                        color: done ? (skin.tokens.dark ? t.ink : '#fff') : t.muted,
                        font: `700 30px/1 ${skin.fonts.body}`,
                      }}
                    >
                      {marker}
                    </span>
                  ) : (
                    <span
                      style={{
                        font: `${displayWeight(skin)} ${numeralSize}px/0.9 ${skin.fonts.display}`,
                        color: `color-mix(in oklab, ${t.ink} 16%, transparent)`,
                      }}
                    >
                      {marker}
                    </span>
                  )}
                  <div
                    style={{
                      font: `${displayWeight(skin)} ${titleSize}px/1.15 ${skin.fonts.display}`,
                      color: t.ink,
                      minWidth: 0,
                      ...clampStyle(2),
                    }}
                  >
                    {s.title}
                  </div>
                  {s.body ? (
                    <div
                      style={{
                        font: `400 ${bodySize}px/1.45 ${skin.fonts.body}`,
                        color: t.muted,
                        minWidth: 0,
                        ...clampStyle(bodyLines),
                      }}
                    >
                      {s.body}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </SlideFrame>
  );
};

export const Roadmap: SlideLayout<'roadmap'> = ({ slide, skin, ctx }) => {
  const t = skin.tokens;
  const d = slide.data;
  const n = Math.max(1, d.phases.length);
  const hasPct = d.phases.some((p) => typeof p.pct === 'number');
  const head = d.title ? titleTier(d.title.length) : null;
  const phaseSize = n <= 3 ? 46 : 38;
  const bodySize = n <= 3 ? 30 : 28;
  const bodyLines = n <= 3 ? 4 : 3;
  return (
    <SlideFrame slideId={slide.id} skin={skin} ctx={ctx} kicker={slide.kicker}>
      <div
        style={{
          flex: '1 1 auto',
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 56,
          minWidth: 0,
        }}
      >
        {head ? (
          <div
            data-fit-tier={head.size}
            style={{
              font: `${displayWeight(skin)} ${head.size}px/${head.line} ${skin.fonts.display}`,
              letterSpacing: '-0.015em',
              color: t.ink,
              ...clampStyle(head.maxLines),
            }}
          >
            {d.title}
          </div>
        ) : null}
        <div
          style={{
            flex: '1 1 auto',
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            minWidth: 0,
          }}
        >
          <div
            style={{
              position: 'relative',
              display: 'grid',
              gridTemplateColumns: `repeat(${n}, 1fr)`,
              gap: 40,
              minWidth: 0,
            }}
          >
            <div
              style={{
                position: 'absolute',
                left: 14,
                right: 14,
                top: 14,
                height: 2,
                background: t.rule,
              }}
              aria-hidden
            />
            {d.phases.map((p, i) => (
              <div
                key={i}
                style={{
                  minWidth: 0,
                  position: 'relative',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 14,
                }}
              >
                <span
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    background: 'var(--accent)',
                    position: 'relative',
                    zIndex: 1,
                  }}
                />
                {p.marker ? (
                  <span
                    style={{
                      font: `700 24px/1 ${kickerFont(skin)}`,
                      letterSpacing: '0.18em',
                      textTransform: 'uppercase',
                      color: t.faint,
                      marginTop: 8,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {p.marker}
                  </span>
                ) : null}
                <div
                  style={{
                    font: `${displayWeight(skin)} ${phaseSize}px/1.1 ${skin.fonts.display}`,
                    color: t.ink,
                    minWidth: 0,
                    ...clampStyle(2),
                  }}
                >
                  {p.title}
                </div>
                {p.body ? (
                  <div
                    style={{
                      font: `400 ${bodySize}px/1.4 ${skin.fonts.body}`,
                      color: t.muted,
                      minWidth: 0,
                      ...clampStyle(bodyLines),
                    }}
                  >
                    {p.body}
                  </div>
                ) : null}
                {hasPct ? (
                  <div style={{ marginTop: 8 }}>
                    <Bar skin={skin} pct={p.pct ?? 0} height={10} />
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </div>
    </SlideFrame>
  );
};
