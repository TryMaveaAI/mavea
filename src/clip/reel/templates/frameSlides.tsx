// The bookends of every reel: the opening prompt (the question, typed in) and the closing wordmark.
// Both render inside the stage band; the orb and top chrome above them belong to the player.
import type { SlideProps } from './types';
import { fitText, PROMPT_TIERS, TITLE_TIERS, BODY_TIERS } from './fitText';

export function TitleSlide({ slots }: SlideProps<'title'>) {
  // The question is the user's own words (up to ~140 chars) — the tier re-sets a long prompt as
  // more, tighter lines instead of letting the fixed display size wrap it into a tower.
  const q = fitText(slots.question, PROMPT_TIERS);
  return (
    <div className="reel-frame-slide reel-fade">
      <div className="reel-eyebrow" style={{ justifyContent: 'center' }}>
        {slots.kicker || 'Prompt'}
        {slots.part && (
          <span className="reel-part-chip">{`Part ${slots.part.index} of ${slots.part.count}`}</span>
        )}
      </div>
      <div className="reel-prompt" data-fit-tier={q.tier} style={q.style}>
        <span aria-hidden="true">“</span>
        <span className="q">{slots.question}</span>
        <span aria-hidden="true">”</span>
        {/* em height so the caret matches whatever size the tier picked (the class fixes it in ru,
            sized for the top tier only). */}
        <span className="reel-caret" aria-hidden="true" style={{ height: '0.81em' }} />
      </div>
    </div>
  );
}

export function OutroSlide({ slots }: SlideProps<'outro'>) {
  const tagline = slots.tagline || 'Talk to AI. See what it means.';
  // Both closing lines carry derived copy (tagline ≤48, statline ≤40) — tiered so a long line
  // reflows under the wordmark instead of pushing it off the band. The wordmark itself stays fixed.
  const tag = fitText(tagline, TITLE_TIERS);
  const stat = slots.statline ? fitText(slots.statline, BODY_TIERS) : undefined;
  return (
    <div className="reel-frame-slide reel-fade">
      {slots.statline && stat && (
        // The tier's clamp swaps the eyebrow's flex display for -webkit-box; the frame slide's
        // inherited text-align keeps the line centered.
        <div className="reel-eyebrow" data-fit-tier={stat.tier} style={stat.style}>
          {slots.statline}
        </div>
      )}
      <div className="reel-wordmark-xl">{slots.wordmark || 'Mavéa'}</div>
      <div className="reel-tagline" data-fit-tier={tag.tier} style={tag.style}>
        {tagline}
      </div>
    </div>
  );
}
