import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  attachFileHandles,
  buildRepositoryIndex,
  detectCycles,
  findDependents,
} from './repository';
import { redactSecret, runAnalyzer } from './analyzers';
import { searchProject } from './search';
import { readProjectFiles, toWorkerProject } from './indexProject';
import { askAI, buildAIMessages } from './ai';
import { buildArchitectureHealth } from './health';

const SOURCES = {
  'src/a.js': "import { b } from './b';\nexport function a() { return b(); }\n",
  'src/b.js':
    "import { a } from './a';\nexport function b() { return 1; }\nexport const unused = () => a;\n",
  'src/server.js':
    "const express = require('express');\nconst app = express();\napp.get('/health', (req, res) => res.send('ok'));\n",
  'src/config.js': 'const API_KEY = "sk_test_abcdefghijklmnop";\n',
};

async function indexFixture() {
  const files = Object.entries(SOURCES).map(([path, content]) => ({
    path,
    name: path.split('/').pop(),
    ext: '.' + path.split('.').pop(),
    content,
  }));
  const project = toWorkerProject('fixture', files);
  return attachFileHandles(await buildRepositoryIndex(project), project);
}

describe('repository index', () => {
  it('indexes symbols, internal dependencies and cycles', async () => {
    const index = await indexFixture();
    expect(index.stats.files).toBe(4);
    expect(index.symbols.map((s) => s.name)).toEqual(expect.arrayContaining(['a', 'b']));
    expect(findDependents(index, 'src/b.js').length).toBeGreaterThan(0);
    expect(detectCycles(index).length).toBeGreaterThan(0);
  });
  it('reports progress and honours cancellation', async () => {
    const controller = new AbortController();
    const onProgress = vi.fn(() => controller.abort());
    const project = toWorkerProject(
      'fixture',
      Object.entries(SOURCES).map(([path, content]) => ({ path, name: path, ext: '.js', content })),
    );
    await expect(
      buildRepositoryIndex(project, { signal: controller.signal, onProgress }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(onProgress).toHaveBeenCalled();
  });
});

/** A project whose files look like real handles: content plus size and modification time. */
function handleProject(sources, modified = {}) {
  return {
    name: 'handles',
    files: Object.entries(sources).map(([path, content]) => ({
      path,
      name: path.split('/').pop(),
      ext: '.' + path.split('.').pop(),
      text: true,
      handle: {
        getFile: async () => ({
          size: content.length,
          lastModified: modified[path] || 1,
          text: async () => content,
        }),
      },
    })),
  };
}

const links = (index) =>
  index.symbols.map((s) => [
    s.definitionKey,
    s.references.map((r) => `${r.from}:${r.line}:${r.column}`),
    s.importedBy.map((b) => `${b.from}:${b.local}`),
  ]);

describe('reference linking', () => {
  it('links each symbol to the references and imports that resolve to it', async () => {
    const project = toWorkerProject('links', [
      {
        path: 'a.js',
        name: 'a.js',
        ext: '.js',
        content: "import { b } from './b';\nexport function a() {\n  return b();\n}\n",
      },
      { path: 'b.js', name: 'b.js', ext: '.js', content: 'export function b() {}\n' },
    ]);
    const index = await buildRepositoryIndex(project);
    const b = index.symbols.find((s) => s.name === 'b');
    expect(b.references.map((r) => [r.from, r.line])).toEqual([['a.js', 3]]);
    expect(b.importedBy.map((i) => i.from)).toEqual(['a.js']);
    for (const symbol of index.symbols)
      for (const ref of symbol.references)
        expect(ref.resolvedSymbols.map((s) => s.definitionKey)).toContain(symbol.definitionKey);
  });
  it('resolves references to the declarations in scope only', async () => {
    const source = [
      'const shared = 1;', // 1
      'function first() {', // 2
      '  const value = 1;', // 3
      '  return value + shared;', // 4
      '}', // 5
      'function second() {', // 6
      '  const value = 2;', // 7
      '  const inner = () => {', // 8
      '    const value = 3;', // 9
      '    return value;', // 10
      '  };', // 11
      '  return value + inner();', // 12
      '}', // 13
    ].join('\n');
    const project = toWorkerProject('scopes', [
      { path: 's.js', name: 's.js', ext: '.js', content: source },
      {
        path: 'other.js',
        name: 'other.js',
        ext: '.js',
        content: 'function f() {\n  return value;\n}\n',
      },
    ]);
    const index = await buildRepositoryIndex(project);
    const refsTo = (line) =>
      index.symbols
        .find((s) => s.name === 'value' && s.line === line)
        .references.map((r) => `${r.from}:${r.line}`);
    expect(refsTo(3)).toEqual(['s.js:4']);
    expect(refsTo(7)).toEqual(['s.js:12']);
    expect(refsTo(9)).toEqual(['s.js:10']);
    // Top-level declarations stay visible inside functions.
    expect(index.symbols.find((s) => s.name === 'shared').references).toHaveLength(1);
    // Another file's locals are not matched by name.
    const other = index.references.find((r) => r.from === 'other.js' && r.name === 'value');
    expect(other.resolvedSymbols).toEqual([]);
  });
  it('indexes names that exist on Object.prototype', async () => {
    const project = toWorkerProject('proto', [
      {
        path: 'k.js',
        name: 'k.js',
        ext: '.js',
        content:
          'export class K {\n  constructor() {}\n  toString() { return valueOf(); }\n}\nfunction valueOf() {}\n',
      },
    ]);
    const index = await buildRepositoryIndex(project);
    expect(index.symbols.map((s) => s.name)).toEqual(
      expect.arrayContaining(['K', 'constructor', 'toString', 'valueOf']),
    );
  });
});

describe('incremental indexing', () => {
  const build = async (project, previous) =>
    buildRepositoryIndex(
      toWorkerProject(project.name, await readProjectFiles(project, { previous })),
    );

  it('reuses unchanged files and matches a full rebuild', async () => {
    const first = await build(handleProject(SOURCES));
    const changedSources = {
      ...SOURCES,
      'src/b.js': 'export function b() { return 2; }\nexport const extra = () => b();\n',
    };
    const changed = handleProject(changedSources, { 'src/b.js': 2 });
    const incremental = await build(changed, first);
    const full = await build(changed);
    expect(incremental.stats.reusedFiles).toBe(3);
    expect(full.stats.reusedFiles).toBe(0);
    expect(incremental.symbols.map((s) => s.name)).toContain('extra');
    expect(links(incremental)).toEqual(links(full));
    expect(incremental.dependencies).toEqual(full.dependencies);
  });
  it('re-reads a file whose size changed even if its time did not', async () => {
    const first = await build(handleProject(SOURCES));
    const again = await build(
      handleProject({ ...SOURCES, 'src/a.js': SOURCES['src/a.js'] + '// more\n' }),
      first,
    );
    expect(again.stats.reusedFiles).toBe(3);
  });
});

describe('architecture health', () => {
  it('counts symbols per file and flags the cycle', async () => {
    const index = await indexFixture();
    const cycles = detectCycles(index);
    const health = buildArchitectureHealth(index, cycles);
    for (const hotspot of health.hotspots)
      expect(hotspot.symbols).toBe(index.symbols.filter((s) => s.path === hotspot.path).length);
    expect(health.signals.find((x) => x.id === 'cycles')).toMatchObject({
      count: cycles.length,
      severity: 'high',
    });
  });
});

describe('built-in analyzers', () => {
  it('discovers Express routes', async () => {
    const routes = await runAnalyzer(await indexFixture(), 'routes');
    expect(routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ method: 'GET', path: '/health', file: 'src/server.js', line: 3 }),
      ]),
    );
  });
  it('finds secrets without repeating them', async () => {
    const findings = await runAnalyzer(await indexFixture(), 'security');
    const hit = findings.find((f) => f.file === 'src/config.js');
    expect(hit).toBeDefined();
    expect(hit.text).not.toContain('abcdefghijklmnop');
  });
  it('redacts quoted values, key blocks and long tokens', () => {
    expect(redactSecret('password = "hunter2hunter2"')).toBe('password = "hunt••••"');
    expect(redactSecret('-----BEGIN RSA PRIVATE KEY----- MIIEow')).toBe(
      '-----BEGIN RSA PRIVATE KEY----- ••••',
    );
    expect(redactSecret('token ghp_abcdefghijklmnopqrstuvwxyz')).toBe('token ghp_••••');
  });
});

