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
