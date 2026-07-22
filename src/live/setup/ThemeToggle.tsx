// ThemeToggle.tsx — a light/dark switch for the Live surface. Live is mounted on its own at
// #/live (the demo's App, which normally owns the theme, never mounts there), so this both
// APPLIES the stored theme on mount — otherwise a returning light-mode user would briefly get
// the CSS dark default — and flips it on click. It reuses the demo's exact contract: the
// `mavea-theme` localStorage key and `document.documentElement.dataset.theme`, so a choice made
// here carries back to the demo and vice-versa.
import { useEffect, useState, type ReactElement } from 'react';
import { MoonIcon, SunIcon } from '../../icons/coreIcons';
import { readTheme, writeTheme, applyTheme, type Theme } from '../../lib/theme';

export function ThemeToggle({
  className = 'setup-icon-btn',
}: {
  className?: string;
}): ReactElement {
  const [theme, setTheme] = useState<Theme>(readTheme);

  // Apply on mount so deep-linking straight to #/live honours a previously-chosen light theme.
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const toggle = (): void => {
    const next: Theme = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    writeTheme(next);
  };

  return (
    <button
      type="button"
      className={className}
      onClick={toggle}
      aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
      title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
    >
      {theme === 'light' ? <MoonIcon /> : <SunIcon />}
    </button>
  );
}
