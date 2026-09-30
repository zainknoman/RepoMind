import { describe, expect, it } from 'vitest';
import { getApplication, TABLE_SUFFIXES } from '../routineCatalog';
import { ROUTINE_SNIPPETS } from '../routineSnippets';
import { ROUTINE_TEMPLATES } from '../routineTemplates';
import { generateEvalQuery, generatePreset, generateRoutine, insertSnippet } from '../routineGenerator';

describe('Routine Creator Phase 1', () => {
  it('catalog exact matching and suffixes', () => {
    for (const name of ['ACCOUNT','ACCOUNT.CLOSURE','CUSTOMER','DRAWINGS','FOREX','FUNDS.TRANSFER','LD.LOANS.AND.DEPOSITS','MG.MORTGAGE','MM.MONEY.MARKET','REPO','SEC.TRADE','STMT.ENTRY','STMT.ENTRY.DETAIL','STMT.PRINTED','TELLER','USER']) expect(getApplication(name)).toBeTruthy();
    expect(getApplication('ACCOUNTING')).toBeNull();
    expect(TABLE_SUFFIXES).toEqual(['','$HIS','$NAU']);
    expect(getApplication('USER').recordVar).toBe('R.USER');
    expect(getApplication('LD.LOANS.AND.DEPOSITS').recordVar).toBe('R.LD');
  });
  it('contains all 14 snippets and four templates', () => {
    expect(ROUTINE_SNIPPETS).toHaveLength(14);
    expect(ROUTINE_SNIPPETS.map(x => x.id)).toEqual(['ReadSeq','Readlist','Fread','Fwrite','WriteFile','Locate','GetLocalRef','FindStr','CallCDD','CallCDT','SubString','Trim','Convert','Change']);
    expect(ROUTINE_TEMPLATES).toHaveLength(4);
    expect(generatePreset('standard-routine','MY.ROUTINE')).toContain('SUBROUTINE MY.ROUTINE');
  });
  const cases = [
    ['A simple ACCOUNT',{tables:['ACCOUNT'],fields:[{name:'CUSTOMER',position:1}]},['CALL F.READ(FN.AC, ID.NEW, R.AC, F.AC, ERR)','CUSTOMER = R.AC<1>']],
    ['B ACCOUNT + CUSTOMER$HIS',{tables:['ACCOUNT','CUSTOMER$HIS'],fields:[{name:'NAME',table:'CUSTOMER',position:2}]},["FN.CUSTOMER = 'F.CUSTOMER$HIS'",'NAME = R.CUSTOMER<2>']],
    ['C $HIS',{tables:['ACCOUNT$HIS']},['F.ACCOUNT$HIS']],['D $NAU',{tables:['ACCOUNT$NAU']},['F.ACCOUNT$NAU']],
    ['E multiple tables',{tables:['ACCOUNT','CUSTOMER','FUNDS.TRANSFER']},['R.AC','R.CUSTOMER','R.FT']],
    ['F Fread',{tables:['ACCOUNT'],functions:['Fread']},['CALL F.READ(FN.FILE, ID, R.FILE, F.FILE, ERR)']],
    ['G Fwrite',{tables:['ACCOUNT'],functions:['Fwrite']},['CALL F.WRITE(FN.FILE, ID, R.FILE, F.FILE)']],
    ['H field extraction',{tables:['CUSTOMER'],fields:[{name:'NAME',position:2}]},['NAME = R.CUSTOMER<2>']],
    ['I concatenation',{tables:['ACCOUNT'],fields:[{name:'A',position:1},{name:'B',position:2}],concat:true,separator:'^'},["CONCAT.VALUE = A : '^' : B"]],
    ['J header',{routineName:'HEADER',developer:'Zain',purpose:'Purpose',header:'* Extra'},['* Developer: Zain','* Purpose: Purpose','* Extra']],
    ['N LD',{tables:['LD.LOANS.AND.DEPOSITS'],fields:[{name:'CUSTOMER',position:1}]},['CUSTOMER = R.LD<1>']],
    ['O USER',{tables:['USER'],fields:[{name:'NAME',position:2}]},['NAME = R.USER<2>']],
    ['P ACCOUNT.CLOSURE',{tables:['ACCOUNT.CLOSURE']},["FN.AC.CLOSURE = 'F.ACCOUNT.CLOSURE'"]],
    ['Q STMT.ENTRY.DETAIL',{tables:['STMT.ENTRY.DETAIL']},["FN.STMT.DETAIL = 'F.STMT.ENTRY.DETAIL'"]],
    ['R no table/field',{},['* No application tables selected','* No fields selected']],
    ['S duplicates',{tables:['ACCOUNT','ACCOUNT','ACCOUNT$HIS'],fields:[{name:'CUSTOMER',position:1},{name:'CUSTOMER',position:1}]},[]],
  ];
  for (const [name,spec,expected] of cases) it(name,()=>{ const out=generateRoutine(spec); for(const value of expected) expect(out).toContain(value); if(name.startsWith('S')){expect(out.match(/FN\.AC =/g)).toHaveLength(2);expect(out.match(/CUSTOMER = R\.AC<1>/g)).toHaveLength(1);} });
  it('K safe cursor insertion',()=>{expect(insertSnippet('AB',1,'Trim').text).toBe('AVALUE = TRIM(TEXT)B');expect(insertSnippet('AB',-1,'Trim').text).toBe('AB');expect(insertSnippet('AB',99,'Trim').text).toBe('AB');});
  it('L EVAL query',()=>expect(generateEvalQuery('ACCOUNT',['AC.CUSTOMER','AC.CURRENCY'],'^')).toBe('SELECT FBNK.ACCOUNT SAVING EVAL "CUSTOMER":"^":"CURRENCY"'));
  it('M exact application matching',()=>{expect(generateEvalQuery('ACCOUNT.CLOSURE',['AC.CLOSURE.STATUS'])).toBe('SELECT FBNK.ACCOUNT.CLOSURE SAVING EVAL "STATUS"');expect(generateEvalQuery('ACCOUNT',['AC.CLOSURE.STATUS'])).toBe('SELECT FBNK.ACCOUNT SAVING EVAL "AC.CLOSURE.STATUS"');});
  it('USER EVAL prefix correction',()=>expect(generateEvalQuery('USER',['USER.NAME'],'|')).toBe('SELECT FBNK.USER SAVING EVAL "NAME"'));
  it('golden output structure',()=>{const out=generateRoutine({routineName:'ACCOUNT.CUSTOMER.EXTRACT',developer:'Zain',purpose:'Extract',tables:['ACCOUNT','CUSTOMER$HIS'],fields:[{name:'ACCOUNT.CUSTOMER',table:'ACCOUNT',position:1},{name:'CUSTOMER.NAME',table:'CUSTOMER',position:2}],concat:true,separator:'^'});expect(out).toContain('$INSERT I_COMMON');expect(out).toContain('$INSERT I_EQUATE');expect(out).toContain('* $INSERT I_ENQUIRY.COMMON');expect(out.indexOf('GOSUB INIT')).toBeLessThan(out.indexOf('INIT:'));expect(out).toContain("CONCAT.VALUE = ACCOUNT.CUSTOMER : '^' : CUSTOMER.NAME");expect(out.endsWith('\nEND')).toBe(true);});
});