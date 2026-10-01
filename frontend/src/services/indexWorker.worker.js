// Web Worker entry: runs the CPU-heavy repository analysis (Babel parsing, reference resolution)
// and the index cache's serialisation and linking off the main thread. The main thread reads file
// contents and posts them here as plain strings.
//
// Messages: { type: 'build', name, files, cacheKey? } → progress…, done { index }, then saved
//           (after the snapshot is written, when cacheKey is given);
//           { type: 'restore', key } → done { index | null } (linked, without file handles).
import { buildRepositoryIndex, linkIndex } from './repository';
import { toWorkerProject } from './indexProject';
import { readSnapshot, writeSnapshot } from './indexCache';

self.onmessage = async (event) => {
  const { type = 'build', name, files, cacheKey, key } = event.data || {};
  try {
    if (type === 'restore') {
      const snapshot = await readSnapshot(key);
      self.postMessage({ type: 'done', index: snapshot ? linkIndex(snapshot) : null });
      return;
    }
    const index = await buildRepositoryIndex(toWorkerProject(name, files), {
      onProgress: (progress) => self.postMessage({ type: 'progress', progress }),
    });
    // The index is cloned when posted, so it can be shown while the snapshot is written here.
    self.postMessage({ type: 'done', index });
    if (cacheKey) await writeSnapshot(cacheKey, name, index);
    self.postMessage({ type: 'saved' });
  } catch (error) {
    self.postMessage({ type: 'error', message: error?.message || String(error) });
  }
};
