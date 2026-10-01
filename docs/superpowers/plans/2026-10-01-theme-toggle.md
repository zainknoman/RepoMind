# Header Theme Toggle (Phase C6) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox
> (`- [ ]`) syntax for tracking.

**Goal:** Let the user choose Light, Dark or System (follow the OS) from the header, remembered
per browser, without a flash of the wrong theme on load.

**Architecture:** `lib/theme.js` (`THEMES`, `loadTheme`, `saveTheme`, `applyTheme`, `nextTheme`)
stores the choice in `localStorage` (guarded) and sets `data-theme` on `<html>` (`light` /
`dark`; none for System). `main.jsx` applies it before the first render. `styles.css` keeps one
set of dark tokens, applied by `:root[data-theme='dark']` and by the OS preference unless
`data-theme='light'`. A header button cycles System → Light → Dark and names the current
choice in its label.

**Tech Stack:** React 19, CSS custom properties, Playwright.

## Global Constraints

- System stays the default; the existing "Dark mode follows the system preference" E2E holds.
- Storage failures (private mode, blocked storage) fall back to System silently.
- The toggle is a real button with an accessible name stating the current theme.

## Review Focus

1. Light chosen while the OS is dark renders light — E2E.
2. The choice survives a reload — E2E.
3. Corrupt or unknown stored value → System — unit test.

---

### Task 1: Theme module and CSS

- [x] Unit tests: `nextTheme` cycle, `loadTheme` with unknown/throwing storage, `applyTheme`
  sets/removes `data-theme`.
- [x] Implement `lib/theme.js`; restructure the dark token block in `styles.css`; apply in
  `main.jsx`.

### Task 2: Header toggle

- [x] Button in `.header-actions` (`🖥 System` / `☀ Light` / `☾ Dark`, title "Theme: … (click to
  change)"); state in App.
- [x] E2E: OS dark + choose Light → light background; choose Dark with OS light → dark; reload
  keeps Dark.
- [x] CHANGELOG, README, IMPLEMENTATION_STATE, Help.

---

## Outcome

**Status: complete** — on `main`, 2026-10-01.

- `lib/theme.js` with unit tests; `main.jsx` applies the stored theme before the first render.
- `styles.css`: the dark tokens are applied by `:root[data-theme='dark']` and, inside the OS
  dark media query, by `:root:not([data-theme='light'])` (the token list appears in both rules;
  CSS cannot share a declaration block between a selector and a media query).
- Header button "Theme: System/Light/Dark" (accessible name states the current theme; the title
  names the next one). Checked by screenshot in light, dark and at 390 px width.
- Mermaid diagrams keep their light theme, as before.

Tests: 240 unit (`theme.test.js`); E2E "The header theme toggle overrides the system
preference and is remembered".
