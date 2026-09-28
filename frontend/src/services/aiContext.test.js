import { afterEach, describe, expect, it } from 'vitest';
import { attachFileHandles, buildRepositoryIndex } from './repository';
import { toWorkerProject } from './indexProject';
import {
  buildGroundedContext,
  exportablePrompt,
  formatPrompt,
  identifierParts,
  questionTerms,
  rankFilesForQuestion,
  verifyCitations,
} from './aiContext';
import { runAnalyzers } from './analyzers';
import { readSavedContexts, saveContextRecipe, deleteSavedContext } from './savedContexts';

const SOURCES = {
  'src/auth/login.js':
    "import { hashPassword } from '../util/crypto';\n" +
    'export function loginUser(name, password) {\n' +
    '  return hashPassword(password);\n' +
    '}\n',
  'src/util/crypto.js':
    'export function hashPassword(value) {\n  return value.split("").reverse().join("");\n}\n',
  'src/orders/cart.js': 'export function addToCart(item) {\n  return [item];\n}\n',
  'src/config.js': 'export const settings = {\n  api_key: "abcd1234efgh5678ijkl",\n};\n',
};

async function fixture(sources = SOURCES) {
  const project = toWorkerProject(
    'shop',
    Object.entries(sources).map(([path, content]) => ({
      path,
      name: path.split('/').pop(),
      ext: '.' + path.split('.').pop(),
      content,
    })),
  );
  return attachFileHandles(await buildRepositoryIndex(project), project);
}

describe('question terms and ranking', () => {
  it('splits identifiers and drops common words', () => {
    expect(identifierParts('getHTTPResponse_code')).toEqual(['get', 'http', 'response', 'code']);
    expect(questionTerms('How does loginUser hash the password?')).toEqual([
      'loginuser',
      'login',
      'user',
      'hash',
      'password',
    ]);
  });

  it('ranks files that define or name what the question asks about first', async () => {
    const index = await fixture();
    const ranked = rankFilesForQuestion(index, 'How does loginUser hash the password?');
    expect(ranked[0]).toMatchObject({ path: 'src/auth/login.js' });
    expect(ranked[0].reasons).toContain('defines loginUser');
    expect(ranked.map((x) => x.path)).toContain('src/util/crypto.js');
    expect(ranked.map((x) => x.path)).not.toContain('src/orders/cart.js');
    const named = rankFilesForQuestion(index, 'What is in cart.js?');
    expect(named[0]).toMatchObject({
      path: 'src/orders/cart.js',
      reasons: expect.arrayContaining(['named in the question']),
    });
  });

  it('falls back to the most coupled files when the question has no usable terms', async () => {
    const index = await fixture();
    const ranked = rankFilesForQuestion(index, 'what?', { limit: 2 });
    expect(ranked).toHaveLength(2);
    expect(ranked[0].reasons).toEqual(['dependency hotspot']);
  });
});

