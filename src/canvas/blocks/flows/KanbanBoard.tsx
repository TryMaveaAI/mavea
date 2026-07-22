import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { KanbanBoardProps, KanbanCard } from './types';

type Props = KanbanBoardProps & { delay?: number };

type Placed = { card: KanbanCard; stageAccent?: string };

export function KanbanBoard({
  title,
  icon = 'layers',
  iconColor = 'var(--presence)',
  stages,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.layers;
  // map of cardId -> stage index (initialized from the data)
  const [pos, setPos] = useState<Record<string, number>>(() => {
    const m: Record<string, number> = {};
    stages.forEach((s, si) => s.cards.forEach((c) => (m[c.id] = si)));
    return m;
  });
  const [lifted, setLifted] = useState<string | null>(null);

  const move = (id: string, dir: 1 | -1) =>
    setPos((p) => {
      const next = Math.max(0, Math.min(stages.length - 1, (p[id] ?? 0) + dir));
      return { ...p, [id]: next };
    });

  const allCards = useMemo(() => {
    const m: Record<string, KanbanCard> = {};
    stages.forEach((s) => s.cards.forEach((c) => (m[c.id] = c)));
    return m;
  }, [stages]);

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>
      <div className="fl-kanban">
        {stages.map((stage, si) => {
          const cards: Placed[] = Object.keys(pos)
            .filter((id) => pos[id] === si)
            .map((id) => ({ card: allCards[id], stageAccent: stage.accent }));
          return (
            <div className="fl-kb-col" key={stage.name}>
              <div className="fl-kb-head">
                <span
                  className="fl-kb-dot"
                  style={{ background: stage.accent || 'var(--presence)' }}
                />
                <span className="fl-kb-name">{stage.name}</span>
                <span className="fl-kb-count tab-num">{cards.length}</span>
              </div>
              <div className="fl-kb-body">
                {cards.map(({ card }) => (
                  <div
                    key={card.id}
                    className={'fl-kb-card' + (lifted === card.id ? ' is-lift' : '')}
                    onMouseEnter={() => setLifted(card.id)}
                    onMouseLeave={() => setLifted(null)}
                    style={
                      { ['--c' as string]: stage.accent || 'var(--presence)' } as CSSProperties
                    }
                  >
                    <div className="fl-kb-card-top">
                      {card.tag && (
                        <span
                          className="fl-kb-tag"
                          style={{ color: card.tagColor || 'var(--presence-soft)' }}
                        >
                          {card.tag}
                        </span>
                      )}
                      {card.points != null && (
                        <span className="fl-kb-pts tab-num">{card.points}</span>
                      )}
                    </div>
                    <div className="fl-kb-card-title">{card.title}</div>
                    <div className="fl-kb-card-foot">
                      {card.assignee && <span className="fl-kb-who">{card.assignee}</span>}
                      <div className="fl-kb-nav">
                        <button
                          className="fl-kb-arrow"
                          disabled={si === 0}
                          onClick={() => move(card.id, -1)}
                          title="Move left"
                          aria-label="Move left"
                        >
                          <Icon.chevR className="ic" style={{ transform: 'rotate(180deg)' }} />
                        </button>
                        <button
                          className="fl-kb-arrow"
                          disabled={si === stages.length - 1}
                          onClick={() => move(card.id, 1)}
                          title="Move right"
                          aria-label="Move right"
                        >
                          <Icon.chevR className="ic" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
                {cards.length === 0 && <div className="fl-kb-empty">Drop zone</div>}
              </div>
            </div>
          );
        })}
      </div>
      {footer && (
        <div className="insight-summary" style={{ marginTop: 12 }}>
          {footer}
        </div>
      )}
    </div>
  );
}
