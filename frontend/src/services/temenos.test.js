import { describe, expect, it } from 'vitest';
import { attachFileHandles, buildRepositoryIndex, findDependents } from './repository';
import { toWorkerProject } from './indexProject';
import { listAnalyzers, runAnalyzers } from './analyzers';
import { parseBasic } from './temenosBasic';
import { hasTemenos, TEMENOS_ANALYZERS } from './temenos';
import { looksLikeBasic, maybeBasicName } from '../lib/files';

const TEMENOS_IDS = TEMENOS_ANALYZERS.map((a) => a.id);

// Extensionless routines are classified as '.b' by the folder walk; the fixtures do the same.
async function indexOf(sources) {
  const project = toWorkerProject(
    'temenos',
    Object.entries(sources).map(([path, content]) => {
      const name = path.split('/').pop();
      const ext = name.endsWith('.java') ? '.java' : '.b';
      return { path, name, ext, content };
    }),
  );
  return attachFileHandles(await buildRepositoryIndex(project), project);
}

const REPO = {
  'BP/ACCOUNT.VALIDATE': [
    '* Validation routine for ACCOUNT',
    '    SUBROUTINE ACCOUNT.VALIDATE',
    '    $INSERT I_COMMON',
    '    $INSERT I_EQUATE',
    '    $INSERT I_F.ACCOUNT',
    '    DEFFUN FMT.AMOUNT(AMT)',
    '    GOSUB INITIALISE',
    '    GOSUB PROCESS',
    '    RETURN',
    'INITIALISE:',
    "    FN.ACC = 'F.ACCOUNT' ; * account file",
    "    F.ACC = ''",
    '    CALL OPF(FN.ACC, F.ACC)',
    '    RETURN',
    'PROCESS:',
    '    CALL F.READ(FN.ACC, ID.NEW, R.ACC, F.ACC, ERR)',
    '    CALL ACC.LIMIT.CHECK(R.ACC)',
    '    CALL @DYN.RTN',
    '    X = FMT.AMOUNT(R.ACC<1>)',
    '    * CALL COMMENTED.OUT',
    '    CRT "CALL NOT.A.CALL"',
    '    CALLJ "com.acme.rates.RateService", "convert", R.ACC SETTING RES',
    '    WRITE R.ACC ON F.ACC, ID.NEW',
    '    RETURN',
    'END',
  ].join('\r\n'),
  'BP/ACC.LIMIT.CHECK.b': [
    '    SUBROUTINE ACC.LIMIT.CHECK(R.ACC)',
    '    $INSERT I_COMMON',
    '    CALL EB.GET.LIMIT(R.ACC)',
    '    R.LIM = AC.AccountOpening.Account.Read(ID, ERR)',
    '    FT.Contract.FundsTransfer.Write(ID, R.FT)',
    '    IF R.ACC THEN GOTO DONE',
    'DONE:',
    '    STOP',
    '    RETURN',
  ].join('\n'),
  'BP/I_COMMON': ['    COMMON /GLOBAL/ ID.NEW, R.NEW', '    EQU TRUE TO 1'].join('\n'),
  'BP/FMT.AMOUNT': ['    FUNCTION FMT.AMOUNT(AMT)', '    RETURN(AMT)'].join('\n'),
  'BP/AC.INTEREST.JOB': ['    SUBROUTINE AC.INTEREST.JOB(ID)', '    RETURN'].join('\n'),
  'BP/AC.INTEREST.JOB.LOAD': ['    SUBROUTINE AC.INTEREST.JOB.LOAD', '    RETURN'].join('\n'),
  'BP/AC.INTEREST.JOB.SELECT': [
    '    SUBROUTINE AC.INTEREST.JOB.SELECT',
    '    CALL BATCH.BUILD.LIST("", SEL.LIST)',
    '    RETURN',
  ].join('\n'),
  'java/src/main/java/com/acme/rates/RateService.java': [
    'package com.acme.rates;',
    'import com.temenos.t24.api.hook.system.RecordLifecycle;',
    'public class RateService extends RecordLifecycle {',
    '  public String convert(String x) { return x; }',
    '}',
  ].join('\n'),
};

