// "It listens. It speaks. Then it draws." — a framed canvas mid-answer, the signature Mavéa move.
// Static, curated content (a Chicago nightlife answer) shown in the app's window chrome: a session
// rail on the left, a living answer on the right, drawing while a caret still blinks. When the
// section scrolls in, the canvas assembles the way a real answer does — finding, then figure,
// then pins, bars, tips — one shot, then rest.
import { Orb } from '../Orb';
import { SectionHead } from '../parts';

const RAIL = [
  {
    title: 'Chicago · 4-Day Architectu…',
    time: '3:14',
    snip: 'help me plan a trip t…',
    tone: 'blue',
  },
  {
    title: 'Chicago · 4-Day Culinary…',
    time: '3:14',
    snip: 'what are the restaura…',
    tone: 'green',
  },
  {
    title: 'Chicago · 4-Day Itinerary',
    time: '3:14',
    snip: 'what other things sh…',
    tone: 'amber',
    active: true,
  },
];

const CATS = [
  { name: 'Speakeasies', tag: 'Hidden & exclusive', w: '48%', tone: 'presence' },
  { name: 'Live music', tag: 'Blues & jazz', w: '78%', tone: 'warning' },
  { name: 'Cocktail bars', tag: 'Modern & craft', w: '46%', tone: 'presence' },
];

const TIPS = [
  'Reservations are essential for popular speakeasies.',
  'Check the music schedule for blues clubs in advance.',
  'Use the “L” train or a rideshare; parking is difficult.',
  'Dress codes vary; check the venue’s site before going.',
];

const PINS = [
  { left: '62%', top: '34%', tone: 'presence', n: '2' },
  { left: '54%', top: '66%', tone: 'warning', n: '3' },
  { left: '60%', top: '70%', tone: 'insight', n: '1', ring: true },
];

/** Minor street grid as two batched paths (vertical + horizontal runs), overdrawn past the
 *  viewBox so the ~8° city rotation never exposes a bare corner. */
function gridPath(vertical: boolean): string {
  const runs: string[] = [];
  for (let a = -48; a <= 448; a += 24) {
    runs.push(vertical ? `M${a},-48 V248` : `M-48,${a} H448`);
  }
  return runs.join(' ');
}

function MapArt() {
  return (
    <svg
      className="fl-map-art"
      viewBox="0 0 400 200"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <rect className="fl-m-land" width="400" height="200" />
      {/* The whole street fabric leans a few degrees — a straight-on grid reads as graph
          paper, a tilted one as a city. */}
      <g className="fl-m-streets" transform="rotate(-8 200 100)">
        <path className="fl-m-minor" d={gridPath(true)} />
        <path className="fl-m-minor" d={gridPath(false)} />
        <path className="fl-m-major" d="M88,-48 V248 M168,-48 V248 M248,-48 V248" />
        <path className="fl-m-major" d="M-48,64 H448 M-48,128 H448" />
        <path className="fl-m-major" d="M-10,214 L300,-14" />
      </g>
      <path
        className="fl-m-park"
        d="M196,132 C218,124 244,128 250,146 C255,162 236,176 214,174 C192,172 180,152 196,132 Z"
      />
      <path className="fl-m-river" d="M284,36 C238,52 206,44 168,58 C136,70 104,62 70,76" />
      {/* The lake paints after the street fabric so avenues never run into the water. */}
      <path className="fl-m-water" d="M285,0 C270,60 276,140 262,200 L400,200 L400,0 Z" />
      <path className="fl-m-shore" d="M285,0 C270,60 276,140 262,200" />
      <path className="fl-m-current" d="M310,52 C326,46 342,50 356,42" />
      <path className="fl-m-current" d="M318,120 C336,114 350,120 366,110" />
    </svg>
  );
}

