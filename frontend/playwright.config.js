import { defineConfig, devices } from '@playwright/test';

// E2E runs against the production bundle served under /RepoMind/, exactly as GitHub Pages serves it,
// so base-path, code-splitting and Content-Security-Policy problems are caught before deployment.
// Set E2E_SKIP_BUILD=1 when dist/ is already built (CI builds once, then tests).
const build = process.env.E2E_SKIP_BUILD ? '' : 'npm run build && ';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: process.env.CI ? 1 : undefined,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://127.0.0.1:4173/RepoMind/',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: {
    command: `${build}npm run preview -- --host 127.0.0.1`,
    url: 'http://127.0.0.1:4173/RepoMind/',
    cwd: '.',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