describe('grounded context', () => {
  it('has an overview, a repository map, findings and numbered, redacted source', async () => {
    const index = await fixture();
    const findings = await runAnalyzers(index, ['security']);
    const context = await buildGroundedContext(index, {
      files: [{ path: 'src/auth/login.js', reason: 'defines loginUser' }, 'src/config.js'],
      includeDependencies: true,
      findings,
      projectName: 'shop',
    });
    const text = context.content;
    expect(text).toMatch(/^# Repository: shop/);
    expect(text).toContain('## Repository map');
    expect(text).toContain('- src/orders/cart.js — addToCart');
    expect(text).toContain('## Analyzer findings');
    expect(text).toContain('- Secret Scan: 1 finding');
    expect(text).toContain('### src/auth/login.js\nReason: defines loginUser');
    expect(text).toContain('2| export function loginUser(name, password) {');
    expect(text).toContain('Reason: imported by src/auth/login.js');
    expect(text).not.toContain('abcd1234efgh5678ijkl');
    expect(text).toContain('api_key: "abcd••••"');
    expect(context.redactions).toBe(1);
    expect(context.requested).toEqual(['src/auth/login.js', 'src/config.js']);
    expect(context.files.map((f) => f.path)).toEqual([
      'src/auth/login.js',
      'src/config.js',
      'src/util/crypto.js',
    ]);
  });

  it('truncates or leaves out files that do not fit the budget', async () => {
    const long = Array.from({ length: 400 }, (_, i) => `const line${i} = ${i};`).join('\n');
    const index = await fixture({ 'src/big.js': long, 'src/small.js': 'export const s = 1;\n' });
    const context = await buildGroundedContext(index, {
      files: ['src/big.js', 'src/small.js'],
      budget: 1200,
      repoMap: false,
    });
    const big = context.files.find((f) => f.path === 'src/big.js');
    expect(big.truncated).toBe(true);
    expect(big.shownLines).toBeLessThan(400);
    expect(context.content).toContain(`lines 1–${big.shownLines} of 400 (truncated)`);
    expect(context.tokens).toBeLessThanOrEqual(1200);

    const tiny = await buildGroundedContext(index, { files: ['src/big.js'], budget: 200 });
    expect(tiny.files).toEqual([]);
    expect(tiny.omitted.map((x) => x.path)).toEqual(['src/big.js']);
    expect(tiny.content).toContain('## Not included (token budget)\n\n- src/big.js');
  });

  it('carries the task in the prompt and the rules in an exported prompt', () => {
    const prompt = formatPrompt('Why?', 'CTX');
    expect(prompt).toBe('# RepoMind Task\n\nWhy?\n\nCTX');
    expect(exportablePrompt(prompt)).toMatch(/^# Instructions\n\nYou are RepoMind.*path:line/s);
  });
});

describe('citation check', () => {
  it('classifies each cited file and line against the index and the context sent', async () => {
    const index = await fixture();
    const sent = [{ path: 'src/auth/login.js', shownLines: 4 }];
    const answer = [
      'The login flow starts at src/auth/login.js:2-3 and hashes in `crypto.js:1`.',
      'See also src/auth/login.js:99, src/missing.js:4 and ./src/auth/login.js:2-3 again.',
      'Built with Node.js, e.g. for tests.',
    ].join('\n');
    const { citations, counts } = verifyCitations(answer, index, sent);
    expect(citations.map((c) => [c.text, c.path, c.status])).toEqual([
      ['src/auth/login.js:2-3', 'src/auth/login.js', 'verified'],
      ['crypto.js:1', 'src/util/crypto.js', 'outside-context'],
      ['src/auth/login.js:99', 'src/auth/login.js', 'bad-line'],
      ['src/missing.js:4', 'src/missing.js', 'unknown-file'],
    ]);
    expect(counts).toEqual({
      verified: 1,
      'outside-context': 1,
      'bad-line': 1,
      'unknown-file': 1,
    });
  });
});

describe('saved contexts', () => {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
  afterEach(() => store.clear());

  it('stores recipes, never source, and strips source from old entries', () => {
    store.set(
      'repomind.savedContexts',
      JSON.stringify([{ id: 'old', name: 'Old', content: 'SECRET SOURCE', files: 3 }]),
    );
    const list = readSavedContexts();
    expect(list).toEqual([
      { id: 'old', name: 'Old', files: 3, legacy: true, paths: [], fileCount: 3 },
    ]);
    expect(store.get('repomind.savedContexts')).not.toContain('SECRET SOURCE');

    const next = saveContextRecipe(list, {
      name: 'Login',
      repository: 'shop',
      task: 'Explain login',
      paths: ['src/auth/login.js'],
      options: { budget: 8000 },
      tokens: 120,
      fileCount: 2,
    });
    expect(next[0]).toMatchObject({
      name: 'Login',
      paths: ['src/auth/login.js'],
      options: { budget: 8000 },
    });
    expect(next[0]).not.toHaveProperty('content');
    expect(JSON.parse(store.get('repomind.savedContexts'))).toHaveLength(2);
    expect(deleteSavedContext(next, 'old').map((x) => x.name)).toEqual(['Login']);
  });
});
