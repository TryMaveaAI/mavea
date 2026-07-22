// A minimal top bar giving the standalone dev/QA surfaces (#/reel, #/slidelab) the same
// "← Back to Mavéa" way home the visual library (#/gallery) has, so none of them strand the
// user with no route back. Mirrors the gallery's `.vlib-back` affordance and tokens.
import './SurfaceNav.css';

export function SurfaceNav({ title }: { title?: string }) {
  return (
    <div className="surface-nav">
      <a className="surface-nav-back" href="#/">
        ← Back to Mavéa
      </a>
      {title ? <span className="surface-nav-title">{title}</span> : null}
    </div>
  );
}
