// The three honesty controls: inspectable sources, labelled estimates, and explicit key storage.
// Each card DEMONSTRATES its control in a small strip — sources fan in, the Inferred badge stamps
// onto an estimate, a key slides into a lock inside the session boundary — and one thread draws
// through all three, because they are one system, not three features. The copy is deliberately
// hedged ("can be labelled", "session-only by default") — keep it that way.
import { SectionHead } from '../parts';

// 1 + 1 + 9 = the badge's own count.
const SOURCES = ['wikipedia.org', 'report.pdf · p.4', 'search · 9 more'];

export function HonestByDesign() {
  return (
    <>
      <SectionHead eyebrow="Transparent by design">
        Know <em>what you’re looking at.</em>
      </SectionHead>

      <div className="fl-trust">
        <svg
          className="fl-trust-spine"
          viewBox="0 0 1032 40"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path pathLength={1} d="M0,20 C172,4 344,36 516,20 S860,4 1032,20" />
        </svg>

        <div className="fl-trust-card grounded">
          <span className="fl-badge grounded">Grounded in · 11</span>
          <div className="fl-trust-title">Sources stay attached</div>
          <p className="fl-trust-body">
            When search or an uploaded document supplies evidence, its citations stay with the
            answer for inspection. A citation does not guarantee that the claim is correct.
          </p>
          <div className="fl-trust-demo" aria-hidden="true">
            {SOURCES.map((s, i) => (
              <span key={s} className="fl-src-chip" style={{ ['--src-i' as string]: String(i) }}>
                {s}
              </span>
            ))}
          </div>
        </div>

        <div className="fl-trust-card inferred">
          <span className="fl-badge inferred">Inferred</span>
          <div className="fl-trust-title">Inferences can be labelled</div>
          <p className="fl-trust-body">
            Estimates can carry an Inferred badge, keeping them distinct from cited evidence.
          </p>
          <div className="fl-trust-demo" aria-hidden="true">
            <span className="fl-stamp-value">Runway ≈ 4 months</span>
            <span className="fl-badge inferred fl-stamp-badge">Inferred</span>
          </div>
        </div>

        <div className="fl-trust-card keys">
          <span className="fl-trust-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="4" y="11" width="16" height="10" rx="2" />
              <path d="M8 11V7a4 4 0 0 1 8 0v4" />
            </svg>
          </span>
          <div className="fl-trust-title">You control key storage</div>
          <p className="fl-trust-body">
            Keys are session-only by default. Optional remembering encrypts them locally. Requests
            reach your chosen provider through the app’s same-origin proxy — on your machine, that
            server is yours. Anyone hosting a copy for you can access keys and content in transit.
          </p>
          <div className="fl-trust-demo" aria-hidden="true">
            <span className="fl-key-boundary">
              <svg className="fl-key-glyph" viewBox="0 0 24 24">
                <circle cx="7" cy="12" r="3.2" />
                <path d="M10.2 12h9.8M16 12v3M20 12v2.4" />
              </svg>
              <svg className="fl-key-lock" viewBox="0 0 24 24">
                <rect x="5" y="10" width="14" height="9" rx="2" />
                <path d="M8 10V7a4 4 0 0 1 8 0v3" />
              </svg>
              <i>this session</i>
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
