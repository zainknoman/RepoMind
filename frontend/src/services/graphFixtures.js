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
];
