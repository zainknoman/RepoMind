/**
 * Change impact of a set of file changes (uncommitted work or one commit): which symbols changed,
 * everything that could be affected through them, and references the change breaks.
 */
import { lineDiff } from '../lib/diff';
import { analyzeSource, languageFor } from './repository';
import { CODE_LANGUAGES } from './coverage';
import { fileImpact, symbolImpact } from './impact';

const UNIT_KINDS = new Set([
  'function',
  'method',
  'class',
  'variable',
  'subroutine',
  'program',
  'insert',
]);
const RANK = { high: 0, medium: 1, low: 2 };

const extOf = (path) => {
  const name = path.split('/').pop();
  return name.includes('.') ? name.slice(name.lastIndexOf('.')) : '';
};
const identity = (s) => `${s.kind}|${s.parent || ''}|${s.name}`;

// Functions, methods, classes, top-level variables and routines: the units a change is reported in.
function unitsOf(path, ext, text) {
  if (text == null) return [];
  const file = { path, name: path.split('/').pop(), ext };
  return analyzeSource(file, text).symbols.filter(
    (s) => UNIT_KINDS.has(s.kind) && !(s.kind === 'variable' && s.scopeStart !== undefined),
  );
}

function innermost(units, line) {
  let best = null;
  for (const unit of units) {
    const end = unit.endLine ?? Infinity;
    if (unit.line > line || end < line) continue;
    if (!best || unit.line > best.line) best = unit;
  }
  return best;
}

/** Changed, added and removed symbols of one file change, and whether code outside them changed. */
export function changedSymbols(change, ext = extOf(change.path)) {
  const before = unitsOf(change.path, ext, change.oldText);
  const after = unitsOf(change.path, ext, change.newText);
  const beforeIds = new Set(before.map(identity));
  const afterIds = new Set(after.map(identity));
  const found = new Map();
  const mark = (unit, kind) => {
    const id = identity(unit);
    if (!found.has(id) || kind !== 'modified')
      found.set(id, {
        name: unit.name,
        kind: unit.kind,
        parent: unit.parent || null,
        change: kind,
        line: unit.line,
      });
  };
  let moduleLevel = false;
  const lines = { added: 0, removed: 0 };

  if (change.oldText != null && change.newText != null) {
    const ops = lineDiff(change.oldText.split(/\r?\n/), change.newText.split(/\r?\n/));
    for (const op of ops) {
      if (op.type === 'same') continue;
      if (op.ri !== null && op.type !== 'del') {
        lines.added++;
        const unit = innermost(after, op.ri);
        if (unit) mark(unit, 'modified');
        else moduleLevel = true;
      }
      if (op.li !== null && op.type !== 'add') {
        lines.removed++;
        const unit = innermost(before, op.li);
        if (unit && afterIds.has(identity(unit))) mark(unit, 'modified');
        else if (!unit) moduleLevel = true;
      }
    }
  }
  for (const unit of after) if (!beforeIds.has(identity(unit))) mark(unit, 'added');
  for (const unit of before) if (!afterIds.has(identity(unit))) mark(unit, 'removed');
  // Only the innermost unit of a change is reported: a class is not "modified" because one of its
  // methods is, unless lines of the class itself changed.
  return {
    symbols: [...found.values()].sort((a, b) => a.line - b.line || a.name.localeCompare(b.name)),
    moduleLevel,
    lines,
  };
}

function indexSymbol(index, path, symbol) {
  const candidates = index.symbols.filter(
    (s) =>
      s.path === path &&
      s.name === symbol.name &&
      s.kind === symbol.kind &&
      (s.parent || null) === symbol.parent,
  );
  return candidates.sort(
    (a, b) => Math.abs(a.line - symbol.line) - Math.abs(b.line - symbol.line),
  )[0];
}

