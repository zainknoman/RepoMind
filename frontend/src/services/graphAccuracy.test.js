import { describe, expect, it } from 'vitest';
import { buildRepositoryIndex } from './repository';
import { toWorkerProject } from './indexProject';
import { edgeKeys, linkKeys, scoreGraph } from './graphAccuracy';
import { GRAPH_FIXTURES } from './graphFixtures';

const extOf = (path) => {
  const name = path.split('/').pop();
  return name.includes('.') ? name.slice(name.lastIndexOf('.')) : '.b';
};

async function indexFixture(files) {
  const project = toWorkerProject(
    'fixture',
    Object.entries(files).map(([path, content]) => ({
      path,
      name: path.split('/').pop(),
      ext: extOf(path),
      content,
    })),
  );
  return buildRepositoryIndex(project);
}

describe('scoreGraph', () => {
  const index = {
    dependencies: [
      { from: 'a.js', to: 'b.js' },
      { from: 'a.js', to: 'c.js' },
    ],
    references: [
      { from: 'a.js', line: 3, name: 'f', resolvedSymbols: [{ path: 'b.js', name: 'f' }] },
      { from: 'a.js', line: 4, name: 'g', resolvedSymbols: [] },
    ],
  };

  it('builds edge and link keys', () => {
    expect(edgeKeys(index)).toEqual(['a.js -> b.js', 'a.js -> c.js']);
    expect(linkKeys(index)).toEqual(['a.js:3 f -> b.js::f']);
  });

  it('reports precision, recall, missing and extra', () => {
    const result = scoreGraph(index, {
      edges: ['a.js -> b.js', 'a.js -> d.js'],
      links: ['a.js:3 f -> b.js::f'],
    });
    expect(result.edges).toMatchObject({ tp: 1, precision: 0.5, recall: 0.5 });
    expect(result.edges.missing).toEqual(['a.js -> d.js']);
    expect(result.edges.extra).toEqual(['a.js -> c.js']);
    expect(result.links).toMatchObject({ precision: 1, recall: 1, missing: [], extra: [] });
  });

  it('treats empty expectations and results as perfect', () => {
    expect(scoreGraph({}, {}).edges).toMatchObject({ precision: 1, recall: 1 });
  });
});

const fixture = (name) => GRAPH_FIXTURES.find((f) => f.name === name).files;
const referenceTo = (index, from, name) =>
  index.references.find((r) => r.from === from && r.name === name);

describe('reference resolution', () => {
  it('marks an imported symbol as a high-confidence import', async () => {
    const index = await indexFixture(fixture('relative-named-import'));
    expect(referenceTo(index, 'app.js', 'greet')).toMatchObject({
      resolution: 'import',
      confidence: 'high',
    });
  });

  it('marks a same-name guess across files as low confidence', async () => {
    const index = await indexFixture(fixture('name-collision'));
    expect(referenceTo(index, 'c.js', 'init')).toMatchObject({
      resolution: 'name-match',
      confidence: 'low',
    });
    expect(index.stats.referenceConfidence).toMatchObject({ low: 1 });
  });

  it('keeps a local declaration high confidence and an unknown name unresolved', async () => {
    const index = await indexFixture({
      'x.js': ['function helper() {}', 'helper();', 'missing();'].join('\n'),
    });
    expect(referenceTo(index, 'x.js', 'helper')).toMatchObject({
      resolution: 'local',
      confidence: 'high',
    });
    expect(referenceTo(index, 'x.js', 'missing')).toMatchObject({
      resolution: 'unresolved',
      confidence: 'none',
    });
  });

  it('does not count package imports or JS globals as unresolved', async () => {
    const index = await indexFixture({
      'y.js': ["import { useState } from 'react';", 'useState();', "console.log('x');"].join('\n'),
    });
    expect(index.references).toEqual([]);
    expect(index.stats).toMatchObject({
      unresolvedReferences: 0,
      externalReferences: 1,
      globalReferences: 1,
    });
  });
});

describe('graph fixtures', () => {
  for (const fixture of GRAPH_FIXTURES) {
    it(`resolves ${fixture.name} exactly`, async () => {
      const result = scoreGraph(await indexFixture(fixture.files), fixture);
      expect({ missing: result.edges.missing, extra: result.edges.extra }).toEqual({
        missing: [],
        extra: [],
      });
      expect({ missing: result.links.missing, extra: result.links.extra }).toEqual({
        missing: [],
        extra: [],
      });
    });
  }
});

describe('local bindings', () => {
  it('lets a parameter shadow an imported name', async () => {
    const index = await indexFixture({
      'lib.js': 'export function item() {}',
      'use.js': [
        "import { item } from './lib';",
        'function show(item) {',
        '  return item;',
        '}',
        'item();',
      ].join('\n'),
    });
    const refs = index.references.filter((r) => r.from === 'use.js' && r.name === 'item');
    expect(refs.map((r) => r.line)).toEqual([5]);
    expect(index.stats.localReferences).toBe(1);
  });

  it('does not count parameters, destructured, catch or type-parameter bindings as unresolved', async () => {
    const index = await indexFixture({
      'x.ts': [
        'export function run<T>(value: T, { a, b = 1 }, ...rest) {',
        '  const { c, d: [e] } = value as any;',
        '  try {',
        '    return [a, b, c, e, rest];',
        '  } catch (err) {',
        '    return err;',
        '  }',
        '}',
      ].join('\n'),
    });
    expect(index.stats.unresolvedReferences).toBe(0);
    expect(index.symbols.map((s) => s.name)).toEqual(['run']);
  });

  it('records where functions, classes and methods end', async () => {
    const index = await indexFixture({
      'k.js': ['class K {', '  m() {', '    return 1;', '  }', '}', 'const f = () => {', '};'].join(
        '\n',
      ),
    });
    const at = (name) => index.symbols.find((s) => s.name === name);
    expect([at('K').endLine, at('m').endLine, at('f').endLine]).toEqual([5, 4, 7]);
  });
});
