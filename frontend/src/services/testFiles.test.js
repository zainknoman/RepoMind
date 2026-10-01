import { describe, expect, it } from 'vitest';
import { buildRepositoryIndex } from './repository';
import { toWorkerProject } from './indexProject';
import { symbolImpact } from './impact';
import { changeImpact, changeImpactMarkdown } from './changeImpact';
import { isTestFile } from './testFiles';

describe('isTestFile', () => {
  it.each([
    ['src/a.test.js', true],
    ['src/a.spec.tsx', true],
    ['src/__tests__/a.js', true],
    ['tests/e2e/app.spec.js', true],
    ['test/util.js', true],
    ['e2e/login.ts', true],
    ['pkg/test_models.py', true],
    ['pkg/models_test.py', true],
    ['pkg/conftest.py', true],
    ['src/test/java/com/acme/AppTest.java', true],
    ['src/main/java/com/acme/AppIT.java', true],
    ['cmd/main_test.go', true],
    ['BP/ACCOUNT.VALIDATE.TEST.b', true],
    ['src/latest.js', false],
    ['src/contest/entry.py', false],
    ['src/main/java/com/acme/Testing.java', false],
    ['src/attestation.ts', false],
  ])('%s → %s', (path, expected) => {
    expect(isTestFile(path)).toBe(expected);
  });
});

const FILES = {
  'core.js': 'export function core() {\n  return 1;\n}\n',
  'mid.js': "import { core } from './core';\nexport function mid() {\n  return core();\n}\n",
  'core.test.js': "import { core } from './core';\ntest('core', () => core());\n",
  'mid.test.js': "import './mid';\n",
};

async function indexOf() {
  const project = toWorkerProject(
    'tests',
    Object.entries(FILES).map(([path, content]) => ({ path, name: path, ext: '.js', content })),
  );
  return buildRepositoryIndex(project);
}

describe('affected tests', () => {
  it('lists the tests that use a symbol, directly or through other code', async () => {
    const index = await indexOf();
    const result = symbolImpact(
      index,
      index.symbols.find((s) => s.name === 'core'),
    );
    expect(result.tests).toEqual([{ path: 'core.test.js', because: ['core'] }]);
  });

  it('lists tests reached by a change, including module-level imports', async () => {
    const index = await indexOf();
    const result = changeImpact(index, [
      {
        path: 'core.js',
        status: 'modified',
        oldText: FILES['core.js'],
        newText: 'export function core() {\n  return 2;\n}\n',
      },
      {
        path: 'mid.js',
        status: 'modified',
        oldText: FILES['mid.js'],
        newText: FILES['mid.js'] + 'export const extra = 1;\n',
      },
    ]);
    expect(result.tests.map((t) => t.path)).toEqual(['core.test.js', 'mid.test.js']);
    expect(changeImpactMarkdown(result, 'x')).toContain('## Tests to run\n\n- core.test.js');
  });

  it('includes a changed test file itself', async () => {
    const index = await indexOf();
    const result = changeImpact(index, [
      {
        path: 'core.test.js',
        status: 'modified',
        oldText: FILES['core.test.js'],
        newText: FILES['core.test.js'] + '// more\n',
      },
    ]);
    expect(result.tests).toEqual([{ path: 'core.test.js', because: ['changed'] }]);
  });
});
