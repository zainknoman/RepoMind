import { describe, expect, it } from 'vitest';
import { buildProjectExport } from './projectExport';

describe('project export', () => {
  it('exports the indexed project model without filesystem handles or source content', () => {
    const project = {
      name: 'CBI',
      openedAt: 123,
      rootHandle: { kind: 'directory' },
      source: { type: 'local' },
      truncated: false,
    };
    const index = {
      repository: 'CBI',
      generatedAt: '2026-10-07T00:00:00.000Z',
      files: [
        {
          path: 'CUSTOMER/PK.CUSTOMER.b',
          language: 'Temenos BASIC',
          extension: '.b',
          lines: 42,
          bytes: 1200,
          tokens: 300,
          symbols: [{ name: 'PK.CUSTOMER', kind: 'routine', line: 1 }],
        },
      ],
      symbols: [
        {
          name: 'PK.CUSTOMER',
          kind: 'routine',
          path: 'CUSTOMER/PK.CUSTOMER.b',
          line: 1,
          references: [],
          importedBy: [],
        },
      ],
      imports: [{ from: 'A.b', to: 'B.b' }],
      exports: [],
      references: [],
      dependencies: [{ from: 'A.b', to: 'B.b' }],
      externalDependencies: [],
      unresolvedImports: [],
      languages: { 'Temenos BASIC': 1 },
      project: { frameworks: [{ name: 'Temenos T24 / Transact' }], source: { type: 'local' } },
      stats: { files: 1, symbols: 1 },
      linked: true,
      _fileHandles: new Map(),
    };

    const result = buildProjectExport(project, index, {
      exportedAt: '2026-10-07T01:00:00.000Z',
    });

    expect(result.schemaVersion).toBe('1.0');
    expect(result.toolVersion).toBe('repomind-ui-0.11.0');
    expect(result.exportedAt).toBe('2026-10-07T01:00:00.000Z');
    expect(result.project).toMatchObject({ name: 'CBI', source: { type: 'local' } });
    expect(result.files[0].path).toBe('CUSTOMER/PK.CUSTOMER.b');
    expect(result.dependencies).toEqual([{ from: 'A.b', to: 'B.b' }]);
    expect(result.stats.files).toBe(1);
    expect(result).not.toHaveProperty('rootHandle');
    expect(result.files[0]).not.toHaveProperty('handle');
    expect(result.files[0]).not.toHaveProperty('content');
    expect(result).not.toHaveProperty('linked');
  });

  it('requires an indexed project', () => {
    expect(() => buildProjectExport({ name: 'CBI' }, null)).toThrow(
      'Build the project index before exporting',
    );
  });
});
