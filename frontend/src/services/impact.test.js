import { describe, expect, it } from 'vitest';
import { buildRepositoryIndex } from './repository';
import { toWorkerProject } from './indexProject';
import { containerAt, fileImpact, symbolImpact } from './impact';

const extOf = (path) => {
  const name = path.split('/').pop();
  return name.includes('.') ? name.slice(name.lastIndexOf('.')) : '.b';
};

async function indexOf(files) {
  const project = toWorkerProject(
    'impact',
    Object.entries(files).map(([path, content]) => ({
      path,
      name: path.split('/').pop(),
      ext: extOf(path),
      content,
    })),
  );
  return buildRepositoryIndex(project);
}

const symbolOf = (index, path, name) =>
  index.symbols.find((s) => s.path === path && s.name === name);
const summary = (result) =>
  result.affected.map((a) => `${a.name || a.path}@${a.depth}:${a.confidence}`);

const CHAIN = {
  'core.js': 'export function core() {}',
  'mid.js': "import { core } from './core';\nexport function mid() {\n  return core();\n}",
  'top.js': "import { mid } from './mid';\nexport function top() {\n  return mid();\n}\nmid();",
};

describe('containerAt', () => {
  it('finds the innermost function, method or class around a line', async () => {
    const index = await indexOf({
      'k.js': ['class K {', '  m() {', '    return 1;', '  }', '}', 'run();'].join('\n'),
    });
    expect(containerAt(index, 'k.js', 3).name).toBe('m');
    expect(containerAt(index, 'k.js', 5).name).toBe('K');
    expect(containerAt(index, 'k.js', 6)).toBeNull();
  });
});

describe('symbolImpact', () => {
  it('follows callers across files and reports module-level use as a file', async () => {
    const index = await indexOf(CHAIN);
    const result = symbolImpact(index, symbolOf(index, 'core.js', 'core'));
    expect(summary(result)).toEqual(['mid@1:high', 'top@2:high', 'top.js@2:high']);
    expect(result.affected[0].via).toEqual({ name: 'core', path: 'mid.js', line: 3 });
    expect(result.affected[2]).toMatchObject({ symbol: null, path: 'top.js', line: 5 });
    expect(result.files).toEqual(['mid.js', 'top.js']);
    expect(result.counts).toEqual({ high: 3, medium: 0, low: 0 });
  });

  it('terminates on recursion and never lists the root', async () => {
    const index = await indexOf({
      'r.js': 'export function a() {\n  return b();\n}\nexport function b() {\n  return a();\n}',
    });
    expect(summary(symbolImpact(index, symbolOf(index, 'r.js', 'a')))).toEqual(['b@1:high']);
  });

  it('keeps the strongest path when a guess and an import both reach a symbol', async () => {
    const index = await indexOf({
      't.js': 'export function t() {}',
      'h.js': "import { t } from './t';\nexport function h() {\n  return t();\n}",
      'x.js': "import { h } from './h';\nexport function x() {\n  t();\n  return h();\n}",
    });
    const result = symbolImpact(index, symbolOf(index, 't.js', 't'));
    expect(summary(result)).toEqual(['h@1:high', 'x@2:high']);
  });

  it('reports a name-match-only path as low confidence', async () => {
    const index = await indexOf({
      't.js': 'export function t() {}',
      'g.js': 'export function g() {\n  return t();\n}',
    });
    const result = symbolImpact(index, symbolOf(index, 't.js', 't'));
    expect(summary(result)).toEqual(['g@1:low']);
    expect(result.blindSpots.map((b) => b.kind)).toContain('low-confidence');
  });

  it('follows Temenos CALL chains between routines', async () => {
    const index = await indexOf({
      'BP/A.b': '    SUBROUTINE A\n    CALL B\n    RETURN\nEND',
      'BP/B.b': '    SUBROUTINE B\n    CALL C\n    CALL @DYN\n    RETURN\nEND',
      'BP/C.b': '    SUBROUTINE C\n    RETURN\nEND',
    });
    const result = symbolImpact(index, symbolOf(index, 'BP/C.b', 'C'));
    expect(summary(result)).toEqual(['B@1:high', 'A@2:high']);
    expect(result.blindSpots.map((b) => b.kind)).toContain('dynamic-calls');
  });

  it('lists languages that are not analysed as blind spots', async () => {
    const index = await indexOf({ ...CHAIN, 'app/job.py': 'def run():\n    pass\n' });
    const spots = symbolImpact(index, symbolOf(index, 'core.js', 'core')).blindSpots;
    expect(spots.find((b) => b.kind === 'coverage').message).toContain('Python');
  });

  it('respects maxDepth', async () => {
    const index = await indexOf(CHAIN);
    const result = symbolImpact(index, symbolOf(index, 'core.js', 'core'), { maxDepth: 1 });
    expect(summary(result)).toEqual(['mid@1:high']);
  });
});

describe('fileImpact', () => {
  it('walks importers transitively with the importing path', async () => {
    const index = await indexOf(CHAIN);
    const result = fileImpact(index, 'core.js');
    expect(result.affected).toEqual([
      { path: 'mid.js', depth: 1, via: 'core.js' },
      { path: 'top.js', depth: 2, via: 'mid.js' },
    ]);
    expect(result).toMatchObject({ direct: 1, transitive: 1 });
  });
});
