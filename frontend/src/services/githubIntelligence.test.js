import { describe, expect, it } from 'vitest';
import {
  fetchGithubBranches,
  fetchGithubCommits,
  fetchGithubIssues,
  fetchGithubPullRequests,
  fetchGithubReleases,
  githubFileImpact,
} from './githubIntelligence';
import { buildRepositoryIndex } from './repository';
import { toWorkerProject } from './indexProject';

const source = { owner: 'zainknoman', repo: 'RepoMind', branch: 'main' };
const mockFetch = (payload) => {
  const calls = [];
  return {
    calls,
    fetchImpl: async (url) => {
      calls.push(url);
      return { ok: true, json: async () => payload };
    },
  };
};

describe('githubIntelligence', () => {
  it('builds public GitHub resource URLs and pagination', async () => {
    const mock = mockFetch([]);
    await fetchGithubBranches(source, 2, { fetchImpl: mock.fetchImpl });
    await fetchGithubCommits(source, 3, { fetchImpl: mock.fetchImpl });
    await fetchGithubPullRequests(source, 4, { fetchImpl: mock.fetchImpl });
    await fetchGithubIssues(source, 5, { fetchImpl: mock.fetchImpl });
    await fetchGithubReleases(source, 6, { fetchImpl: mock.fetchImpl });
    expect(mock.calls).toEqual([
      'https://api.github.com/repos/zainknoman/RepoMind/branches?per_page=30&page=2',
      'https://api.github.com/repos/zainknoman/RepoMind/commits?sha=main&per_page=30&page=3',
      'https://api.github.com/repos/zainknoman/RepoMind/pulls?state=all&sort=updated&direction=desc&per_page=30&page=4',
      'https://api.github.com/repos/zainknoman/RepoMind/issues?state=all&sort=updated&direction=desc&per_page=30&page=5',
      'https://api.github.com/repos/zainknoman/RepoMind/releases?per_page=30&page=6',
    ]);
  });
  it('filters pull requests out of issues', async () => {
    const mock = mockFetch([
      { number: 1, title: 'issue' },
      { number: 2, title: 'pull', pull_request: { url: 'x' } },
    ]);
    await expect(fetchGithubIssues(source, 1, { fetchImpl: mock.fetchImpl })).resolves.toEqual([
      { number: 1, title: 'issue' },
    ]);
  });
  it('uses the existing file-impact graph for GitHub changes', async () => {
    const project = toWorkerProject('fixture', [
      { path: 'core.js', name: 'core.js', ext: '.js', content: 'export function core() {}\n' },
      {
        path: 'mid.js',
        name: 'mid.js',
        ext: '.js',
        content: "import { core } from './core';\nexport function mid() { return core(); }\n",
      },
      {
        path: 'top.js',
        name: 'top.js',
        ext: '.js',
        content: "import { mid } from './mid';\nexport function top() { return mid(); }\n",
      },
    ]);
    const index = await buildRepositoryIndex(project);
    const result = githubFileImpact(index, [{ filename: 'core.js', status: 'modified' }]);
    expect(result.counts).toMatchObject({ files: 1, direct: 1, transitive: 1 });
    expect(result.affected.map((item) => item.path)).toEqual(['mid.js', 'top.js']);
  });
});
