import { type CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { Idea, IdeaBoardProps } from './types';
import { BlockEmpty } from '../../lib';
import { richInnerHtml } from '../../../lib/richText';

type Props = IdeaBoardProps & { delay?: number };

/** One lens's worth of ideas. `angle` is absent for the ungrouped spread. */
interface AngleGroup {
  angle?: string;
  ideas: Idea[];
}

/** Angle tints cycle through the neutral accents only — never `--danger`, and never a
 *  hot→cold ramp like the tier-list rail. A spread must not imply that the first lens is the
 *  best one; the colors say "a different way of looking at it", nothing more. */
const ANGLE_TINTS = [
  'var(--presence)',
  'var(--insight)',
  'var(--warning)',
  'var(--presence-soft)',
  'var(--insight-soft)',
];

/** The entrance stagger stops climbing here, so a board of many angles still lands promptly. */
const MAX_STAGGER_INDEX = 9;

/** Bucket ideas by their angle, keeping first-appearance order for both the angles and the
 *  ideas inside each. Ideas with no angle share one unlabelled group, which is what makes a
 *  flat spread (no angles anywhere) render as a single ungrouped board for free. */
function groupByAngle(ideas: readonly Idea[] | undefined): AngleGroup[] {
  // Annotated rather than inferred: `Array.isArray` widens a `readonly T[]` to `any[]`, and the
  // point of this guard is that loose model JSON can't reach React, not that it loses its type.
  const list: readonly Idea[] = Array.isArray(ideas) ? ideas : [];
  const groups: AngleGroup[] = [];
  const byAngle = new Map<string, AngleGroup>();
  for (const idea of list) {
    const label = typeof idea?.label === 'string' ? idea.label.trim() : '';
    if (!label) continue;
    const angle = typeof idea.angle === 'string' ? idea.angle.trim() : '';
    const note = typeof idea.note === 'string' ? idea.note.trim() : '';
    let group = byAngle.get(angle);
    if (!group) {
      group = { angle: angle || undefined, ideas: [] };
      byAngle.set(angle, group);
      groups.push(group);
    }
    group.ideas.push({ label, note: note || undefined, angle: angle || undefined });
  }
  return groups;
}

// A divergent spread: many different ideas laid out side by side under equal-weight angles,
// with nothing numbered, scored, or crowned. Every other list block in the library converges —
// picks ranks, tierlist grades, quadrant places knowns, takeaways concludes — so a "give me
// ideas" ask had no home that showed breadth without naming a winner.
export function IdeaBoard({
  title,
  icon = 'sparkle',
  iconColor = 'var(--presence)',
  ask,
  ideas,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] ?? Icon.sparkle;
  const groups = groupByAngle(ideas);

  if (groups.length === 0) {
    return (
      <div
        className="card reveal"
        style={{ ['--delay' as string]: (delay ?? 0) + 'ms' } as CSSProperties}
      >
        <div className="card-eyebrow">
          <Ic className="ic" style={{ color: iconColor }} /> {title}
        </div>
        <BlockEmpty message="No ideas yet" />
      </div>
    );
  }

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay ?? 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      {/* The question the spread answers — quoted, so the ideas below read as replies to it */}
      {ask && <div className="ibd-ask">{ask}</div>}

      <div className="ibd-board">
        {groups.map((group, gi) => (
          <div
            key={gi}
            className="ibd-angle m-stagger-item m-fade-rise"
            style={
              {
                ['--i' as string]: Math.min(gi, MAX_STAGGER_INDEX),
                ['--ibd-tint' as string]: ANGLE_TINTS[gi % ANGLE_TINTS.length],
              } as CSSProperties
            }
          >
            {group.angle && (
              <div className="ibd-angle-head">
                <span className="ibd-angle-label">{group.angle}</span>
                <span className="ibd-angle-count tab-num">{group.ideas.length}</span>
                {/* A fading hairline, not a rail: it separates lenses without ranking them */}
                <span className="ibd-angle-rule" aria-hidden="true" />
              </div>
            )}

            <div className="ibd-ideas">
              {group.ideas.map((idea, ii) => (
                <div key={ii} className="ibd-idea">
                  <span className="ibd-idea-label">{idea.label}</span>
                  {idea.note && <span className="ibd-idea-note">{idea.note}</span>}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

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
