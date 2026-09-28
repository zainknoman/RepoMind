import { test, expect } from '@playwright/test';

const files = {
  'package.json': JSON.stringify(
    {
      name: 'e2e-fixture',
      dependencies: { express: '^5.0.0', react: '^19.0.0' },
    },
    null,
    2,
  ),
  'src/app.js': `const express = require('express');
const router = express.Router();
router.get('/users', (req, res) => res.json({ ok: true }));
router.post('/users', (req, res) => res.json({ ok: true }));
module.exports = router;
`,
  'src/service.js': `export function greet(name) { return 'Hello ' + name; }
export function unusedHelper() { return true; }
`,
  'src/app.tsx': `import React from 'react';
import { greet } from './service';
export function UserCard() { return <div>{greet('User')}</div>; }
`,
  'src/orders.py': `from fastapi import FastAPI
app = FastAPI()
@app.get('/orders')
def orders():
    return []
`,
  'src/AdminController.java': `@RestController
public class AdminController {
  @GetMapping("/admin")
  public String admin() { return "ok"; }
}
`,
  'src/UserController.cs': `public class UserController : ControllerBase {
  [HttpGet("/api/users")]
  public string GetUsers() => "ok";
}
`,
  'src/config.js': `const config = { API_KEY: "fixture-secret-1234567890" };
module.exports = config;
`,
  'src/compare-left.txt': `one
two
three
`,
  'src/compare-right.txt': `one
inserted
two
three
`,
};

async function openFixture(page) {
  await page.addInitScript((sourceFiles) => {
    function makeFile(name, content) {
      return {
        kind: 'file',
        name,
        async getFile() {
          // Fixed timestamp so the index cache key is stable across page loads.
          return new File([content], name, { type: 'text/plain', lastModified: 1700000000000 });
        },
      };
    }

    function makeDir(name, entries = {}) {
      return {
        kind: 'directory',
        name,
        async *entries() {
          for (const [entryName, entry] of Object.entries(entries)) yield [entryName, entry];
        },
        async getDirectoryHandle(path) {
          const entry = entries[path];
          if (!entry || entry.kind !== 'directory')
            throw new DOMException('Not found', 'NotFoundError');
          return entry;
        },
        async getFileHandle(path) {
          const entry = entries[path];
          if (!entry || entry.kind !== 'file') throw new DOMException('Not found', 'NotFoundError');
          return entry;
        },
      };
    }

    const root = makeDir('RepoMind E2E Fixture', {
      'package.json': makeFile('package.json', sourceFiles['package.json']),
      src: makeDir(
        'src',
        Object.fromEntries(
          Object.entries(sourceFiles)
            .filter(([path]) => path.startsWith('src/'))
            .map(([path, content]) => [path.slice(4), makeFile(path.slice(4), content)]),
        ),
      ),
      '.git': makeDir('.git', {
        HEAD: makeFile('HEAD', 'ref: refs/heads/main\\n'),
        config: makeFile(
          'config',
          '[remote "origin"]\\n\\turl = https://example.invalid/repomind-e2e.git\\n',
        ),
      }),
    });

    window.showDirectoryPicker = async () => root;
  }, files);

  // Listen before navigating so errors thrown during start-up are captured too.
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto('./');
  return pageErrors;
}

async function buildIndex(page) {
  await page.getByRole('button', { name: 'Open Folder' }).click();
  await expect(page.getByText('📁 RepoMind E2E Fixture')).toBeVisible();
  await page.getByRole('button', { name: 'Codebase' }).click();
  await page.getByRole('button', { name: /Build Project Index/ }).click();
  await expect(page.getByText('✓ Fresh index')).toBeVisible({ timeout: 30_000 });
}

