import { describe, expect, it, vi } from 'vitest';
import { attachFileHandles, buildRepositoryIndex } from './repository';
import { toWorkerProject } from './indexProject';
import {
  analyzerSummary,
  defineAnalyzer,
  definePatternAnalyzer,
  lineLocator,
  listAnalyzers,
  registerAnalyzer,
  runAnalyzers,
} from './analyzers';

async function indexOf(sources) {
  const project = toWorkerProject(
    'analyzers',
    Object.entries(sources).map(([path, content]) => ({
      path,
      name: path.split('/').pop(),
      ext: '.' + path.split('.').pop(),
      content,
    })),
  );
  return attachFileHandles(await buildRepositoryIndex(project), project);
}

const spec = (extra = {}) => ({
  id: 'demo',
  name: 'Demo',
  category: 'Test',
  description: 'A test analyzer.',
  scope: 'index',
  run: () => [],
  ...extra,
});

describe('analyzer contract', () => {
  it('rejects incomplete definitions with every problem listed', () => {
    expect(() => defineAnalyzer({ id: 'Bad Id', run: 1 })).toThrow(
      /id must be lowercase-kebab.*name is required.*scope must be.*run must be a function/,
    );
    expect(() => defineAnalyzer(spec({ columns: [['only-key']] }))).toThrow(/columns/);
  });

  it('lists the built-ins with their declared columns', () => {
    const ids = listAnalyzers().map((a) => a.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        'routes',
        'framework-structure',
        'symbol-resolution',
        'architecture-hotspots',
        'security',
      ]),
    );
    const routes = listAnalyzers().find((a) => a.id === 'routes');
    expect(routes.scope).toBe('source');
    expect(routes.columns.map(([key]) => key)).toEqual([
      'method',
      'path',
      'framework',
      'file',
      'line',
    ]);
  });

  it('registers and unregisters plugins, refusing duplicate ids', () => {
    const remove = registerAnalyzer(spec({ id: 'plugin-demo' }));
    expect(listAnalyzers().some((a) => a.id === 'plugin-demo')).toBe(true);
    expect(() => registerAnalyzer(spec({ id: 'plugin-demo' }))).toThrow(/already registered/);
    remove();
    expect(listAnalyzers().some((a) => a.id === 'plugin-demo')).toBe(false);
  });

  it('normalizes findings and isolates a failing analyzer', async () => {
    const index = await indexOf({ 'src/a.js': 'export const a = 1;\n' });
    const removeGood = registerAnalyzer(
      spec({
        id: 'plugin-good',
        run: () => [{ title: 42, severity: 'catastrophic', file: 'src/a.js', line: 1.5 }],
      }),
    );
    const removeBad = registerAnalyzer(
      spec({
        id: 'plugin-bad',
        run: () => {
          throw new Error('boom');
        },
      }),
    );
    const onResult = vi.fn();
    const results = await runAnalyzers(index, ['plugin-bad', 'plugin-good'], { onResult });
    removeGood();
    removeBad();
    expect(results['plugin-bad']).toMatchObject({ name: 'Demo', error: 'boom', findings: [] });
    expect(results['plugin-good'].findings).toEqual([
      { analyzer: 'plugin-good', title: '42', severity: 'info', file: 'src/a.js', line: null },
    ]);
    expect(onResult).toHaveBeenCalledTimes(2);
  });

  it('reads each file once per run, however many analyzers use it', async () => {
    const index = await indexOf({ 'src/a.js': 'TODO one\n', 'src/b.js': 'nothing\n' });
    const reads = [];
    for (const [path, file] of index._fileHandles) {
      const getFile = file.handle.getFile.bind(file.handle);
      index._fileHandles.set(path, {
        ...file,
        handle: { getFile: () => (reads.push(path), getFile()) },
      });
    }
    await runAnalyzers(index, ['routes', 'security', 'framework-structure']);
    expect(reads.sort()).toEqual(['src/a.js', 'src/b.js']);
  });
});

describe('pattern analyzers', () => {
  it('reports each match with its line and the rule fields, without duplicates', async () => {
    const index = await indexOf({
      'src/a.js': 'x\n// TODO first\n// TODO first\ny // TODO second\n',
      'src/skip.js': '// TODO skipped\n',
    });
    const todo = definePatternAnalyzer({
      id: 'todo',
      name: 'TODOs',
      category: 'Test',
      description: 'Finds TODO comments.',
      files: (file) => file.path !== 'src/skip.js',
      key: (f) => f.title,
      rules: [
        {
          pattern: /TODO (\w+)/,
          severity: 'low',
          finding: (m, { lineText }) => ({ title: m[1], text: lineText.trim() }),
        },
      ],
    });
    const remove = registerAnalyzer(todo);
    const { todo: result } = await runAnalyzers(index, ['todo']);
    remove();
    expect(result.findings.map((f) => [f.title, f.line, f.severity, f.text])).toEqual([
      ['first', 2, 'low', '// TODO first'],
      ['second', 4, 'low', 'y // TODO second'],
    ]);
  });

  it('locates lines by offset', () => {
    const line = lineLocator('a\nbb\n\nccc');
    expect([0, 1, 2, 4, 5, 6, 8].map(line)).toEqual([1, 1, 2, 2, 3, 4, 4]);
  });
});

describe('built-in analyzers', () => {
  it('finds routes across frameworks and lists references that are not certain', async () => {
    const index = await indexOf({
      'src/app.py': "@app.get('/orders')\ndef orders():\n    return []\n",
      'src/Admin.java':
        '@RestController\nclass Admin {\n  @GetMapping("/admin")\n  void a() {}\n}\n',
      'src/one.js': 'export function helper() {}\n',
      'src/two.js': 'export function helper() {}\n',
      'src/use.js': 'function used() {\n  return helper();\n}\n',
      'src/solo.js': 'export function lonely() {}\n',
      'src/call.js': 'lonely();\n',
    });
    const results = await runAnalyzers(index, ['routes', 'symbol-resolution']);
    expect(results.routes.findings.map((f) => [f.method, f.path, f.framework, f.line])).toEqual([
      ['GET', '/orders', 'FastAPI', 1],
      ['GET', '/admin', 'Spring', 3],
    ]);
    // Name matches are guesses even with a single candidate: nothing imports the target.
    expect(results['symbol-resolution'].findings).toEqual([
      expect.objectContaining({
        title: 'helper',
        status: 'guessed',
        severity: 'low',
        file: 'src/use.js',
        targets: 'src/one.js::helper, src/two.js::helper',
      }),
      expect.objectContaining({ title: 'lonely', status: 'guessed', file: 'src/call.js' }),
    ]);
    expect(analyzerSummary(index)).toMatchObject({
      resolved: 0,
      ambiguous: 0,
      guessed: 2,
      unresolved: 0,
    });
  });
});
