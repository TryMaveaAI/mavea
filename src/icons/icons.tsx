// A minimal line-icon set. Every glyph inherits its color from the surrounding text
// (stroke=currentColor) and accepts the usual SVG props, so callers size and style them
// like any other element.
import type { ReactNode, SVGProps } from 'react';

const I =
  (paths: ReactNode, vb = '0 0 24 24') =>
  (props: SVGProps<SVGSVGElement>) => (
    <svg
      viewBox={vb}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {paths}
    </svg>
  );

export const Icon = {
  mic: I(
    <>
      <path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z" />
      <path d="M19 11a7 7 0 0 1-14 0" />
      <path d="M12 18v3" />
    </>,
  ),
  micOff: I(
    <>
      <path d="M9 9v3a3 3 0 0 0 5.1 2.1M15 11V6a3 3 0 0 0-5.9-.7" />
      <path d="M19 11a7 7 0 0 1-1.3 4M12 18v3" />
      <path d="M5 11a7 7 0 0 0 9.4 6.6" />
      <path d="m3 3 18 18" />
    </>,
  ),
  send: I(<path d="m4 12 16-7-7 16-2.5-6.5L4 12Z" />),
  spinner: I(<path d="M12 3a9 9 0 1 0 9 9" />),
  upload: I(
    <>
      <path d="M12 16V4" />
      <path d="m7 9 5-5 5 5" />
      <path d="M5 20h14" />
    </>,
  ),
  paperclip: I(
    <path d="M21 9.5 12.5 18a4 4 0 0 1-5.7-5.7l8-8a2.7 2.7 0 0 1 3.8 3.8l-8 8a1.3 1.3 0 0 1-1.9-1.9l7.4-7.4" />,
  ),
  screen: I(
    <>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16v4" />
    </>,
  ),
  sparkle: I(
    <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6.3 6.3l2.4 2.4M15.3 15.3l2.4 2.4M17.7 6.3l-2.4 2.4M8.7 15.3l-2.4 2.4" />,
  ),
  spark: I(<path d="M12 2.5 14 9l6.5 2-6.5 2-2 6.5-2-6.5L3.5 11 10 9l2-6.5Z" />),
  // Horizontal sliders — the universal "settings / adjust" affordance (used for the Tweaks panel,
  // which a pencil glyph wrongly read as "edit").
  sliders: I(
    <>
      <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
      <circle cx="15" cy="7" r="2" />
      <circle cx="9" cy="17" r="2" />
    </>,
  ),
  eye: I(
    <>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </>,
  ),
  eyeOff: I(
    <>
      <path d="M10.6 6.1A9.7 9.7 0 0 1 12 6c6 0 10 6 10 6a16 16 0 0 1-3.4 3.8M6.6 6.6A16 16 0 0 0 2 12s4 6 10 6a9.6 9.6 0 0 0 4.5-1.1" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
      <path d="m3 3 18 18" />
    </>,
  ),
  captions: I(
    <>
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <path d="M7.5 10.5a2 2 0 1 0 0 3M16.5 10.5a2 2 0 1 0 0 3" />
    </>,
  ),
  speaker: I(
    <>
      <path d="M4 9v6h4l5 4V5L8 9H4Z" />
      <path d="M17 8a5 5 0 0 1 0 8" />
    </>,
  ),
  speakerOff: I(
    <>
      <path d="M4 9v6h4l5 4V5L8 9H4Z" />
      <path d="m17 9 4 6M21 9l-4 6" />
    </>,
  ),
  share: I(
    <>
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path d="m8.6 10.5 6.8-4M8.6 13.5l6.8 4" />
    </>,
  ),
  export: I(
    <>
      <path d="M12 3v12" />
      <path d="m8 7 4-4 4 4" />
      <path d="M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" />
    </>,
  ),
  check: I(<path d="m4 12 5 5L20 6" />),
  copy: I(
    <>
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </>,
  ),
  chevR: I(<path d="m9 6 6 6-6 6" />),
  chevL: I(<path d="m15 18-6-6 6-6" />),
  menu: I(<path d="M4 7h16M4 12h16M4 17h16" />),
  arrowUp: I(<path d="M12 19V5M6 11l6-6 6 6" />),
  arrowDown: I(<path d="M12 5v14M18 13l-6 6-6-6" />),
  doc: I(
    <>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" />
      <path d="M14 3v5h5" />
    </>,
  ),
  slides: I(
    <>
      <rect x="3" y="4" width="18" height="13" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </>,
  ),
  proof: I(
    <>
      <path d="m9 11 3 3L22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </>,
  ),
  shield: I(
    <>
      <path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6l-7-3Z" />
      <path d="m9 12 2 2 4-4" />
    </>,
  ),
  alert: I(
    <>
      <path d="M10.3 4 3.5 16a2 2 0 0 0 1.7 3h13.6a2 2 0 0 0 1.7-3L13.7 4a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9v4M12 17h.01" />
    </>,
  ),
  lock: I(
    <>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </>,
  ),
  undo: I(
    <>
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h11a5 5 0 0 1 0 10h-3" />
    </>,
  ),
  play: I(<path d="M7 4v16l13-8L7 4Z" />),
  pause: I(
    <>
      <rect x="6" y="4" width="4" height="16" rx="1.5" />
      <rect x="14" y="4" width="4" height="16" rx="1.5" />
    </>,
  ),
  // Circular "sync / refresh" arrows, drawn as a real 14px line-icon so it matches the other
  // chips (was a bare ⟳ glyph that read smaller).
  refresh: I(
    <>
      <path d="M21 12a9 9 0 1 1-2.6-6.36" />
      <path d="M21 4v5h-5" />
    </>,
  ),
  clock: I(
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>,
  ),
  bell: I(
    <>
      <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9Z" />
      <path d="M10.3 21a2 2 0 0 0 3.4 0" />
    </>,
  ),
  table: I(
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 10h18M9 4v16" />
    </>,
  ),
  chart: I(
    <>
      <path d="M4 19V5M4 19h16" />
      <path d="m8 15 3-4 3 2 4-6" />
    </>,
  ),
  edit: I(
    <>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
    </>,
  ),
  x: I(<path d="M6 6l12 12M18 6 6 18" />),
  plus: I(<path d="M12 5v14M5 12h14" />),
  mail: I(
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </>,
  ),
  layers: I(
    <>
      <path d="m12 3 9 5-9 5-9-5 9-5Z" />
      <path d="m3 13 9 5 9-5" />
    </>,
  ),
  globe: I(
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18Z" />
    </>,
  ),
  image: I(
    <>
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <circle cx="8.5" cy="9.5" r="1.8" />
      <path d="m4 17 5-5 4 4 3-3 4 4" />
    </>,
  ),
  external: I(
    <>
      <path d="M14 4h6v6" />
      <path d="M20 4 10 14" />
      <path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" />
    </>,
  ),
  quote: I(
    <>
      <path d="M7 7h4v6a4 4 0 0 1-4 4" />
      <path d="M15 7h4v6a4 4 0 0 1-4 4" />
    </>,
  ),
  sun: I(
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </>,
  ),
  moon: I(<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />),
  link: I(
    <>
      <path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" />
      <path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" />
    </>,
  ),
  cart: I(
    <>
      <circle cx="9" cy="20" r="1.4" />
      <circle cx="18" cy="20" r="1.4" />
      <path d="M2 3h2l2.5 13h11l2-8H6" />
    </>,
  ),
  chat: I(
    <>
      <path d="M21 15a2 2 0 0 1-2 2H8l-4 4V5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2Z" />
      <path d="M8 9h8M8 13h5" />
    </>,
  ),
  // Magnifier — the universal "search"; the topbar's persistent handle on the ⌘K feature palette.
  search: I(
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </>,
  ),
  // Magnifier with a plus — "zoom in on this block", and the zoomed sheet's zoom-in control.
  zoomIn: I(
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
      <path d="M11 8v6M8 11h6" />
    </>,
  ),
  // Magnifier with a minus — the zoomed sheet's zoom-out control.
  zoomOut: I(
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
      <path d="M8 11h6" />
    </>,
  ),
  // Sidebar toggle — a framed panel with a divider, the conventional "collapse/expand the rail" glyph.
  panelLeft: I(
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M9 4v16" />
    </>,
  ),
  // Weather glyphs — so a forecast shows the real condition per day instead of falling back to sun.
  cloud: I(<path d="M17.5 18a3.5 3.5 0 0 0-.6-6.95A5 5 0 0 0 7 10.5 3.75 3.75 0 0 0 7.5 18h10Z" />),
  rain: I(
    <>
      <path d="M17 14.5a3.3 3.3 0 0 0-.55-6.55A4.7 4.7 0 0 0 7 7.7 3.55 3.55 0 0 0 7.3 14.5h9.7Z" />
      <path d="M8 17.5l-1 2.5M12 17.5l-1 2.5M16 17.5l-1 2.5" />
    </>,
  ),
  snow: I(
    <>
      <path d="M17 14.5a3.3 3.3 0 0 0-.55-6.55A4.7 4.7 0 0 0 7 7.7 3.55 3.55 0 0 0 7.3 14.5h9.7Z" />
      <path d="M8 18.5h.01M12 18.5h.01M16 18.5h.01M10 20.5h.01M14 20.5h.01" />
    </>,
  ),
  storm: I(
    <>
      <path d="M17 13.5a3.3 3.3 0 0 0-.55-6.55A4.7 4.7 0 0 0 7 6.7 3.55 3.55 0 0 0 7.3 13.5h9.7Z" />
      <path d="M13 13l-3 4.5h2.8L11 22" />
    </>,
  ),
  wind: I(
    <>
      <path d="M3 8h10.5a2.5 2.5 0 1 0-2.5-2.5" />
      <path d="M3 12h14a2.5 2.5 0 1 1-2.5 2.5" />
      <path d="M3 16h7" />
    </>,
  ),
  // Transit modes — TransitRoute's mode enum (walk|bus|subway|train|bike|car|ferry); without these
  // every step fell back to a globe.
  walk: I(
    <>
      <circle cx="12.5" cy="4" r="1.6" />
      <path d="M12.5 6.5l1 4.5 3 2.5 1 4M13.5 11l-3 2-2 4.5M16 9l1.5 1" />
    </>,
  ),
  bus: I(
    <>
      <rect x="4" y="5" width="16" height="12" rx="2.5" />
      <path d="M4 11h16" />
      <circle cx="8.5" cy="19.5" r="1.4" />
      <circle cx="15.5" cy="19.5" r="1.4" />
    </>,
  ),
  train: I(
    <>
      <rect x="6" y="3.5" width="12" height="13" rx="3" />
      <path d="M6 11h12" />
      <path d="M9.5 19.5l-2 3M14.5 19.5l2 3" />
      <circle cx="9.5" cy="13.7" r="0.9" />
      <circle cx="14.5" cy="13.7" r="0.9" />
    </>,
  ),
  subway: I(
    <>
      <rect x="5" y="4" width="14" height="13" rx="3" />
      <path d="M5 10.5h14M12 4v6.5" />
      <path d="M8.5 20l-1.5 2.5M15.5 20l1.5 2.5" />
    </>,
  ),
  bike: I(
    <>
      <circle cx="6" cy="17" r="3.3" />
      <circle cx="18" cy="17" r="3.3" />
      <path d="M6 17l4.5-7.5H15M9.5 9.5h5l3.5 7.5M10.5 9.5L9 6.5h2.5" />
    </>,
  ),
  car: I(
    <>
      <path d="M5 17l1.4-5.2A2 2 0 0 1 8.3 10.3h7.4a2 2 0 0 1 1.9 1.5L19 17" />
      <rect x="3" y="16.5" width="18" height="2.6" rx="1.2" />
      <circle cx="7.5" cy="19.5" r="1.5" />
      <circle cx="16.5" cy="19.5" r="1.5" />
    </>,
  ),
  ferry: I(
    <>
      <path d="M4 16h16l-2 4.5H6L4 16Z" />
      <path d="M6.5 16V9.5H12l4 6.5M9.5 9.5V6.5" />
      <path d="M3 21.6a2.6 2.6 0 0 0 2.9-.8 2.6 2.6 0 0 1 3.5 0 2.6 2.6 0 0 0 3.7 0 2.6 2.6 0 0 1 3.5 0 2.6 2.6 0 0 0 2.9.8" />
    </>,
  ),
} as const;

export type IconKey = keyof typeof Icon;

/** The full set of valid icon names, as a runtime list. This is the source of truth the Live
 *  prompt hands the model so it only ever emits an icon that actually exists (an invented name
 *  renders nothing). Derived from `Icon` so it can never drift from what's drawable. */
export const ICON_KEYS = Object.keys(Icon) as IconKey[];
