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

  it('adds graph neighbours of the best matches, below the files that match', async () => {
    const index = await fixture({
      ...SOURCES,
      'src/routes/session.js':
        "import { loginUser } from '../auth/login';\nexport function start() {\n  return loginUser('a', 'b');\n}\n",
    });
    const ranked = rankFilesForQuestion(index, 'How does loginUser work?');
    expect(ranked[0].path).toBe('src/auth/login.js');
    const session = ranked.find((x) => x.path === 'src/routes/session.js');
    expect(session.reasons).toEqual(
      expect.arrayContaining(['uses loginUser', 'imports src/auth/login.js']),
    );
    const crypto = ranked.find((x) => x.path === 'src/util/crypto.js');
    expect(crypto.reasons).toContain('imported by src/auth/login.js');
    expect(session.score).toBeLessThan(ranked[0].score);
  });

  const basic = (name, body) => ['    SUBROUTINE ' + name, ...body, '    RETURN'].join('\n');
  const t24Index = (sources) =>
    buildRepositoryIndex(
      toWorkerProject(
        't24',
        Object.entries(sources).map(([path, content]) => ({
          path,
          name: path.split('/').pop(),
          ext: '.b',
          content,
        })),
      ),
    );
  const T24_SOURCES = {
    'BP/ACCOUNT.VALIDATE.b': basic('ACCOUNT.VALIDATE', ['    CALL ACCOUNT.VALIDATE.CHARGES']),
    'BP/ACCOUNT.VALIDATE.CHARGES.b': basic('ACCOUNT.VALIDATE.CHARGES', ['    X = 1']),
    'BP/CUSTOMER.UPDATE.b': basic('CUSTOMER.UPDATE', [
      "    FN.CUS = 'F.CUSTOMER'",
      "    F.CUS = ''",
      '    CALL OPF(FN.CUS, F.CUS)',
      '    WRITE R.CUS ON F.CUS, ID',
    ]),
  };

  it('ranks T24 routines by routine and application names', async () => {
    const index = await t24Index(T24_SOURCES);
    const routine = rankFilesForQuestion(index, 'What does ACCOUNT.VALIDATE do?');
    expect(routine[0]).toMatchObject({ path: 'BP/ACCOUNT.VALIDATE.b' });
    expect(routine[0].reasons).toContain('routine ACCOUNT.VALIDATE');
    expect(routine[0].reasons).not.toContain('close to ACCOUNT.VALIDATE');
    const writers = rankFilesForQuestion(index, 'Which routines write CUSTOMER records?');
    expect(writers[0]).toMatchObject({ path: 'BP/CUSTOMER.UPDATE.b' });
    expect(writers[0].reasons).toContain('writes CUSTOMER');
  });

  it('ranks T24 names written in lower case or with a typo, below exact matches', async () => {
    const index = await t24Index(T24_SOURCES);
    const exact = rankFilesForQuestion(index, 'What does ACCOUNT.VALIDATE do?')[0];
    const typo = rankFilesForQuestion(index, 'What does account.validte do?')[0];
    expect(typo).toMatchObject({ path: 'BP/ACCOUNT.VALIDATE.b' });
    expect(typo.reasons).toContain('close to ACCOUNT.VALIDATE');
    expect(typo.score).toBeLessThan(exact.score);

    const words = rankFilesForQuestion(index, 'Where is account validate charges used?');
    const charges = words.find((x) => x.path === 'BP/ACCOUNT.VALIDATE.CHARGES.b');
    expect(charges.reasons).toContain('close to ACCOUNT.VALIDATE.CHARGES');
  });

  it('does not guess between equally close T24 names', async () => {
    const index = await t24Index({
      'BP/ACCOUNT.VALIDATE.A.b': basic('ACCOUNT.VALIDATE.A', ['    X = 1']),
      'BP/ACCOUNT.VALIDATE.B.b': basic('ACCOUNT.VALIDATE.B', ['    X = 1']),
    });
    const ranked = rankFilesForQuestion(index, 'What does account.validate.c do?');
    expect(ranked.flatMap((x) => x.reasons).filter((r) => r.startsWith('close to'))).toEqual([]);
  });

  it('falls back to the most coupled files when the question has no usable terms', async () => {
    const index = await fixture();
    const ranked = rankFilesForQuestion(index, 'what?', { limit: 2 });
    expect(ranked).toHaveLength(2);
    expect(ranked[0].reasons).toEqual(['dependency hotspot']);
  });
});

describe('grounded context', () => {
  it('lists analysis coverage gaps in the overview', async () => {
    const index = await fixture({ 'cmd/main.go': 'package main\n\nfunc main() {}\n' });
    const context = await buildGroundedContext(index, { files: ['cmd/main.go'] });
    expect(context.content).toContain('- Analysis coverage gaps:');
    expect(context.content).toContain('Go: Symbols only');
    const clean = await buildGroundedContext(await fixture(), { files: ['src/config.js'] });
    expect(clean.content).not.toContain('Analysis coverage gaps');
  });

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
