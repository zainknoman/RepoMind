/**
 * Which files changed, with their old and new text: the working tree against HEAD, or a commit
 * against its first parent. Read-only; built on gitObjects.js.
 */
import { createObjectStore, flattenTree, parseCommit } from './gitObjects';
import { parseIndex, readGitRepository } from './git';
import { EXTS, IGN, looksLikeBasic, maybeBasicName, sensitiveName } from '../lib/files';

const MAX_BYTES = 1_000_000;
const MAX_CHANGES = 500;

const decoder = new TextDecoder();
const isBinary = (bytes) => bytes.subarray(0, 8000).includes(0);

async function blobSha(bytes) {
  const header = new TextEncoder().encode(`blob ${bytes.length}\0`);
  const data = new Uint8Array(header.length + bytes.length);
  data.set(header);
  data.set(bytes, header.length);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-1', data));
  return Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('');
}

function withoutCarriageReturns(bytes) {
  const out = new Uint8Array(bytes.length);
  let n = 0;
  for (let i = 0; i < bytes.length; i++)
    if (!(bytes[i] === 13 && bytes[i + 1] === 10)) out[n++] = bytes[i];
  return out.subarray(0, n);
}

async function directory(root, name) {
  try {
    return await root.getDirectoryHandle(name);
  } catch {
    return null;
  }
}

async function exists(root, path) {
  try {
    let handle = root;
    const parts = path.split('/');
    for (const part of parts.slice(0, -1)) handle = await handle.getDirectoryHandle(part);
    await handle.getFileHandle(parts.at(-1));
    return true;
  } catch {
    return false;
  }
}

/** A change record: text when both sides are diffable, otherwise the reason it was skipped. */
function change(path, status, oldBytes, newBytes) {
  const sides = [oldBytes, newBytes].filter(Boolean);
  if (sides.some((b) => b.length > MAX_BYTES)) return { path, status, skipped: 'too large' };
  if (sides.some(isBinary)) return { path, status, skipped: 'binary' };
  return {
    path,
    status,
    oldText: oldBytes ? decoder.decode(oldBytes) : null,
    newText: newBytes ? decoder.decode(newBytes) : null,
  };
}

async function treeFiles(store, commitSha) {
  // An unborn branch (no commits yet) leaves HEAD naming a ref that does not exist.
  const object = /^[0-9a-f]{40}$/.test(commitSha || '') ? await store.read(commitSha) : null;
  if (!object || object.type !== 'commit') return { commit: null, files: new Map() };
  const commit = parseCommit(object.bytes);
  return { commit, files: await flattenTree(store, commit.tree) };
}

/**
 * Index entries that can vouch for a file without reading it. As in Git, an entry whose file time
 * is not older than the index itself is "racy" (the file may have changed within the same second
 * after staging) and is left out, so that file is compared by content.
 */
async function trustedEntries(gitDir) {
  try {
    const file = await (await gitDir.getFileHandle('index')).getFile();
    const written = Math.floor(file.lastModified / 1000);
    return new Map(
      parseIndex(await file.arrayBuffer())
        .filter((e) => e.mtime < written)
        .map((e) => [e.path, e]),
    );
  } catch {
    return new Map();
  }
}

/**
 * Walks the working tree against HEAD and calls `onChange(status, path, { sha, bytes })` for each
 * file whose content differs (`modified`), that HEAD lacks (`added`) or that is gone (`deleted`).
 * Unchanged files are skipped by the index fast path or by blob SHA-1 (CRLF-tolerant). Stops when
 * `onChange` returns false.
 */
async function compareToHead(root, gitDir, files, onChange) {
  const store = createObjectStore(gitDir);
  const { head } = await readGitRepository(root);
  const { files: headFiles } = await treeFiles(store, head);
  const staged = await trustedEntries(gitDir);
  const present = new Set(files.map((f) => f.path));
  for (const f of files) {
    if (!f.text) continue;
    const oldSha = headFiles.get(f.path);
    let file;
    try {
      file = await f.handle.getFile();
    } catch {
      continue;
    }
    // Fast path: the index entry matches the file on disk and HEAD, so nothing changed.
    const entry = staged.get(f.path);
    if (
      oldSha &&
      entry?.sha === oldSha &&
      entry.size === file.size &&
      entry.mtime === Math.floor(file.lastModified / 1000)
    )
      continue;
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!oldSha) {
      if ((await onChange('added', f.path, { bytes })) === false) return { store, head };
      continue;
    }
    if ((await blobSha(bytes)) === oldSha) continue;
    // core.autocrlf: the working copy has CRLF where the committed blob has LF.
    if (bytes.includes(13) && (await blobSha(withoutCarriageReturns(bytes))) === oldSha) continue;
    if ((await onChange('modified', f.path, { sha: oldSha, bytes })) === false)
      return { store, head };
  }
  for (const [path, sha] of headFiles) {
    if (present.has(path) || (await exists(root, path))) continue;
    if ((await onChange('deleted', path, { sha })) === false) break;
  }
  return { store, head };
}

