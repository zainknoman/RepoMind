import { describe, expect, it } from 'vitest';
import { basicCandidate, gitignoreMatcher, looksLikeBasic, walk, sensitiveName } from './files';

describe('gitignoreMatcher', () => {
  const ignored = gitignoreMatcher(
    [
      '# comment',
      'node_modules/',
      '/build',
      '*.log',
      'docs/**/draft.md',
      'secret?.txt',
      '!keep.log',
    ].join('\n'),
  );
  it('ignores directories anywhere, including their contents', () => {
    expect(ignored('node_modules/react/index.js')).toBe(true);
    expect(ignored('packages/a/node_modules/x.js')).toBe(true);
  });
  it('anchors leading-slash rules to the root', () => {
    expect(ignored('build/app.js')).toBe(true);
    expect(ignored('src/build/app.js')).toBe(false);
  });
  it('matches wildcards without crossing directories', () => {
    expect(ignored('server.log')).toBe(true);
    expect(ignored('logs/today.log')).toBe(true);
    expect(ignored('server.log.txt')).toBe(false);
    expect(ignored('secret1.txt')).toBe(true);
    expect(ignored('secret12.txt')).toBe(false);
  });
  it('supports ** for any depth', () => {
    expect(ignored('docs/draft.md')).toBe(true);
    expect(ignored('docs/a/b/draft.md')).toBe(true);
    expect(ignored('src/docs/draft.md')).toBe(false);
  });
  it('keeps files that match nothing', () => {
    expect(ignored('src/index.js')).toBe(false);
  });
});

function dir(entries) {
  return {
    kind: 'directory',
    async *entries() {
      yield* Object.entries(entries);
    },
  };
}
const file = (size = 10) => ({ kind: 'file', getFile: async () => ({ size }) });

describe('walk', () => {
  it('lists nested files, skips ignored folders and marks sensitive names as non-text', async () => {
    const root = dir({
      'a.js': file(),
      '.env': file(),
      node_modules: dir({ 'x.js': file() }),
      src: dir({ 'b.ts': file(), 'big.json': file(3 * 1024 * 1024) }),
    });
    const files = await walk(root);
    expect(files.map((f) => f.path).sort()).toEqual(['.env', 'a.js', 'src/b.ts', 'src/big.json']);
    expect(files.find((f) => f.path === '.env').text).toBe(false);
    expect(files.find((f) => f.path === 'src/big.json').text).toBe(false);
    expect(files.find((f) => f.path === 'src/b.ts').text).toBe(true);
  });
  it('includes sensitive files as text when asked', async () => {
    const files = await walk(dir({ '.env': file() }), '', [], true);
    expect(files[0].text).toBe(true);
  });
  it('stops at the file limit and flags truncation', async () => {
    const files = await walk(
      dir({ 'a.js': file(), 'b.js': file(), 'c.js': file() }),
      '',
      [],
      false,
      2,
    );
    expect(files).toHaveLength(2);
    expect(files.truncated).toBe(true);
  });
  it('classifies .b files and extensionless BASIC routines as Temenos BASIC', async () => {
    const source = (text) => ({
      kind: 'file',
      getFile: async () => ({ size: text.length, slice: () => ({ text: async () => text }) }),
    });
    const files = await walk(
      dir({
        BP: dir({
          'ACCOUNT.VALIDATE': source('    SUBROUTINE ACCOUNT.VALIDATE\n    RETURN'),
          I_COMMON: source('    COMMON /GLOBAL/ X'),
          'RATES.b': source('CRT 1'),
        }),
        LICENSE: source('MIT License\nPermission is hereby granted'),
      }),
    );
    const byPath = Object.fromEntries(files.map((f) => [f.path, f]));
    expect(byPath['BP/ACCOUNT.VALIDATE']).toMatchObject({ ext: '.b', text: true });
    expect(byPath['BP/I_COMMON']).toMatchObject({ ext: '.b', text: true });
    expect(byPath['BP/RATES.b']).toMatchObject({ ext: '.b', text: true });
    expect(byPath.LICENSE.text).toBe(false);
  });
  it('recognises sensitive file names', () => {
    expect(sensitiveName.test('config/.env.production')).toBe(true);
    expect(sensitiveName.test('keys/id_rsa')).toBe(true);
    expect(sensitiveName.test('src/index.js')).toBe(false);
  });
});

describe('basicCandidate', () => {
  it.each([
    ['BP/ACCOUNT.VALIDATE', true],
    ['src/I_COMMON', true],
    ['BP/account.validate', true],
    ['T24.BP/acc.limit.check', true],
    ['BP.LOCAL/rates', true],
    ['local_bp/fmt.amount', true],
    ['src/readme', false],
    ['docs/notes', false],
    ['BP/logo.png', false],
    ['bpm/flow.chart', false],
  ])('%s → %s', (path, expected) => {
    expect(basicCandidate(path)).toBe(expected);
  });

  it('walk sniffs lower-case names only in BASIC source folders', async () => {
    const source = (text) => ({
      kind: 'file',
      getFile: async () => ({ size: text.length, slice: () => ({ text: async () => text }) }),
    });
    const files = await walk(
      dir({
        BP: dir({ 'account.validate': source('    SUBROUTINE account.validate\n    RETURN') }),
        docs: dir({ notes: source('    SUBROUTINE looks.like.basic\n') }),
      }),
    );
    const byPath = Object.fromEntries(files.map((f) => [f.path, f]));
    expect(byPath['BP/account.validate']).toMatchObject({ ext: '.b', text: true });
    expect(byPath['docs/notes'].text).toBe(false);
  });
});

describe('BASIC detection on real T24 names and sources', () => {
  it.each([
    ['ALL.OLD.R09/COB.IS.LD.ASSET.CLASS', true],
    ['ALL.OLD.R09/AB.TAX.A', true],
    ['ALL.OLD.R09/A.CTR.UPDATE_prev', true],
    ['ALL.OLD.R09/A.CTR.UPDATE_old_20160127', true],
    ['lib/Helper.class', false],
    ['out/native.so', false],
    ['ALL.OLD.R09/BD.Soc.component', false],
    ['ALL.OLD.R09/convertSEAT', false],
  ])('%s → %s', (path, expected) => {
    expect(basicCandidate(path)).toBe(expected);
  });

  it('recognises inserts with lower-case equates and unnamed common blocks', () => {
    expect(looksLikeBasic('* insert\n    EQU dasEbFileUploadEqStatus TO 1\n')).toBe(true);
    expect(looksLikeBasic('    COM TRACE.DATA.COMMON,TRACE.START.TIME\n')).toBe(true);
    expect(looksLikeBasic('A COMPANY OF HEROES\nCOM is short for commercial')).toBe(false);
  });
});