test.describe('RepoMind parent navigation', () => {
  // [nav button, expected main heading once a folder is open]
  const tabs = [
    ['Dashboard', 'RepoMind E2E Fixture'],
    ['Codebase', /Codebase Intelligence/],
    ['Explorer', 'Explorer'],
    ['Search', 'Search'],
    ['Editor', 'Editor'],
    ['Ingest', /Ingest/],
    ['Quick Analysis', /Quick Analysis/],
    ['Transform', /Transform/],
    ['Compare', /Compare/],
    ['Developer Tools', 'Developer Tools'],
    ['Temenos / OFS', 'Temenos / OFS'],
    ['Markdown', /Markdown/],
  ];

  test('Header groups follow the product hierarchy', async ({ page }) => {
    await openFixture(page);
    const nav = page.getByRole('navigation');
    for (const group of ['Understand', 'Explore', 'Analyze', 'Tools'])
      await expect(nav.getByText(group, { exact: true })).toBeVisible();
    await expect(nav.locator('button.nav-primary')).toHaveText('Codebase');
    const tools = nav.locator('.nav-group.secondary');
    await expect(tools.getByRole('button')).toHaveText([
      'Developer Tools',
      'Temenos / OFS',
      'Markdown',
    ]);
    // Engineering is deliberately kept out of the header (it opens from ?tool=eng).
    await expect(nav.getByRole('button', { name: 'Engineering', exact: true })).toHaveCount(0);
    await expect(nav.getByRole('button', { name: 'Project Analysis', exact: true })).toHaveCount(0);
  });

  for (const [button, heading] of tabs) {
    test(`parent tab: ${button}`, async ({ page }) => {
      const errors = await openFixture(page);
      await page.getByRole('button', { name: 'Open Folder' }).click();
      await expect(page.getByText('📁 RepoMind E2E Fixture')).toBeVisible();
      await page.getByRole('navigation').getByRole('button', { name: button, exact: true }).click();
      await expect(page.locator('nav button.active')).toHaveText(button);
      await expect(page.locator('nav button[aria-current="page"]')).toHaveText(button);
      await expect(
        page.getByRole('main').getByRole('heading', { level: 1, name: heading }),
      ).toBeVisible();
      expect(errors, `page errors while opening ${button}`).toEqual([]);
    });
  }
});

