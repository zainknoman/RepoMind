// The colour theme: 'system' follows the operating system; 'light' and 'dark' override it. The
// choice is kept per browser and applied as `data-theme` on <html>, which styles.css reads.

export const THEMES = ['system', 'light', 'dark'];
const KEY = 'repomind.theme';

export const nextTheme = (theme) => THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];

export function loadTheme(storage = globalThis.localStorage) {
  try {
    const value = storage?.getItem(KEY);
    return THEMES.includes(value) ? value : 'system';
  } catch {
    return 'system';
  }
}

export function saveTheme(theme, storage = globalThis.localStorage) {
  try {
    storage?.setItem(KEY, theme);
  } catch {
    // Storage blocked (private mode, policy): the choice lasts for this page only.
  }
}

export function applyTheme(theme, root = globalThis.document?.documentElement) {
  if (!root) return;
  if (theme === 'light' || theme === 'dark') root.dataset.theme = theme;
  else delete root.dataset.theme;
}
