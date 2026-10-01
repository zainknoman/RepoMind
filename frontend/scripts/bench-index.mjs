// Indexer benchmark (Phase 3a). Runs the real indexing, cache and search code in Node against
// deterministic synthetic repositories, or a real folder, and prints one Markdown table per run.
//
//   npm run bench:index                       # small, medium and large synthetic repositories
//   npm run bench:index -- --sizes small,medium
//   npm run bench:index -- --files 50,100  # custom synthetic sizes
//   npm run bench:index -- --dir ../some/repo # a real folder (same extension/ignore rules as the app)
//   npm run bench:index -- --json out.json    # also write the raw numbers
//
// Browser-only costs are approximated: postMessage and IndexedDB storage are measured as
// structuredClone, and file reads come from memory, so the numbers isolate CPU work, not disk I/O.
import 'fake-indexeddb/auto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, extname, join, relative, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import v8 from 'node:v8';
import { runnerImport } from 'vite';

const load = async (id) =>
  (await runnerImport(id, { configFile: false, logLevel: 'error' })).module;

const repository = await load('/src/services/repository.js');
const search = await load('/src/services/search.js');
const cache = await load('/src/services/indexCache.js');
const health = await load('/src/services/health.js');
const indexProject = await load('/src/services/indexProject.js');
const filesLib = await load('/src/lib/files.js');

const SIZES = { small: 150, medium: 1500, large: 6000 };

function args() {
  const out = { sizes: Object.keys(SIZES), dir: null, json: null };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--sizes') out.sizes = argv[++i].split(',');
    else if (argv[i] === '--dir') out.dir = argv[++i];
    else if (argv[i] === '--json') out.json = argv[++i];
    else if (argv[i] === '--files') out.sizes = argv[++i].split(',').map(Number);
  }
  return out;
}

// mulberry32: small, fast, deterministic.
function random(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PER_FOLDER = 40;
const folderOf = (i) => `src/pkg${Math.floor(i / PER_FOLDER)}`;
const extOf = (i) => ['.ts', '.js', '.tsx', '.jsx'][i % 4];
const pathOf = (i) => `${folderOf(i)}/mod${i}${extOf(i)}`;

function relativeImport(from, to) {
  const a = folderOf(from),
    b = folderOf(to);
  return a === b ? `./mod${to}` : `../pkg${Math.floor(to / PER_FOLDER)}/mod${to}`;
}

/** A module of ~150-300 lines: imports, exported functions, a class with methods, constants. */
function codeFile(i, rand) {
  const lines = [];
  const imports = [];
  const importCount = i === 0 ? 0 : 2 + Math.floor(rand() * 5);
  for (let k = 0; k < importCount; k++) {
    // Mostly earlier modules (a DAG); ~3% point forward so the graph has some cycles.
    const back = rand() < 0.03;
    const j = back ? i + 1 + Math.floor(rand() * 20) : Math.floor(rand() * i);
    if (j === i || imports.includes(j)) continue;
    imports.push(j);
  }
  for (const j of imports)
    lines.push(`import { fn${j}_0, fn${j}_1, Service${j} } from '${relativeImport(i, j)}';`);
  lines.push(`import { useState } from 'react';`, '');
  const fnCount = 6 + Math.floor(rand() * 9);
  for (let n = 0; n < fnCount; n++) {
    const callee = imports.length ? imports[Math.floor(rand() * imports.length)] : null;
    lines.push(`export function fn${i}_${n}(input, options = {}) {`);
    lines.push(`  const value = ${callee !== null ? `fn${callee}_${n % 2}(input)` : 'input'};`);
    lines.push(`  const limit = options.limit ?? LIMIT_${i};`);
    for (let s = 0; s < 6 + Math.floor(rand() * 10); s++)
      lines.push(`  if (value?.items?.length > limit + ${s}) return format${i}(value, ${s});`);
    if (n > 0) lines.push(`  return fn${i}_${n - 1}(value, options);`);
    else lines.push('  return value;');
    lines.push('}', '');
  }
  lines.push(`const LIMIT_${i} = ${10 + (i % 90)};`, '');
  lines.push(`const format${i} = (value, depth) => ({ ...value, depth, id: ${i} });`, '');
  lines.push(`export class Service${i} {`);
  lines.push('  constructor(client) {', '    this.client = client;', '  }');
  for (let m = 0; m < 3 + Math.floor(rand() * 4); m++) {
    lines.push(`  async method${m}(request) {`);
    lines.push(`    const [state] = useState(request);`);
    lines.push(`    return fn${i}_${m % fnCount}(await this.client.send(state), { limit: ${m} });`);
    lines.push('  }');
  }
  lines.push('}', '');
  return lines.join('\n');
}

function otherFile(i, rand) {
  const ext = ['.json', '.md', '.css'][i % 3];
  const n = 20 + Math.floor(rand() * 60);
  if (ext === '.json')
    return {
      ext,
      content: JSON.stringify(
        Object.fromEntries(Array.from({ length: n }, (_, k) => [`key${k}`, k])),
        null,
        2,
      ),
    };
  if (ext === '.md')
    return {
      ext,
      content: Array.from({ length: n }, (_, k) => `Line ${k} of document ${i}.`).join('\n'),
    };
  return {
    ext,
    content: Array.from({ length: n }, (_, k) => `.c${i}-${k} { margin: ${k}px; }`).join('\n'),
  };
}

function syntheticRepository(fileCount) {
  const rand = random(fileCount);
  const records = [];
  for (let i = 0; i < fileCount; i++) {
    // ~15% of files are data/docs/styles, as in a typical front-end repository.
    if (i % 7 === 3) {
      const { ext, content } = otherFile(i, rand);
      const path = `${folderOf(i)}/asset${i}${ext}`;
      records.push({ path, name: path.split('/').pop(), ext, content });
    } else {
      const path = pathOf(i);
      records.push({
        path,
        name: path.split('/').pop(),
        ext: extOf(i),
        content: codeFile(i, rand),
      });
    }
  }
  return records;
}

function folderRepository(dir) {
  const root = resolve(dir);
  const records = [];
  const visit = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        if (!filesLib.IGN.has(entry.name)) visit(full);
      } else if (filesLib.EXTS.has(extname(entry.name).toLowerCase())) {
        if (statSync(full).size > 2_000_000) continue;
        records.push({
          path: relative(root, full).replace(/\\/g, '/'),
          name: entry.name,
          ext: extname(entry.name).toLowerCase(),
          content: readFileSync(full, 'utf8'),
        });
      }
    }
  };
  visit(root);
  return records;
}

