import { fileImpact } from './impact';

const API = 'https://api.github.com';
const PER_PAGE = 30;

function sourceParts(source) {
  if (!source?.owner || !source?.repo) throw new Error('GitHub repository metadata is missing');
  return { owner: encodeURIComponent(source.owner), repo: encodeURIComponent(source.repo) };
}
async function request(path, { signal, fetchImpl = fetch } = {}) {
  const response = await fetchImpl(API + path, { signal, headers: { Accept: 'application/vnd.github+json' } });
  if (!response.ok) {
    if (response.status === 404) throw new Error('GitHub resource not found');
    if (response.status === 403 || response.status === 429) throw new Error('GitHub API rate limit reached. Try again later.');
    throw new Error('GitHub request failed (' + response.status + ')');
  }
  return response.json();
}
const pageUrl = (path, page) => path + (path.includes('?') ? '&' : '?') + 'per_page=' + PER_PAGE + '&page=' + page;
export async function fetchGithubRepository(source, options) { const p = sourceParts(source); return request('/repos/' + p.owner + '/' + p.repo, options); }
export async function fetchGithubBranches(source, page = 1, options) { const p = sourceParts(source); return request(pageUrl('/repos/' + p.owner + '/' + p.repo + '/branches', page), options); }
export async function fetchGithubCommits(source, page = 1, options) { const p = sourceParts(source); const branch = source.branch ? '?sha=' + encodeURIComponent(source.branch) : ''; return request(pageUrl('/repos/' + p.owner + '/' + p.repo + '/commits' + branch, page), options); }
export async function fetchGithubPullRequests(source, page = 1, options) { const p = sourceParts(source); return request(pageUrl('/repos/' + p.owner + '/' + p.repo + '/pulls?state=all&sort=updated&direction=desc', page), options); }
export async function fetchGithubIssues(source, page = 1, options) { const p = sourceParts(source); return request(pageUrl('/repos/' + p.owner + '/' + p.repo + '/issues?state=all&sort=updated&direction=desc', page), options).then((items) => items.filter((item) => !item.pull_request)); }
export async function fetchGithubReleases(source, page = 1, options) { const p = sourceParts(source); return request(pageUrl('/repos/' + p.owner + '/' + p.repo + '/releases', page), options); }
export async function fetchGithubCommit(source, sha, options) { const p = sourceParts(source); return request('/repos/' + p.owner + '/' + p.repo + '/commits/' + encodeURIComponent(sha), options); }
export async function fetchGithubPullRequestFiles(source, number, page = 1, options) { const p = sourceParts(source); return request(pageUrl('/repos/' + p.owner + '/' + p.repo + '/pulls/' + number + '/files', page), options); }

export function githubFileImpact(index, changedFiles) {
  const affected = new Map(); const blindSpots = new Map();
  const addBlind = (spot) => { if (spot && !blindSpots.has(spot.kind)) blindSpots.set(spot.kind, spot); };
  const files = (changedFiles || []).map((file) => ({ path: file.filename || file.path, status: file.status || 'modified', additions: file.additions || 0, deletions: file.deletions || 0, changes: file.changes || 0 }));
  for (const file of files) {
    if (!index?.files?.some((item) => item.path === file.path)) { addBlind({ kind: 'missing-file', message: file.path + ' is not present in the current imported index; its historical content was not analysed.' }); continue; }
    const result = fileImpact(index, file.path);
    for (const item of result.affected) { const current = affected.get(item.path); if (!current || item.depth < current.depth) affected.set(item.path, { path: item.path, depth: item.depth, via: item.via }); }
    for (const spot of result.blindSpots || []) addBlind(spot);
  }
  const list = [...affected.values()].sort((a, b) => a.depth - b.depth || a.path.localeCompare(b.path));
  return { files, affected: list, counts: { files: files.length, direct: list.filter((item) => item.depth === 1).length, transitive: list.filter((item) => item.depth > 1).length }, blindSpots: [...blindSpots.values()] };
}
