// A diagram finish rendered as an IDE window: a chrome bar with three traffic-light dots and the
// filename (label), then a few syntax-highlighted lines that recast the idea as code — a comment from
// the note, a `def` named after the label, and a `return` carrying the equation. The dark editor
// surface and the syntax palette (comment / keyword / string / number) are an intrinsic identity a
// real editor owns, not something the reel tints, so those few colors live in finishes.css; the
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
