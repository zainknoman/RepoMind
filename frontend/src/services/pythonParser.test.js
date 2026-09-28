import { describe, expect, it } from 'vitest';
import { parsePython } from './pythonParser';
import { buildRepositoryIndex } from './repository';
import { toWorkerProject } from './indexProject';

const SOURCE = [
  'import os, pkg.tools as tools',
  'from .models import (User,',
  '    Account as Acct)',
  'from . import helpers',
  '',
  'LIMIT = 10  # a constant',
  'default = Service()',
  '',
  '@decorate',
  'class Service(Base):',
  '    """Doc with def fake(): and import nothing."""',
  '    def run(self, user: User, count=LIMIT):',
  '        total = helpers.fmt(user)',
  "        text = 'print(x)'",
  '        self.save()',
  '        for item in user.items():',
  '            total += len(item)',
  '        def inner():',
  '            return total',
  '        return inner()',
  '',
  '    def save(self):',
  '        pass',
  '',
  'def main():',
  '    Service().run(None)',
  '',
].join('\n');

const parsed = parsePython({ path: 'pkg/service.py', name: 'service.py', ext: '.py' }, SOURCE);
const symbol = (name) => parsed.symbols.find((s) => s.name === name);

describe('parsePython', () => {
  it('finds classes, methods, functions and top-level variables with their extent', () => {
    expect(
      parsed.symbols.map(
        (s) => `${s.kind}:${s.parent ? s.parent + '.' : ''}${s.name}:${s.line}-${s.endLine}`,
      ),
    ).toEqual([
      'variable:LIMIT:6-6',
      'variable:default:7-7',
      'class:Service:10-23',
      'method:Service.run:12-20',
      'function:inner:18-19',
      'method:Service.save:22-23',
      'function:main:25-26',
    ]);
    expect(symbol('Service').superClass).toBe('Base');
    expect(symbol('default').instanceOf).toBe('Service');
    expect(symbol('inner').scopeStart).toBeGreaterThan(0);
    expect(symbol('run').scopeStart).toBeUndefined();
  });

  it('reads imports with their bindings', () => {
    expect(parsed.imports.map((i) => [i.module, i.line, i.bindings])).toEqual([
      ['os', 1, [{ local: 'os', imported: '*', kind: 'namespace' }]],
      ['pkg.tools', 1, [{ local: 'tools', imported: '*', kind: 'namespace' }]],
      [
        '.models',
        2,
        [
          { local: 'User', imported: 'User', kind: 'named' },
          { local: 'Acct', imported: 'Account', kind: 'named' },
        ],
      ],
      ['.', 4, [{ local: 'helpers', imported: 'helpers', kind: 'named' }]],
    ]);
  });

  it('records references, not keywords, builtins, strings, comments or attribute names', () => {
    const names = parsed.references.filter((r) => r.kind === 'identifier').map((r) => r.name);
    expect(names).toEqual(
      expect.arrayContaining(['Service', 'Base', 'decorate', 'User', 'LIMIT', 'helpers', 'inner']),
    );
    for (const absent of ['print', 'len', 'self', 'for', 'fake', 'nothing', 'items', 'x', 'run'])
      expect(names).not.toContain(absent);
    const members = parsed.references
      .filter((r) => r.kind === 'member')
      .map((r) => `${r.name}:${JSON.stringify(r.receiver)}:${r.call}`);
    expect(members).toEqual([
      'fmt:{"object":"helpers"}:true',
      'save:{"this":"Service"}:true',
      'items:{"object":"user","type":"User"}:true',
      'run:{"other":true}:true',
    ]);
  });

  it('treats parameters and local assignments as local bindings', () => {
    const all = parsed.localBindings.map((b) => b.name);
    expect(all).toEqual(expect.arrayContaining(['user', 'count', 'total', 'text', 'item']));
    // Bindings are scoped to their function: `total` lives inside run, not in the module.
    const total = parsed.localBindings.find((b) => b.name === 'total');
    expect(SOURCE.slice(total.scopeStart, total.scopeStart + 20)).toContain('def run');
  });
});

describe('Python in the index', () => {
  const FILES = {
    'src/app/__init__.py': '',
    'src/app/core.py': 'def boot():\n    pass\n',
    'pkg/__init__.py': '',
    'pkg/db.py': 'def load():\n    return 1\n',
    'pkg/helpers.py': 'def fmt(value):\n    return value\n',
    'pkg/service.py': [
      'from pkg.db import load',
      'from . import helpers',
      'from app.core import boot',
      'import requests',
      '',
      'def serve():',
      '    boot()',
      '    return helpers.fmt(load())',
    ].join('\n'),
    'other.py': 'def run(load):\n    load = 2\n    return load\n',
  };

  it('resolves absolute, relative, submodule and source-root imports', async () => {
    const project = toWorkerProject(
      'py',
      Object.entries(FILES).map(([path, content]) => ({
        path,
        name: path.split('/').pop(),
        ext: '.py',
        content,
      })),
    );
    const index = await buildRepositoryIndex(project);
    expect(index.dependencies.map((e) => `${e.from} -> ${e.to}`).sort()).toEqual([
      'pkg/service.py -> pkg/db.py',
      'pkg/service.py -> pkg/helpers.py',
      'pkg/service.py -> src/app/core.py',
    ]);
    expect(index.unresolvedImports).toEqual([]);
    expect(index.externalDependencies.map((e) => e.module)).toEqual(['requests']);
    const links = index.references
      .filter((r) => r.resolvedSymbols.length)
      .map((r) => `${r.from}:${r.line} ${r.name} ${r.confidence} -> ${r.resolvedSymbols[0].path}`);
    expect(links).toEqual(
      expect.arrayContaining([
        'pkg/service.py:7 boot high -> src/app/core.py',
        'pkg/service.py:8 fmt high -> pkg/helpers.py',
        'pkg/service.py:8 load high -> pkg/db.py',
      ]),
    );
    // other.py's parameter `load` is local: never linked to pkg/db.py.
    expect(links.filter((l) => l.startsWith('other.py'))).toEqual([]);
  });
});
