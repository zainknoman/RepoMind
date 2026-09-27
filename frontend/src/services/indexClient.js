import { buildRepositoryIndex } from './repository';
import { readProjectFiles, toWorkerProject } from './indexProject';

function createWorker() {
  try {
    return new Worker(new URL('./indexWorker.worker.js', import.meta.url), { type: 'module' });
  } catch {
    return null;
  }
}

function abortError() {
  return new DOMException('Indexing cancelled', 'AbortError');
}

/**
 * Builds the repository index in a Web Worker so parsing large repositories does not freeze the UI.
 * Falls back to the main thread when workers are unavailable. Same contract as buildRepositoryIndex.
 */
export async function buildIndex(project, { signal, onProgress } = {}) {
  if (!project) return null;
  const files = await readProjectFiles(project, { signal, onProgress });
  const worker = createWorker();
  if (!worker)
    return buildRepositoryIndex(toWorkerProject(project.name, files), { signal, onProgress });

  return new Promise((resolve, reject) => {
    const finish = (fn, value) => {
      worker.terminate();
      signal?.removeEventListener('abort', onAbort);
      fn(value);
    };
    const onAbort = () => finish(reject, abortError());
    if (signal?.aborted) return onAbort();
    signal?.addEventListener('abort', onAbort);
    worker.onmessage = ({ data }) => {
      if (data.type === 'progress') onProgress?.(data.progress);
      else if (data.type === 'done') finish(resolve, data.index);
      else if (data.type === 'error') finish(reject, new Error(data.message));
    };
    worker.onerror = (event) => {
      event.preventDefault?.();
      // A worker that fails to start (e.g. blocked by policy) falls back to the main thread.
      worker.terminate();
      signal?.removeEventListener('abort', onAbort);
      buildRepositoryIndex(toWorkerProject(project.name, files), { signal, onProgress }).then(
        resolve,
        reject,
      );
    };
    worker.postMessage({ name: project.name, files });
  });
}
