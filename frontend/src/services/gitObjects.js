/**
 * Read-only access to Git's object database through a `.git` directory handle: loose objects and
 * packfiles (index v2, offset and ref deltas), inflated with the platform's DecompressionStream.
 * Enough to read commits, trees and file contents for change impact; nothing is ever written.
 */

const TYPES = { 1: 'commit', 2: 'tree', 3: 'blob', 4: 'tag' };
const OFS_DELTA = 6;
const REF_DELTA = 7;
const CACHE_LIMIT = 256;

const toHex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
function fromHex(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

async function inflate(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function child(directory, name, kind) {
  try {
    return kind === 'file'
      ? await directory.getFileHandle(name)
      : await directory.getDirectoryHandle(name);
  } catch {
    return null;
  }
}

/** A pack index (.idx version 2): SHA lookup and the offset where the following entry starts. */
function parseIdx(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0) !== 0xff744f63 || view.getUint32(4) !== 2) return null;
  const fanout = (i) => (i < 0 ? 0 : view.getUint32(8 + i * 4));
  const count = fanout(255);
  const shas = 8 + 256 * 4;
  const offsets = shas + count * 20 + count * 4;
  const large = offsets + count * 4;
  const offsetAt = (i) => {
    const value = view.getUint32(offsets + i * 4);
    if (!(value & 0x80000000)) return value;
    const at = large + (value & 0x7fffffff) * 8;
    return view.getUint32(at) * 2 ** 32 + view.getUint32(at + 4);
  };
  const compare = (i, target) => {
    for (let k = 0; k < 20; k++) {
      const d = bytes[shas + i * 20 + k] - target[k];
      if (d) return d;
    }
    return 0;
  };
  const sorted = Float64Array.from({ length: count }, (_, i) => offsetAt(i)).sort();
  return {
    find(sha) {
      const target = fromHex(sha);
      let lo = fanout(target[0] - 1);
      let hi = fanout(target[0]) - 1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        const d = compare(mid, target);
        if (!d) return offsetAt(mid);
        if (d < 0) lo = mid + 1;
        else hi = mid - 1;
      }
      return -1;
    },
    // The entry after `offset`, or null for the last one (which ends at the pack checksum).
    next(offset) {
      let lo = 0;
      let hi = sorted.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (sorted[mid] <= offset) lo = mid + 1;
        else hi = mid;
      }
      return lo < sorted.length ? sorted[lo] : null;
    },
  };
}

/** Applies a Git delta (copy/insert instructions) to its base object. */
export function applyDelta(base, delta) {
  let pos = 0;
  const size = () => {
    let value = 0;
    let shift = 0;
    let byte;
    do {
      byte = delta[pos++];
      value += (byte & 0x7f) * 2 ** shift;
      shift += 7;
    } while (byte & 0x80);
    return value;
  };
  if (size() !== base.length) throw new Error('Delta base size mismatch');
  const out = new Uint8Array(size());
  let at = 0;
  while (pos < delta.length) {
    const op = delta[pos++];
    if (op & 0x80) {
      let offset = 0;
      let length = 0;
      for (let i = 0; i < 4; i++) if (op & (1 << i)) offset += delta[pos++] * 2 ** (8 * i);
      for (let i = 0; i < 3; i++) if (op & (0x10 << i)) length += delta[pos++] * 2 ** (8 * i);
      if (!length) length = 0x10000;
      out.set(base.subarray(offset, offset + length), at);
      at += length;
    } else if (op) {
      out.set(delta.subarray(pos, pos + op), at);
      at += op;
      pos += op;
    } else throw new Error('Invalid delta instruction');
  }
  return out;
}

