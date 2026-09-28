import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { directoryHandle, fileHandle } from '../test-utils/nodeHandles';
import { commitChanges, workingTreeChanges } from './gitChanges';

let gitAvailable = true;
try {
  execFileSync('git', ['--version'], { stdio: 'pipe' });
} catch {
  gitAvailable = false;
}

function makeRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'repomind-changes-'));
  const git = (...args) =>
    execFileSync('git', args, { cwd: dir, stdio: 'pipe', encoding: 'utf8' }).trim();
  const write = (path, content) => {
    mkdirSync(join(dir, path, '..'), { recursive: true });
    writeFileSync(join(dir, path), content);
  };
  git('init', '-q');
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'Test');
  git('config', 'core.autocrlf', 'false');
  return { dir, git, write };
}

// Project files as the folder walk produces them (text flag, handle), excluding .git.
function projectFiles(dir, prefix = '') {
  const out = [];
  for (const name of readdirSync(join(dir, prefix))) {
    if (name === '.git') continue;
    const path = prefix ? `${prefix}/${name}` : name;
    if (statSync(join(dir, path)).isDirectory()) out.push(...projectFiles(dir, path));
    else
      out.push({
        path,
        name,
        ext: name.includes('.') ? name.slice(name.lastIndexOf('.')) : '',
        text: !name.endsWith('.png'),
        handle: fileHandle(join(dir, path), name),
      });
  }
  return out;
}

const summary = (changes) =>
  changes.map((c) => `${c.status} ${c.path}${c.skipped ? ` (${c.skipped})` : ''}`).sort();

describe.skipIf(!gitAvailable)('workingTreeChanges', () => {
  it('lists modified, added and deleted files with old and new text', async () => {
    const repo = makeRepo();
    repo.write('src/a.js', 'export const a = 1;\n');
    repo.write('src/b.js', 'export const b = 1;\n');
    repo.write('src/gone.js', 'export const gone = 1;\n');
    repo.git('add', '.');
    repo.git('commit', '-q', '-m', 'first');
    repo.write('src/a.js', 'export const a = 2;\n');
    repo.write('src/new.js', 'export const n = 1;\n');
    rmSync(join(repo.dir, 'src/gone.js'));
    const result = await workingTreeChanges(directoryHandle(repo.dir), projectFiles(repo.dir));
    expect(result.available).toBe(true);
    expect(summary(result.changes)).toEqual([
      'added src/new.js',
      'deleted src/gone.js',
      'modified src/a.js',
    ]);
    const a = result.changes.find((c) => c.path === 'src/a.js');
    expect(a).toMatchObject({ oldText: 'export const a = 1;\n', newText: 'export const a = 2;\n' });
    expect(result.changes.find((c) => c.path === 'src/gone.js').oldText).toContain('gone');
  });

  it('treats a CRLF copy of a committed LF file as unchanged', async () => {
    const repo = makeRepo();
    repo.write('a.js', 'one\ntwo\n');
    repo.git('add', '.');
    repo.git('commit', '-q', '-m', 'first');
    repo.write('a.js', 'one\r\ntwo\r\n');
    const result = await workingTreeChanges(directoryHandle(repo.dir), projectFiles(repo.dir));
    expect(result.changes).toEqual([]);
  });

  it('reports every file as added before the first commit', async () => {
    const repo = makeRepo();
    repo.write('a.js', 'x\n');
    const result = await workingTreeChanges(directoryHandle(repo.dir), projectFiles(repo.dir));
    expect(summary(result.changes)).toEqual(['added a.js']);
  });

  it('is unavailable without a .git folder', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'repomind-nogit-'));
    expect(await workingTreeChanges(directoryHandle(dir), [])).toEqual({ available: false });
  });
});

describe.skipIf(!gitAvailable)('commitChanges', () => {
  it('diffs a commit against its parent and skips binary files', async () => {
    const repo = makeRepo();
    repo.write('a.js', 'export const a = 1;\n');
    repo.write('b.js', 'export const b = 1;\n');
    repo.git('add', '.');
    repo.git('commit', '-q', '-m', 'first');
    repo.write('a.js', 'export const a = 2;\n');
    repo.write('img.png', Buffer.from([137, 80, 78, 71, 0, 1, 2]));
    repo.git('rm', '-q', 'b.js');
    repo.git('add', '.');
    repo.git('commit', '-q', '-m', 'second');
    const sha = repo.git('rev-parse', 'HEAD');
    const result = await commitChanges(directoryHandle(repo.dir), sha);
    expect(result.commit).toMatchObject({ sha, message: 'second', author: 'Test' });
    expect(summary(result.changes)).toEqual([
      'added img.png (binary)',
      'deleted b.js',
      'modified a.js',
    ]);
  });

  it('treats the first commit as adding every file', async () => {
    const repo = makeRepo();
    repo.write('a.js', 'x\n');
    repo.git('add', '.');
    repo.git('commit', '-q', '-m', 'root');
    const result = await commitChanges(directoryHandle(repo.dir), repo.git('rev-parse', 'HEAD'));
    expect(summary(result.changes)).toEqual(['added a.js']);
    expect(result.changes[0].newText).toBe('x\n');
  });
});
