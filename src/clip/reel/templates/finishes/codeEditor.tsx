// A diagram finish rendered as an IDE window: a chrome bar with three traffic-light dots and the
// filename (label), then a few syntax-highlighted lines that recast the idea as code — a comment from
// the note, a `def` named after the label, and a `return` carrying the equation. The dark editor
// surface and the syntax palette (comment / keyword / string / number) are an intrinsic identity a
// real editor owns, not something the reel tints, so those few colors live in a scoped <style>; the
// frame's lift and the accent filename still ride the reel. A blinking caret trails the last line, and
// each line types itself in on a stagger so the snippet reads like it's being written.
import type { SlideProps } from '../types';

// A label like "Kinetic energy" → a valid identifier for the function name, e.g. `kinetic_energy`.
const toIdent = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'result';

export function CodeEditorSlide({ slots }: SlideProps<'diagram'>) {
  const { label, equation, note } = slots;
  const fn = toIdent(label);
  const file = `${fn}.py`;
  // The signature uses any named vectors as the function's parameters; otherwise it takes the world.
  const args = (slots.vectors ?? []).map((v) => toIdent(v.label)).slice(0, 3);

  return (
    <div className="reel-ide reel-fade">
      <style>{`
        .reel-ide {
          --ide-bg: #1e2430;
          --ide-chrome: #2a3140;
          --ide-line: rgba(255, 255, 255, 0.06);
          --ide-comment: #6b7a8d;
          --ide-keyword: #c792ea;
          --ide-string: #b6e08a;
          --ide-number: #f6a96b;
          --ide-fn: #82c8ff;
          --ide-text: #d7e0ea;
          width: calc(var(--rw) * 80);
          border-radius: calc(var(--ru) * 2.4);
          overflow: hidden;
          background: var(--ide-bg);
          box-shadow: 0 calc(var(--ru) * 7) calc(var(--ru) * 16) calc(var(--ru) * -6) rgba(12, 10, 28, 0.7);
          font: 500 calc(var(--ru) * 3)/1.7 var(--reel-mono);
        }
        .reel-ide .chrome {
          display: flex;
          align-items: center;
          gap: calc(var(--rw) * 1.6);
          padding: calc(var(--ru) * 2.2) calc(var(--rw) * 3.2);
          background: var(--ide-chrome);
          border-bottom: 1px solid var(--ide-line);
        }
        .reel-ide .light { width: calc(var(--ru) * 2.2); height: calc(var(--ru) * 2.2); border-radius: 50%; }
        .reel-ide .file {
          margin-left: calc(var(--rw) * 1.6);
          font: 500 calc(var(--ru) * 2.4)/1 var(--reel-mono);
          color: var(--reel-accent);
          overflow-wrap: anywhere;
        }
        .reel-ide .body { padding: calc(var(--ru) * 3) calc(var(--rw) * 3.6); }
        .reel-ide .row {
          display: flex;
          gap: calc(var(--rw) * 2.6);
          color: var(--ide-text);
          animation: ide-type 0.42s ease-out var(--d) both;
        }
        .reel-ide .ln {
          color: rgba(255, 255, 255, 0.26);
          flex-shrink: 0;
          width: 2ch;
          text-align: right;
          user-select: none;
        }
        .reel-ide .code {
          min-width: 0;
          /* Preserve the indentation but let a long comment/equation wrap rather than truncate. */
          white-space: pre-wrap;
          overflow-wrap: anywhere;
        }
        .reel-ide .c { color: var(--ide-comment); font-style: italic; }
        .reel-ide .k { color: var(--ide-keyword); }
        .reel-ide .f { color: var(--ide-fn); }
        .reel-ide .s { color: var(--ide-string); }
        .reel-ide .n { color: var(--ide-number); }
        .reel-ide .caret {
          display: inline-block;
          width: 0.5ch;
          height: calc(var(--ru) * 2.5);
          margin-left: 0.4ch;
          vertical-align: text-bottom;
          background: var(--ide-text);
          animation: reel-blink 1s step-end infinite;
        }
        @keyframes ide-type {
          from { opacity: 0; transform: translateX(calc(var(--rw) * -1)); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>

      <div className="chrome">
        <span className="light" style={{ background: '#ff5f57' }} />
        <span className="light" style={{ background: '#febc2e' }} />
        <span className="light" style={{ background: '#28c840' }} />
        <span className="file">{file}</span>
      </div>

      <div className="body">
        {note && (
          <div className="row" style={{ ['--d' as string]: '0.05s' }}>
            <span className="ln">1</span>
            <span className="code c"># {note}</span>
          </div>
        )}
        <div className="row" style={{ ['--d' as string]: '0.2s' }}>
          <span className="ln">{note ? 2 : 1}</span>
          <span className="code">
            <span className="k">def</span> <span className="f">{fn}</span>(
            {args.map((a, i) => (
              <span key={i}>
                {i > 0 && ', '}
                {a}
              </span>
            ))}
            ):
          </span>
        </div>
        <div className="row" style={{ ['--d' as string]: '0.36s' }}>
          <span className="ln">{note ? 3 : 2}</span>
          <span className="code">
            {'    '}
            <span className="k">return</span>{' '}
            {equation ? <span className="s">{equation}</span> : <span className="n">42</span>}
            <span className="caret" />
          </span>
        </div>
      </div>
    </div>
  );
}
