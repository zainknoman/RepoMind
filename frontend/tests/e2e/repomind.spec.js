import { test, expect } from '@playwright/test';

const files = {
  'package.json': JSON.stringify({
    name: 'e2e-fixture',
    dependencies: { express: '^5.0.0', react: '^19.0.0' }
  }, null, 2),
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
`
};

async function openFixture(page) {
  await page.addInitScript(sourceFiles => {
    function makeFile(name, content) {
      return {
        kind: 'file',
        name,
        async getFile() {
          return new File([content], name, { type: 'text/plain', lastModified: Date.now() });
        }
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
          if (!entry || entry.kind !== 'directory') throw new DOMException('Not found', 'NotFoundError');
          return entry;
        },
        async getFileHandle(path) {
          const entry = entries[path];
          if (!entry || entry.kind !== 'file') throw new DOMException('Not found', 'NotFoundError');
          return entry;
        }
      };
    }

    const root = makeDir('RepoMind E2E Fixture', {
      'package.json': makeFile('package.json', sourceFiles['package.json']),
      src: makeDir('src', Object.fromEntries(
        Object.entries(sourceFiles)
          .filter(([path]) => path.startsWith('src/'))
          .map(([path, content]) => [path.slice(4), makeFile(path.slice(4), content)])
      )),
      '.git': makeDir('.git', {
        HEAD: makeFile('HEAD', 'ref: refs/heads/main\\n'),
        config: makeFile('config', '[remote "origin"]\\n\\turl = https://example.invalid/repomind-e2e.git\\n')
      })
    });

    window.showDirectoryPicker = async () => root;
  }, files);

  await page.goto('/');
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
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
  const tabs = [
    ['Overview', 'Overview'],
    ['Codebase', 'Codebase Intelligence'],
    ['Explorer', 'Project Explorer'],
    ['Search', 'Search'],
    ['Editor', 'Editor'],
    ['Ingest', 'Code Ingest'],
    ['Project Analysis', 'Project Analysis'],
    ['Transform', 'Transform'],
    ['Compare', 'Diff / Compare'],
    ['Developer Tools', 'Developer Tools'],
    ['Temenos', 'Temenos'],
    ['Markdown', 'Markdown'],
    ['Engineering', 'Engineering']
  ];

  for (const [button, heading] of tabs) {
    test(`parent tab: ${button}`, async ({ page }) => {
      const errors = await openFixture(page);
      await page.getByRole('button', { name: button, exact: true }).click();
      await expect(page.locator('nav button.active')).toHaveText(button);
      await expect(page.locator('main')).toBeVisible();
      expect(errors, `page errors while opening ${button}`).toEqual([]);
    });
  }
});

test.describe('RepoMind Codebase Intelligence end-to-end', () => {
  test.beforeEach(async ({ page }) => {
    await openFixture(page);
    await buildIndex(page);
  });

  test('Overview child tab works', async ({ page }) => {
    await page.getByRole('button', { name: 'Overview', exact: true }).last().click();
    await expect(page.getByText('Project Profile')).toBeVisible();
    await expect(page.getByText('Health Signals')).toBeVisible();
  });

  test('Search child tab finds source and indexed symbols', async ({ page }) => {
    await page.getByRole('button', { name: 'Search', exact: true }).last().click();
    await page.getByPlaceholder('Search symbols, files and source text').fill('greet');
    await page.getByRole('button', { name: '▶ Search' }).click();
    await expect(page.getByText('greet', { exact: false }).first()).toBeVisible();
  });

  test('Symbols child tab resolves symbols', async ({ page }) => {
    await page.getByRole('button', { name: 'Symbols', exact: true }).click();
    await expect(page.getByText('greet', { exact: true })).toBeVisible();
    await page.getByText('greet', { exact: true }).click();
    await expect(page.getByText('Definition')).toBeVisible();
  });

  test('Architecture child tab shows dependency hotspots', async ({ page }) => {
    await page.getByRole('button', { name: 'Architecture', exact: true }).click();
    await expect(page.getByText('Architecture Hotspots')).toBeVisible();
  });

  test('Health child tab renders health signals', async ({ page }) => {
    await page.getByRole('button', { name: 'Health', exact: true }).click();
    await expect(page.getByText('Architecture Risk Signals')).toBeVisible();
    await expect(page.locator('.index-row').filter({ hasText: 'Unresolved relative imports' }).first()).toBeVisible();
  });

  test('Analyzers child tab runs every registered analyzer', async ({ page }) => {
    await page.getByRole('button', { name: 'Analyzers', exact: true }).click();
    for (const name of ['Route Discovery', 'Framework Structure', 'Symbol Resolution', 'Architecture Hotspots']) {
      const panel = page.locator('.analytics-panel').filter({ hasText: name }).first();
      await expect(panel).toBeVisible();
      await panel.getByRole('button', { name: /Run/ }).click();
      await expect(panel.getByText(/No result yet/)).toHaveCount(0);
    }
  });

  test('Impact child tab supports file selection', async ({ page }) => {
    await page.getByRole('button', { name: 'Impact', exact: true }).click();
    await page.locator('select').first().selectOption('src/app.js');
    await expect(page.getByText('Dependencies')).toBeVisible();
    await expect(page.getByText('Imported by')).toBeVisible();
  });

  test('API Discovery finds routes from multiple frameworks', async ({ page }) => {
    await page.getByRole('button', { name: 'API Discovery', exact: true }).click();
    await page.getByRole('button', { name: '▶ Run Scan' }).click();
    await expect(page.getByText('/users', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('/orders', { exact: true })).toBeVisible();
    await expect(page.getByText('/admin', { exact: true })).toBeVisible();
    await expect(page.getByText('/api/users', { exact: true })).toBeVisible();
    await expect(page.locator('.analyzer-row').filter({ hasText: '/admin' })).toContainText('GET');
    await expect(page.locator('.analyzer-row').filter({ hasText: '/api/users' })).toContainText('GET');
  });

  test('Security child tab finds fixture secret', async ({ page }) => {
    await page.getByRole('button', { name: 'Security', exact: true }).click();
    await page.getByRole('button', { name: '▶ Run Scan' }).click();
    await expect(page.getByText('api-key', { exact: true })).toBeVisible();
  });

  test('Diagram child tab generates dependency graph', async ({ page }) => {
    await page.getByRole('button', { name: 'Diagram', exact: true }).click();
    await page.getByRole('button', { name: /Generate/ }).click();
    await expect(page.locator('textarea.diagram-output')).toHaveValue(/graph TD/);
  });

  test('Git child tab reads local Git metadata', async ({ page }) => {
    await page.getByRole('button', { name: 'Git', exact: true }).click();
    await expect(page.locator('.tabs button.active')).toHaveText('Git');
    await expect(page.locator('.git-workspace')).toBeVisible();
    await expect(page.locator('.git-workspace .transform-toolbar b').filter({ hasText: 'Repository' })).toBeVisible();
    await expect(page.locator('.git-workspace .index-row').filter({ hasText: 'Branch' })).toBeVisible();
    await expect(page.locator('.git-workspace .index-row').filter({ hasText: 'Branch' })).toContainText('main');
    await expect(page.locator('.git-workspace .index-row').filter({ hasText: 'Remote' })).toContainText('https://example.invalid/repomind-e2e.git');
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

  test('AI Workspace child tab builds a prompt without an AI provider', async ({ page }) => {
    await page.getByRole('button', { name: 'AI Workspace', exact: true }).click();
    await page.getByRole('button', { name: '▶ Build Prompt' }).click();
    await expect(page.locator('textarea.ai-output')).not.toHaveValue('');
    await expect(page.locator('textarea.ai-output')).toContainText('RepoMind Task');
  });
});


test.describe('RepoMind Help', () => {
  test('Help opens the help workspace and switches topics', async ({ page }) => {
    const errors = await openFixture(page);
    await page.getByRole('button', { name: /Help/ }).click();

    await expect(page.locator('.help-page')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Learn RepoMind' })).toBeVisible();
    await expect(page.getByText('Every workspace is explained')).toBeVisible();
    await expect(page.locator('.help-detail')).toContainText('Overview');

    await page.locator('.help-list button').filter({ hasText: 'Codebase Intelligence' }).click();
    await expect(page.locator('.help-detail')).toContainText('The central intelligence workspace');
    await expect(page.locator('.help-list button.active')).toContainText('Codebase Intelligence');

    expect(errors, 'page errors while opening Help').toEqual([]);
  });
});
