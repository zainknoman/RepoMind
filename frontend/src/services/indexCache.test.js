import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import {
  clearCachedIndex,
  loadCachedIndex,
  loadLatestCachedIndex,
  saveCachedIndex,
} from './indexCache';
import { attachFileHandles, buildRepositoryIndex } from './repository';
import { toWorkerProject } from './indexProject';

function project(name, files) {
  return {
    name,
    files: files.map(({ path, size = 10, lastModified = 1 }) => ({
      path,
      text: true,
      handle: { getFile: async () => ({ size, lastModified }) },
    })),
  };
}

describe('index cache', () => {
  it('restores a saved index for the same project and files', async () => {
    const p = project('cache-a', [{ path: 'a.js' }]);
    expect(await saveCachedIndex(p, { files: [{ path: 'a.js' }], symbols: [] })).toBe(true);
    const restored = await loadCachedIndex(project('cache-a', [{ path: 'a.js' }]));
    expect(restored.files).toEqual([{ path: 'a.js' }]);
    expect(restored.cacheVersion).toBe(4);
    expect(restored.cachedAt).toEqual(expect.any(String));
  });
  it('misses when a file changed since the index was saved', async () => {
    await saveCachedIndex(project('cache-b', [{ path: 'a.js', lastModified: 1 }]), { files: [] });
    expect(
      await loadCachedIndex(project('cache-b', [{ path: 'a.js', lastModified: 2 }])),
    ).toBeNull();
    expect(await loadCachedIndex(project('cache-b', [{ path: 'a.js', size: 11 }]))).toBeNull();
  });
  it('does not store file handles', async () => {
    const p = project('cache-c', [{ path: 'a.js' }]);
    await saveCachedIndex(p, { files: [], _fileHandles: new Map([['a.js', {}]]) });
    expect((await loadCachedIndex(p))._fileHandles).toBeUndefined();
  });
  it('clears the entry for a project', async () => {
    const p = project('cache-d', [{ path: 'a.js' }]);
    await saveCachedIndex(p, { files: [] });
    await clearCachedIndex(p);
    expect(await loadCachedIndex(p)).toBeNull();
    expect(await loadLatestCachedIndex(p)).toBeNull();
  });
  it('restores symbol references and importers exactly', async () => {
    const sources = {
      'a.js': "import { b } from './b';\nexport function a() {\n  return b() + b();\n}\n",
      'b.js': 'export function b() { return 1; }\n',
    };
    const records = Object.entries(sources).map(([path, content]) => ({
      path,
      name: path,
      ext: '.js',
      content,
    }));
    const workerProject = toWorkerProject('cache-e', records);
    const fresh = attachFileHandles(await buildRepositoryIndex(workerProject), workerProject);
    const p = project('cache-e', [{ path: 'a.js' }, { path: 'b.js' }]);
    await saveCachedIndex(p, fresh);
    const restored = attachFileHandles(await loadCachedIndex(p), workerProject);
    const shape = (index) =>
      index.symbols.map((s) => ({
        key: s.definitionKey,
        references: s.references.map((r) => [r.from, r.line, r.column]),
        importedBy: s.importedBy.map((i) => [i.from, i.local]),
      }));
    expect(shape(restored)).toEqual(shape(fresh));
    const b = restored.symbols.find((s) => s.name === 'b');
    expect(b.references).toHaveLength(2);
    // Back-links point at the restored reference objects, not copies.
    expect(restored.references).toContain(b.references[0]);
    expect(b.references[0].resolvedSymbols[0]).toBe(b);
  });
  it('keeps the latest snapshot per repository and evicts the one it replaces', async () => {
    const before = project('cache-f', [{ path: 'a.js', lastModified: 1 }]);
    const after = project('cache-f', [{ path: 'a.js', lastModified: 2 }]);
    await saveCachedIndex(before, { files: [{ path: 'a.js', modified: 1 }] });
    expect(await loadCachedIndex(after)).toBeNull();
    expect((await loadLatestCachedIndex(after)).files).toEqual([{ path: 'a.js', modified: 1 }]);
    await saveCachedIndex(after, { files: [{ path: 'a.js', modified: 2 }] });
    expect(await loadCachedIndex(before)).toBeNull();
    expect((await loadLatestCachedIndex(before)).files).toEqual([{ path: 'a.js', modified: 2 }]);
  });
});