test.describe('RepoMind Codebase Intelligence end-to-end', () => {
  test.beforeEach(async ({ page }) => {
    await openFixture(page);
    await buildIndex(page);
  });

  test('Dashboard loads interactive repository analytics', async ({ page }) => {
    await page.getByRole('button', { name: 'Dashboard', exact: true }).click();
    await expect(page.locator('.hero-badge')).toContainText('Local Repository Intelligence');
    await expect(page.getByText('Repository Composition')).toBeVisible();
    await expect(page.getByText('Project Composition')).toBeVisible();
    await expect(page.getByText('Key Insights')).toBeVisible();
    await page.getByRole('button', { name: 'Structure', exact: true }).click();
    await expect(page.getByText('Top-level folders')).toBeVisible();
    await page.getByRole('button', { name: 'Quality', exact: true }).click();
    await expect(page.getByText('Quality Signals')).toBeVisible();
    await page.getByRole('button', { name: 'Files', exact: true }).click();
    await expect(page.getByText('Repository Files')).toBeVisible();
    await page.getByPlaceholder('Filter files', { exact: true }).fill('src/');
    await expect(page.getByText(/matching files/)).toBeVisible();
    await page.locator('.dashboard-file-list button').filter({ hasText: 'src/service.js' }).click();
    await expect(page.locator('.editor textarea')).toHaveValue(/export function greet/);
  });

  test('Search finds indexed symbols, files and text in one place', async ({ page }) => {
    await page.getByRole('navigation').getByRole('button', { name: 'Search', exact: true }).click();
    await page.getByPlaceholder('Find symbols, files and text').fill('greet');
    await page.getByRole('button', { name: '🔎 Search' }).click();
    await expect(page.getByRole('heading', { name: 'Symbols (1)' })).toBeVisible();
    await expect(page.getByRole('heading', { name: /^Text \(/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /src\/app\.tsx · Line 3/ })).toBeVisible();
    // The Codebase workspace no longer has its own search.
    await page
      .getByRole('navigation')
      .getByRole('button', { name: 'Codebase', exact: true })
      .click();
    await expect(
      page.locator('.codebase-intelligence .tabs button', { hasText: 'Search' }),
    ).toHaveCount(0);
  });

  test('Search symbol result opens the file, and the viewer opens it in the Editor', async ({
    page,
  }) => {
    await page.getByRole('navigation').getByRole('button', { name: 'Search', exact: true }).click();
    await page.getByPlaceholder('Find symbols, files and text').fill('unusedHelper');
    await page.getByRole('button', { name: '🔎 Search' }).click();
    await page.getByRole('button', { name: /unusedHelper · function/ }).click();
    await expect(page.getByText('📄 src/service.js')).toBeVisible();
    await page.getByRole('button', { name: '✏️ Editor' }).click();
    await expect(page.locator('nav button.active')).toHaveText('Editor');
    await expect(page.locator('.editor textarea')).toHaveValue(/export function unusedHelper/);
  });

  test('Search regex reports an invalid pattern', async ({ page }) => {
    await page.getByRole('navigation').getByRole('button', { name: 'Search', exact: true }).click();
    await page.getByLabel('Regex').check();
    await page.getByPlaceholder('Find symbols, files and text').fill('(unclosed');
    await page.getByRole('button', { name: '🔎 Search' }).click();
    await expect(page.locator('.search-results .error')).toContainText(
      'Invalid regular expression',
    );
  });

  test('Dashboard "Search code" step opens Search', async ({ page }) => {
    await page
      .getByRole('navigation')
      .getByRole('button', { name: 'Dashboard', exact: true })
      .click();
    await page.getByRole('button', { name: '🔎 Search code' }).click();
    await expect(page.locator('nav button.active')).toHaveText('Search');
  });

  test('Codebase index survives switching workspace tabs', async ({ page }) => {
    await page.getByRole('button', { name: 'Explorer', exact: true }).click();
    await page.getByRole('button', { name: 'Codebase', exact: true }).click();
    await expect(page.getByText('✓ Fresh index')).toBeVisible();
  });

  test('AI refuses to call a provider without a model', async ({ page }) => {
    const providerCalls = [];
    await page.route(
      /api\.openai\.com|api\.anthropic\.com|generativelanguage\.googleapis\.com/,
      (route) => {
        providerCalls.push(route.request().url());
        return route.abort();
      },
    );
    await page.getByRole('button', { name: 'AI', exact: true }).click();
    await page.getByRole('button', { name: '▶ Build Prompt' }).click();
    await page.getByRole('button', { name: '⚙ AI Settings' }).click();
    await page.getByPlaceholder('Stored only in this browser').fill('test-key');
    await page.getByRole('button', { name: '🤖 Ask AI' }).click();
    await expect(page.locator('textarea.ai-response')).toHaveValue(/model/i);
    expect(providerCalls).toEqual([]);
  });

  test('Symbols child tab resolves symbols', async ({ page }) => {
    await page.getByRole('button', { name: 'Symbols', exact: true }).click();
    await expect(page.getByText('greet', { exact: true })).toBeVisible();
    await page.getByText('greet', { exact: true }).click();
    await expect(page.getByText('Definition')).toBeVisible();
  });

  test('Dependencies child tab shows dependency hotspots and cycles', async ({ page }) => {
    await page.getByRole('button', { name: 'Dependencies', exact: true }).click();
    await expect(page.getByText('Dependency Hotspots')).toBeVisible();
    await expect(page.getByText('Circular Dependencies')).toBeVisible();
  });

  test('Health child tab renders health signals', async ({ page }) => {
    await page.getByRole('button', { name: 'Health', exact: true }).click();
    await expect(page.getByText('Architecture Risk Signals')).toBeVisible();
    await expect(
      page.locator('.index-row').filter({ hasText: 'Unresolved relative imports' }).first(),
    ).toBeVisible();
  });

  test('Analyzers child tab runs every registered analyzer', async ({ page }) => {
    await page.getByRole('button', { name: 'Analyzers', exact: true }).click();
    for (const name of [
      'Route Discovery',
      'Framework Structure',
      'Symbol Resolution',
      'Architecture Hotspots',
      'Secret Scan',
    ]) {
      const panel = page
        .locator('.analyzer-registry .analytics-panel')
        .filter({ hasText: name })
        .first();
      await expect(panel).toBeVisible();
      await panel.getByRole('button', { name: /Run/ }).click();
      await expect(panel.getByText(/No result yet/)).toHaveCount(0);
    }
  });

  test('Impact child tab supports file selection', async ({ page }) => {
    await page.getByRole('button', { name: 'Impact', exact: true }).click();
    await page.locator('select').first().selectOption('src/app.js');
    await expect(page.getByRole('heading', { name: 'Dependencies', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Imported by', exact: true })).toBeVisible();

    // Symbol impact: greet is used by UserCard in app.tsx; unanalysed languages are blind spots.
    await page.locator('select').first().selectOption('src/service.js');
    await expect(
      page.locator('.codebase-intelligence .index-row').filter({ hasText: 'src/app.tsx' }),
    ).toBeVisible();
    await page.locator('.index-row').filter({ hasText: 'greet' }).click();
    const row = page.locator('.impact-row').filter({ hasText: 'UserCard' });
    await expect(row).toContainText('src/app.tsx');
    await expect(row.locator('.confidence')).toHaveText('high');
    await expect(
      page
        .locator('.analytics-panel')
        .filter({ hasText: 'Symbol Impact' })
        .getByText(/Not analysed: .*Python/),
    ).toBeVisible();
  });

  test('Analyzers API discovery finds routes from multiple frameworks', async ({ page }) => {
    await page.getByRole('button', { name: 'Analyzers', exact: true }).click();
    await page
      .locator('[data-analyzer="routes"]')
      .getByRole('button', { name: '▶ Run', exact: true })
      .click();
    await expect(page.getByText('/users', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('/orders', { exact: true })).toBeVisible();
    await expect(page.getByText('/admin', { exact: true })).toBeVisible();
    await expect(page.getByText('/api/users', { exact: true })).toBeVisible();
    await expect(page.locator('.analyzer-row').filter({ hasText: '/admin' })).toContainText('GET');
    await expect(page.locator('.analyzer-row').filter({ hasText: '/api/users' })).toContainText(
      'GET',
    );
  });

  test('Analyzers security scan finds fixture secret', async ({ page }) => {
    await page.getByRole('button', { name: 'Analyzers', exact: true }).click();
    await page
      .locator('[data-analyzer="security"]')
      .getByRole('button', { name: '▶ Run', exact: true })
      .click();
    await expect(page.getByText('api-key', { exact: true })).toBeVisible();
  });

  test('Analyzers Run All runs every analyzer and a finding opens its file', async ({ page }) => {
    await page.getByRole('button', { name: 'Analyzers', exact: true }).click();
    await page.getByRole('button', { name: '▶ Run All' }).click();
    await expect(page.getByText(/No result yet/)).toHaveCount(0);
    await expect(page.locator('.analyzer-registry .intelligence-cards')).toContainText('5/5');
    const routes = page.locator('[data-analyzer="routes"]');
    await expect(routes.locator('.analyzer-head')).toContainText('Method');
    await routes.getByRole('button', { name: 'src/orders.py' }).click();
    await expect(page.locator('nav button.active')).toHaveText('Editor');
    await expect(page.locator('.editor textarea')).toHaveValue(/FastAPI/);
  });

  test('Diagram child tab generates dependency graph', async ({ page }) => {
    await page.getByRole('button', { name: 'Diagram', exact: true }).click();
    await page.getByRole('button', { name: /Generate/ }).click();
    await expect(page.locator('textarea.diagram-output')).toHaveValue(/graph TD/);
  });

  test('Diagram explains a missing Mermaid chunk after a redeploy', async ({ page }) => {
    // Simulates a page from a previous deploy whose hashed chunk no longer exists.
    await page.route(/mermaid.core-[^/]*.js$/, (route) => route.fulfill({ status: 404 }));
    await page.getByRole('button', { name: 'Diagram', exact: true }).click();
    await expect(page.locator('.codebase-intelligence .error')).toContainText(
      'RepoMind was updated after this page was opened',
    );
  });

  test('Codebase text outputs use the full panel width', async ({ page }) => {
    for (const [tab, selector] of [
      ['Reports', 'textarea.report-output'],
      ['Diagram', 'textarea.diagram-output'],
      ['AI', 'textarea.ai-output'],
    ]) {
      await page.getByRole('button', { name: tab, exact: true }).click();
      const area = page.locator(selector);
      const [box, panel] = await Promise.all([
        area.boundingBox(),
        area.locator('xpath=..').boundingBox(),
      ]);
      expect(box.width, tab).toBeGreaterThan(panel.width * 0.9);
    }
  });

  test('Git child tab reads local Git metadata', async ({ page }) => {
    await page.getByRole('button', { name: 'Git', exact: true }).click();
    await expect(page.locator('.tabs button.active')).toHaveText('Git');
    await expect(page.locator('.git-workspace')).toBeVisible();
    await expect(
      page.locator('.git-workspace .transform-toolbar b').filter({ hasText: 'Repository' }),
    ).toBeVisible();
    await expect(
      page.locator('.git-workspace .index-row').filter({ hasText: 'Branch' }),
    ).toBeVisible();
    await expect(
      page.locator('.git-workspace .index-row').filter({ hasText: 'Branch' }),
    ).toContainText('main');
    await expect(
      page.locator('.git-workspace .index-row').filter({ hasText: 'Remote' }),
    ).toContainText('https://example.invalid/repomind-e2e.git');
  });

  test('Reports child tab generates project report', async ({ page }) => {
    await page.getByRole('button', { name: 'Reports', exact: true }).click();
    await page.getByRole('button', { name: '▶ Project Report' }).click();
    await expect(page.locator('textarea.report-output')).toContainText('Codebase Report');
  });

  test('Context Builder child tab generates context', async ({ page }) => {
    await page.getByRole('button', { name: 'Context Builder', exact: true }).click();
    await page.getByRole('button', { name: '▶ Generate Context' }).click();
    await expect(page.locator('textarea.context-output').last()).not.toHaveValue('');
  });

  test('AI child tab builds a prompt without an AI provider', async ({ page }) => {
    await page.getByRole('button', { name: 'AI', exact: true }).click();
    await page.getByRole('button', { name: '▶ Build Prompt' }).click();
    await expect(page.locator('textarea.ai-output')).not.toHaveValue('');
    await expect(page.locator('textarea.ai-output')).toContainText('RepoMind Task');
  });

  test('AI prompt is grounded in files relevant to the question', async ({ page }) => {
    await page.getByRole('button', { name: 'AI', exact: true }).click();
    await page.locator('textarea.ai-task').fill('How does greet work, and what reads config.js?');
    await page.getByRole('button', { name: '▶ Build Prompt' }).click();
    const prompt = page.locator('textarea.ai-output');
    await expect(prompt).toHaveValue(/## Repository map/);
    await expect(prompt).toHaveValue(/### src\/service\.js\nReason: defines greet/);
    await expect(prompt).toHaveValue(/1\| export function greet\(name\)/);
    // The fixture's API key is masked before it can reach a provider.
    await expect(prompt).not.toHaveValue(/fixture-secret-1234567890/);
    await expect(page.locator('.context-summary')).toContainText('likely secrets masked');
    await expect(
      page.locator('.context-summary .context-file').filter({ hasText: 'src/service.js' }),
    ).toContainText('defines greet');
  });

  test('AI answers are checked for file:line citations', async ({ page }) => {
    let sent;
    await page.route('https://api.openai.com/**', async (route) => {
      sent = route.request().postDataJSON();
      await route.fulfill({
        json: {
          choices: [
            {
              message: {
                content: 'greet is defined at src/service.js:1; see also src/nowhere.js:3.',
              },
            },
          ],
        },
      });
    });
    await page.getByRole('button', { name: 'AI', exact: true }).click();
    await page.locator('textarea.ai-task').fill('Where is greet defined?');
    await page.getByRole('button', { name: '⚙ AI Settings' }).click();
    await page.getByPlaceholder('e.g. gpt-4.1-mini').fill('test-model');
    await page.getByPlaceholder('Stored only in this browser').fill('test-key');
    await page.getByRole('button', { name: '🤖 Ask AI' }).click();
    const check = page.locator('.grounding-check');
    await expect(check).toContainText('1 of 2 file references verified');
    await expect(check.locator('.citation.verified')).toContainText('src/service.js:1');
    await expect(check.locator('.citation.unknown-file')).toContainText('no such file');
    expect(sent.messages[0]).toMatchObject({ role: 'system' });
    expect(sent.messages[0].content).toContain('path:line');
    expect(sent.messages[1].content).toContain('### src/service.js');
  });

  test('saved contexts keep the file list, not the source, and rebuild on load', async ({
    page,
  }) => {
    await page.getByRole('button', { name: 'AI', exact: true }).click();
    await page.locator('textarea.ai-task').fill('How does greet work?');
    await page.getByRole('button', { name: '▶ Build Prompt' }).click();
    await page.getByPlaceholder('Snapshot name').fill('Greeting');
    await page.getByRole('button', { name: '💾 Save Snapshot' }).click();
    const stored = await page.evaluate(() => localStorage.getItem('repomind.savedContexts'));
    expect(stored).toContain('src/service.js');
    expect(stored).not.toContain('export function greet');
    await page.locator('textarea.ai-output').fill('');
    await page
      .locator('.saved-context')
      .filter({ hasText: 'Greeting' })
      .getByRole('button', { name: 'Load' })
      .click();
    await expect(page.getByText(/Rebuilt “Greeting” from the current files/)).toBeVisible();
    await expect(page.locator('textarea.ai-output')).toHaveValue(/export function greet/);
  });
});

test.describe('RepoMind Analyze workspaces', () => {
  test.beforeEach(async ({ page }) => {
    await openFixture(page);
    await page.getByRole('button', { name: 'Open Folder' }).click();
    await expect(page.getByText('📁 RepoMind E2E Fixture')).toBeVisible();
  });

  test('Compare aligns an inserted line instead of marking everything changed', async ({
    page,
  }) => {
    await page.getByRole('button', { name: 'Compare', exact: true }).click();
    await page.locator('.compare-select select').nth(0).selectOption('src/compare-left.txt');
    await page.locator('.compare-select select').nth(1).selectOption('src/compare-right.txt');
    await page.getByRole('button', { name: '🔍 Compare' }).click();
    const summary = page.locator('.diff-summary');
    await expect(summary).toContainText('1 added');
    await expect(summary).toContainText('0 removed');
    await expect(summary).toContainText('0 modified');
    await expect(page.locator('.analytics-panel textarea')).toHaveValue('+ inserted');
  });

  test('Quick Analysis indexes JavaScript and TypeScript files', async ({ page }) => {
    await page.getByRole('button', { name: 'Quick Analysis', exact: true }).click();
    await page.getByRole('button', { name: '⚡ Run Quick Analysis' }).click();
    await expect(page.locator('article').filter({ hasText: 'JS/TS files' })).toContainText('4');
    await expect(page.locator('article').filter({ hasText: 'Functions' })).toContainText('3');
    await expect(page.locator('article').filter({ hasText: 'Lines' }).first()).not.toHaveText(
      /^\s*\d\s*Lines/,
    );
  });

  test('Quick Analysis points to Codebase Intelligence for the full index', async ({ page }) => {
    await page.getByRole('button', { name: 'Quick Analysis', exact: true }).click();
    await page.getByRole('main').getByRole('button', { name: 'Codebase Intelligence' }).click();
    await expect(page.locator('nav button.active')).toHaveText('Codebase');
  });
});

async function openFolder(page) {
  const errors = await openFixture(page);
  await page.getByRole('button', { name: 'Open Folder' }).click();
  await expect(page.getByText('📁 RepoMind E2E Fixture')).toBeVisible();
  return errors;
}

async function goTo(page, label) {
  await page.getByRole('navigation').getByRole('button', { name: label, exact: true }).click();
}

test.describe('RepoMind workspaces', () => {
  test('Explorer filters files and opens one in the Editor', async ({ page }) => {
    await openFolder(page);
    await goTo(page, 'Explorer');
    await page.getByPlaceholder('Filter files', { exact: true }).fill('service');
    await expect(page.getByText(/1 of \d+ files/)).toBeVisible();
    await page.getByRole('button', { name: /src\/service\.js/ }).click();
    await expect(page.locator('nav button.active')).toHaveText('Editor');
    await expect(page.locator('.editor textarea')).toHaveValue(/export function greet/);
  });

  test('Search finds text, handles special characters and opens the match', async ({ page }) => {
    await openFolder(page);
    await goTo(page, 'Search');
    await expect(page.getByText('Build the code index to also find symbols.')).toBeVisible();
    await page.getByPlaceholder('Find symbols, files and text').fill("greet('User')");
    await page
      .getByRole('button', { name: /Search/ })
      .last()
      .click();
    const hit = page.getByRole('button', { name: /src\/app\.tsx · Line 3/ });
    await expect(hit).toBeVisible();
    await page.getByPlaceholder('Find symbols, files and text').fill('no-such-text-anywhere');
    await page
      .getByRole('button', { name: /Search/ })
      .last()
      .click();
    await expect(page.getByText('No matches.')).toBeVisible();
  });

  test('Search builds the code index on request and then finds symbols', async ({ page }) => {
    await openFolder(page);
    await goTo(page, 'Search');
    await page.getByRole('button', { name: 'Build index' }).click();
    // Wait for the build to finish, not just start: both hints disappear once the index exists.
    await expect(page.getByText(/Build the code index|Building the code index/)).toHaveCount(0, {
      timeout: 30_000,
    });
    await page.getByPlaceholder('Find symbols, files and text').fill('greet');
    await page.getByRole('button', { name: '🔎 Search' }).click();
    await expect(page.getByRole('heading', { name: 'Symbols (1)' })).toBeVisible();
    await expect(page.locator('nav button.active')).toHaveText('Search');
  });

  test('Editor find/replace respects case and does not steal focus while typing', async ({
    page,
  }) => {
    await openFolder(page);
    await goTo(page, 'Explorer');
    await page.getByRole('button', { name: /src\/service\.js/ }).click();
    const find = page.getByRole('textbox', { name: 'Find' });
    await find.pressSequentially('export');
    await expect(find).toBeFocused();
    await expect(find).toHaveValue('export');
    await expect(page.getByText('1/2')).toBeVisible();
    await page.getByLabel('Match case').check();
    await find.fill('EXPORT');
    await expect(page.getByText('0/0')).toBeVisible();
    await find.fill('greet');
    await page.getByRole('textbox', { name: 'Replace with' }).fill('hello');
    await page.getByRole('button', { name: 'Replace All' }).click();
    await expect(page.locator('.editor textarea')).toHaveValue(/export function hello/);
    await expect(page.getByText('● modified')).toBeVisible();
  });

  test('Unsaved edits are protected when opening another file', async ({ page }) => {
    await openFolder(page);
    await goTo(page, 'Explorer');
    await page.getByRole('button', { name: /src\/service\.js/ }).click();
    await page.locator('.editor textarea').fill('edited');
    await goTo(page, 'Explorer');
    page.once('dialog', (d) => d.dismiss());
    await page.getByRole('button', { name: /src\/config\.js/ }).click();
    await expect(page.locator('.editor textarea')).toHaveCount(0); // stayed in Explorer
    await goTo(page, 'Editor');
    await expect(page.locator('.editor textarea')).toHaveValue('edited');
    await goTo(page, 'Explorer');
    page.once('dialog', (d) => d.accept());
    await page.getByRole('button', { name: /src\/config\.js/ }).click();
    await expect(page.locator('.editor textarea')).toHaveValue(/API_KEY/);
  });

  test('Ingest builds a summary, a directory tree and combined content', async ({ page }) => {
    await openFolder(page);
    await goTo(page, 'Ingest');
    await page.getByRole('button', { name: /Generate/ }).click();
    await expect(page.locator('textarea').nth(0)).toHaveValue(/Total files: \d+/);
    await expect(page.locator('textarea').nth(1)).toHaveValue(/└── |├── /);
    await expect(page.locator('textarea').nth(2)).toHaveValue(/Start of file: src\/service\.js/);
  });

  test('Transform compiles selected files and splits them back', async ({ page }) => {
    await openFolder(page);
    await goTo(page, 'Transform');
    await page.getByRole('checkbox', { name: 'src/service.js' }).check();
    await page.getByRole('button', { name: /Compile/ }).click();
    const compiled = page.getByRole('textbox', { name: 'Compiled output' });
    await expect(compiled).toHaveValue(/Start of file: src\/service\.js/);
    await page.getByRole('textbox', { name: 'Bundle to split' }).fill(await compiled.inputValue());
    await page.getByRole('button', { name: /Split/ }).click();
    await expect(page.getByText('📄 src/service.js')).toBeVisible();
    await expect(page.getByText('1 of 1 files')).toBeVisible();
  });

  test('Markdown renders sanitised HTML and Mermaid diagrams', async ({ page }) => {
    const errors = await openFixture(page);
    await goTo(page, 'Markdown');
    await page
      .getByRole('textbox', { name: 'Markdown source' })
      .fill('# Title\n\n<img src=x onerror=alert(1)>\n\n```mermaid\ngraph TD; A-->B\n```');
    await expect(page.locator('.md-viewer h1')).toHaveText('Title');
    await expect(page.locator('.md-viewer img[onerror]')).toHaveCount(0);
    await expect(page.locator('.md-viewer svg')).toBeVisible({ timeout: 20_000 });
    expect(errors).toEqual([]);
  });

  test('Developer Tools format JSON and run a regex against typed text', async ({ page }) => {
    await openFixture(page);
    await page.goto('./?tool=json');
    await page.getByRole('textbox', { name: 'Tool input' }).fill('{"a":1}');
    await page.getByRole('button', { name: '▶ Run' }).click();
    await expect(page.getByRole('textbox', { name: 'Tool output' })).toHaveValue('{\n  "a": 1\n}');
    await page.getByRole('tab', { name: /Regex/ }).click();
    await page.getByRole('textbox', { name: 'Regular Expression' }).fill('\\d+');
    await page.getByRole('textbox', { name: 'Test Text' }).fill('a1 b22');
    await page.getByRole('button', { name: '▶ Run' }).click();
    await expect(page.getByRole('textbox', { name: 'Output' })).toHaveValue(/"count": 2/);
  });

  test('Tools open from a ?tool= deep link', async ({ page }) => {
    await page.goto('./?tool=uuid');
    await expect(
      page.getByRole('main').getByRole('heading', { level: 1, name: 'Developer Tools' }),
    ).toBeVisible();
    await expect(page.getByRole('tab', { name: /UUID/ })).toHaveAttribute('aria-selected', 'true');
  });

  test('Embedded OFS tool is sandboxed and persists settings through the bridge', async ({
    page,
  }) => {
    await openFixture(page);
    await page.goto('./?tool=ofs');
    const iframe = page.locator('iframe[title="OFS Generator"]');
    await expect(iframe).toHaveAttribute('sandbox', /allow-scripts/);
    await expect(iframe).not.toHaveAttribute('sandbox', /allow-same-origin/);
    const tool = page.frameLocator('iframe[title="OFS Generator"]');
    await tool.locator('#application').fill('FUNDS.TRANSFER');
    await tool.locator('#saveBtn').click();
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem('repomind.ofs.config') || ''))
      .toContain('FUNDS.TRANSFER');
    const frame = page.frames().find((f) => f.url().includes('ofsMessageGenNew.html'));
    const reachParent = await frame.evaluate(() => {
      try {
        return String(window.parent.localStorage.length);
      } catch {
        return 'blocked';
      }
    });
    expect(reachParent).toBe('blocked');
  });

  test('Engineering and T24 tools load inside the sandbox', async ({ page }) => {
    await openFixture(page);
    await page.goto('./?tool=ofs');
    await page.getByRole('tab', { name: /T24 Log Analyzer/ }).click();
    await expect(page.frameLocator('iframe[title="T24 Log Analyzer"]').locator('h1')).toContainText(
      'T24 Log Analyzer',
    );
    await page.goto('./?tool=eng');
    await expect(page.locator('iframe[title="Engineering Utilities"]')).toHaveAttribute(
      'sandbox',
      /allow-scripts/,
    );
  });

  test('Reopening the same folder restores the cached index', async ({ page }) => {
    await openFixture(page);
    await buildIndex(page);
    await page.reload();
    await page.getByRole('button', { name: 'Open Folder' }).click();
    await goTo(page, 'Codebase');
    await expect(page.getByText('⚡ Cached index')).toBeVisible();
  });

  test('Dark mode follows the system preference', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await openFixture(page);
    const background = await page.evaluate(
      () => getComputedStyle(document.documentElement).backgroundColor,
    );
    expect(background).toBe('rgb(11, 18, 32)');
  });
});

test.describe('RepoMind in unsupported browsers', () => {
  test('explains that folder access needs a Chromium browser', async ({ page }) => {
    await page.addInitScript(() => {
      window.showDirectoryPicker = undefined;
    });
    await page.goto('./');
    await expect(page.getByText(/needs a Chromium-based browser/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open Folder' })).toBeDisabled();
    await goTo(page, 'Markdown');
    await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toContainText(
      'Markdown',
    );
  });
});

test.describe('RepoMind Help', () => {
  test('Help opens the help workspace and switches topics', async ({ page }) => {
    const errors = await openFixture(page);
    await page.getByRole('button', { name: /Help/ }).click();

    await expect(page.locator('.help-page')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Learn RepoMind' })).toBeVisible();
    await expect(page.getByText('Every workspace is explained')).toBeVisible();
    await page.locator('.help-list button').filter({ hasText: 'Codebase Intelligence' }).click();
    await expect(page.locator('.help-detail')).toContainText('The central intelligence workspace');
    await expect(page.locator('.help-list button.active')).toContainText('Codebase Intelligence');

    expect(errors, 'page errors while opening Help').toEqual([]);
  });
});

test.describe('RepoMind Dashboard investigation', () => {
  const codebaseTab = (page) => page.locator('.codebase-intelligence .tabs button.active');

  test('first run explains the workflow and opens a repository', async ({ page }) => {
    const errors = await openFixture(page);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Understand any codebase locally' }),
    ).toBeVisible();
    await expect(page.locator('.workflow li')).toHaveCount(6);
    await expect(page.locator('.workflow li.current')).toContainText('Open');
    await page.getByRole('button', { name: /Open Repository Folder/ }).click();
    await expect(page.getByText('📁 RepoMind E2E Fixture')).toBeVisible();
    const investigate = page.locator('.investigate');
    await expect(investigate.getByRole('button', { name: /Build Project Index/ })).toBeVisible();
    await expect(investigate.locator('.workflow li.current')).toContainText('Index');
    expect(errors).toEqual([]);
  });

  test('builds the index from the Dashboard and links findings to Codebase views', async ({
    page,
  }) => {
    await openFolder(page);
    const investigate = page.locator('.investigate');
    await investigate.getByRole('button', { name: /Build Project Index/ }).click();
    await expect(investigate.getByText(/✓ Fresh index/)).toBeVisible({ timeout: 30_000 });
    await expect(
      investigate.locator('.investigate-signal').filter({ hasText: 'Circular dependency paths' }),
    ).toContainText('0');
    await expect(investigate.getByText(/Every relative import resolves/)).toBeVisible();

    // A hotspot opens Impact focused on that file.
    await investigate
      .locator('.investigate-lists .index-row')
      .filter({ hasText: 'src/service.js' })
      .click();
    await expect(page.locator('nav button.active')).toHaveText('Codebase');
    await expect(codebaseTab(page)).toHaveText('Impact');
    await expect(page.locator('.codebase-intelligence select').first()).toHaveValue(
      'src/service.js',
    );
    await expect(
      page.locator('.codebase-intelligence .index-row').filter({ hasText: 'src/app.tsx' }),
    ).toBeVisible();
    // The Codebase workspace shares the index built on the Dashboard.
    await expect(page.getByText('✓ Fresh index')).toBeVisible();

    await goTo(page, 'Dashboard');
    await investigate
      .locator('.investigate-signal')
      .filter({ hasText: 'Circular dependency paths' })
      .click();
    await expect(codebaseTab(page)).toHaveText('Dependencies');

    await goTo(page, 'Dashboard');
    await investigate
      .locator('.workflow')
      .getByRole('button', { name: /Report \/ AI/ })
      .click();
    await expect(codebaseTab(page)).toHaveText('Reports');
  });

  test('shows a restored cached index without rebuilding', async ({ page }) => {
    await openFixture(page);
    await buildIndex(page);
    await page.reload();
    await page.getByRole('button', { name: 'Open Folder' }).click();
    await expect(page.locator('.investigate').getByText(/⚡ Cached index/)).toBeVisible();
    await expect(page.locator('.investigate .investigate-signal')).toHaveCount(5);
  });

  test('security count reads "not scanned" until the scan runs', async ({ page }) => {
    await openFixture(page);
    await buildIndex(page);
    const card = page.locator('.intelligence-cards article').filter({ hasText: /Security/ });
    await expect(card).toContainText('Security: not scanned');
    await page.getByRole('button', { name: 'Analyzers', exact: true }).click();
    await page
      .locator('[data-analyzer="security"]')
      .getByRole('button', { name: '▶ Run', exact: true })
      .click();
    await expect(card).toContainText('Security findings');
    await expect(card.locator('b')).toHaveText('1');
  });
});