export function changeImpact(index, changes, options = {}) {
  const affected = new Map();
  const spots = new Map();
  const broken = [];
  const files = [];
  const skipped = [];
  const nonCode = [];

  const add = (key, item, because) => {
    const current = affected.get(key);
    if (
      !current ||
      RANK[item.confidence] < RANK[current.confidence] ||
      (item.confidence === current.confidence && item.depth < current.depth)
    )
      affected.set(key, { ...item, because: new Set([...(current?.because || []), because]) });
    else current.because.add(because);
  };
  const addSpots = (list) => {
    for (const spot of list || []) if (!spots.has(spot.kind)) spots.set(spot.kind, spot);
  };
  const addFileImpact = (path, because) => {
    const result = fileImpact(index, path, options);
    for (const item of result.affected)
      add(
        'file:' + item.path,
        {
          kind: 'file',
          name: null,
          path: item.path,
          depth: item.depth,
          confidence: 'high',
          via: item.via,
        },
        because,
      );
    addSpots(result.blindSpots);
  };

  for (const change of changes) {
    if (change.skipped) {
      skipped.push(change);
      continue;
    }
    const ext = index.files.find((f) => f.path === change.path)?.extension ?? extOf(change.path);
    if (!CODE_LANGUAGES.has(languageFor(ext))) {
      nonCode.push(change);
      continue;
    }
    const result = changedSymbols(change, ext);
    files.push({ path: change.path, status: change.status, ...result });

    for (const symbol of result.symbols) {
      if (symbol.change === 'removed') {
        const importers = (index.importBindings || []).filter(
          (b) => b.to === change.path && b.imported === symbol.name && !b.resolvedSymbols?.length,
        );
        for (const b of importers)
          broken.push({
            path: b.from,
            line: b.line,
            name: b.local,
            reason: `imports ${symbol.name}, which was removed from ${change.path}`,
          });
        continue;
      }
      const target = indexSymbol(index, change.path, symbol);
      const impact = target && symbolImpact(index, target, options);
      if (!impact) continue;
      for (const item of impact.affected) add(item.key, item, symbol.name);
      addSpots(impact.blindSpots);
    }
    if (result.moduleLevel || change.status === 'added')
      addFileImpact(change.path, `${change.path} (module code)`);
    if (change.status === 'deleted') {
      const base = change.path
        .split('/')
        .pop()
        .replace(/\.[^.]+$/, '');
      for (const edge of index.unresolvedImports || [])
        if (
          edge.module
            .split('/')
            .pop()
            .replace(/\.[^.]+$/, '') === base
        )
          broken.push({
            path: edge.from,
            line: edge.line,
            name: edge.module,
            reason: `imports ${edge.module}; ${change.path} was deleted`,
          });
    }
  }

  const list = [...affected.values()]
    .map((item) => ({ ...item, because: [...item.because].sort() }))
    .sort(
      (a, b) =>
        RANK[a.confidence] - RANK[b.confidence] ||
        a.depth - b.depth ||
        a.path.localeCompare(b.path),
    );
  if (skipped.length)
    spots.set('skipped', {
      kind: 'skipped',
      message: `${skipped.length} changed file${skipped.length === 1 ? ' was' : 's were'} not analysed (binary or over 1 MB): ${skipped.map((c) => c.path).join(', ')}.`,
    });
  if (nonCode.length)
    spots.set('non-code', {
      kind: 'non-code',
      message: `${nonCode.length} changed non-code file${nonCode.length === 1 ? '' : 's'} (configuration, docs, styles) can change behaviour but are not traced: ${nonCode.map((c) => c.path).join(', ')}.`,
    });
  return {
    files,
    affected: list,
    broken,
    skipped,
    nonCode,
    counts: {
      files: changes.length,
      symbols: files.reduce((n, f) => n + f.symbols.length, 0),
      affected: list.length,
      high: list.filter((a) => a.confidence === 'high').length,
      medium: list.filter((a) => a.confidence === 'medium').length,
      low: list.filter((a) => a.confidence === 'low').length,
      broken: broken.length,
    },
    blindSpots: [...spots.values()],
  };
}

export function changeImpactMarkdown(result, title) {
  const { counts } = result;
  const out = [
    `# Change impact: ${title}`,
    '',
    `- Changed files: ${counts.files} · changed symbols: ${counts.symbols} · affected: ${counts.affected} (high ${counts.high}, medium ${counts.medium}, low ${counts.low}) · broken references: ${counts.broken}`,
    '',
    '## Changed',
    '',
  ];
  for (const file of result.files) {
    out.push(`- **${file.path}** (${file.status}, +${file.lines.added} −${file.lines.removed})`);
    for (const s of file.symbols) out.push(`  - \`${s.name}\` (${s.kind}, ${s.change})`);
    if (file.moduleLevel) out.push('  - module-level code');
  }
  for (const c of [...result.skipped, ...result.nonCode])
    out.push(`- ${c.path} (${c.status}, not analysed)`);
  out.push('', '## Affected', '');
  if (result.affected.length) {
    out.push('| Symbol | File | Level | Confidence | Because |', '|---|---|---|---|---|');
    for (const a of result.affected)
      out.push(
        `| ${a.name || '—'} | ${a.path} | ${a.depth} | ${a.confidence} | ${a.because.join(', ')} |`,
      );
  } else out.push('Nothing in the index depends on the changed code.');
  if (result.broken.length) {
    out.push('', '## Broken references', '');
    for (const b of result.broken) out.push(`- ${b.path}:${b.line} — ${b.reason}`);
  }
  if (result.blindSpots.length) {
    out.push('', '## Blind spots', '');
    for (const spot of result.blindSpots) out.push(`- ${spot.message}`);
  }
  return out.join('\n') + '\n';
}
