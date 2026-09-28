/**
 * Small repositories with every dependency edge and reference link the indexer should produce.
 * Used by graphAccuracy.test.js; each fixture pins one resolution behaviour.
 */

const lines = (...rows) => rows.join('\n');

export const GRAPH_FIXTURES = [
  {
    name: 'relative-named-import',
    files: {
      'lib.js': lines('export function greet(name) {', "  return 'hi ' + name;", '}'),
      'app.js': lines("import { greet } from './lib';", "greet('x');"),
    },
    edges: ['app.js -> lib.js'],
    links: ['app.js:2 greet -> lib.js::greet'],
  },
  {
    // No import names `init`: both same-name top-level functions are possible targets.
    name: 'name-collision',
    files: {
      'a.js': 'export function init() {}',
      'b.js': 'export function init() {}',
      'c.js': 'init();',
    },
    edges: [],
    links: ['c.js:1 init -> a.js::init', 'c.js:1 init -> b.js::init'],
  },
  {
    // `useState` comes from a package, so the repository's own useState is not its target.
    name: 'external-shadow',
    files: {
      'hooks.js': 'export function useState() {}',
      'view.js': lines("import { useState } from 'react';", 'useState();'),
    },
    edges: [],
    links: [],
  },
  {
    // A barrel's re-exports are edges, and imports through it link to the defining file.
    name: 'barrel',
    files: {
      'lib/math.js': 'export function add() {}',
      'lib/fmt.js': 'export function fmt() {}',
      'lib/index.js': lines("export * from './math';", "export { fmt as format } from './fmt';"),
      'app.js': lines("import { add, format } from './lib';", 'add();', 'format();'),
    },
    edges: ['app.js -> lib/index.js', 'lib/index.js -> lib/math.js', 'lib/index.js -> lib/fmt.js'],
    links: ['app.js:2 add -> lib/math.js::add', 'app.js:3 format -> lib/fmt.js::fmt'],
  },
  {
    // A default import names only the default export, declared inline or exported by name.
    name: 'default-export',
    files: {
      'a.js': lines('export default function main() {}', 'export function helper() {}'),
      'b.js': lines("import main from './a';", 'main();'),
      'c.js': lines('function run() {}', 'export default run;'),
      'd.js': lines("import go from './c';", 'go();'),
    },
    edges: ['b.js -> a.js', 'd.js -> c.js'],
    links: ['b.js:2 main -> a.js::main', 'd.js:2 go -> c.js::run'],
  },
  {
    name: 'commonjs-dynamic',
    files: {
      'util.js': lines('function util() {}', 'module.exports = util;'),
      'pick.js': 'export function pick() {}',
      'lazy.js': 'export const lazy = 1;',
      'main.js': lines(
        "const { pick } = require('./pick');",
        "const util = require('./util');",
        'pick();',
        'util();',
        "import('./lazy');",
      ),
    },
    edges: ['main.js -> pick.js', 'main.js -> util.js', 'main.js -> lazy.js'],
    links: ['main.js:3 pick -> pick.js::pick', 'main.js:4 util -> util.js::util'],
  },
  {
    // Barrels that re-export each other must not loop.
    name: 'reexport-cycle',
    files: {
      'x.js': lines("export * from './y';", 'export function fromX() {}'),
      'y.js': "export * from './x';",
      'z.js': lines("import { fromX, nope } from './y';", 'fromX();'),
    },
    edges: ['x.js -> y.js', 'y.js -> x.js', 'z.js -> y.js'],
    links: ['z.js:2 fromX -> x.js::fromX'],
  },
  {
    // Usage on an export line (a one-line exported function) is still a reference.
    name: 'one-line-export',
    files: {
      'lib.js': 'export function greet() {}',
      'card.js': lines(
        "import { greet } from './lib';",
        'export function card() { return greet(); }',
      ),
      'alias.js': lines(
        'function inner() {}',
        'export { inner as outer };',
        'export default inner;',
      ),
    },
    edges: ['card.js -> lib.js'],
    links: ['card.js:2 greet -> lib.js::greet'],
  },
  {
    // Calls through objects: this (inherited), namespace, static, `new` variables; built-in names
    // and globals are not linked.
    name: 'member-calls',
    files: {
      'base.js': lines('export class Base {', '  save() {}', '  static make() {}', '}'),
      'ns.js': 'export function tool() {}',
      'store.js': lines(
        "import { Base } from './base';",
        'export class Store extends Base {',
        '  put() {',
        '    this.save();',
        '  }',
        '}',
      ),
      'main.js': lines(
        "import * as ns from './ns';",
        "import { Base } from './base';",
        "import { Store } from './store';",
        'ns.tool();',
        'Base.make();',
        'const s = new Store();',
        's.put();',
        '[].map((x) => x);',
        'Math.max(1, 2);',
      ),
    },
    edges: ['store.js -> base.js', 'main.js -> ns.js', 'main.js -> base.js', 'main.js -> store.js'],
    links: [
      'store.js:2 Base -> base.js::Base',
      'store.js:4 save -> base.js::Base.save',
      'main.js:4 ns -> ns.js::tool',
      'main.js:4 tool -> ns.js::tool',
      'main.js:5 Base -> base.js::Base',
      'main.js:5 make -> base.js::Base.make',
      'main.js:6 Store -> store.js::Store',
      'main.js:7 s -> main.js::s',
      'main.js:7 put -> store.js::Store.put',
    ],
  },
];
