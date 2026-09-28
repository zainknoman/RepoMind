// Each GitHub Pages deploy replaces the previous build, including its hashed chunks. A page opened
// before a deploy (or served from the 10-minute HTML cache) then fails to load code on demand, e.g.
// Mermaid or a workspace. Browsers word the failure differently.
const STALE_BUILD =
  /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed/i;

export const STALE_BUILD_MESSAGE =
  'RepoMind was updated after this page was opened. Reload the page to load the latest version.';

export const isStaleBuildError = (error) => STALE_BUILD.test(String(error?.message ?? error ?? ''));
