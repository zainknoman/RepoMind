/**
 * Change impact: what could be affected, directly or through any number of hops, if a file or a
 * symbol changes. Every result carries a confidence (a path is as strong as its weakest link) and
 * the blind spots that could hide further impact, so an empty result is never read as "safe".
 */
import { coverageGaps } from './coverage';

const CONTAINER_KINDS = new Set([
  'function',
  'method',
  'class',
  'variable',
  'subroutine',
  'program',
  'insert',
]);
const RANK = { high: 0, medium: 1, low: 2 };
const LEVELS = ['high', 'medium', 'low'];
const weakest = (a, b) => (RANK[a] >= RANK[b] ? a : b);

// Per-index lookups, built once and dropped with the index.
const cache = new WeakMap();
function lookups(index) {
  let entry = cache.get(index);
  if (entry) return entry;
  const containers = new Map();
  for (const symbol of index.symbols || []) {
    if (!CONTAINER_KINDS.has(symbol.kind)) continue;
    // A variable inside a function is part of that function, not a unit of its own.
    if (symbol.kind === 'variable' && symbol.scopeStart !== undefined) continue;
    if (!containers.has(symbol.path)) containers.set(symbol.path, []);
    containers.get(symbol.path).push(symbol);
  }
  const referencesTo = new Map();
  for (const reference of index.references || [])
    for (const symbol of reference.resolvedSymbols || []) {
      const key = symbol.definitionKey;
      if (!referencesTo.has(key)) referencesTo.set(key, []);
      referencesTo.get(key).push(reference);
    }
  const importers = new Map();
  for (const edge of index.dependencies || []) {
    if (!importers.has(edge.to)) importers.set(edge.to, []);
    importers.get(edge.to).push(edge.from);
  }
  entry = { containers, referencesTo, importers };
  cache.set(index, entry);
  return entry;
}

/** The innermost function, method, class, top-level variable or routine around a line, or null. */
export function containerAt(index, path, line) {
  let best = null;
  for (const symbol of lookups(index).containers.get(path) || []) {
    const end = symbol.endLine ?? Infinity;
    if (symbol.line > line || end < line) continue;
    if (
      !best ||
      symbol.line > best.line ||
      (symbol.line === best.line && end < (best.endLine ?? Infinity))
    )
      best = symbol;
  }
  return best;
}

function blindSpots(index, root, affected) {
  const spots = [];
  const gaps = coverageGaps(index).filter((g) => g.imports === 'none' || !g.references);
  if (gaps.length)
    spots.push({
      kind: 'coverage',
      message: `Not analysed: ${gaps.map((g) => `${g.language} (${g.files} files)`).join(', ')}. Usage in these files is not shown.`,
    });
  if (root?.name) {
    const unresolved = (index.references || []).filter(
      (r) => r.name === root.name && !r.resolvedSymbols?.length,
    ).length;
    if (unresolved)
      spots.push({
        kind: 'unresolved',
        message: `${unresolved} unresolved reference${unresolved === 1 ? '' : 's'} named ${root.name} could also be usages.`,
      });
  }
  if (root?.kind === 'method')
    spots.push({
      kind: 'member-calls',
      message:
        'Calls through an object of unknown class (a parameter, obj.a.b()) are matched by method name at low confidence; calls using common built-in names (get, map, then…) and computed access (obj[name]()) are not tracked.',
    });
  const dynamic = (index.files || []).reduce((n, f) => n + (f.temenos?.dynamicCalls || 0), 0);
  if (dynamic && root?.path?.endsWith('.b'))
    spots.push({
      kind: 'dynamic-calls',
      message: `${dynamic} dynamic CALL @variable site${dynamic === 1 ? '' : 's'} could reach this routine.`,
    });
  const low = affected.filter((a) => a.confidence !== 'high').length;
  if (low)
    spots.push({
      kind: 'low-confidence',
      message: `${low} affected item${low === 1 ? ' is' : 's are'} reached through an ambiguous or guessed link.`,
    });
  return spots;
}

/**
 * Symbols (and module-level code) that use `root`, then their users, and so on. Nodes are
 * finalised best-confidence first, so each is reported with its strongest path and, at that
 * confidence, its shortest depth.
 */
export function symbolImpact(index, root, { maxDepth = 8, limit = 2000 } = {}) {
  if (typeof root === 'string') root = index.symbols.find((s) => s.definitionKey === root);
  if (!root) return null;
  const { referencesTo } = lookups(index);
  const queues = { high: [], medium: [], low: [] };
  const done = new Set([root.definitionKey]);
  const affected = [];
  let truncated = false;
  queues.high.push({ symbol: root, depth: 0, confidence: 'high' });

  const next = () => {
    for (const level of LEVELS) if (queues[level].length) return queues[level].shift();
    return null;
  };
  for (let item = next(); item; item = next()) {
    const { symbol, depth, confidence } = item;
    if (item.key) {
      if (done.has(item.key)) continue;
      done.add(item.key);
      if (affected.length >= limit) {
        truncated = true;
        break;
      }
      affected.push({
        key: item.key,
        symbol: symbol || null,
        name: symbol?.name || null,
        kind: symbol?.kind || 'module',
        path: item.path,
        line: symbol?.line ?? item.via.line,
        depth,
        confidence,
        via: item.via,
      });
    }
    if (!symbol || depth >= maxDepth) continue;
    for (const reference of referencesTo.get(symbol.definitionKey) || []) {
      const container = containerAt(index, reference.from, reference.line);
      const key = container ? container.definitionKey : 'module:' + reference.from;
      if (done.has(key)) continue;
      const level = weakest(confidence, reference.confidence || 'high');
      queues[level].push({
        key,
        symbol: container,
        path: reference.from,
        depth: depth + 1,
        confidence: level,
        via: { name: reference.name, path: reference.from, line: reference.line },
      });
    }
  }
  return {
    root,
    affected,
    files: [...new Set(affected.map((a) => a.path))].sort(),
    counts: Object.fromEntries(
      LEVELS.map((level) => [level, affected.filter((a) => a.confidence === level).length]),
    ),
    truncated,
    blindSpots: blindSpots(index, root, affected),
  };
}

/** Files that import `path`, then their importers, and so on (resolved edges only). */
export function fileImpact(index, path, { maxDepth = 8 } = {}) {
  const { importers } = lookups(index);
  const seen = new Set([path]);
  const affected = [];
  let frontier = [path];
  for (let depth = 1; depth <= maxDepth && frontier.length; depth++) {
    const nextFrontier = [];
    for (const current of frontier)
      for (const from of importers.get(current) || []) {
        if (seen.has(from)) continue;
        seen.add(from);
        affected.push({ path: from, depth, via: current });
        nextFrontier.push(from);
      }
    frontier = nextFrontier;
  }
  const fileRoot = { path };
  return {
    root: path,
    affected,
    direct: affected.filter((a) => a.depth === 1).length,
    transitive: affected.filter((a) => a.depth > 1).length,
    blindSpots: blindSpots(
      index,
      fileRoot,
      affected.map(() => ({ confidence: 'high' })),
    ),
  };
}
