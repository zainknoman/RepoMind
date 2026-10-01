import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { directoryHandle, fileHandle } from '../test-utils/nodeHandles';
import { commitChanges, commitSnapshot, workingTreeChanges, workingTreeStatus } from './gitChanges';
import { buildRepositoryIndex } from './repository';
import { toWorkerProject } from './indexProject';
import { changeImpact } from './changeImpact';
import { gitStatusSummary } from './git';

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

describe.skipIf(!gitAvailable)('workingTreeChanges', { timeout: 60_000 }, () => {
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

describe.skipIf(!gitAvailable)('commitChanges', { timeout: 60_000 }, () => {
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

describe.skipIf(!gitAvailable)('workingTreeStatus', { timeout: 60_000 }, () => {
  it('compares content, so a touched but unchanged file is not modified', async () => {
    const repo = makeRepo();
    repo.write('a.js', 'a\n');
    repo.write('b.js', 'b\n');
    repo.write('c.js', 'c\n');
    repo.git('add', '.');
    repo.git('commit', '-q', '-m', 'first');
    repo.write('a.js', 'a2\n');
    repo.write('b.js', 'b\n');
    const later = new Date(Date.now() + 100_000);
    utimesSync(join(repo.dir, 'b.js'), later, later);
    rmSync(join(repo.dir, 'c.js'));
    repo.write('new.js', 'n\n');
    const root = directoryHandle(repo.dir);
    const files = projectFiles(repo.dir);
    expect(await workingTreeStatus(root, files)).toMatchObject({
      available: true,
      modified: ['a.js'],
      added: ['new.js'],
      deleted: ['c.js'],
    });
    const summary = await gitStatusSummary(root, files);
    expect(summary).toMatchObject({ modified: ['a.js'], deleted: ['c.js'], untracked: ['new.js'] });
  });
});

describe.skipIf(!gitAvailable)('commitSnapshot', { timeout: 60_000 }, () => {
  it('indexes a commit as it was, so its impact is traced against its own code', async () => {
    const repo = makeRepo();
    repo.write('lib.js', 'export function oldName() {\n  return 1;\n}\n');
    repo.write('use.js', "import { oldName } from './lib';\noldName();\n");
    repo.write('node_modules/dep/index.js', 'module.exports = 1;\n');
    repo.write('big.js', 'x'.repeat(2 * 1024 * 1024 + 10));
    repo.write('BP/ACCOUNT.CHECK', '    SUBROUTINE ACCOUNT.CHECK\n    RETURN\n');
    repo.git('add', '-f', '.');
    repo.git('commit', '-q', '-m', 'first');
    const first = repo.git('rev-parse', 'HEAD');
    repo.write('lib.js', 'export function oldName() {\n  return 2;\n}\n');
    repo.git('commit', '-qam', 'change body');
    const second = repo.git('rev-parse', 'HEAD');
    // Later, the function is renamed everywhere.
    repo.write('lib.js', 'export function newName() {\n  return 2;\n}\n');
    repo.write('use.js', "import { newName } from './lib';\nnewName();\n");
    repo.git('commit', '-qam', 'rename');
    const root = directoryHandle(repo.dir);

    const snapshot = await commitSnapshot(root, second);
    expect(snapshot.files.map((f) => `${f.path}:${f.ext}`).sort()).toEqual([
      'BP/ACCOUNT.CHECK:.b',
      'lib.js:.js',
      'use.js:.js',
    ]);
    expect(snapshot.files.find((f) => f.path === 'lib.js').content).toContain('return 2');
    expect(snapshot.source).toMatchObject({ type: 'commit', commit: second });

    const changes = (await commitChanges(root, second)).changes;
    const then = await buildRepositoryIndex(toWorkerProject(snapshot.name, snapshot.files));
    expect(changeImpact(then, changes).affected.map((a) => a.path)).toEqual(['use.js']);
    // Today's code no longer has oldName, so the current index cannot trace that commit.
    const now = await buildRepositoryIndex(
      toWorkerProject('now', [
        { path: 'lib.js', name: 'lib.js', ext: '.js', content: 'export function newName() {}\n' },
        {
          path: 'use.js',
          name: 'use.js',
          ext: '.js',
          content: "import { newName } from './lib';\nnewName();\n",
        },
      ]),
    );
    expect(changeImpact(now, changes).affected).toEqual([]);
    expect(first).not.toBe(second);
  });
});