describe('BASIC source detection', () => {
  it('considers upper-case, extensionless names and recognises BASIC by its content', () => {
    expect(maybeBasicName('ACCOUNT.VALIDATE')).toBe(true);
    expect(maybeBasicName('I_F.ACCOUNT')).toBe(true);
    expect(maybeBasicName('readme')).toBe(false);
    expect(maybeBasicName('LOGO.PNG')).toBe(false);
    expect(looksLikeBasic('* comment\n\tSUBROUTINE ACCOUNT.VALIDATE\n')).toBe(true);
    expect(looksLikeBasic('    COMMON /GLOBAL/ X')).toBe(true);
    expect(looksLikeBasic('$PACKAGE AC.ModelBank\n')).toBe(true);
    expect(looksLikeBasic('MIT License\n\nThis program is free software.\nPROGRAM is fine')).toBe(
      false,
    );
  });
});

describe('parseBasic', () => {
  const parsed = parseBasic(
    { path: 'BP/ACCOUNT.VALIDATE', name: 'ACCOUNT.VALIDATE' },
    REPO['BP/ACCOUNT.VALIDATE'],
  );

  it('records the routine, its local labels and its inserts and calls', () => {
    expect(parsed.symbols[0]).toMatchObject({
      name: 'ACCOUNT.VALIDATE',
      kind: 'subroutine',
      line: 2,
    });
    const labels = parsed.symbols.filter((s) => s.kind === 'label').map((s) => s.name);
    expect(labels).toEqual(['INITIALISE', 'PROCESS']);
    expect(parsed.imports.map((i) => [i.kind, i.module])).toEqual([
      ['insert', 'I_COMMON'],
      ['insert', 'I_EQUATE'],
      ['insert', 'I_F.ACCOUNT'],
      ['call', 'FMT.AMOUNT'],
      ['call', 'OPF'],
      ['call', 'F.READ'],
      ['call', 'ACC.LIMIT.CHECK'],
      ['callj', 'com.acme.rates.RateService'],
    ]);
    expect(parsed.exports).toEqual([expect.objectContaining({ name: 'ACCOUNT.VALIDATE' })]);
  });

  it('ignores comments and strings, and counts dynamic calls', () => {
    const names = parsed.imports.map((i) => i.module);
    expect(names).not.toContain('COMMENTED.OUT');
    expect(names).not.toContain('NOT.A.CALL');
    expect(parsed.temenos.dynamicCalls).toBe(1);
  });

  it('references labels from GOSUB and DEFFUN functions where they are called', () => {
    const refs = parsed.references.map((r) => `${r.kind}:${r.name}:${r.line}`);
    expect(refs).toEqual(
      expect.arrayContaining([
        'label:INITIALISE:7',
        'label:PROCESS:8',
        'call:ACC.LIMIT.CHECK:17',
        'call:FMT.AMOUNT:19',
      ]),
    );
    const source = REPO['BP/ACCOUNT.VALIDATE'];
    const gosub = parsed.references.find((r) => r.name === 'PROCESS');
    expect(source.slice(gosub.offset, gosub.offset + 7)).toBe('PROCESS');
  });

  it('finds the applications a routine reads, writes or uses the layout of', () => {
    expect(parsed.temenos.applications.map((a) => `${a.name}:${a.access}`)).toEqual([
      'ACCOUNT:layout',
      'ACCOUNT:read',
      'ACCOUNT:write',
    ]);
    expect(parsed.temenos.javaCalls).toEqual([
      { className: 'com.acme.rates.RateService', method: 'convert', line: 22 },
    ]);
  });

  it('names inserts and header-less programs after the file', () => {
    expect(parseBasic({ path: 'BP/I_COMMON', name: 'I_COMMON' }, 'COM /X/ A').temenos.type).toBe(
      'insert',
    );
    const program = parseBasic({ path: 'BP/RUN.ME.b', name: 'RUN.ME.b' }, 'CRT "hi"');
    expect(program.symbols[0]).toMatchObject({ name: 'RUN.ME', kind: 'program' });
  });
});