/** A project shaped like the one the app builds from a directory handle. */
function toProject(name, records) {
  return {
    name,
    files: records.map((r) => ({
      path: r.path,
      name: r.name,
      ext: r.ext,
      text: true,
      handle: {
        getFile: async () => ({
          size: r.content.length,
          lastModified: r.modified ?? 1_700_000_000_000,
          text: async () => r.content,
        }),
      },
    })),
  };
}

const gc = () => globalThis.gc?.();
const heapMb = () => process.memoryUsage().heapUsed / 1024 / 1024;

const verbose = process.argv.includes('--verbose');
let step = 0;

async function time(fn) {
  const start = performance.now();
  const value = await fn();
  const ms = performance.now() - start;
  if (verbose) process.stderr.write(`  step ${++step}: ${ms.toFixed(0)} ms\n`);
  return { ms, value };
}

async function benchmark(label, records) {
  const project = toProject(label, records);
  const row = { label, files: records.length };

  // Main thread: read every file into plain records (the part before the worker starts).
  const read = await time(() => indexProject.readProjectFiles(project));
  row.readMs = read.ms;

  // Worker: the index build itself, split into phases from the progress events it already emits.
  gc();
  const heapBefore = heapMb();
  const phases = {};
  let progressEvents = 0;
  const build = await time(() =>
    repository.buildRepositoryIndex(indexProject.toWorkerProject(label, read.value), {
      onProgress: ({ phase }) => {
        progressEvents++;
        phases[phase] ??= performance.now();
      },
    }),
  );
  const end = performance.now();
  let index = build.value;
  row.buildMs = build.ms;
  row.analyzeMs = (phases.resolve ?? end) - phases.analyze;
  row.resolveMs = (phases.finalize ?? end) - (phases.resolve ?? end);
  row.finalizeMs = end - (phases.finalize ?? end);
  row.progressEvents = progressEvents;
  row.lines = index.stats.lines;
  row.symbols = index.stats.symbols;
  row.references = index.stats.references;
  row.dependencies = index.dependencies.length;
  row.resolvedLinks = index.references.reduce((n, r) => n + r.resolvedSymbols.length, 0);
  const confidence = index.stats.referenceConfidence || {};
  row.highRefs = confidence.high || 0;
  row.mediumRefs = confidence.medium || 0;
  row.lowRefs = confidence.low || 0;
  row.unresolvedRefs = confidence.none || 0;
  row.externalRefs = (index.stats.externalReferences || 0) + (index.stats.globalReferences || 0);
  row.memberRefs = index.stats.memberReferences || 0;
  row.untracedMembers = index.stats.untracedMemberCalls || 0;

  // Main thread: receiving the worker result (postMessage ≈ structuredClone) and attaching handles.
  const transfer = await time(() => structuredClone(index));
  row.transferMs = transfer.ms;
  const attach = await time(() => repository.attachFileHandles(transfer.value, project));
  row.attachMs = attach.ms;
  // Measure what the main thread keeps: the worker's copy is gone in the browser.
  index = build.value = transfer.value = null;
  gc();
  row.heapMb = heapMb() - heapBefore;

  const fresh = attach.value;
  row.cyclesMs = (await time(() => repository.detectCycles(fresh))).ms;
  const cycles = repository.detectCycles(fresh);
  row.healthMs = (await time(() => health.buildArchitectureHealth(fresh, cycles))).ms;

  // Cache. IndexedDB stores a structured clone, so saving costs serialize + clone, now in the
  // worker (the main thread pays nothing). Restoring: the worker reads (clone) and links; the main
  // thread receives the linked index (clone) and attaches handles. V8's serializer gives the stored
  // size. fake-indexeddb clones in JavaScript, far slower than a browser, so it is only used for
  // the key check.
  const save = await time(() => structuredClone(cache.serializeIndex(fresh)));
  row.cacheSaveMs = save.ms;
  row.cacheSnapshotMb = v8.serialize(save.value).length / 1024 / 1024;
  const miss = await time(() => cache.loadCachedIndex({ ...project, name: `${label}-miss` }));
  row.cacheKeyMs = miss.ms;
  const restoreWorker = await time(() => repository.linkIndex(structuredClone(save.value)));
  row.cacheRestoreWorkerMs = restoreWorker.ms;
  const restoreMain = await time(() =>
    repository.attachFileHandles(structuredClone(restoreWorker.value), project),
  );
  row.cacheRestoreMs = restoreMain.ms;

  // Search latency (symbols, files and full text) with the index.
  const found = await time(() =>
    search.searchProject({ files: project.files, index: fresh, query: 'options.limit' }),
  );
  row.searchMs = found.ms;
  row.searchHits = found.value.text.length;

  // Incremental rebuild after editing 1% of the files: read + post to the worker + build.
  const changedEvery = 100;
  const edited = records.map((r, i) =>
    i % changedEvery === 0 ? { ...r, content: r.content + '\n// edited\n', modified: 1 } : r,
  );
  const editedProject = toProject(label, edited);
  const incremental = await time(async () => {
    const files = await indexProject.readProjectFiles(editedProject, { previous: fresh });
    return repository.buildRepositoryIndex(
      indexProject.toWorkerProject(label, structuredClone(files)),
    );
  });
  row.incrementalMs = incremental.ms;
  row.incrementalChanged = edited.length - incremental.value.stats.reusedFiles;
  return row;
}

