import { describe, expect, it } from 'vitest';
import { lineDiff } from './diff';
import { findMatches, replaceAll, replaceAt } from './findReplace';
import { combineFiles, safeArchivePath, splitCombined } from './transform';
import { esc, escapeHtml } from './text';

const types = (rows) => rows.map((r) => r.type);

describe('lineDiff', () => {
  it('reports an inserted line without marking later lines as changed', () => {
    const rows = lineDiff(['a', 'b', 'c'], ['a', 'x', 'b', 'c']);
    expect(types(rows)).toEqual(['same', 'add', 'same', 'same']);
    expect(rows[1]).toMatchObject({ li: null, ri: 2, r: 'x' });
  });
  it('reports a removed line', () => {
    expect(types(lineDiff(['a', 'b', 'c'], ['a', 'c']))).toEqual(['same', 'del', 'same']);
  });
  it('pairs a removed and an added line as a modification', () => {
    const rows = lineDiff(['a', 'old', 'c'], ['a', 'new', 'c']);
    expect(types(rows)).toEqual(['same', 'change', 'same']);
    expect(rows[1]).toMatchObject({ l: 'old', r: 'new', li: 2, ri: 2 });
  });
  it('handles empty inputs', () => {
    expect(types(lineDiff([], ['a']))).toEqual(['add']);
    expect(types(lineDiff(['a'], []))).toEqual(['del']);
    expect(lineDiff([], [])).toEqual([]);
  });
  it('treats blank lines as content, not as additions', () => {
    expect(types(lineDiff(['a', '', 'b'], ['a', '', 'b']))).toEqual(['same', 'same', 'same']);
  });
});

describe('find and replace', () => {
  it('finds literal text, case-insensitively by default', () => {
    expect(findMatches('Foo foo (x)', 'foo')).toEqual([0, 4]);
    expect(findMatches('Foo foo', 'foo', true)).toEqual([4]);
    expect(findMatches('a (x) b', '(x)')).toEqual([2]);
  });
  it('replaces the chosen occurrence', () => {
    expect(replaceAt('foo foo', 4, 'foo', 'bar')).toBe('foo bar');
  });
  it('replaces all occurrences with the same matching rules, without $ substitution', () => {
    expect(replaceAll('Foo foo', 'foo', 'x')).toBe('x x');
    expect(replaceAll('Foo foo', 'foo', 'x', true)).toBe('Foo x');
    expect(replaceAll('a.b', '.', '$&$&')).toBe('a$&$&b');
  });
});

describe('transform bundles', () => {
  const files = [
    { path: 'src/a.js', content: 'const a = 1;' },
    { path: 'b.txt', content: 'line1\nline2' },
  ];
  it('round-trips files through combine and split', () => {
    expect(splitCombined(combineFiles(files))).toEqual(
      files.map((f) => ({ name: f.path, content: f.content })),
    );
  });
  it('splits bundles that were saved with CRLF line endings', () => {
    const crlf = combineFiles(files).replace(/\n/g, '\r\n');
    expect(splitCombined(crlf).map((p) => p.name)).toEqual(['src/a.js', 'b.txt']);
  });
  it('keeps ZIP entries inside the archive', () => {
    expect(safeArchivePath('../../etc/passwd')).toBe('etc/passwd');
    expect(safeArchivePath('/abs/file.js')).toBe('abs/file.js');
    expect(safeArchivePath('C:\\Users\\x\\a.js')).toBe('Users/x/a.js');
    expect(safeArchivePath('..')).toBe('file.txt');
  });
});

describe('text helpers', () => {
  it('escapes regex metacharacters', () => {
    expect(new RegExp(esc('a.b(c)[d]$')).test('a.b(c)[d]$')).toBe(true);
    expect(new RegExp(esc('a.b')).test('axb')).toBe(false);
  });
  it('escapes HTML', () => {
    expect(escapeHtml('<a href="x">\'&')).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;');
  });
});
