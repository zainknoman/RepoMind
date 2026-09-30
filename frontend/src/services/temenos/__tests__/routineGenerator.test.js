import { describe, expect, it } from 'vitest';
import { getApplication, normalizeTableSpec, TABLE_SUFFIXES } from '../routineCatalog';
import { ROUTINE_SNIPPETS } from '../routineSnippets';
import { ROUTINE_TEMPLATES } from '../routineTemplates';
import {
  generateEvalQuery,
  generatePreset,
  generateRoutine,
  insertSnippet,
} from '../routineGenerator';

describe('Routine Creator Phase 1', () => {
  it('covers the application catalog and exact matching', () => {
    const names = [
      'ACCOUNT',
      'ACCOUNT.CLOSURE',
      'CUSTOMER',
      'DRAWINGS',
      'FOREX',
      'FUNDS.TRANSFER',
      'LD.LOANS.AND.DEPOSITS',
      'MG.MORTGAGE',
      'MM.MONEY.MARKET',
      'REPO',
      'SEC.TRADE',
      'STMT.ENTRY',
      'STMT.ENTRY.DETAIL',
      'STMT.PRINTED',
      'TELLER',
      'USER',
    ];
    names.forEach((name) => expect(getApplication(name)).toBeTruthy());
    expect(getApplication('ACCOUNTING')).toBeNull();
    expect(TABLE_SUFFIXES).toEqual(['', '$HIS', '$NAU']);
    expect(normalizeTableSpec('ACCOUNT$HIS').suffix).toBe('$HIS');
    expect(normalizeTableSpec('ACCOUNT$NAU').suffix).toBe('$NAU');
    expect(getApplication('ACCOUNT').recordVar).toBe('R.ACC');
    expect(getApplication('ACCOUNT').fileNameVariable).toBe('FN.ACC');
    expect(getApplication('ACCOUNT').fileVariable).toBe('F.ACC');
    expect(getApplication('CUSTOMER').fileNameVariable).toBe('FN.CUSTOMER');
    expect(getApplication('CUSTOMER').recordVar).toBe('R.CUS');
    expect(getApplication('CUSTOMER').recordVar).toBe('R.CUS');
    expect(getApplication('USER').recordVar).toBe('R.USR');
    expect(getApplication('LD.LOANS.AND.DEPOSITS').recordVar).toBe('R.LND');
  });

  it('reproduces the 14 useful legacy snippets without legacy UI code', () => {
    expect(ROUTINE_SNIPPETS.map((x) => x.id)).toEqual([
      'ReadSeq',
      'Readlist',
      'Fread',
      'Fwrite',
      'WriteFile',
      'Locate',
      'GetLocalRef',
      'FindStr',
      'CallCDD',
      'SubString',
      'Trim',
      'CallCDT',
      'Convert',
      'Change',
    ]);
    expect(ROUTINE_SNIPPETS.find((x) => x.id === 'Fread').content).toContain(
      'CALL F.READ(FN,Y.ID,REC,F,E)',
    );
    expect(ROUTINE_SNIPPETS.find((x) => x.id === 'Fwrite').content).toContain(
      'CALL F.WRITE(FN,Y.ID,REC)',
    );
  });

  it('uses the recovered four templates', () => {
    expect(ROUTINE_TEMPLATES).toHaveLength(4);
    expect(generatePreset('standard-routine', 'MY.ROUTINE')).toContain('SUBROUTINE MY.ROUTINE');
    expect(generatePreset('ofs-routine', 'MY.OFS')).toContain('OFS.POST.MESSAGE');
    expect(generatePreset('ofs-opm', 'MY.OPM')).toContain('CALL OFS.POST.MESSAGE');
    expect(generatePreset('fwrite-routine', 'MY.WRITE')).toContain('CALL F.WRITE');
  });

  it.each([
    [
      'A simple ACCOUNT',
      { tables: ['ACCOUNT'], fields: [{ name: 'AC.CUSTOMER', position: 1 }] },
      ['CALL OPF(FN.ACC,F.ACC)', 'Y.AC.CUSTOMER = R.ACC<1>'],
    ],
    [
      'B ACCOUNT + CUSTOMER$HIS',
      {
        tables: ['ACCOUNT', 'CUSTOMER$HIS'],
        fields: [{ name: 'EB.CUS.NAME.1', table: 'CUSTOMER', position: 2 }],
      },
      ['FN.CUSTOMER = "F.CUSTOMER$HIS"', 'Y.EB.CUS.NAME.1 = R.CUS<2>'],
    ],
    ['C $HIS', { tables: ['ACCOUNT$HIS'] }, ['FN.ACC = "F.ACCOUNT$HIS"', '$INSERT I_F.ACCOUNT']],
    ['D $NAU', { tables: ['ACCOUNT$NAU'] }, ['FN.ACC = "F.ACCOUNT$NAU"']],
    [
      'E multiple tables',
      { tables: ['ACCOUNT', 'CUSTOMER', 'FUNDS.TRANSFER'] },
      ['FN.ACC', 'FN.CUS', 'FN.FN'],
    ],
    [
      'F Fread expansion',
      { tables: ['ACCOUNT'], functions: ['Fread'] },
      ['CALL F.READ(FN.ACC,Y.ACC.ID,R.ACC,F.ACC,E.ACC)'],
    ],
    [
      'G Fwrite expansion',
      { tables: ['ACCOUNT'], functions: ['Fwrite'] },
      ['CALL F.WRITE(FN.ACC,Y.ACC.ID,R.ACC)', 'CALL JOURNAL.UPDATE(Y.ACC.ID)'],
    ],
    [
      'H field extraction',
      { tables: ['CUSTOMER'], fields: [{ name: 'EB.CUS.NAME.1', position: 2 }] },
      ['Y.EB.CUS.NAME.1 = R.CUS<2>'],
    ],
    [
      'I concatenation',
      {
        tables: ['ACCOUNT'],
        fields: [
          { name: 'AC.CUSTOMER', position: 1 },
          { name: 'AC.CATEGORY', position: 2 },
        ],
        concat: true,
        separator: '^',
      },
      ["MY.DATA<-1> = Y.AC.CUSTOMER : '^' : Y.AC.CATEGORY"],
    ],
    [
      'J header generation',
      { routineName: 'HEADER', developer: 'Zain', purpose: 'Purpose' },
      ['SUBROUTINE HEADER', 'Developed By          : Zain', 'Purpose               : Purpose'],
    ],
    [
      'N LD.LOANS.AND.DEPOSITS',
      { tables: ['LD.LOANS.AND.DEPOSITS'], fields: [{ name: 'LD.CUSTOMER.ID', position: 1 }] },
      ['Y.LD.CUSTOMER.ID = R.LND<1>'],
    ],
    [
      'O USER',
      { tables: ['USER'], fields: [{ name: 'EB.USE.SIGN.ON.NAME', position: 1 }] },
      ['Y.EB.USE.SIGN.ON.NAME = R.USR<1>'],
    ],
    [
      'P ACCOUNT.CLOSURE',
      { tables: ['ACCOUNT.CLOSURE'], fields: [{ name: 'AC.ACL.STATUS', position: 1 }] },
      ['Y.AC.ACL.STATUS = R.ACL<1>'],
    ],
    [
      'Q STMT.ENTRY.DETAIL',
      { tables: ['STMT.ENTRY.DETAIL'] },
      ['FN.ST.DT = "F.STMT.ENTRY.DETAIL"'],
    ],
    ['R no-table/no-field', {}, ['* No application tables selected', '* No fields selected']],
  ])('%s', (_name, spec, expected) => {
    const out = generateRoutine(spec);
    expected.forEach((fragment) => expect(out).toContain(fragment));
  });

  it('does not generate unverified field access or implicit field clearing', () => {
    const out = generateRoutine({ tables: ['ACCOUNT'], fields: [{ name: 'AC.CUSTOMER' }] });
    expect(out).toContain(
      '* Field position not verified: AC.CUSTOMER. Verify the application schema before generating field access.',
    );
    expect(out).not.toContain('R.ACC<AC.CUSTOMER>');
    expect(out).not.toContain("Y.AC.CUSTOMER = ''");

    const cleared = generateRoutine({
      tables: ['ACCOUNT'],
      fields: [{ name: 'AC.CUSTOMER', position: 1 }],
      clearFields: true,
    });
    expect(cleared).toContain("Y.AC.CUSTOMER = ''");
  });

  it('handles duplicate tables and duplicate fields deterministically', () => {
    const out = generateRoutine({
      tables: ['ACCOUNT', 'ACCOUNT', 'ACCOUNT$HIS'],
      fields: [
        { name: 'AC.CUSTOMER', position: 1 },
        { name: 'AC.CUSTOMER', position: 1 },
      ],
    });
    expect((out.match(/FN\.ACC =/g) || []).length).toBe(2);
    expect((out.match(/Y\.AC\.CUSTOMER =/g) || []).length).toBe(1);
  });

  it('K safe snippet insertion', () => {
    const result = insertSnippet('AB', 1, 'Trim');
    expect(result.inserted).toBe(true);
    expect(result.text).toContain('AB'.slice(0, 1));
    expect(insertSnippet('AB', -1, 'Trim').text).toBe('AB');
    expect(insertSnippet('AB', 99, 'Trim').text).toBe('AB');
  });

  it('L EVAL query and USER prefix handling', () => {
    expect(generateEvalQuery('ACCOUNT', ['AC.CUSTOMER', 'AC.CURRENCY'], '^')).toBe(
      'SELECT FBNK.ACCOUNT SAVING EVAL "CUSTOMER":"^":"CURRENCY"',
    );
    expect(generateEvalQuery('USER', ['EB.USE.SIGN.ON.NAME'], '|')).toBe(
      'SELECT FBNK.USER SAVING EVAL "SIGN.ON.NAME"',
    );
    expect(generateEvalQuery('ACCOUNT.CLOSURE', ['AC.ACL.STATUS'])).toBe(
      'SELECT FBNK.ACCOUNT.CLOSURE SAVING EVAL "STATUS"',
    );
    expect(generateEvalQuery('ACCOUNT', ['AC.ACL.STATUS'])).toBe(
      'SELECT FBNK.ACCOUNT SAVING EVAL "AC.ACL.STATUS"',
    );
  });

  it('golden structure preserves the requested generation order', () => {
    const out = generateRoutine({
      routineName: 'ACCOUNT.CUSTOMER.EXTRACT',
      developer: 'Zain',
      purpose: 'Extract',
      tables: ['ACCOUNT', 'CUSTOMER$HIS'],
      fields: [
        { name: 'AC.CUSTOMER', table: 'ACCOUNT', position: 1 },
        { name: 'EB.CUS.NAME.1', table: 'CUSTOMER', position: 2 },
      ],
      functions: ['Fread'],
      concat: true,
      separator: '^',
    });
    expect(out.indexOf('$INSERT I_COMMON')).toBeLessThan(out.indexOf('GOSUB INIT'));
    expect(out.indexOf('GOSUB INIT')).toBeLessThan(out.indexOf('INIT:'));
    expect(out.indexOf('INIT:')).toBeLessThan(out.indexOf('PROCESS:'));
    expect(out.indexOf('PROCESS:')).toBeLessThan(out.indexOf('Y.AC.CUSTOMER = R.ACC<1>'));
    expect(out).toContain("MY.DATA<-1> = Y.AC.CUSTOMER : '^' : Y.EB.CUS.NAME.1");
    expect(out.endsWith('\nEND')).toBe(true);
  });
});
