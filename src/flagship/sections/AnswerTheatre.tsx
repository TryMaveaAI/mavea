import { useEffect, useMemo, useState } from 'react';
import { TopicCanvas } from '../../canvas/TopicCanvas';
import { useBlockFamilies } from '../../canvas/blocks/useBlockFamilies';
import { Presence } from '../../presence/Presence';
import { useVoiceEnergySink } from '../../voice/voiceEnergy';
import { useInView } from '../../hooks/useInView';
import { useInterval } from '../../hooks/useInterval';
import { loadTourCorpus } from '../../tour/corpus';
import type { TourConversation } from '../../tour/corpus/types';
import './answerTheatre.css';

const EXAMPLES = [
  {
    id: 'money',
    label: 'Watch money grow',
    chapter: 'draws',
    cards: [
      { id: 'live-2', label: 'The growth curve' },
      { id: 'live-3', label: 'Principal vs. interest' },
      { id: 'live-4', label: 'The milestones' },
    ],
  },
  {
    id: 'neural',
    label: 'See a network learn',
    chapter: 'range',
    cards: [
      { id: 'live-2', label: 'The learning loop' },
      { id: 'live-3', label: 'Training progress' },
      { id: 'live-1', label: 'The core idea' },
    ],
  },
  {
    id: 'roadtrip',
    label: 'Trace the Pacific coast',
    chapter: 'range',
    cards: [
      { id: 'live-1', label: 'The coastal route' },
      { id: 'live-2', label: 'Seven days' },
      { id: 'live-3', label: 'The places to stop' },
    ],
  },
] as const;
type Example = (typeof EXAMPLES)[number];

export function AnswerTheatre({ immersive = false }: { immersive?: boolean }) {
  const [conversations, setConversations] = useState<readonly TourConversation[]>([]);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [selected, setSelected] = useState<string>(EXAMPLES[0].id);
  useEffect(() => {
    let active = true;
    void loadTourCorpus().then(
      (corpus) => {
        if (active) setConversations(corpus.conversations);
      },
      () => {
        if (active) setFailed(true);
      },
    );
    return () => {
      active = false;
    };
  }, [attempt]);
  const conversation = conversations.find((entry) => entry.id === selected);
  const example = EXAMPLES.find((entry) => entry.id === selected) ?? EXAMPLES[0];
  return (
    <section
      className={`answer-theatre${immersive ? ' answer-theatre-immersive' : ''}`}
      aria-labelledby="answer-theatre-title"
    >
      <div className="answer-theatre-heading">
        <h2 id="answer-theatre-title">
          {immersive ? 'One question. A different way in.' : 'The answer takes shape.'}
        </h2>
        <p>Choose a recorded question. Watch it unfold. Take over whenever you like.</p>
      </div>
      <div className="answer-theatre-choices" aria-label="Recorded answer examples">
        {EXAMPLES.map((example) => (
          <button
            key={example.id}
            type="button"
            aria-pressed={selected === example.id}
            onClick={() => setSelected(example.id)}
          >
            {example.label}
          </button>
        ))}
      </div>
      {conversation ? (
        <RecordedAnswer
          key={selected}
          conversation={conversation}
          immersive={immersive}
          example={example}
        />
      ) : (
        <div className="answer-theatre-loading" role="status">
          {failed ? (
            <>
              <p>The recorded answer couldn’t load.</p>
              <button
                type="button"
                onClick={() => {
                  setFailed(false);
                  setAttempt((value) => value + 1);
                }}
              >
                Try again
              </button>
            </>
          ) : (
            'Opening the recorded canvas…'
          )}
        </div>
      )}
      <div className="answer-theatre-footer">
        <p>Curated recorded excerpt · illustrative data · no prompt sent · no audio</p>
        <a
          href={`#/live?tour=1&ch=${EXAMPLES.find((entry) => entry.id === selected)?.chapter ?? 'draws'}&solo=1`}
        >
          Explore the full walkthrough ↗
        </a>
      </div>
    </section>
  );
}

