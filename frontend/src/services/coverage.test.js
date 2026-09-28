import { describe, expect, it } from 'vitest';
import { buildRepositoryIndex } from './repository';
import { toWorkerProject } from './indexProject';
import { analysisCoverage, coverageFor, coverageGaps } from './coverage';

async function indexOf(files) {
  const project = toWorkerProject(
    'coverage',
    Object.entries(files).map(([path, content]) => ({
      path,
      name: path.split('/').pop(),
      ext: path.slice(path.lastIndexOf('.')),
      content,
    })),
  );
  return buildRepositoryIndex(project);
}

describe('analysis coverage', () => {
  it('reports languages whose imports and references are not extracted', async () => {
    const index = await indexOf({
      'app/models.py': 'from app.db import Base\n\ndef load():\n    pass\n',
      'src/main/java/com/acme/Foo.java': 'package com.acme;\nimport com.acme.Bar;\nclass Foo {}\n',
      'README.md': '# Readme',
    });
    const coverage = analysisCoverage(index);
    expect(coverage.map((c) => c.language).sort()).toEqual(['Java', 'Python']);
    for (const entry of coverage) {
      expect(entry).toMatchObject({ imports: 'none', references: false, gap: true });
      expect(entry.note).toContain('Dependencies and Impact are empty');
    }
    expect(index.coverage).toEqual(coverage);
    expect(coverageFor(index, 'app/models.py').language).toBe('Python');
    expect(coverageFor(index, 'README.md')).toBeNull();
  });

  it('counts package-looking imports that are probably path aliases', async () => {
    const index = await indexOf({
      'src/lib/x.js': 'export const x = 1;',
      'src/app.js': [
        "import { x } from '@/lib/x';",
        "import y from 'src/lib/x';",
        "import React from 'react';",
        "import { z } from '@scope/pkg';",
      ].join('\n'),
    });
    const [js] = analysisCoverage(index);
    expect(js).toMatchObject({
      language: 'JavaScript',
      imports: 'relative',
      references: true,
      aliasLikeImports: 2,
      gap: true,
    });
    expect(js.note).toContain('@/lib/x');
  });

  it('reports no gaps for JavaScript with relative imports only', async () => {
    const index = await indexOf({
      'a.js': "import { b } from './b';\nb();",
      'b.js': 'export function b() {}',
    });
    expect(coverageGaps(index)).toEqual([]);
    expect(analysisCoverage(index)[0]).toMatchObject({ files: 2, gap: false });
  });

  it('marks Temenos BASIC as resolved by name', async () => {
    const index = await indexOf({ 'BP/X.b': '    SUBROUTINE X\n    CALL Y\n    RETURN\nEND' });
    expect(analysisCoverage(index)[0]).toMatchObject({
      language: 'Temenos BASIC',
      imports: 'resolved',
      references: true,
      gap: false,
    });
  });
});
