// List & sequence archetypes: ranked list, checklist, numbered milestones, vertical timeline.
import { Caption, SectionHeading } from './parts';
import type { SectionComponent, TemplateSkin } from '../types';
import type { ChecklistEntry } from '../../model/ExportDoc';

export const RankedList: SectionComponent<'rankedList'> = ({ data, skin }) => {
  const t = skin.tokens;
  const mono = skin.fonts.mono ?? skin.fonts.body;
  return (
    <div>
      <SectionHeading skin={skin} label={data.heading} />
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {data.items.map((it, i) => {
          const last = i === data.items.length - 1;
          return (
            <div
              key={i}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                gap: 16,
                padding: '13px 0',
                borderBottom: last ? 'none' : `1px solid ${t.rule}`,
              }}
            >
              <span
                style={{
                  fontFamily: skin.fonts.display,
                  fontSize: 19,
                  color: it.hot ? 'var(--accent)' : t.ink,
                }}
              >
                {it.name}
              </span>
              {it.meta && (
                <span
                  style={{
                    font: `500 11px/1.3 ${mono}`,
                    letterSpacing: '.03em',
                    color: t.muted,
                    textAlign: 'right',
                    flex: 'none',
                  }}
                >
                  {it.meta}
                </span>
              )}
            </div>
          );
        })}
      </div>
      {data.note && <Caption skin={skin} text={data.note} />}
    </div>
  );
};

function CheckBox({ status, skin }: { status?: ChecklistEntry['status']; skin: TemplateSkin }) {
  const t = skin.tokens;
  const done = status === 'done' || status === undefined;
  const doing = status === 'doing';
  return (
    <span
      style={{
        flex: 'none',
        width: 18,
        height: 18,
        borderRadius: 4,
        marginTop: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 11,
        fontWeight: 700,
        background: done ? 'var(--accent)' : 'transparent',
        border: done ? 'none' : `1.5px solid ${doing ? 'var(--accent)' : t.rule}`,
        color: '#fff',
      }}
    >
      {done ? (
        '✓'
      ) : doing ? (
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)' }} />
      ) : (
        ''
      )}
    </span>
  );
}

export const Checklist: SectionComponent<'checklist'> = ({ data, skin }) => {
  const t = skin.tokens;
  return (
    <div>
      <SectionHeading skin={skin} label={data.heading} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
        {data.items.map((it, i) => (
          <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <CheckBox status={it.status} skin={skin} />
            <span style={{ fontSize: 14, lineHeight: 1.45, color: t.ink }}>
              <b style={{ fontWeight: 600 }}>{it.title}</b>
              {it.note && <span style={{ color: t.muted }}> — {it.note}</span>}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export const NumberedMilestones: SectionComponent<'numberedMilestones'> = ({ data, skin }) => {
  const t = skin.tokens;
  const mono = skin.fonts.mono ?? skin.fonts.body;
  return (
    <div>
      <SectionHeading skin={skin} label={data.heading} />
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {data.items.map((it, i) => {
          const last = i === data.items.length - 1;
          return (
            <div
              key={i}
              style={{
                display: 'grid',
                gridTemplateColumns: '34px 1fr auto',
                gap: 18,
                alignItems: 'baseline',
                padding: '14px 0',
                borderBottom: last ? 'none' : `1px solid ${t.rule}`,
              }}
            >
              <span
                style={{ fontFamily: skin.fonts.display, fontSize: 24, color: 'var(--accent)' }}
              >
                {i + 1}
              </span>
              <div>
                <div style={{ fontFamily: skin.fonts.display, fontSize: 19, color: t.ink }}>
                  {it.title}
                </div>
                {it.body && (
                  <p style={{ margin: '3px 0 0', fontSize: 12.5, lineHeight: 1.5, color: t.muted }}>
                    {it.body}
                  </p>
                )}
              </div>
              {it.tag && (
                <span
                  style={{
                    font: `600 9.5px/1 ${mono}`,
                    letterSpacing: '.1em',
                    color: 'var(--accent)',
                    textTransform: 'uppercase',
                  }}
                >
                  {it.tag}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export const VerticalTimeline: SectionComponent<'verticalTimeline'> = ({ data, skin }) => {
  const t = skin.tokens;
  const mono = skin.fonts.mono ?? skin.fonts.body;
  // Reserve the left marker rail only when at least one event actually has a marker — otherwise
  // it leaves a wide blank gutter and the events read as floating bullets.
  const hasMarkers = data.events.some((e) => e.marker);
  return (
    <div>
      <SectionHeading skin={skin} label={data.heading} />
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {data.events.map((e, i) => {
          const last = i === data.events.length - 1;
          return (
            <div
              key={i}
              style={{
                display: 'grid',
                gridTemplateColumns: hasMarkers ? '116px 1fr' : '1fr',
                gap: 26,
                paddingBottom: last ? 0 : 28,
              }}
            >
              {hasMarkers && (
                <div style={{ textAlign: 'right', paddingTop: 2 }}>
                  {e.marker && (
                    <div
                      style={{
                        font: `600 9.5px/1.3 ${mono}`,
                        letterSpacing: '.12em',
                        color: t.faint,
                        textTransform: 'uppercase',
                      }}
                    >
                      {e.marker}
                    </div>
                  )}
                </div>
              )}
              <div
                style={{
                  borderLeft: `2px solid ${last ? 'transparent' : t.rule}`,
                  paddingLeft: 26,
                  position: 'relative',
                }}
              >
                <span
                  style={{
                    position: 'absolute',
                    left: -7,
                    top: 4,
                    width: 12,
                    height: 12,
                    borderRadius: '50%',
                    background: 'var(--accent)',
                    border: `3px solid ${t.pageBg}`,
                  }}
                />
                <div
                  style={{
                    fontFamily: skin.fonts.display,
                    fontSize: 21,
                    color: t.ink,
                    lineHeight: 1.1,
                  }}
                >
                  {e.title}
                </div>
                {e.body && (
                  <p style={{ margin: '5px 0 0', fontSize: 13, lineHeight: 1.5, color: t.muted }}>
                    {e.body}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
