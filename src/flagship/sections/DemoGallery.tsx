// The demo gallery. Every card replays a curated model-generated fixture on the same Live surface
// used by interactive sessions. Clicking a card hands off to #/live in demo replay mode; no key is
// needed, and the UI labels the fictional choreography so it cannot be mistaken for a live result.
import { DEMO_CATEGORIES, castMember, type DemoCastMember } from '../../demo/cast';
import { Icon } from '../../icons/icons';
import { SectionHead } from '../parts';

/** Emoji avatars get a soft tinted disc; initials get a filled gradient disc. */
function isEmojiAvatar(avatar: string): boolean {
  return /\p{Extended_Pictographic}/u.test(avatar);
}

/** All four use-case demos, each paired with its category label. */
const ALL_DEMOS = DEMO_CATEGORIES.map((cat) => ({
  cat,
  persona: castMember(cat.persona),
})).filter(
  (d): d is { cat: (typeof DEMO_CATEGORIES)[number]; persona: DemoCastMember } => !!d.persona,
);

export function DemoGallery({ onPlay }: { onPlay: (p: DemoCastMember) => void }) {
  return (
    <>
      <SectionHead
        eyebrow="Curated examples"
        sub="Each fictional scenario is a prerecorded, model-generated answer sequence with curated feature choreography on the production UI. No live provider call runs during playback."
      >
        Watch a prerecorded workflow
      </SectionHead>

      <div className="fl-demo-grid">
        {ALL_DEMOS.map(({ cat, persona: p }) => (
          <button
            key={p.id}
            type="button"
            className="fl-demo-card"
            style={{ ['--accent' as string]: p.accent }}
            onClick={() => onPlay(p)}
          >
            <div className="fl-demo-top">
              <span className={'fl-demo-avatar' + (isEmojiAvatar(p.avatar) ? ' emoji' : '')}>
                {p.avatar}
              </span>
              <span className="fl-demo-name">{p.useCase}</span>
              <span className="fl-demo-role">
                {p.name} · {p.role}
              </span>
            </div>
            <span className="fl-demo-blurb">{p.blurb}</span>
            {/* The category sits at the foot, not beside the title: in the header it took a third
                of the line, and one card's title and persona wrapped where its neighbours' did
                not — four lines of header against two. */}
            <span className="fl-demo-foot">
              <span className="fl-demo-play">
                <Icon.play /> Play curated replay
              </span>
              <span className="fl-demo-badge">{cat.label}</span>
            </span>
          </button>
        ))}
      </div>
    </>
  );
}
