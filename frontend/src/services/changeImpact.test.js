import { describe, expect, it } from 'vitest';
import { buildRepositoryIndex } from './repository';
import { toWorkerProject } from './indexProject';
import { changedSymbols, changeImpact, changeImpactMarkdown } from './changeImpact';

// The index is built from the new (current) text, as it is for the working tree.
async function indexOf(files) {
  const project = toWorkerProject(
    'change',
    Object.entries(files).map(([path, content]) => ({
      path,
      name: path.split('/').pop(),
      ext: path.slice(path.lastIndexOf('.')),
      content,
    })),
  );
  return buildRepositoryIndex(project);
}

const modified = (path, oldText, newText) => ({ path, status: 'modified', oldText, newText });
const names = (items) => items.map((x) => `${x.name || x.path}:${x.change || x.confidence}`);

const CORE_V1 = '// v1\nexport function core() {\n  return 1;\n}\n';
const CORE_V2 = '// v1\nexport function core() {\n  return 2;\n}\n';
const CHAIN = {
  'core.js': CORE_V2,
  'mid.js': "import { core } from './core';\nexport function mid() {\n  return core();\n}\n",
  'top.js': "import { mid } from './mid';\nexport function top() {\n  return mid();\n}\n",
};

describe('changedSymbols', () => {
  it('reports the innermost changed function, added and removed symbols', () => {
    const result = changedSymbols(
      modified(
        'k.js',
        'class K {\n  a() {\n    return 1;\n  }\n}\nfunction gone() {}\n',
        'class K {\n  a() {\n    return 2;\n  }\n}\nfunction fresh() {}\n',
      ),
    );
    expect(names(result.symbols).sort()).toEqual(['a:modified', 'fresh:added', 'gone:removed']);
    expect(result.moduleLevel).toBe(false);
    expect(result.lines).toEqual({ added: 2, removed: 2 });
  });

  it('flags changes outside any symbol as module-level', () => {
    const result = changedSymbols(modified('core.js', CORE_V1, CORE_V1.replace('v1', 'v2')));
    expect(result).toMatchObject({ symbols: [], moduleLevel: true });
  });

  it('treats every symbol of an added or deleted file as added or removed', () => {
    const file = 'export function a() {}\nexport function b() {}\n';
    expect(names(changedSymbols({ path: 'n.js', status: 'added', newText: file }).symbols)).toEqual(
      ['a:added', 'b:added'],
    );
    expect(
      names(changedSymbols({ path: 'n.js', status: 'deleted', oldText: file }).symbols),
    ).toEqual(['a:removed', 'b:removed']);
  });
});

describe('changeImpact', () => {
  it('merges the transitive impact of changed symbols', async () => {
    const index = await indexOf(CHAIN);
    const result = changeImpact(index, [modified('core.js', CORE_V1, CORE_V2)]);
    expect(result.files[0]).toMatchObject({ path: 'core.js', status: 'modified' });
    expect(names(result.files[0].symbols)).toEqual(['core:modified']);
    expect(names(result.affected)).toEqual(['mid:high', 'top:high']);
    expect(result.affected[0].because).toEqual(['core']);
    expect(result.counts).toMatchObject({ files: 1, symbols: 1, affected: 2, high: 2 });
  });

  it('reports importers of a file whose module-level code changed', async () => {
    const index = await indexOf(CHAIN);
    const result = changeImpact(index, [modified('core.js', CORE_V2.replace('v1', 'v0'), CORE_V2)]);
    expect(result.affected.map((a) => `${a.path}@${a.depth}`)).toEqual(['mid.js@1', 'top.js@2']);
    expect(result.affected[0]).toMatchObject({ kind: 'file', because: ['core.js (module code)'] });
  });

  it('reports importers broken by a removed export', async () => {
    const index = await indexOf({
      'lib.js': 'export function greet() {}\n',
      'app.js': "import { greet, bye } from './lib';\ngreet();\nbye();\n",
    });
    const result = changeImpact(index, [
      modified(
        'lib.js',
        'export function greet() {}\nexport function bye() {}\n',
        'export function greet() {}\n',
      ),
    ]);
    expect(result.broken).toEqual([
      expect.objectContaining({ path: 'app.js', line: 1, name: 'bye' }),
    ]);
    expect(result.counts.broken).toBe(1);
  });

  it('keeps the strongest confidence and every changed symbol that reaches an item', async () => {
    const lib = (n) =>
      `export function t() {\n  return ${n};\n}\nexport function u() {\n  return ${n};\n}\n`;
    const index = await indexOf({
      't.js': lib(2),
      'x.js': "import { u } from './t';\nexport function x() {\n  t();\n  return u();\n}\n",
    });
    const result = changeImpact(index, [modified('t.js', lib(1), lib(2))]);
    expect(result.affected).toEqual([
      expect.objectContaining({ name: 'x', confidence: 'high', because: ['t', 'u'] }),
    ]);
  });

  it('lists skipped and non-code files as blind spots', async () => {
    const index = await indexOf(CHAIN);
    const result = changeImpact(index, [
      { path: 'logo.png', status: 'modified', skipped: 'binary' },
      modified('README.md', '# a\n', '# b\n'),
    ]);
    const kinds = result.blindSpots.map((b) => b.kind);
    expect(kinds).toEqual(expect.arrayContaining(['skipped', 'non-code']));
  });

  it('writes a Markdown report', async () => {
    const index = await indexOf(CHAIN);
    const report = changeImpactMarkdown(
      changeImpact(index, [modified('core.js', CORE_V1, CORE_V2)]),
      'Uncommitted changes',
    );
    expect(report).toContain('# Change impact: Uncommitted changes');
    expect(report).toContain('`core` (function, modified)');
    expect(report).toContain('| mid | mid.js | 1 | high | core |');
  });
});
