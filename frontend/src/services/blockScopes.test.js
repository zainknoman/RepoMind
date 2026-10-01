import { describe, expect, it } from 'vitest';
import { buildRepositoryIndex } from './repository';
import { toWorkerProject } from './indexProject';

async function indexOf(content) {
  return buildRepositoryIndex(
    toWorkerProject('blocks', [{ path: 'b.js', name: 'b.js', ext: '.js', content }]),
  );
}

// "line name -> line of the declaration it links to", for one name.
const links = (index, name) =>
  index.references
    .filter((r) => r.name === name)
    .map((r) => `${r.line} -> ${r.resolvedSymbols.map((s) => s.line).join(',') || 'none'}`);

describe('block scopes', () => {
  it('links a use to the const of its own block, not a sibling block', async () => {
    const index = await indexOf(
      [
        'function run(flag) {',
        '  if (flag) {',
        '    const x = () => 1;',
        '    x();',
        '  } else {',
        '    const x = () => 2;',
        '    x();',
        '  }',
        '}',
      ].join('\n'),
    );
    expect(links(index, 'x')).toEqual(['4 -> 3', '7 -> 6']);
  });

  it('keeps a loop variable inside its loop', async () => {
    const index = await indexOf(
      [
        'const item = () => 0;',
        'function run(list) {',
        '  for (const item of list) item.go;',
        '  return item();',
        '}',
      ].join('\n'),
    );
    // Line 3 uses the loop's own variable; line 4, after the loop, the top-level function.
    expect(links(index, 'item')).toEqual(['3 -> 3', '4 -> 1']);
  });

  it('keeps var function-scoped, so a use after the block still sees it', async () => {
    const index = await indexOf(
      [
        'function run(flag) {',
        '  if (flag) {',
        '    var helper = () => 1;',
        '  }',
        '  return helper();',
        '}',
      ].join('\n'),
    );
    expect(links(index, 'helper')).toEqual(['5 -> 3']);
  });

  it('does not let a block const leak to code after the block', async () => {
    const index = await indexOf(
      [
        'const value = () => 0;',
        'function run() {',
        '  {',
        '    const value = () => 1;',
        '    value();',
        '  }',
        '  return value();',
        '}',
      ].join('\n'),
    );
    expect(links(index, 'value')).toEqual(['5 -> 4', '7 -> 1']);
  });
});
