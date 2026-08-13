import { useEffect, useRef, useState, type ReactElement } from 'react';
import { TopicCanvas } from '../../canvas';
import { Presence } from '../../presence/Presence';
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
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    frameRef?.(rootRef.current);
    return () => frameRef?.(null);
  }, [frameRef]);

  useEffect(() => {
    const scroll = scrollRef.current;
    if (!scroll) return;
    let top = 0;
    if (scene?.spot) {
      const target = [...scroll.querySelectorAll<HTMLElement>('[data-spot-id]')].find(
        (element) => element.dataset.spotId === scene.spot,
      );
      if (!target) return;
      const host = scroll.getBoundingClientRect();
      const item = target.getBoundingClientRect();
      top = Math.max(
        0,
        scroll.scrollTop + item.top - host.top - (scroll.clientHeight - item.height) / 2,
      );
    }
    // Glide the spotlight the way Live's walk does — the recorder captures the motion. Re-measure
    // the ink anchors only once the glide has settled, so pen marks land on resting positions.
    if (typeof scroll.scrollTo === 'function')
      scroll.scrollTo({ top, behavior: glide ? 'smooth' : 'auto' });
    else scroll.scrollTop = top;
    const settle = window.setTimeout(() => setRevision((value) => value + 1), 420);
    return () => window.clearTimeout(settle);
  }, [scene?.spot, scene?.turnIndex, glide]);

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
              <div className="topic-wrap" key={scene.turnIndex}>
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
            <div className="cvs-presence">
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