describe('search', () => {
  const files = () =>
    toWorkerProject('search', [
      {
        path: 'src/greet.js',
        name: 'greet.js',
        ext: '.js',
        content: 'export function greet() {}\nconst Greeting = 1;\n',
      },
      { path: 'docs/a.md', name: 'a.md', ext: '.md', content: 'Say greet(x) here\n' },
    ]).files;

  it('finds symbols, files and text, with symbols only when indexed', async () => {
    const project = { name: 'search', files: files() };
    const index = attachFileHandles(await buildRepositoryIndex(project), project);
    const withIndex = await searchProject({ files: project.files, index, query: ' greet ' });
    expect(withIndex.query).toBe('greet');
    expect(withIndex.symbols.map((s) => s.name)).toEqual(['greet', 'Greeting']);
    expect(withIndex.files.map((f) => f.path)).toEqual(['src/greet.js']);
    expect(withIndex.text.map((t) => [t.path, t.line])).toEqual([
      ['src/greet.js', 1],
      ['src/greet.js', 2],
      ['docs/a.md', 1],
    ]);
    const withoutIndex = await searchProject({ files: project.files, index: null, query: 'greet' });
    expect(withoutIndex.symbols).toEqual([]);
    expect(withoutIndex.text).toHaveLength(3);
  });
  it('treats the query literally unless regex is on, and honours match case', async () => {
    const project = { files: files() };
    const literal = await searchProject({ ...project, query: 'greet(x)' });
    expect(literal.text.map((t) => t.path)).toEqual(['docs/a.md']);
    const regex = await searchProject({ ...project, query: '^const', options: { regex: true } });
    expect(regex.text.map((t) => t.line)).toEqual([2]);
    const cased = await searchProject({
      ...project,
      query: 'Greet',
      options: { caseSensitive: true },
    });
    expect(cased.text.map((t) => t.line)).toEqual([2]);
  });
  it('reports an invalid regex instead of throwing', async () => {
    const results = await searchProject({ files: files(), query: '(', options: { regex: true } });
    expect(results.error).toMatch(/Invalid regular expression/);
    expect(results.text).toEqual([]);
  });
  it('stops at the result limit and says so', async () => {
    const results = await searchProject({ files: files(), query: 'e', limit: 2 });
    expect(results.text).toHaveLength(2);
    expect(results.truncated).toBe(true);
  });
});

