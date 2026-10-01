import { describe, expect, it } from 'vitest';
import {
  LAYOUTS,
  decodeFields,
  layoutFromInsert,
  parseDlHeader,
  parseNamedRecord,
  recordLinks,
  recordValues,
} from './temenosRecords';
import { buildRepositoryIndex } from './repository';
import { toWorkerProject } from './indexProject';
import { symbolImpact } from './impact';
import { runAnalyzers } from './analyzers';
import './temenos';

const VM = '\uF8FD';
const SM = '\uF8FC';
// A positional record: one field per line, field N on line N.
const positional = (values) => {
  const lines = [];
  for (const [position, value] of Object.entries(values)) lines[Number(position) - 1] = value;
  return Array.from(lines, (v) => v ?? '').join('\r\n');
};

describe('DL.DEFINE packages', () => {
  it('maps each REC file to its application and record id (fields 9 and 10)', () => {
    const header = positional({
      1: 'PKG.ONE',
      9: ['VERSION', 'ENQUIRY', 'EB.API'].join(VM),
      10: ['FUNDS.TRANSFER,ACME', 'ACME.ENQ', 'ACME.API'].join(VM),
      13: 'R21',
    });
    expect(parseDlHeader(header)).toEqual([
      { application: 'VERSION', id: 'FUNDS.TRANSFER,ACME', record: 'REC00001' },
      { application: 'ENQUIRY', id: 'ACME.ENQ', record: 'REC00002' },
      { application: 'EB.API', id: 'ACME.API', record: 'REC00003' },
    ]);
  });

  it('decodes fields with value and sub-value marks', () => {
    const fields = decodeFields(positional({ 2: 'a', 3: `b${VM}c${SM}d` }));
    expect(fields[0]).toEqual([]);
    expect(fields[1]).toEqual(['a']);
    expect(fields[2]).toEqual(['b', 'c', 'd']);
  });
});

describe('record values and links', () => {
  it('reads VERSION routines by the default layout, including multi-values', () => {
    const fields = decodeFields(
      positional({
        59: 'ACME.VALIDATE',
        63: ['ACME.I.UPDATE', '@ACME.I.CHECK'].join(VM),
        74: 'ACME.ID.RTN',
        77: 'ACME.BA.MARKER',
      }),
    );
    const values = recordValues(fields, LAYOUTS.VERSION.fields);
    expect(recordLinks('VERSION', 'FUNDS.TRANSFER,ACME', values)).toEqual([
      { routine: 'ACME.VALIDATE', role: 'validation', field: 'VALIDATION.RTN', position: 59 },
      { routine: 'ACME.I.UPDATE', role: 'input', field: 'INPUT.ROUTINE', position: 63 },
      { routine: 'ACME.I.CHECK', role: 'input', field: 'INPUT.ROUTINE', position: 63 },
      { routine: 'ACME.ID.RTN', role: 'record id', field: 'ID.RTN', position: 74 },
      {
        routine: 'ACME.BA.MARKER',
        role: 'before authorisation',
        field: 'BEFORE.AUTH.RTN',
        position: 77,
      },
    ]);
  });

  it('reads ENQUIRY build and @ conversion routines, EB.API and batch jobs', () => {
    const enquiry = recordValues(
      decodeFields(
        positional({
          2: 'ACCOUNT',
          12: 'E.ACME.BUILD',
          18: ['@ E.ACME.CONV', 'L ACCOUNT', '@E.ACME.CONV2'].join(VM),
        }),
      ),
      LAYOUTS.ENQUIRY.fields,
    );
    expect(
      recordLinks('ENQUIRY', 'ACME.ENQ', enquiry).map((l) => `${l.role}:${l.routine}`),
    ).toEqual([
      'enquiry build:E.ACME.BUILD',
      'enquiry conversion:E.ACME.CONV',
      'enquiry conversion:E.ACME.CONV2',
    ]);
    expect(recordLinks('EB.API', 'ACME.API', { 'SOURCE.TYPE': ['BASIC'] })).toEqual([
      { routine: 'ACME.API', role: 'API', field: '@ID', position: 0 },
    ]);
    expect(recordLinks('EB.API', 'JAPI', { 'SOURCE.TYPE': ['JAVA'] })).toEqual([]);
    expect(
      recordLinks('PGM.FILE', 'ACME.JOB', { TYPE: ['B'] }).map((l) => `${l.role}:${l.routine}`),
    ).toEqual([
      'batch job:ACME.JOB',
      'batch job load:ACME.JOB.LOAD',
      'batch job select:ACME.JOB.SELECT',
    ]);
    expect(
      recordLinks('BATCH', 'BNK/ACME', { 'JOB.NAME': ['ACME.JOB'] }).map((l) => l.routine),
    ).toEqual(['ACME.JOB', 'ACME.JOB.LOAD', 'ACME.JOB.SELECT']);
  });

  it('takes positions from a repository insert when it has them', () => {
    const layout = layoutFromInsert('VERSION', {
      'EB.VER.VALIDATION.RTN': 61,
      'EB.VER.INPUT.ROUTINE': 65,
      'EB.VER.RECORD.STATUS': 90,
    });
    expect(layout['VALIDATION.RTN']).toBe(61);
    expect(layout['INPUT.ROUTINE']).toBe(65);
    // Fields the insert does not name keep their default position.
    expect(layout['AUTH.ROUTINE']).toBe(LAYOUTS.VERSION.fields['AUTH.ROUTINE']);
  });

  it('reads named records: FIELD: value, FIELD = value and OFS FIELD:1:1=value', () => {
    expect(
      parseNamedRecord(
        [
          'VALIDATION.RTN: ACME.VAL',
          'INPUT.ROUTINE:1:1=ACME.IN1',
          'INPUT.ROUTINE:2:1=ACME.IN2',
        ].join('\n'),
      ),
    ).toEqual({ 'VALIDATION.RTN': ['ACME.VAL'], 'INPUT.ROUTINE': ['ACME.IN1', 'ACME.IN2'] });
    expect(parseNamedRecord('BUILD.ROUTINE = E.X,FILE.NAME:1:1=ACCOUNT')).toEqual({
      'BUILD.ROUTINE': ['E.X'],
      'FILE.NAME': ['ACCOUNT'],
    });
    expect(parseNamedRecord('just some notes\nnothing here')).toBeNull();
  });
});

