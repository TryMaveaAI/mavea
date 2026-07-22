// The demo gallery. Every card replays a frozen model-generated fixture on the same Live surface
// used by interactive sessions. Clicking a card hands off to #/live in demo replay mode; no key is
// needed, and the UI labels the replay plainly so it cannot be mistaken for a live provider call.
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
        eyebrow="See it for real"
        sub="Each is a frozen, model-generated session replayed on the production UI — not a live provider call."
      >
        Watch a frozen session
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
              <span className="fl-demo-who">
                <span className="fl-demo-name">{p.useCase}</span>
                <span className="fl-demo-role">
                  {p.name} · {p.role}
                </span>
              </span>
              <span className="fl-demo-badge">{cat.label}</span>
            </div>
            <span className="fl-demo-blurb">{p.blurb}</span>
            <span className="fl-demo-play">
              <Icon.play /> Play the session
            </span>
          </button>
        ))}
      </div>
    </>
  );
}