const fmt = (n) =>
  typeof n === 'number'
    ? Number.isInteger(n)
      ? n.toLocaleString('en-US')
      : n.toFixed(n < 10 ? 1 : 0)
    : String(n);

const COLUMNS = [
  ['files', 'Files'],
  ['lines', 'Lines'],
  ['symbols', 'Symbols'],
  ['references', 'References'],
  ['dependencies', 'Internal edges'],
  ['resolvedLinks', 'Reference → symbol links'],
  ['highRefs', '· references, high confidence'],
  ['mediumRefs', '· references, medium confidence'],
  ['lowRefs', '· references, low (name match)'],
  ['unresolvedRefs', '· references, unresolved'],
  ['externalRefs', '· package / global names (not linked)'],
  ['memberRefs', '· member calls linked (obj.method())'],
  ['untracedMembers', '· member calls not traced'],
  ['readMs', 'Read files (ms, main)'],
  ['buildMs', 'Index build (ms, worker)'],
  ['analyzeMs', '· analyze/parse'],
  ['resolveMs', '· resolve bindings + references'],
  ['finalizeMs', '· finalize symbol back-links'],
  ['progressEvents', 'Progress messages'],
  ['transferMs', 'Worker → main clone (ms)'],
  ['attachMs', 'Attach handles (ms, main)'],
  ['heapMb', 'Retained heap (MB)'],
  ['cyclesMs', 'Cycle detection (ms)'],
  ['healthMs', 'Health (ms)'],
  ['cacheSaveMs', 'Cache save: serialize + clone (ms, worker)'],
  ['cacheKeyMs', 'Cache key check (ms)'],
  ['cacheRestoreWorkerMs', 'Cache restore: read + link (ms, worker)'],
  ['cacheRestoreMs', 'Cache restore: receive + attach handles (ms, main)'],
  ['cacheSnapshotMb', 'Cache snapshot (MB)'],
  ['searchMs', 'Search: symbols + files + text (ms)'],
  ['incrementalChanged', 'Files changed for rebuild'],
  ['incrementalMs', 'Incremental rebuild (ms)'],
];

function table(rows) {
  const out = [
    `| Metric | ${rows.map((r) => r.label).join(' | ')} |`,
    `|---|${rows.map(() => '---:|').join('')}`,
  ];
  for (const [key, title] of COLUMNS)
    out.push(`| ${title} | ${rows.map((r) => fmt(r[key])).join(' | ')} |`);
  return out.join('\n');
}

const options = args();
if (!globalThis.gc)
  console.warn('Run with --expose-gc for heap numbers (npm run bench:index does).');
const rows = [];
if (options.dir) {
  rows.push(await benchmark(basename(resolve(options.dir)), folderRepository(options.dir)));
} else {
  for (const size of options.sizes) {
    const count = typeof size === 'number' ? size : SIZES[size];
    if (!count) throw new Error(`Unknown size "${size}" (use ${Object.keys(SIZES).join(', ')})`);
    process.stderr.write(`Benchmarking ${size} (${count} files)…\n`);
    rows.push(await benchmark(String(size), syntheticRepository(count)));
  }
}
console.log(`Node ${process.version} · ${new Date().toISOString()}\n`);
console.log(table(rows));
if (options.json) writeFileSync(options.json, JSON.stringify(rows, null, 2));