function RecordedAnswer({
  conversation,
  immersive,
  example,
}: {
  conversation: TourConversation;
  immersive: boolean;
  example: Example;
}) {
  const voiceSinkRef = useVoiceEnergySink();
  const frame = conversation.frames[0];
  // Prime the entire excerpt before its first card mounts. A later family arrival must not
  // leave a memoized card displaying the temporary plain-text fallback.
  const excerpt = useMemo(
    () =>
      example.cards
        .map((card) => frame?.spec.blocks.find((block) => block.id === card.id))
        .filter((block) => block !== undefined),
    [frame, example],
  );
  const familiesReady = useBlockFamilies(excerpt, `homepage-${conversation.id}`);
  const [ref, visible] = useInView<HTMLDivElement>({
    once: false,
    threshold: 0,
    rootMargin: '0px',
  });
  const [hidden, setHidden] = useState(() => document.hidden);
  const [reduced, setReduced] = useState(
    () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
  );
  const [paused, setPaused] = useState(false);
  const [count, setCount] = useState(1);
  const total = excerpt.length;
  useEffect(() => {
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const onMotion = () => setReduced(media?.matches ?? false);
    const onVisibility = () => setHidden(document.hidden);
    media?.addEventListener('change', onMotion);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      media?.removeEventListener('change', onMotion);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);
  const shown = count;
  const playing = familiesReady && !paused && !hidden && visible && !reduced && count < total;
  useInterval(
    () => setCount((value) => Math.min(value + 1, total)),
    playing ? (immersive && count === 1 ? 1800 : 6000) : null,
  );
  const data = useMemo(
    () => frame && { ...frame.spec, blocks: excerpt.slice(shown - 1, shown) },
    [frame, shown, excerpt],
  );
  if (!data || !total) return <p>This recorded answer is unavailable.</p>;
  return (
    <div
      ref={ref}
      className="answer-theatre-player"
      data-playing={playing}
      data-paused={paused || hidden || !visible}
      data-chapter={shown}
    >
      <div className="answer-theatre-prompt">
        <div className="answer-theatre-presence" ref={voiceSinkRef}>
          <Presence state={playing ? 'thinking' : 'idle'} />
        </div>
        <div>
          <span>{immersive ? 'The recorded question' : 'You asked'}</span>
          <p>
            {immersive
              ? conversation.question.split(' ').map((word, index) => (
                  <span
                    className="answer-question-word"
                    key={`${index}-${word}`}
                    style={{ animationDelay: `${index * 45}ms` }}
                  >
                    {word}{' '}
                  </span>
                ))
              : conversation.question}
          </p>
        </div>
      </div>
      <div className="answer-theatre-progress" aria-label="Explore the recorded answer">
        {excerpt.map((block, index) => (
          <button
            key={block.id}
            type="button"
            aria-pressed={index === shown - 1}
            aria-label={`0${index + 1} ${example.cards.find((card) => card.id === block.id)?.label}`}
            onClick={() => {
              setCount(index + 1);
              setPaused(true);
            }}
          >
            <span>0{index + 1}</span>
            {example.cards.find((card) => card.id === block.id)?.label}
          </button>
        ))}
      </div>
      <div className="answer-theatre-controls">
        <span role="status">
          Part {shown} of {total}
        </span>
        {!reduced && (
          <button
            type="button"
            onClick={() => {
              if (count >= total) setCount(1);
              setPaused(count >= total ? false : !paused);
            }}
          >
            {count >= total ? 'Replay answer' : paused ? 'Play answer' : 'Pause answer'}
          </button>
        )}
      </div>
      <div
        className="answer-theatre-canvas"
        data-preview-type={data.blocks[0]?.type}
        role="region"
        aria-label="Recorded answer canvas"
      >
        {familiesReady ? (
          <TopicCanvas
            key={shown}
            data={data}
            spot={null}
            built={{}}
            onProve={() => {
              window.location.hash = '/live?tour=1&ch=prism&solo=1';
            }}
          />
        ) : (
          <p role="status">Preparing the recorded canvas…</p>
        )}
        {data.blocks[0]?.type === 'cyclewheel' && (
          <ol className="answer-cycle-key">
            {data.blocks[0].props.stages.map((stage, index) => (
              <li key={`${index}-${stage.label}`}>
                <strong>{stage.label}</strong>
                <span>{stage.caption}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
