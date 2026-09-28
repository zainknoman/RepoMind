import { describe, expect, it } from 'vitest';
import { analyzeSource, buildRepositoryIndex } from './repository';
import { toWorkerProject } from './indexProject';
import { symbolImpact } from './impact';

const parse = (content, path = 'm.ts') =>
  analyzeSource({ path, name: path, ext: path.slice(path.lastIndexOf('.')) }, content);
const members = (analysis) =>
  analysis.references
    .filter((r) => r.kind === 'member')
    .map((r) => ({ name: r.name, receiver: r.receiver, call: r.call }));

async function indexOf(files) {
  const project = toWorkerProject(
    'members',
    Object.entries(files).map(([path, content]) => ({
      path,
      name: path.split('/').pop(),
      ext: path.slice(path.lastIndexOf('.')),
      content,
    })),
  );
  return buildRepositoryIndex(project);
}

const links = (index, name) =>
  index.references
    .filter((r) => r.name === name)
    .map(
      (r) =>
        `${r.from}:${r.line} ${r.resolution}/${r.confidence} -> ` +
        r.resolvedSymbols.map((s) => `${s.path}::${s.parent ? s.parent + '.' : ''}${s.name}`),
    );

describe('member references (parser)', () => {
  it('records receivers for this, super, objects and expressions', () => {
    const analysis = parse(
      [
        'class Cls extends Base {',
        '  run(obj) {',
        '    this.a();',
        '    super.b();',
        '    obj.c();',
        '    new Foo().d();',
        '    use(this.handler);',
        '    const cb = () => this.f();',
        '    function nested() { this.e(); }',
        '  }',
        '}',
      ].join('\n'),
    );
    expect(members(analysis)).toEqual([
      { name: 'a', receiver: { this: 'Cls' }, call: true },
      { name: 'b', receiver: { super: 'Cls' }, call: true },
      { name: 'c', receiver: { object: 'obj' }, call: true },
      { name: 'd', receiver: { other: true }, call: true },
      { name: 'handler', receiver: { this: 'Cls' }, call: false },
      { name: 'f', receiver: { this: 'Cls' }, call: true },
      { name: 'e', receiver: { this: null }, call: true },
    ]);
    expect(analysis.symbols.find((s) => s.name === 'Cls').superClass).toBe('Base');
  });

  it('knows the class of `new` variables and typed parameters, not untyped shadows', () => {
    const analysis = parse(
      [
        'const f = new Foo();',
        'f.run();',
        'function g(x: Bar) { x.go(); }',
        'function h(f) { f.stop(); }',
        'obj.plain.deep();',
      ].join('\n'),
    );
    expect(members(analysis)).toEqual([
      { name: 'run', receiver: { object: 'f', type: 'Foo' }, call: true },
      { name: 'go', receiver: { object: 'x', type: 'Bar' }, call: true },
      { name: 'stop', receiver: { object: 'f' }, call: true },
      { name: 'deep', receiver: { other: true }, call: true },
    ]);
    expect(analysis.symbols.find((s) => s.name === 'f').instanceOf).toBe('Foo');
  });
});

describe('member references (resolution)', () => {
  const FILES = {
    'base.js': [
      'export class Base {',
      '  save() {}',
      '  static create() {}',
      '}',
      'export const shared = new Base();',
    ].join('\n'),
    'util.js': 'export function helper() {}\nexport function other() {}',
    'store.js': [
      "import { Base } from './base';",
      'export class Store extends Base {',
      '  put() {',
      '    this.save();',
      '    this.missing();',
      '  }',
      '  map() {}',
      '}',
    ].join('\n'),
    'app.js': [
      "import * as util from './util';",
      "import { Base, shared } from './base';",
      "import { Store } from './store';",
      "import React from 'react';",
      'util.helper();',
      'Base.create();',
      'const s = new Store();',
      's.put();',
      'shared.save();',
      'function f(anything) { anything.put(); }',
      'const items = [];',
      'items.map((x) => x);',
      'Math.max(1, 2);',
      'React.createElement();',
    ].join('\n'),
  };

  it('resolves this, inherited, namespace, static, typed and guessed calls', async () => {
    const index = await indexOf(FILES);
    expect(links(index, 'save')).toEqual([
      'store.js:4 this/high -> base.js::Base.save',
      'app.js:9 member-type/high -> base.js::Base.save',
    ]);
    expect(links(index, 'helper')).toEqual(['app.js:5 import/high -> util.js::helper']);
    expect(links(index, 'create')).toEqual(['app.js:6 import/high -> base.js::Base.create']);
    expect(links(index, 'put')).toEqual([
      'app.js:8 member-type/high -> store.js::Store.put',
      'app.js:10 member-guess/low -> store.js::Store.put',
    ]);
    // Built-in names, globals, packages and unknown methods are not linked.
    expect(links(index, 'map')).toEqual([]);
    expect(links(index, 'max')).toEqual([]);
    expect(links(index, 'createElement')).toEqual([]);
    expect(links(index, 'missing')).toEqual([]);
    expect(index.stats.untracedMemberCalls).toBe(2);
    expect(index.stats.memberReferences).toBe(6);
    expect(index.stats.unresolvedReferences).toBe(0);
  });

  it('feeds method impact', async () => {
    const index = await indexOf(FILES);
    const save = index.symbols.find((s) => s.name === 'save');
    const result = symbolImpact(index, save);
    expect(result.affected.map((a) => `${a.name || a.path}:${a.confidence}`)).toEqual(
      expect.arrayContaining(['put:high', 'app.js:high']),
    );
  });
});
