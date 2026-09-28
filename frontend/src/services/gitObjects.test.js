import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { directoryHandle } from '../test-utils/nodeHandles';
import { createObjectStore, flattenTree, parseCommit } from './gitObjects';

let gitAvailable = true;
try {
  execFileSync('git', ['--version'], { stdio: 'pipe' });
} catch {
  gitAvailable = false;
}

// A repository with several commits of a large file, so `git gc` stores later versions as deltas.
function makeRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'repomind-objects-'));
  const git = (...args) =>
    execFileSync('git', args, { cwd: dir, stdio: 'pipe', encoding: 'utf8' }).trim();
  git('init', '-q');
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'Test');
  git('config', 'core.autocrlf', 'false');
  const lines = Array.from({ length: 400 }, (_, i) => `line ${i} of a file that compresses well`);
  for (let version = 0; version < 4; version++) {
    lines[version * 50] = `changed in version ${version}`;
    writeFileSync(join(dir, 'big.txt'), lines.join('\n'));
    writeFileSync(join(dir, `note${version}.md`), `# Note ${version}\n`);
    git('add', '.');
    git('commit', '-q', '-m', `version ${version}`);
  }
  return { dir, git };
}

async function expectAllObjectsMatch({ dir, git }) {
  const store = createObjectStore(await directoryHandle(dir).getDirectoryHandle('.git'));
  const shas = git('rev-list', '--objects', '--all')
    .split('\n')
    .map((line) => line.split(' ')[0]);
  expect(shas.length).toBeGreaterThan(10);
  for (const sha of shas) {
    const object = await store.read(sha);
    expect(object.type).toBe(git('cat-file', '-t', sha));
    const expected = execFileSync('git', ['cat-file', object.type, sha], { cwd: dir });
    expect(Buffer.from(object.bytes).equals(expected)).toBe(true);
  }
  return store;
}

describe.skipIf(!gitAvailable)('git object store', () => {
  it('reads loose objects exactly as git stores them', async () => {
    await expectAllObjectsMatch(makeRepo());
  });

  it('reads packed and delta-compressed objects after git gc', async () => {
    const repo = makeRepo();
    repo.git('gc', '-q', '--aggressive');
    // Proof that the pack really contains deltas, so the delta code ran.
    const packDir = join(repo.dir, '.git', 'objects', 'pack');
    const idx = readdirSync(packDir).find((name) => name.endsWith('.idx'));
    expect(repo.git('verify-pack', '-v', join(packDir, idx))).toMatch(/chain length = [1-9]/);
    await expectAllObjectsMatch(repo);
  });

  it('parses commits and flattens trees', async () => {
    const repo = makeRepo();
    repo.git('gc', '-q');
    const store = createObjectStore(await directoryHandle(repo.dir).getDirectoryHandle('.git'));
    const head = repo.git('rev-parse', 'HEAD');
    const commit = parseCommit((await store.read(head)).bytes);
    expect(commit.tree).toBe(repo.git('rev-parse', 'HEAD^{tree}'));
    expect(commit.parents).toEqual([repo.git('rev-parse', 'HEAD~1')]);
    expect(commit.message).toBe('version 3');
    const files = await flattenTree(store, commit.tree);
    expect([...files.keys()].sort()).toEqual([
      'big.txt',
      'note0.md',
      'note1.md',
      'note2.md',
      'note3.md',
    ]);
    expect(files.get('big.txt')).toBe(repo.git('rev-parse', 'HEAD:big.txt'));
  });

  it('reports a missing object as null', async () => {
    const { dir } = makeRepo();
    const store = createObjectStore(await directoryHandle(dir).getDirectoryHandle('.git'));
    expect(await store.read('0'.repeat(40))).toBeNull();
  });
});