describe('configuration records in the index', () => {
  const header = positional({
    1: 'ACME.PKG',
    9: ['VERSION', 'ENQUIRY', 'EB.API'].join(VM),
    10: ['FUNDS.TRANSFER,ACME', 'ACME.ENQ', 'ACME.API'].join(VM),
  });
  const FILES = {
    'DL.DEFINE/ACME.PKG/DL.D_ACME.PKG': header,
    // VERSION: the repository's own insert moves INPUT.ROUTINE to 65.
    'DL.DEFINE/ACME.PKG/REC00001': positional({
      59: 'ACME.VALIDATE',
      65: 'ACME.INPUT',
      77: 'CORE.ONLY.RTN',
    }),
    'DL.DEFINE/ACME.PKG/REC00002': positional({ 2: 'ACCOUNT', 12: 'E.ACME.BUILD' }),
    'DL.DEFINE/ACME.PKG/REC00003': positional({ 3: 'BASIC' }),
    'BP/I_F.VERSION': '    EQU EB.VER.VALIDATION.RTN TO 59, EB.VER.INPUT.ROUTINE TO 65\n',
    'BP/ACME.VALIDATE': '    SUBROUTINE ACME.VALIDATE\n    RETURN\n',
    'BP/ACME.INPUT': '    SUBROUTINE ACME.INPUT\n    RETURN\n',
    'BP/E.ACME.BUILD': '    SUBROUTINE E.ACME.BUILD(ENQ)\n    RETURN\n',
    'BP/ACME.API': '    SUBROUTINE ACME.API\n    RETURN\n',
  };
  const records = () =>
    Object.entries(FILES).map(([path, content]) => ({
      path,
      name: path.split('/').pop(),
      ext: path.startsWith('DL.DEFINE/') ? '.t24r' : '.b',
      content,
      size: content.length,
      lastModified: 1,
    }));

  it('links records to routines, with events, edges, references and record symbols', async () => {
    const index = await buildRepositoryIndex(toWorkerProject('cfg', records()));
    const summary = index.temenosConfig.records.map(
      (r) =>
        `${r.application} ${r.id}: ` +
        r.links
          .map((l) => `${l.role}=${l.routine}${l.path ? '' : ' (not in repository)'}`)
          .join(', '),
    );
    expect(summary).toEqual([
      'VERSION FUNDS.TRANSFER,ACME: validation=ACME.VALIDATE, input=ACME.INPUT, before authorisation=CORE.ONLY.RTN (not in repository)',
      'ENQUIRY ACME.ENQ: enquiry build=E.ACME.BUILD',
      'EB.API ACME.API: API=ACME.API',
    ]);
    expect(index.temenosConfig.layouts.VERSION).toBe('repository insert BP/I_F.VERSION');
    expect(
      index.dependencies
        .filter((e) => e.kind === 'config')
        .map((e) => `${e.from.split('/').pop()} -> ${e.to.split('/').pop()}`)
        .sort(),
    ).toEqual([
      'REC00001 -> ACME.INPUT',
      'REC00001 -> ACME.VALIDATE',
      'REC00002 -> E.ACME.BUILD',
      'REC00003 -> ACME.API',
    ]);
    // Impact of a routine reaches the record that runs it.
    const validate = index.symbols.find((s) => s.name === 'ACME.VALIDATE');
    const impact = symbolImpact(index, validate);
    expect(impact.affected.map((a) => `${a.name}:${a.kind}:${a.confidence}`)).toEqual([
      'VERSION FUNDS.TRANSFER,ACME:record:high',
    ]);

    const { 'temenos-config': config } = await runAnalyzers(index, ['temenos-config']);
    expect(
      config.findings.map((f) => `${f.event}|${f.routine}|${f.status.split(' ·')[0]}`),
    ).toEqual([
      'validation|ACME.VALIDATE|in repository',
      'input|ACME.INPUT|in repository',
      'before authorisation|CORE.ONLY.RTN|not in repository',
      'enquiry build|E.ACME.BUILD|in repository',
      'API|ACME.API|in repository',
    ]);
  });

  it('does not duplicate links when record analyses are reused', async () => {
    const first = await buildRepositoryIndex(toWorkerProject('cfg', records()));
    const reused = await buildRepositoryIndex(
      toWorkerProject(
        'cfg',
        first.files.map((analysis) => ({
          path: analysis.path,
          name: analysis.path.split('/').pop(),
          ext: analysis.extension,
          analysis,
        })),
      ),
    );
    expect(reused.temenosConfig).toEqual(first.temenosConfig);
    expect(reused.dependencies.length).toBe(first.dependencies.length);
  });
});
