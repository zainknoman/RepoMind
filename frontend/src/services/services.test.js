import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  attachFileHandles,
  buildRepositoryIndex,
  detectCycles,
  findDependents,
} from './repository';
import { discoverApis, redactSecret, scanSecurity, searchCode } from './intelligence';
import { toWorkerProject } from './indexProject';
import { askAI, buildAIMessages } from './ai';

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

describe('intelligence', () => {
  it('discovers Express routes', async () => {
    const routes = await discoverApis(await indexFixture());
    expect(routes).toEqual(expect.arrayContaining([expect.objectContaining({ path: '/health' })]));
  });
  it('finds secrets without repeating them', async () => {
    const findings = await scanSecurity(await indexFixture());
    const hit = findings.find((f) => f.path === 'src/config.js');
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
  it('reports an invalid regex instead of throwing', async () => {
    const results = await searchCode(await indexFixture(), '(', { regex: true });
    expect(results[0]).toMatchObject({ type: 'error' });
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
