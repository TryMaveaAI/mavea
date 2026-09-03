// TalkToDashboard — suggested questions + an ask box on the dashboard detail. Asking runs a real
// Live turn grounded in this dashboard's widgets (useDashboardTurn) and shows the answer inline. When
// no model is connected it says so and points to Live, rather than pretending to answer.
import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { TopicCanvas } from '../../canvas';
import type { Block } from '../../data/conversation';
import { useDashboardTurn } from './useDashboardTurn';
import { pinBlockToDashboard } from './pin';
import { detectTalkIntent, type TalkIntent } from './talkIntent';
import type { Dashboard } from './types';

function suggestions(d: Dashboard): string[] {
  const out: string[] = [];
  // "Are the numbers holding where I want?" is only a sensible question when there IS a line being
  // watched — i.e. a tripwire. A plain tracker (scores, weather, a story) has no line to hold;
  // offering the chip there reads like the dashboard doesn't know what it's about.
  if (d.tripwires.length > 0) {
    out.push('Are the numbers holding where I want?', 'Which alert is closest to triggering?');
  }
  if (d.metrics[0]) out.push(`What does ${d.metrics[0].label} tell me right now?`);
  out.push('What changed since the last update?');
  return out.slice(0, 3);
}

/** Pin an answer's blocks onto the dashboard as widgets, with an ADDED lineage row — through the
 *  shared pin path (pin.ts), which stores the raw ask as each widget's standing refreshQuery
 *  right away and refines it ONCE in the background, so pinning is instant instead of waiting on
 *  a refine call. `firstCheck: false` because these blocks came out of a grounded turn seconds
 *  ago — re-searching the same answer immediately would spend a call to learn nothing. The raw
 *  `ask` still shows in the lineage row for an honest record of what you typed. */
function pinAnswer(dashboardId: string, ask: string, blocks: Block[]): void {
  if (blocks.length === 0) return;
  pinBlockToDashboard({
    block: blocks,
    question: ask,
    target: dashboardId,
    fromSource: 'talk',
    firstCheck: false,
    source: {
      kind: 'ADDED',
      conversationId: 'talk',
      title: `Asked: “${ask}”`,
      contributed: `Pinned ${Math.min(blocks.length, 4)} from this question`,
      at: Date.now(),
    },
  });
}

export function TalkToDashboard({ dashboard }: { dashboard: Dashboard }): ReactElement {
  const turn = useDashboardTurn(dashboard);
  const [draft, setDraft] = useState('');
  const [pinned, setPinned] = useState(false);
  const [autoAddIntent, setAutoAddIntent] = useState<TalkIntent>('ask');
  const chips = useMemo(() => suggestions(dashboard), [dashboard]);

  const submit = (text: string): void => {
    setPinned(false);
    setAutoAddIntent(detectTalkIntent(text));
    turn.run(text);
    setDraft('');
  };

  // "add …" / "track …" phrasing skips the manual pin step — the ask itself was the command, so
  // making the user then click "+ Add" too would be a second confirmation nobody asked for. Gated
  // on `!turn.loading` so this can't fire against the PREVIOUS ask's still-resident result while a
  // new one is in flight (the hook doesn't null `result` the moment a new run starts). The pin
  // itself persists synchronously (pin.ts defers its one refine call), so `pinned` flips in the
  // same pass and this effect can't double-fire.
  useEffect(() => {
    if (
      autoAddIntent === 'add' &&
      !turn.loading &&
      turn.result &&
      !turn.result.error &&
      !turn.result.collapsed &&
      turn.result.spec.blocks.length > 0 &&
      !pinned
    ) {
      pinAnswer(dashboard.id, turn.lastAsk ?? '', turn.result.spec.blocks);
      setPinned(true);
    }
  }, [autoAddIntent, turn.loading, turn.result, turn.lastAsk, pinned, dashboard.id]);

  return (
    <section className="dash-talk">
      <div className="card-eyebrow dash-talk-eyebrow">Talk to this dashboard</div>

      {!turn.ready ? (
        <p className="dash-talk-gate">
          Connect a model in <a href="#/live">Live</a> to ask questions grounded in this dashboard.
        </p>
      ) : (
        <>
          <div className="dash-talk-chips">
            {chips.map((c) => (
              <button
                key={c}
                type="button"
                className="dash-talk-chip"
                disabled={turn.loading}
                onClick={() => submit(c)}
              >
                <span className="dash-talk-chip-orb" />
                <span className="dash-talk-chip-t">“{c}”</span>
              </button>
            ))}
          </div>

          <form
            className="dash-talk-ask"
            onSubmit={(e) => {
              e.preventDefault();
              submit(draft);
            }}
          >
            <input
              className="dash-talk-input"
              value={draft}
              placeholder='Ask a question, or type "add …" / "track …" to add it in one step'
              onChange={(e) => setDraft(e.target.value)}
              disabled={turn.loading}
            />
            <button
              type="submit"
              className="dash-talk-send"
              disabled={turn.loading || !draft.trim()}
            >
              {turn.loading ? 'Thinking…' : 'Ask'}
            </button>
          </form>
        </>
      )}

      {turn.lastAsk && (
        <div className="dash-talk-answer">
          <div className="dash-talk-q">“{turn.lastAsk}”</div>
          {turn.loading ? (
            <div className="dash-talk-thinking">Mavéa is looking at your dashboard…</div>
          ) : turn.result?.error ? (
            <div className="dash-talk-error">
              That didn’t go through. Check your model in <a href="#/live">Live</a> and try again.
            </div>
          ) : turn.result ? (
            <>
              {turn.result.narration && (
                <p className="dash-talk-narration">{turn.result.narration}</p>
              )}
              <TopicCanvas data={turn.result.spec} spot={null} built={{}} onProve={() => {}} />
              {turn.result.spec.blocks.length > 0 &&
                (pinned ? (
                  <div className="dash-talk-pinned">
                    {autoAddIntent === 'add' ? (
                      <>
                        Auto-added — this read like a command, not a question. Remove it from Edit
                        layout if that’s wrong.
                      </>
                    ) : (
                      'Added to this dashboard ✓'
                    )}
                  </div>
                ) : autoAddIntent === 'add' ? null : ( // the auto-pin effect above is about to
                  // fire — showing the manual button here too would let a click race it into
                  // pinning twice.
                  <button
                    type="button"
                    className="dash-talk-pin"
                    onClick={() => {
                      pinAnswer(dashboard.id, turn.lastAsk ?? '', turn.result!.spec.blocks);
                      setPinned(true);
                    }}
                  >
                    + Add this to the dashboard
                  </button>
                ))}
            </>
          ) : null}
        </div>
      )}
    </section>
  );
}
