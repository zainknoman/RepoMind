/**
 * Rebuilds a project from plain {path, name, ext, content} records so the indexer can run where real
 * file handles are unavailable (a Web Worker, or unit tests). A record with an `analysis` instead of
 * content reuses that earlier analysis of an unchanged file.
 */
export function toWorkerProject(name, files) {
  return {
    name,
    files: files.map((f) => ({
      path: f.path,
      name: f.name,
      ext: f.ext,
      text: true,
      analysis: f.analysis,
      handle: {
        getFile: async () => ({
          size: f.size,
          lastModified: f.lastModified,
          text: async () => f.content ?? '',
        }),
      },
    })),
  };
}

/** Earlier per-file analyses that can be reused, keyed by path (only ones with file metadata). */
function reusableAnalyses(previous) {
  return new Map(
    (previous?.files || [])
      .filter((f) => typeof f.size === 'number' && typeof f.modified === 'number')
      .map((f) => [f.path, f]),
  );
}

/**
 * Reads every text file of a project into plain records, reporting progress and honouring abort.
 * With a `previous` index, files whose size and modification time are unchanged are not read: their
 * record carries the previous analysis instead.
 */
export async function readProjectFiles(project, { signal, onProgress, previous } = {}) {
  const textFiles = project.files.filter((f) => f.text);
  const reusable = reusableAnalyses(previous);
  const out = [];
  let reused = 0;
  for (let i = 0; i < textFiles.length; i++) {
    if (signal?.aborted) throw new DOMException('Indexing cancelled', 'AbortError');
    const f = textFiles[i];
    const record = { path: f.path, name: f.name, ext: f.ext, content: '' };
    try {
      const raw = await f.handle.getFile();
      const prior = reusable.get(f.path);
      if (prior && prior.size === raw.size && prior.modified === raw.lastModified) {
        record.analysis = prior;
        delete record.content;
        reused++;
      } else {
        record.content = await raw.text();
        // Only a file that was actually read may be reused next time.
        record.size = raw.size;
        record.lastModified = raw.lastModified;
      }
    } catch {
      // Unreadable files (deleted or permission revoked) are indexed as empty.
    }
    out.push(record);
    if (i % 25 === 0 || i === textFiles.length - 1)
      onProgress?.({
        phase: 'read',
        current: i + 1,
        total: textFiles.length,
        path: f.path,
        reused,
      });
  }
  return out;
}