describe('Temenos linking in the code index', () => {
  it('links CALL, $INSERT and CALLJ by name so impact and dependencies work', async () => {
    const index = await indexOf(REPO);
    expect(index.languages['Temenos BASIC']).toBe(7);
    expect(index.project.frameworks.map((f) => f.name)).toContain('Temenos T24 / Transact');
    expect(findDependents(index, 'BP/ACC.LIMIT.CHECK.b')).toEqual(['BP/ACCOUNT.VALIDATE']);
    expect(findDependents(index, 'BP/I_COMMON').sort()).toEqual([
      'BP/ACC.LIMIT.CHECK.b',
      'BP/ACCOUNT.VALIDATE',
    ]);
    expect(findDependents(index, 'java/src/main/java/com/acme/rates/RateService.java')).toEqual([
      'BP/ACCOUNT.VALIDATE',
    ]);
    // Core routines are external dependencies, not unresolved references.
    expect(index.externalDependencies.map((e) => e.module)).toEqual(
      expect.arrayContaining(['F.READ', 'OPF', 'EB.GET.LIMIT', 'I_EQUATE']),
    );
    expect(index.references.some((r) => r.name === 'F.READ')).toBe(false);
    expect(index.unresolvedImports).toEqual([]);

    const check = index.symbols.find(
      (s) => s.name === 'ACC.LIMIT.CHECK' && s.kind === 'subroutine',
    );
    expect(check.references.map((r) => r.from)).toEqual(['BP/ACCOUNT.VALIDATE']);
    expect(check.importedBy.map((b) => b.from)).toEqual(['BP/ACCOUNT.VALIDATE']);
    // Labels stay local: PROCESS in one routine does not resolve in another.
    const label = index.symbols.find((s) => s.name === 'PROCESS');
    expect(label.references.every((r) => r.from === 'BP/ACCOUNT.VALIDATE')).toBe(true);
  });
});

describe('Temenos analyzers', () => {
  it('are offered only for indexes with BASIC sources', async () => {
    const index = await indexOf(REPO);
    expect(hasTemenos(index)).toBe(true);
    expect(listAnalyzers(index).map((a) => a.id)).toEqual(expect.arrayContaining(TEMENOS_IDS));
    const plain = { files: [{ path: 'a.js' }] };
    expect(listAnalyzers(plain).map((a) => a.id)).not.toContain('temenos-routines');
  });

  it('report routines, applications, services, core calls, Java links and practices', async () => {
    const index = await indexOf(REPO);
    const results = await runAnalyzers(index, TEMENOS_IDS);
    for (const id of TEMENOS_IDS) expect(results[id].error).toBeUndefined();

    const routines = results['temenos-routines'].findings;
    expect(routines.find((f) => f.routine === 'ACC.LIMIT.CHECK')).toMatchObject({
      calls: '0 in repository · 1 core/external',
      callers: 'ACCOUNT.VALIDATE',
    });

    const apps = Object.fromEntries(
      results['temenos-applications'].findings.map((f) => [f.application, f]),
    );
    expect(apps.ACCOUNT).toMatchObject({
      writers: 'ACCOUNT.VALIDATE',
      readers: expect.any(String),
    });
    expect(apps.ACCOUNT.readers.split(', ').sort()).toEqual([
      'ACC.LIMIT.CHECK',
      'ACCOUNT.VALIDATE',
    ]);
    expect(apps['FUNDS.TRANSFER'].writers).toBe('ACC.LIMIT.CHECK');

    expect(results['temenos-services'].findings).toEqual([
      expect.objectContaining({
        service: 'AC.INTEREST.JOB',
        missing: 'I_AC.INTEREST.JOB.COMMON',
        severity: 'low',
      }),
    ]);

    const core = results['temenos-calls'].findings.map((f) => f.routine);
    expect(core).toEqual(expect.arrayContaining(['F.READ', 'OPF', 'BATCH.BUILD.LIST']));
    expect(core).not.toContain('ACC.LIMIT.CHECK');

    const java = results['temenos-java'].findings;
    expect(java).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ link: 'CALLJ', severity: 'info', method: 'convert' }),
        expect.objectContaining({
          link: 'Java extension',
          className: 'RateService',
          method: 'RecordLifecycle',
          routines: 'ACCOUNT.VALIDATE',
        }),
      ]),
    );

    const practices = results['temenos-practices'].findings.map((f) => `${f.file}:${f.line}`);
    expect(practices).toEqual(
      expect.arrayContaining([
        'BP/ACCOUNT.VALIDATE:21', // CRT
        'BP/ACCOUNT.VALIDATE:23', // direct WRITE
        'BP/ACC.LIMIT.CHECK.b:6', // GOTO
        'BP/ACC.LIMIT.CHECK.b:8', // STOP in a subroutine
      ]),
    );
  });
});
