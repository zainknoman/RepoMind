import { buildRepositoryIndex, linkIndex } from './repository';
import { readProjectFiles, toWorkerProject } from './indexProject';
import { projectKey, readSnapshot, writeSnapshot } from './indexCache';

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
 * Posts `message` to a new index worker and resolves with the `index` of its `done` reply. The
 * worker is terminated after its last message (`saved` for a build that writes the cache, else
 * `done`), so a cache write is never cut short. Resolves `fallback()` if the worker cannot start.
 */
function runInWorker(message, { signal, onProgress, fallback }) {
  const worker = createWorker();
  if (!worker) return fallback();
  const waitForSave = message.type === 'build' && Boolean(message.cacheKey);
  return new Promise((resolve, reject) => {
    let settled = false;
    const stop = () => {
      worker.terminate();
      signal?.removeEventListener('abort', onAbort);
    };
    const onAbort = () => {
      stop();
      if (!settled) reject(abortError());
      settled = true;
    };
    if (signal?.aborted) return onAbort();
    signal?.addEventListener('abort', onAbort);
    worker.onmessage = ({ data }) => {
      if (data.type === 'progress') onProgress?.(data.progress);
      else if (data.type === 'done') {
        settled = true;
        // Detach from the caller's cancel button: the result is in, only the save remains.
        signal?.removeEventListener('abort', onAbort);
        if (!waitForSave) worker.terminate();
        resolve(data.index);
      } else if (data.type === 'saved') worker.terminate();
      else if (data.type === 'error') {
        stop();
        if (!settled) reject(new Error(data.message));
        settled = true;
      }
    };
    worker.onerror = (event) => {
      event.preventDefault?.();
      // A worker that fails to start (e.g. blocked by policy) falls back to the main thread.
      stop();
      if (!settled) fallback().then(resolve, reject);
      settled = true;
    };
    worker.postMessage(message);
  });
}

/**
 * Builds the repository index in a Web Worker so parsing large repositories does not freeze the UI.
 * Falls back to the main thread when workers are unavailable. Same contract as buildRepositoryIndex.
 * With a `previous` index (in memory or cached), unchanged files are not read or parsed again. With
 * a `cacheKey` (see `projectKey`), the worker also writes the index cache, off the main thread.
 */
export async function buildIndex(project, { signal, onProgress, previous, cacheKey } = {}) {
  if (!project) return null;
  const files = await readProjectFiles(project, { signal, onProgress, previous });
  const onMainThread = async () => {
    const index = await buildRepositoryIndex(toWorkerProject(project.name, files), {
      signal,
      onProgress,
    });
    if (cacheKey) writeSnapshot(cacheKey, project.name, index);
    return index;
  };
  return runInWorker(
    { type: 'build', name: project.name, files, cacheKey },
    { signal, onProgress, fallback: onMainThread },
  );
}

/**
 * The cached index of `project` if its files are unchanged, read and linked in a worker (on the
 * main thread without workers), or null. File handles are not attached.
 */
export async function restoreIndex(project) {
  if (!project) return null;
  const key = await projectKey(project);
  return runInWorker(
    { type: 'restore', key },
    {
      fallback: async () => {
        const snapshot = await readSnapshot(key);
        return snapshot ? linkIndex(snapshot) : null;
      },
    },
  );
}
