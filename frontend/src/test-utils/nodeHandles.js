// File System Access handles over a real folder, for unit tests that run browser code against
// repositories created with the git CLI. Only the calls RepoMind uses are implemented.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const notFound = (name) => new DOMException(`${name} not found`, 'NotFoundError');

export function fileHandle(path, name) {
  return {
    kind: 'file',
    name,
    async getFile() {
      const bytes = readFileSync(path);
      const { mtimeMs } = statSync(path);
      return new File([bytes], name, { lastModified: mtimeMs });
    },
  };
}

export function directoryHandle(path, name = path.split(/[\\/]/).pop()) {
  const statOf = (child) => {
    try {
      return statSync(join(path, child));
    } catch {
      return null;
    }
  };
  return {
    kind: 'directory',
    name,
    async getDirectoryHandle(child) {
      if (!statOf(child)?.isDirectory()) throw notFound(child);
      return directoryHandle(join(path, child), child);
    },
    async getFileHandle(child) {
      if (!statOf(child)?.isFile()) throw notFound(child);
      return fileHandle(join(path, child), child);
    },
    async *values() {
      for (const child of readdirSync(path)) {
        const stat = statOf(child);
        if (stat?.isDirectory()) yield directoryHandle(join(path, child), child);
        else if (stat?.isFile()) yield fileHandle(join(path, child), child);
      }
    },
  };
}
