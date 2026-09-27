/**
 * Rebuilds a project from plain {path, name, ext, content} records so the indexer can run where real
 * file handles are unavailable (a Web Worker, or unit tests).
 */
export function toWorkerProject(name, files) {
  return {
    name,
    files: files.map((f) => ({
      path: f.path,
      name: f.name,
      ext: f.ext,
      text: true,
      handle: { getFile: async () => ({ text: async () => f.content }) },
    })),
  };
}

/** Reads every text file of a project into plain records, reporting progress and honouring abort. */
export async function readProjectFiles(project, { signal, onProgress } = {}) {
  const textFiles = project.files.filter((f) => f.text);
  const out = [];
  for (let i = 0; i < textFiles.length; i++) {
    if (signal?.aborted) throw new DOMException('Indexing cancelled', 'AbortError');
    const f = textFiles[i];
    let content = '';
    try {
      content = await (await f.handle.getFile()).text();
    } catch {
      // Unreadable files (deleted or permission revoked) are indexed as empty.
    }
    out.push({ path: f.path, name: f.name, ext: f.ext, content });
    if (i % 25 === 0 || i === textFiles.length - 1)
      onProgress?.({ phase: 'read', current: i + 1, total: textFiles.length, path: f.path });
  }
  return out;
}
