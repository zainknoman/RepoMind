const text = async (file) => await (await file.getFile()).text();
async function dir(root, name) {
  try {
    return await root.getDirectoryHandle(name);
  } catch {
    return null;
  }
}
async function file(root, path) {
  let h = root;
  for (const p of path.split('/').slice(0, -1)) h = await h.getDirectoryHandle(p);
  return h.getFileHandle(path.split('/').pop());
}
async function read(root, path) {
  try {
    return text(await file(root, path));
  } catch {
    return '';
  }
}
function cleanRef(ref) {
  return ref.trim().replace(/^ref:\s*/, '');
}
export async function readGitRepository(root, files = []) {
  const g = await dir(root, '.git');
  if (!g) return { available: false };
  const headRaw = await read(g, 'HEAD');
  const head = cleanRef(headRaw);
  let branch = headRaw.startsWith('ref:') ? head.replace(/^refs\/heads\//, '') : null;
  const config = await read(g, 'config');
  const remote = (config.match(/\[remote "origin"\][\s\S]*?url\s*=\s*(.+)/) || [])[1]?.trim() || '';
  const packed = await read(g, 'packed-refs');
  let resolvedHead = head;
  if (branch) {
    const direct = await read(g, 'refs/heads/' + branch);
    if (direct.trim()) resolvedHead = direct.trim();
    else {
      const m = packed.split(/\r?\n/).find((x) => x.endsWith(' refs/heads/' + branch));
      if (m) resolvedHead = m.split(' ')[0];
    }
  }
  return { available: true, branch, head: resolvedHead, remote };
}
// Git's v4 offset varint: 7 bits per byte, big-endian, with +1 added per continuation byte.
function readVarint(bytes, pos) {
  let byte = bytes[pos++];
  let value = byte & 0x7f;
  while (byte & 0x80) {
    byte = bytes[pos++];
    value = ((value + 1) << 7) | (byte & 0x7f);
  }
  return [value, pos];
}

/**
 * Parses a .git/index file (versions 2, 3 and 4) into {path, mtime, size, flags} entries.
 * Returns [] for anything that is not a recognised index.
 */
export function parseIndex(buffer) {
  const bytes = new Uint8Array(buffer);
  if (bytes.length < 12 || new TextDecoder().decode(bytes.slice(0, 4)) !== 'DIRC') return [];
  const dv = new DataView(buffer);
  const version = dv.getUint32(4);
  if (version < 2 || version > 4) return [];
  const count = dv.getUint32(8);
  const decoder = new TextDecoder();
  let pos = 12;
  let previousPath = '';
  const out = [];
  for (let i = 0; i < count && pos + 62 <= bytes.length; i++) {
    const start = pos;
    const mtime = dv.getUint32(pos + 8),
      size = dv.getUint32(pos + 36),
      flags = dv.getUint16(pos + 60);
    pos += 62;
    if (version >= 3 && flags & 0x4000) pos += 2; // extended flags
    let path;
    if (version === 4) {
      const [strip, next] = readVarint(bytes, pos);
      let end = next;
      while (end < bytes.length && bytes[end] !== 0) end++;
      path =
        previousPath.slice(0, previousPath.length - strip) + decoder.decode(bytes.slice(next, end));
      pos = end + 1; // v4 entries are not padded
    } else {
      let end = pos;
      while (end < bytes.length && bytes[end] !== 0) end++;
      path = decoder.decode(bytes.slice(pos, end));
      // v2/v3 entries are NUL-padded to a multiple of 8 bytes measured from the entry start.
      pos = start + Math.ceil((end - start + 1) / 8) * 8;
    }
    previousPath = path;
    out.push({ path, mtime, size, flags });
  }
  return out;
}
export async function gitStatusSummary(root, files = []) {
  const g = await dir(root, '.git');
  if (!g) return { available: false };
  try {
    const indexFile = await file(g, 'index');
    const entries = parseIndex(await (await indexFile.getFile()).arrayBuffer());
    const current = new Map(files.map((f) => [f.path, f]));
    const tracked = new Set(entries.map((x) => x.path));
    const untracked = files.filter((f) => !tracked.has(f.path)).map((f) => f.path);
    const deleted = entries.filter((e) => !current.has(e.path)).map((e) => e.path);
    const byPath = new Map(entries.map((e) => [e.path, e]));
    const probableModified = [];
    for (const f of files) {
      const e = byPath.get(f.path);
      if (e) {
        try {
          const lf = (await f.handle.getFile()).lastModified / 1000;
          if (Math.abs(lf - e.mtime) > 2) probableModified.push(f.path);
        } catch {}
      }
    }
    return {
      available: true,
      modified: [...new Set(probableModified)],
      untracked,
      deleted,
      tracked: entries.length,
    };
  } catch (e) {
    return {
      available: true,
      error: e.message,
      modified: [],
      untracked: files.map((f) => f.path),
      deleted: [],
      tracked: 0,
    };
  }
}
export async function gitActivity(root) {
  const g = await dir(root, '.git');
  if (!g) return [];
  const raw = await read(g, 'logs/HEAD');
  return raw
    .split(/\r?\n/)
    .filter(Boolean)
    .slice(-30)
    .reverse()
    .map((line) => {
      const m = line.match(
        /^([0-9a-f]{40})\s+([0-9a-f]{40})\s+(.+?)\s+<[^>]+>\s+(\d+)\s+[+-]\d+\t(.*)$/,
      );
      return m
        ? { oldHash: m[1], hash: m[2], author: m[3], date: Number(m[4]) * 1000, message: m[5] }
        : { hash: line.slice(41, 81), action: line.slice(0, 180) };
    });
}