export function createObjectStore(gitDir) {
  const cache = new Map();
  let packs = null;

  const remember = (key, object) => {
    if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value);
    cache.set(key, object);
    return object;
  };

  async function loadPacks() {
    const list = [];
    const objects = await child(gitDir, 'objects');
    const packDir = objects && (await child(objects, 'pack'));
    if (!packDir) return list;
    for await (const entry of packDir.values()) {
      if (entry.kind !== 'file' || !entry.name.endsWith('.idx')) continue;
      const packHandle = await child(packDir, entry.name.slice(0, -4) + '.pack', 'file');
      if (!packHandle) continue;
      const idx = parseIdx(new Uint8Array(await (await entry.getFile()).arrayBuffer()));
      if (idx) list.push({ id: entry.name, idx, file: await packHandle.getFile() });
    }
    return list;
  }

  async function readPacked(pack, offset) {
    const key = pack.id + ':' + offset;
    if (cache.has(key)) return cache.get(key);
    const end = pack.idx.next(offset) ?? pack.file.size - 20;
    const buf = new Uint8Array(await pack.file.slice(offset, end).arrayBuffer());
    let pos = 0;
    let byte = buf[pos++];
    const type = (byte >> 4) & 7;
    // The inflated size is not needed: the entry is sliced exactly, so skip the size bytes.
    while (byte & 0x80) byte = buf[pos++];
    let base;
    if (type === OFS_DELTA) {
      byte = buf[pos++];
      let distance = byte & 0x7f;
      while (byte & 0x80) {
        byte = buf[pos++];
        distance = (distance + 1) * 128 + (byte & 0x7f);
      }
      base = await readPacked(pack, offset - distance);
    } else if (type === REF_DELTA) {
      base = await read(toHex(buf.subarray(pos, pos + 20)));
      pos += 20;
      if (!base) throw new Error('Missing delta base');
    }
    const data = await inflate(buf.subarray(pos));
    const object = base
      ? { type: base.type, bytes: applyDelta(base.bytes, data) }
      : { type: TYPES[type], bytes: data };
    return remember(key, object);
  }

  async function readLoose(sha) {
    const objects = await child(gitDir, 'objects');
    const folder = objects && (await child(objects, sha.slice(0, 2)));
    const handle = folder && (await child(folder, sha.slice(2), 'file'));
    if (!handle) return null;
    const raw = await inflate(new Uint8Array(await (await handle.getFile()).arrayBuffer()));
    const nul = raw.indexOf(0);
    const [type] = new TextDecoder().decode(raw.subarray(0, nul)).split(' ');
    return { type, bytes: raw.subarray(nul + 1) };
  }

  async function read(sha) {
    if (cache.has(sha)) return cache.get(sha);
    const loose = await readLoose(sha);
    if (loose) return remember(sha, loose);
    packs ??= await loadPacks();
    for (const pack of packs) {
      const offset = pack.idx.find(sha);
      if (offset >= 0) return remember(sha, await readPacked(pack, offset));
    }
    return null;
  }

  return { read };
}

const decoder = new TextDecoder();

export function parseCommit(bytes) {
  const text = decoder.decode(bytes);
  const split = text.indexOf('\n\n');
  const headers = (split >= 0 ? text.slice(0, split) : text).split('\n');
  const commit = { tree: null, parents: [], author: '', date: null, message: '' };
  for (const line of headers) {
    const space = line.indexOf(' ');
    const key = line.slice(0, space);
    const value = line.slice(space + 1);
    if (key === 'tree') commit.tree = value;
    else if (key === 'parent') commit.parents.push(value);
    else if (key === 'author') {
      const m = /^(.*?) <[^>]*> (\d+)/.exec(value);
      commit.author = m ? m[1] : value;
      commit.date = m ? Number(m[2]) * 1000 : null;
    }
  }
  commit.message = split >= 0 ? text.slice(split + 2).trimEnd() : '';
  return commit;
}

export function parseTree(bytes) {
  const entries = [];
  let pos = 0;
  while (pos < bytes.length) {
    const space = bytes.indexOf(0x20, pos);
    const nul = bytes.indexOf(0, space);
    entries.push({
      mode: decoder.decode(bytes.subarray(pos, space)),
      name: decoder.decode(bytes.subarray(space + 1, nul)),
      sha: toHex(bytes.subarray(nul + 1, nul + 21)),
    });
    pos = nul + 21;
  }
  return entries;
}

/** Every file (blob) under a tree, as path → blob SHA. Submodules are skipped. */
export async function flattenTree(store, treeSha, prefix = '', out = new Map()) {
  const tree = await store.read(treeSha);
  if (!tree || tree.type !== 'tree') return out;
  for (const entry of parseTree(tree.bytes)) {
    const path = prefix + entry.name;
    if (entry.mode === '40000') await flattenTree(store, entry.sha, path + '/', out);
    else if (entry.mode !== '160000') out.set(path, entry.sha);
  }
  return out;
}
