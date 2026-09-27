# Security Policy

## Reporting a vulnerability

Please report security issues privately through GitHub's **Report a vulnerability** option on the
repository's *Security* tab (private vulnerability reporting). Do not open a public issue for a
suspected vulnerability. Include steps to reproduce and the affected version or commit.

## Supported versions

Only the latest version deployed to GitHub Pages from `main` receives fixes.

## Security model

RepoMind is a static, backend-free web application. Repository files are read through the browser's
File System Access API and processed locally.

| Asset | Protection |
|---|---|
| Repository source | Never uploaded. Only sent to an AI provider when the user clicks **Ask AI**, and only the context the user built. |
| AI API key | Kept in `sessionStorage` for the current tab only; never written to `localStorage`, IndexedDB or reports. Gemini keys are sent in a header, not the URL. |
| Detected secrets | Security-scan findings mask the matched value before it is displayed or exported. |
| Index cache | IndexedDB holds analysis metadata (paths, symbols, dependencies), not file contents. It can be cleared from the Codebase workspace. |
| Sensitive files | `.env`, keys and credential-like files are not read unless **Include sensitive files** is ticked. |

### Browser hardening

- **Content Security Policy** (production builds, set in `frontend/vite.config.js`): scripts only from
  the site itself; network access only to the site and the supported AI provider APIs; no plugins;
  no form submission.
- **No third-party scripts.** All dependencies, including Mermaid and JSZip, are bundled.
- **Sanitised rendering.** Markdown is rendered with `marked` and sanitised with DOMPurify; Mermaid
  runs with `securityLevel: "strict"`.
- **Sandboxed embedded tools.** The Temenos/OFS and Engineering tools run in iframes with
  `sandbox="allow-scripts allow-downloads allow-modals allow-forms"` (no `allow-same-origin`), so
  they have an opaque origin and cannot read RepoMind's storage or navigate the app. Each tool page has
  its own CSP with `connect-src 'none'`. They communicate through `public/tools/repomind-bridge.js`;
  RepoMind accepts only messages from its own frame, only two allow-listed storage keys and only the
  "open OFS generator" action. Log content shown by the T24 analyzer is HTML-escaped.
- **ZIP export** strips absolute paths and `..` segments from entry names.

### Known limitations

- GitHub Pages cannot send HTTP security headers, so the CSP is delivered as a `<meta>` tag; this
  cannot enforce `frame-ancestors`.
- Direct browser calls to AI providers require the provider to allow CORS and expose the API key to
  the browser session; use a dedicated, restricted key.
- An OpenAI-compatible endpoint on a host not listed in `connect-src` is blocked until it is added to
  the policy.
