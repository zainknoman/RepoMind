const DB_NAME = 'repomind-cache';
const STORE = 'indexes';
// Repository name -> key of its most recent snapshot, so a changed repository can still reuse the
// unchanged files of its previous index, and superseded snapshots can be deleted.
const LATEST = 'latest';
const VERSION = 2;
// Version 3 stores symbol back-links as positions instead of copies of every reference.
// Version 4: Temenos BASIC sources are indexed; external imports exclude unresolved relative ones.
// Version 9: package.json dependencies are part of the index (`manifest`).
const CACHE_VERSION = 9;

function openDb() {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = (event) => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      // Version 2 snapshots are unreadable now and were never evicted; drop them.
      else if (event.oldVersion < 2) req.transaction.objectStore(STORE).clear();
      if (!db.objectStoreNames.contains(LATEST)) db.createObjectStore(LATEST);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** The cache key of a project: its name and every text file's path, size and time. */
export async function projectKey(project) {
  // Imported snapshots are immutable at a specific GitHub commit, so use the commit/ref as the
  // identity instead of requiring local File System Access handles.
  if (project?.source?.type === 'github') {
    const identity = [
      'github',
      project.source.owner || '',
      project.source.repo || project.name || '',
      project.source.commit || project.source.ref || project.source.branch || '',
    ].join(':');
    let hash = 2166136261;
    for (const value of [
      identity,
      ...(project.files || [])
        .filter((f) => f.text)
        .map((f) => f.path)
        .sort(),
    ])
      for (let i = 0; i < value.length; i++) {
        hash ^= value.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
      }
    return (hash >>> 0).toString(16);
  }

  // Runs on every folder open, so iterate the sorted files directly (no per-path lookup), reading
  // metadata in parallel batches. The local-folder key format is unchanged.
  const files = (project?.files || [])
    .filter((f) => f.text)
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const metadata = [];
  for (let start = 0; start < files.length; start += 64) {
    const batch = files.slice(start, start + 64).map(async ({ path, handle }) => {
      try {
        const raw = await handle.getFile();
        return `${path}|${raw.size}|${raw.lastModified}`;
      } catch {
        return `${path}|unreadable`;
      }
    });
    metadata.push(...(await Promise.all(batch)));
  }
  let hash = 2166136261;
  for (const value of [project?.name || '', ...metadata])
    for (let i = 0; i < value.length; i++) {
      hash ^= value.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
  return (hash >>> 0).toString(16);
}

const symbolKey = (symbol) =>
  symbol?.definitionKey || [symbol?.path, symbol?.name, symbol?.kind, symbol?.line].join('|');

/**
 * A plain, structured-cloneable snapshot: file handles dropped, resolved symbols stored as keys and
 * each symbol's references/importers stored as positions in `references`/`importBindings`.
 */
export function serializeIndex(index) {
  // `linked` describes the in-memory graph; a snapshot holds keys and positions instead.
  // eslint-disable-next-line no-unused-vars
  const { _fileHandles, linked, ...rest } = index;
  const references = index.references || [];
  const importBindings = index.importBindings || [];
  const referencePosition = new Map(references.map((item, i) => [item, i]));
  const bindingPosition = new Map(importBindings.map((item, i) => [item, i]));
  const positions = (items, position) =>
    (items || [])
      .map((item) => (typeof item === 'number' ? item : position.get(item)))
      .filter((item) => item !== undefined);
  // References that resolve to the same symbols share one array; the snapshot shares it too.
  const keys = new Map();
  const withKeys = (item) => {
    const symbols = item.resolvedSymbols || [];
    if (!keys.has(symbols)) keys.set(symbols, symbols.map(symbolKey));
    return { ...item, resolvedSymbols: keys.get(symbols) };
  };
  return {
    ...rest,
    references: references.map(withKeys),
    importBindings: importBindings.map(withKeys),
    symbols: (index.symbols || []).map((symbol) => ({
      ...symbol,
      references: positions(symbol.references, referencePosition),
      importedBy: positions(symbol.importedBy, bindingPosition),
    })),
  };
}

function request(req) {
  return new Promise((resolve) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(undefined);
  });
}

const current = (record) => (record?.index?.cacheVersion === CACHE_VERSION ? record.index : null);

export async function loadCachedIndex(project) {
  // Resolve the key before opening the transaction: awaiting inside it would let IndexedDB auto-commit.
  return readSnapshot(await projectKey(project));
}

/** The current-version snapshot stored under `key` (unlinked: see `linkIndex`), or null. */
export async function readSnapshot(key) {
  const db = await openDb();
  if (!db) return null;
  return current(await request(db.transaction(STORE, 'readonly').objectStore(STORE).get(key)));
}

/**
 * The most recent snapshot saved for a repository of this name, even if its files have changed
 * since. Used only to reuse the analysis of unchanged files, never shown as the current index.
 */
export async function loadLatestCachedIndex(project) {
  const db = await openDb();
  if (!db || !project?.name) return null;
  const tx = db.transaction([STORE, LATEST], 'readonly');
  return new Promise((resolve) => {
    const pointer = tx.objectStore(LATEST).get(project.name);
    pointer.onerror = () => resolve(null);
    pointer.onsuccess = () => {
      if (pointer.result === undefined) return resolve(null);
      const record = tx.objectStore(STORE).get(pointer.result);
      record.onsuccess = () => resolve(current(record.result));
      record.onerror = () => resolve(null);
    };
  });
}

export async function saveCachedIndex(project, index) {
  return writeSnapshot(await projectKey(project), project.name, index);
}

/**
 * Serialises and stores `index` under `key`, and makes it the latest snapshot of repository
 * `name` (deleting the one it supersedes). Works in the index worker as on the main thread.
 */
export async function writeSnapshot(key, name, index) {
  const db = await openDb();
  if (!db) return false;
  try {
    const snapshot = serializeIndex(index);
    snapshot.cacheVersion = CACHE_VERSION;
    snapshot.cachedAt = new Date().toISOString();
    const tx = db.transaction([STORE, LATEST], 'readwrite');
    const done = new Promise((resolve) => {
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
      tx.onabort = () => resolve(false);
    });
    const indexes = tx.objectStore(STORE);
    const latest = tx.objectStore(LATEST);
    indexes.put({ index: snapshot }, key);
    const previous = latest.get(name);
    previous.onsuccess = () => {
      if (previous.result !== undefined && previous.result !== key) indexes.delete(previous.result);
      latest.put(key, name);
    };
    return await done;
  } catch {
    return false;
  }
}

export async function clearCachedIndex(project) {
  const db = await openDb();
  if (!db) return;
  const key = await projectKey(project);
  const tx = db.transaction([STORE, LATEST], 'readwrite');
  const done = new Promise((resolve) => {
    tx.oncomplete = tx.onerror = tx.onabort = () => resolve();
  });
  tx.objectStore(STORE).delete(key);
  const latest = tx.objectStore(LATEST);
  const pointer = latest.get(project.name);
  pointer.onsuccess = () => {
    if (pointer.result === key) latest.delete(project.name);
  };
  await done;
}