export function SignatureLoop() {
  return (
    <>
      <SectionHead eyebrow="The signature move">
        It listens. It speaks. <em>Then it draws.</em>
      </SectionHead>

      <div className="fl-window">
        <div className="fl-window-bar">
          <span className="fl-light r" />
          <span className="fl-light y" />
          <span className="fl-light g" />
          <div className="fl-window-title">
            <Orb size={18} className="fl-orb-inline" />
            <span className="fl-window-topic">Chicago Nightlife: A Curated Guide</span>
            {/* An illustration of the Live window, not a real result — labelled "Example" (muted,
                no pulsing live-dot) so the hand-authored Chicago content is never mistaken for a
                live generation. Deliberately NO model badge: no model generated this, and Live is
                bring-your-own-keys — naming one vendor here would be both false provenance and a
                fake endorsement. */}
            <span className="fl-live" style={{ color: 'var(--text-muted)' }}>
              Example
            </span>
          </div>
        </div>

        <div className="fl-window-body">
          <aside className="fl-rail">
            <div className="fl-rail-head">
              <span>This session</span>
              <span className="fl-rail-chip">Replay</span>
            </div>
            {RAIL.map((r) => (
              <div key={r.title} className={'fl-rail-row' + (r.active ? ' active' : '')}>
                <div className={'fl-rail-title tone-' + r.tone}>{r.title}</div>
                <div className="fl-rail-snip">
                  <span className="fl-rail-time">{r.time}</span>
                  <span className="fl-rail-text">{r.snip}</span>
                </div>
              </div>
            ))}
          </aside>

          <div className="fl-canvas">
            <div className="fl-finding">
              <div className="fl-finding-kicker">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 2l1.6 6.4L20 10l-6.4 1.6L12 18l-1.6-6.4L4 10l6.4-1.6z" />
                </svg>
                Finding 1
              </div>
              <div className="fl-finding-title">The Chicago after-dark vibe</div>
              <p className="fl-finding-text">
                Chicago’s nightlife thrives on variety. Whether you’re after a quiet, high-end
                cocktail lounge or a high-energy blues bar, there’s a district for it.
                <span className="fl-caret" />
              </p>
              <span className="fl-badge inferred">Inferred</span>
            </div>

            <div className="fl-fig">
              <div className="fl-fig-label">Fig. 1 — Nightlife hotspots</div>
              <div className="fl-map">
                <MapArt />
                <div className="fl-map-zoom">
                  <span>+</span>
                  <span>−</span>
                </div>
                {PINS.map((p, i) => (
                  <span
                    key={p.n}
                    className={'fl-pin tone-' + p.tone + (p.ring ? ' ring' : '')}
                    style={{ left: p.left, top: p.top, ['--pin-i' as string]: String(i) }}
                  >
                    {p.n}
                  </span>
                ))}
                <span className="fl-map-attr">Illustrated map</span>
              </div>
              <div className="fl-fig-note">Illustrated example · 3 locations</div>
            </div>

            <div className="fl-cardrow">
              <div className="fl-mini">
                <div className="fl-mini-label">▦ Nightlife categories</div>
                {CATS.map((c, i) => (
                  <div key={c.name} className="fl-bar">
                    <div className="fl-bar-top">
                      <span className="fl-bar-name">{c.name}</span>
                      <span className="fl-bar-tag">{c.tag}</span>
                    </div>
                    <div className="fl-bar-track">
                      <div
                        className={'fl-bar-fill tone-' + c.tone}
                        style={{ ['--w' as string]: c.w, ['--bar-i' as string]: String(i) }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <div className="fl-mini">
                <div className="fl-mini-label">✦ Pro-tips for Chicago nights</div>
                {TIPS.map((t, i) => (
                  <div key={t} className="fl-tip" style={{ ['--tip-i' as string]: String(i) }}>
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path pathLength={1} d="M20 6L9 17l-5-5" />
                    </svg>
                    <span>{t}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="fl-dock">
              <span className="fl-dock-mic">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3" />
                </svg>
              </span>
              <span className="fl-dock-text">Talk, or type — anything.</span>
              {/* the real dock's highlighter toggle, icon and label verbatim (annotate/MarkToggle) */}
              <span className="fl-dock-mark">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M3 21l3.2-.9L18 8.3l-2.3-2.3L4 17.6 3 21z M14.7 7l2.3 2.3" />
                </svg>
                Highlight
              </span>
              <span className="fl-dock-send">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
