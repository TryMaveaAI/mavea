// Wireframe thumbnails of the screens Mavéa will generate, one low-fidelity sketch per screen kind.
import type { CSSProperties, ReactNode } from 'react';
import { Icon } from '../icons/icons';
import { toast } from '../lib/toast';
import type { ScreenKind, ScreenMapProps } from '../data/conversation';

type Props = ScreenMapProps & { delay?: number };

const WIRE: Record<ScreenKind, ReactNode> = {
  dashboard: (
    <>
      <span className="wl w60"></span>
      <div className="wgrid">
        <span></span>
        <span></span>
        <span></span>
      </div>
      <span className="wbar"></span>
    </>
  ),
  table: (
    <>
      <span className="wl w40"></span>
      <span className="wrow"></span>
      <span className="wrow"></span>
      <span className="wrow"></span>
      <span className="wrow"></span>
    </>
  ),
  board: (
    <>
      <span className="wl w40"></span>
      <div className="wcols">
        <span></span>
        <span></span>
        <span></span>
      </div>
    </>
  ),
  detail: (
    <>
      <span className="wl w50"></span>
      <span className="wblock"></span>
      <span className="wl w70"></span>
      <span className="wl w50"></span>
    </>
  ),
  list: (
    <>
      <span className="wl w40"></span>
      <span className="wrow"></span>
      <span className="wrow"></span>
      <span className="wrow"></span>
    </>
  ),
};

export function ScreenMap({ title = "The screens you'll get", screens, footer, delay }: Props) {
  return (
    <div className="card reveal" style={{ '--delay': (delay || 0) + 'ms' } as CSSProperties}>
      <div className="card-eyebrow">
        <Icon.slides className="ic" style={{ color: 'var(--presence-soft)' }} /> {title}
      </div>
      <div className="screenmap">
        {screens.map((s, i) => {
          const openScreen = () =>
            toast('Opening ' + s.name + ' — you can rename or reorder', 'info');
          return (
            // A <div> (not <figure>) so the click-to-open role can live on the element itself —
            // <figure> carries an implicit non-interactive role that a11y lint rightly rejects
            // pairing with keyboard/mouse activation.
            <div
              className="screen-thumb"
              key={i}
              role="button"
              tabIndex={0}
              aria-label={`Open ${s.name}`}
              onClick={openScreen}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  openScreen();
                }
              }}
            >
              <div className="screen-wire">{WIRE[s.kind] || WIRE.table}</div>
              <figcaption>{s.name}</figcaption>
            </div>
          );
        })}
      </div>
      {footer && (
        <div className="insight-summary" style={{ marginTop: 12 }}>
          {footer}
        </div>
      )}
    </div>
  );
}
