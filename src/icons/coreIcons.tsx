// Tiny, tree-shakeable icons for the eager landing shell. Importing the full application icon
// catalog here makes a cold landing parse every feature glyph before the first interaction.
import type { ReactNode, SVGProps } from 'react';

const icon = (paths: ReactNode) =>
  function CoreIcon(props: SVGProps<SVGSVGElement>) {
    return (
      <svg
        viewBox="0 0 24 24"
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
  };

export const MicIcon = icon(
  <>
    <path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z" />
    <path d="M19 11a7 7 0 0 1-14 0" />
    <path d="M12 18v3" />
  </>,
);

export const SendIcon = icon(<path d="m4 12 16-7-7 16-2.5-6.5L4 12Z" />);

export const MenuIcon = icon(<path d="M4 7h16M4 12h16M4 17h16" />);

export const SearchIcon = icon(
  <>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m16 16 4.5 4.5" />
  </>,
);

export const SunIcon = icon(
  <>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </>,
);

export const MoonIcon = icon(<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />);

export const SpeakerOffIcon = icon(
  <>
    <path d="M4 9v6h4l5 4V5L8 9H4Z" />
    <path d="m17 9 4 6M21 9l-4 6" />
  </>,
);
