// The always-on mic preference's storage key. The Tweaks panel that once lived around it
// belonged to the old demo surface; the key survives because Live persists and reads the
// same preference (LiveApp's mic-mode popover), and a rename would silently drop every
// existing user's stored choice.
export const ALWAYS_ON_STORAGE_KEY = 'mavea-always-on';
