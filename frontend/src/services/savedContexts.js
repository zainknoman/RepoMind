// Saved AI contexts store how to rebuild a context (repository, files, options, task), never the
// source itself: repository code does not belong in localStorage, and a rebuilt context reflects the
// files as they are now. Entries saved before this format carried the full source; reading the list
// strips it and marks them as legacy.
const KEY = 'repomind.savedContexts';
export const MAX_SAVED_CONTEXTS = 20;

function write(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // Storage full or unavailable: the list still works for this session.
  }
  return list;
}

export function readSavedContexts() {
  let list;
  try {
    list = JSON.parse(localStorage.getItem(KEY) || '[]');
  } catch {
    list = [];
  }
  if (!Array.isArray(list)) list = [];
  let migrated = false;
  list = list.map((item) => {
    if (typeof item?.content !== 'string') return item;
    migrated = true;
    const { content, ...rest } = item; // eslint-disable-line no-unused-vars
    return { ...rest, legacy: true, paths: [], fileCount: item.files || 0 };
  });
  return migrated ? write(list) : list;
}

/** Adds a recipe to the front of the list; returns the new list. */
export function saveContextRecipe(list, recipe) {
  const item = {
    id: crypto.randomUUID(),
    name: recipe.name?.trim() || 'Context ' + new Date().toLocaleString(),
    repository: recipe.repository || '',
    task: recipe.task || '',
    paths: [...(recipe.paths || [])],
    options: { ...(recipe.options || {}) },
    tokens: recipe.tokens || 0,
    fileCount: recipe.fileCount || 0,
    createdAt: new Date().toISOString(),
  };
  return write([item, ...list].slice(0, MAX_SAVED_CONTEXTS));
}

export const deleteSavedContext = (list, id) => write(list.filter((x) => x.id !== id));
