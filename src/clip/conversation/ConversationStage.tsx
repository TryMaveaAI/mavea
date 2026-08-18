import { useEffect, useRef, useState, type ReactElement } from 'react';
import { TopicCanvas } from '../../canvas';
import { Presence } from '../../presence/Presence';
import { useVoiceEnergySink } from '../../voice/voiceEnergy';
import { AnnotationLayer } from '../../live/annotate/AnnotationLayer';
import type { ConversationScene, ConversationVideoOptions } from './types';

export function ConversationStage({
  scene,
  options,
  frameRef,
  glide = true,
}: {
  scene: ConversationScene | null;
  options: ConversationVideoOptions;
  frameRef?: (element: HTMLDivElement | null) => void;
  /** Whether the spotlight travels or cuts. Defaults on: the offscreen capture host must keep
   *  gliding — the recorder captures that motion AS the exported video, so a viewer's
   *  reduced-motion preference belongs to the on-screen preview, never to the rendered file. */
  glide?: boolean;
}): ReactElement {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const voiceSinkRef = useVoiceEnergySink();
  const shownTurnRef = useRef<number | null>(null);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    frameRef?.(rootRef.current);
    return () => frameRef?.(null);
  }, [frameRef]);

  // The spotlight travels by TRANSFORM (`--cvs-shift` on the wrap), never by scrollTop: the
  // capture clone drops a container's scroll position, so a scrolled spotlight reached the
  // preview but rendered from the top of the exported file.
  useEffect(() => {
    const scroll = scrollRef.current;
    const wrap = wrapRef.current;
    if (!scroll || !wrap) return;
    const turnChanged = shownTurnRef.current !== scene?.turnIndex;
    shownTurnRef.current = scene?.turnIndex ?? null;
    // A fresh turn's canvas starts at the top; a beat with no cue HOLDS where the last one
    // settled — gliding home between cues is what read as random scrolling.
    let shift: number | null = turnChanged ? 0 : null;
    if (scene?.spot) {
      const target = [...scroll.querySelectorAll<HTMLElement>('[data-spot-id]')].find(
        (element) => element.dataset.spotId === scene.spot,
      );
      if (target) {
        // Accumulate layout offsets rather than reading getBoundingClientRect: the keyed remount
        // replays `.reveal`'s translate/scale entrance, so a client rect measured mid-animation
        // is off by whatever frame the cards happen to be on. offsetTop never is.
        let top = 0;
        for (
          let node: HTMLElement | null = target;
          node && node !== scroll;
          node = node.offsetParent as HTMLElement | null
        )
          top += node.offsetTop;
        shift = Math.max(
          0,
          Math.min(
            top - (scroll.clientHeight - target.offsetHeight) / 2,
            wrap.offsetHeight - scroll.clientHeight,
          ),
        );
      }
    }
    if (shift === null) return;
    wrap.style.setProperty('--cvs-shift', `${-shift}px`);
    // The recorder captures the glide as motion. Re-measure the ink anchors only once it has
    // settled, so pen marks land on resting positions.
    const settle = window.setTimeout(() => setRevision((value) => value + 1), 420);
    return () => window.clearTimeout(settle);
  }, [scene?.spot, scene?.turnIndex]);

  const asking = scene?.questionOnly ?? false;
  const heading = scene ? scene.frame.question || scene.frame.spec.title : '';

  return (
    <div
      ref={rootRef}
      className="cvs-stage"
      data-aspect="16:9"
      data-question-only={asking}
      // The caption band is reserved whether or not this beat has a line, so the canvas never
      // reflows mid-turn and a caption can never come down on top of the answer.
      data-captioned={options.captions}
    >
      {scene ? (
        <>
          <header className="cvs-header">
            <div className="cvs-brand">
              <span className="cvs-brand-dot" /> Mavéa conversation
            </div>
            <div className="cvs-turn">Turn {scene.turnIndex + 1}</div>
            <h2>{heading}</h2>
          </header>
          {asking ? (
            // The beat before an answer lands. This used to be the finished canvas held at 30%
            // opacity, which reads as a half-painted page rather than a moment; stating the
            // question instead gives the viewer a beat they can actually use.
            <div className="cvs-ask">
              <span className="cvs-ask-eyebrow">Asked</span>
              <p className="cvs-ask-line">{heading}</p>
            </div>
          ) : (
            <div ref={scrollRef} className="cvs-canvas">
              {/* Keyed by turn so every answer's cards MOUNT here and play the same staggered
                  `.reveal` entrance Live gives them, instead of being present from frame one.
                  The recorder rasterizes the animating DOM, so that bloom lands in the file. */}
              <div className="topic-wrap" key={scene.turnIndex} ref={wrapRef} data-glide={glide}>
                <TopicCanvas
                  data={scene.frame.spec}
                  spot={scene.spot}
                  built={{}}
                  onProve={() => {}}
                />
              </div>
              {options.penMarks && (
                <AnnotationLayer spots={scene.ink} within={rootRef.current} revision={revision} />
              )}
            </div>
          )}
          {options.captions && scene.caption && <div className="cvs-caption">{scene.caption}</div>}
          {options.presence && (
            <div className="cvs-presence" ref={voiceSinkRef}>
              <Presence state={asking ? 'thinking' : 'speaking'} />
            </div>
          )}
        </>
      ) : (
        <div className="cvs-empty">Choose a turn to preview it.</div>
      )}
    </div>
  );
}
