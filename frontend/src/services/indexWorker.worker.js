// Web Worker entry: runs the CPU-heavy repository analysis (Babel parsing, reference resolution) off
// the main thread. The main thread reads file contents and posts them here as plain strings.
import { buildRepositoryIndex } from './repository';
import { toWorkerProject } from './indexProject';

self.onmessage = async (event) => {
  const { name, files } = event.data || {};
  try {
    const index = await buildRepositoryIndex(toWorkerProject(name, files), {
      onProgress: (progress) => self.postMessage({ type: 'progress', progress }),
    });
    self.postMessage({ type: 'done', index });
  } catch (error) {
    self.postMessage({ type: 'error', message: error?.message || String(error) });
  }
};
