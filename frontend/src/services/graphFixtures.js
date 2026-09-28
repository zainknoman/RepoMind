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
];