describe('AI requests', () => {
  afterEach(() => vi.unstubAllGlobals());
  const ok = (body) => vi.fn(async () => ({ ok: true, json: async () => body }));

  it('requires an API key and a model before calling anything', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await expect(askAI({ provider: 'anthropic', model: 'm' }, [])).rejects.toThrow(/API key/);
    await expect(askAI({ provider: 'anthropic', apiKey: 'k' }, [])).rejects.toThrow(/model/);
    await expect(
      askAI({ provider: 'openaiCompatible', apiKey: 'k', model: 'm' }, []),
    ).rejects.toThrow(/endpoint/);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('sends Anthropic requests with the chosen model and the system prompt separated', async () => {
    const fetch = ok({ content: [{ type: 'text', text: 'hi' }] });
    vi.stubGlobal('fetch', fetch);
    const out = await askAI(
      { provider: 'anthropic', apiKey: 'k', model: ' claude-sonnet-5 ' },
      buildAIMessages('task', 'ctx'),
    );
    expect(out).toBe('hi');
    const [url, init] = fetch.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(init.headers['x-api-key']).toBe('k');
    expect(body.model).toBe('claude-sonnet-5');
    expect(body.system).toMatch(/RepoMind/);
    expect(body.messages.every((m) => m.role !== 'system')).toBe(true);
  });
  it('keeps the Gemini key out of the URL', async () => {
    const fetch = ok({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] });
    vi.stubGlobal('fetch', fetch);
    await askAI(
      { provider: 'gemini', apiKey: 'secret-key', model: 'gemini-x' },
      buildAIMessages('t'),
    );
    const [url, init] = fetch.mock.calls[0];
    expect(url).not.toContain('secret-key');
    expect(url).toMatch(/gemini-x:generateContent$/);
    expect(init.headers['x-goog-api-key']).toBe('secret-key');
  });
  it('surfaces provider error messages', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 401,
        json: async () => ({ error: { message: 'bad key' } }),
      })),
    );
    await expect(askAI({ provider: 'openai', apiKey: 'k', model: 'm' }, [])).rejects.toThrow(
      'bad key',
    );
  });
});
