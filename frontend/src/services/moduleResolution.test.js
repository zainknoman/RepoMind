import { describe, expect, it } from 'vitest';
import { buildRepositoryIndex } from './repository';
import { toWorkerProject } from './indexProject';
import { parseModuleConfig } from './moduleResolution';

const extOf = (path) => {
  const name = path.split('/').pop();
  return name.includes('.') ? name.slice(name.lastIndexOf('.')) : '';
};

const project = (files) =>
  toWorkerProject(
    'modules',
    Object.entries(files).map(([path, content]) => ({
      path,
      name: path.split('/').pop(),
      ext: extOf(path),
      content,
      size: content.length,
      lastModified: 1,
    })),
  );

const edges = (index) => index.dependencies.map((e) => `${e.from} -> ${e.to}`).sort();

describe('parseModuleConfig', () => {
  it('reads JSON with comments and trailing commas', () => {
    const config = parseModuleConfig(
      [
        '{',
        '  // editor settings',
        '  "extends": "./base.json",',
        '  "compilerOptions": {',
        '    /* aliases */',
        '    "baseUrl": "./src",',
        '    "paths": { "@/*": ["*",], },',
        '  },',
        '}',
      ].join('\n'),
    );
    expect(config).toEqual({ extends: './base.json', baseUrl: './src', paths: { '@/*': ['*'] } });
    expect(parseModuleConfig('not json')).toBeNull();
    expect(parseModuleConfig('{ "url": "http://x//y" }')).toEqual({});
  });
});

describe('tsconfig / jsconfig paths', () => {
  const FILES = {
    'tsconfig.json': JSON.stringify({
      compilerOptions: {
        baseUrl: '.',
        paths: { '@/*': ['src/*'], '#lib': ['missing/lib', 'src/lib/index'] },
      },
    }),
    'app/jsconfig.json': '{ "extends": "../tsconfig.json" }',
    'src/util/format.ts': 'export function format() {}',
    'src/lib/index.ts': 'export function lib() {}',
    'components/Button.tsx': 'export function Button() {}',
    'src/main.ts': [
      "import { format } from '@/util/format';",
      "import { lib } from '#lib';",
      "import { Button } from 'components/Button';",
      "import React from 'react';",
      'format();',
      'lib();',
      'Button();',
    ].join('\n'),
    'app/page.js': "import { format } from '@/util/format';\nformat();",
  };

  it('resolves aliases and baseUrl imports; packages stay external', async () => {
    const index = await buildRepositoryIndex(project(FILES));
    expect(edges(index)).toEqual([
      'app/page.js -> src/util/format.ts',
      'src/main.ts -> components/Button.tsx',
      'src/main.ts -> src/lib/index.ts',
      'src/main.ts -> src/util/format.ts',
    ]);
    expect(index.externalDependencies.map((e) => e.module)).toEqual(['react']);
    const format = index.symbols.find((s) => s.name === 'format');
    expect(format.references.map((r) => `${r.from}:${r.confidence}`)).toEqual([
      'src/main.ts:high',
      'app/page.js:high',
    ]);
  });

  it('keeps resolving when the config file is reused from a previous build', async () => {
    const first = await buildRepositoryIndex(project(FILES));
    const reused = toWorkerProject(
      'modules',
      first.files.map((analysis) => ({
        path: analysis.path,
        name: analysis.path.split('/').pop(),
        ext: extOf(analysis.path),
        analysis,
      })),
    );
    const second = await buildRepositoryIndex(reused);
    expect(second.stats.reusedFiles).toBe(Object.keys(FILES).length);
    expect(edges(second)).toEqual(edges(first));
  });
});