/**
 * Exact status of the working tree against HEAD, by content: `{ available, modified, added,
 * deleted }` (paths). A file whose time changed but whose content did not is not modified.
 */
export async function workingTreeStatus(root, files) {
  const gitDir = await directory(root, '.git');
  if (!gitDir) return { available: false };
  const status = { available: true, modified: [], added: [], deleted: [] };
  await compareToHead(root, gitDir, files, (kind, path) => {
    status[kind].push(path);
  });
  for (const list of [status.modified, status.added, status.deleted]) list.sort();
  return status;
}

/**
 * Uncommitted changes (staged or not, plus new files) against HEAD, with old and new text.
 * `files` are the project's files from the folder walk; a HEAD file missing from them is deleted
 * only if it is gone on disk.
 */
export async function workingTreeChanges(root, files) {
  const gitDir = await directory(root, '.git');
  if (!gitDir) return { available: false };
  const changes = [];
  const pending = [];
  const { store, head } = await compareToHead(root, gitDir, files, (status, path, sides) => {
    pending.push({ status, path, ...sides });
    return pending.length < MAX_CHANGES;
  });
  for (const { status, path, sha, bytes } of pending) {
    const old = sha ? (await store.read(sha))?.bytes || null : null;
    changes.push(change(path, status, old, bytes || null));
  }
  return {
    available: true,
    base: head,
    changes,
    truncated: changes.length >= MAX_CHANGES,
  };
}

/** The files a commit changed against its first parent (all files for a root commit). */
export async function commitChanges(root, sha) {
  const gitDir = await directory(root, '.git');
  if (!gitDir) return { available: false };
  const store = createObjectStore(gitDir);
  const { commit, files: after } = await treeFiles(store, sha);
  if (!commit) return { available: true, error: `Commit ${sha} not found`, changes: [] };
  const { files: before } = await treeFiles(store, commit.parents[0]);
  const changes = [];
  for (const path of new Set([...before.keys(), ...after.keys()])) {
    const oldSha = before.get(path);
    const newSha = after.get(path);
    if (oldSha === newSha) continue;
    if (changes.length >= MAX_CHANGES) break;
    const status = !oldSha ? 'added' : !newSha ? 'deleted' : 'modified';
    const read = async (s) => (s ? (await store.read(s))?.bytes || null : null);
    changes.push(change(path, status, await read(oldSha), await read(newSha)));
  }
  return {
    available: true,
    commit: { sha, ...commit },
    changes,
    truncated: changes.length >= MAX_CHANGES,
  };
}

const MAX_SNAPSHOT_BYTES = 2 * 1024 * 1024;
const extensionOf = (name) =>
  name.includes('.') ? name.slice(name.lastIndexOf('.')).toLowerCase() : '';
const isTextName = (name) =>
  EXTS.has(extensionOf(name)) || ['Dockerfile', 'Makefile', '.gitignore'].includes(name);

/**
 * The repository as it was at commit `sha`, as a project whose files carry their content: the
 * same files the folder walk would index (text extensions, ignored folders and sensitive names
 * skipped, files over 2 MB left out, extensionless upper-case names kept only if they read as
 * BASIC). Index it to trace that commit against its own code.
 */
export async function commitSnapshot(root, sha, { signal } = {}) {
  const gitDir = await directory(root, '.git');
  if (!gitDir) return null;
  const store = createObjectStore(gitDir);
  const { commit, files: tree } = await treeFiles(store, sha);
  if (!commit) return null;
  const files = [];
  for (const [path, blob] of tree) {
    if (signal?.aborted) throw new DOMException('Indexing cancelled', 'AbortError');
    const parts = path.split('/');
    const name = parts[parts.length - 1];
    if (parts.some((part) => IGN.has(part)) || sensitiveName.test(path)) continue;
    const basic = !isTextName(name) && maybeBasicName(name);
    if (!isTextName(name) && !basic) continue;
    const bytes = (await store.read(blob))?.bytes;
    if (!bytes || bytes.length > MAX_SNAPSHOT_BYTES || isBinary(bytes)) continue;
    const content = decoder.decode(bytes);
    if (basic && !looksLikeBasic(content.slice(0, 4096))) continue;
    files.push({
      name,
      path,
      ext: basic ? '.b' : extensionOf(name),
      text: true,
      content,
      size: bytes.length,
      lastModified: 0,
    });
  }
  const repository = root.name || 'repository';
  return {
    name: repository,
    files,
    source: { type: 'commit', commit: sha, message: commit.message },
  };
}
