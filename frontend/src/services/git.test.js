import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseIndex } from './git';

// Builds a real .git/index with the git CLI, so the parser is checked against git's own encoder.
function realIndex(version, paths) {
  const dir = mkdtempSync(join(tmpdir(), 'repomind-git-'));
  const git = (...args) => execFileSync('git', args, { cwd: dir, stdio: 'pipe' });
  git('init', '-q');
  for (const p of paths) {
    mkdirSync(join(dir, p, '..'), { recursive: true });
    writeFileSync(join(dir, p), 'content of ' + p);
  }
  git('add', '.');
  // skip-worktree sets an extended flag, which forces the extra v3 header bytes.
  if (version >= 3) git('update-index', '--skip-worktree', 'src/app/menu.js');
  git('update-index', '--index-version', String(version));
  const buf = readFileSync(join(dir, '.git', 'index'));
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

let gitAvailable = true;
try {
  execFileSync('git', ['--version'], { stdio: 'pipe' });
} catch {
  gitAvailable = false;
}

describe.skipIf(!gitAvailable)('parseIndex', () => {
  const paths = ['README.md', 'src/app/main.js', 'src/app/menu.js', 'src/lib/util.js', 'z.txt'];
  for (const version of [2, 3, 4]) {
    it(`reads every path from an index v${version}`, () => {
      const entries = parseIndex(realIndex(version, paths));
      expect(entries.map((e) => e.path)).toEqual([...paths].sort());
      expect(entries.find((e) => e.path === 'z.txt').size).toBe('content of z.txt'.length);
      if (version >= 3)
        expect(entries.find((e) => e.path === 'src/app/menu.js').flags & 0x4000).toBe(0x4000);
    });
  }
  it('rejects non-index data', () => {
    expect(parseIndex(new TextEncoder().encode('not an index').buffer)).toEqual([]);
  });
});
