import {
  EXTS,
  IGN,
  MAX_FILES,
  maybeBasicName,
  looksLikeBasic,
  sensitiveName,
  gitignoreMatcher,
} from '../lib/files';

const GITHUB_HOSTS = new Set(['github.com', 'www.github.com']);
const MAX_TEXT_BYTES = 2 * 1024 * 1024;
const FETCH_CONCURRENCY = 8;

export function parseGithubUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) throw new Error('Enter a GitHub repository URL');

  const candidate = /^[a-z][a-z\d+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;

  let url;
  try {
    url = new URL(candidate);
  } catch {
    throw new Error('Enter a valid GitHub repository URL');
  }

  if (url.protocol !== 'https:' || !GITHUB_HOSTS.has(url.hostname.toLowerCase()))
    throw new Error('Only https://github.com repository URLs are supported');

  const parts = url.pathname
    .split('/')
    .filter(Boolean)
    .map((part) => decodeURIComponent(part));

  if (parts.length < 2)
    throw new Error('GitHub URL must look like https://github.com/owner/repository');

  const owner = parts[0];
  const repo = parts[1].replace(/\.git$/i, '');
  if (!owner || !repo) throw new Error('GitHub URL is missing the owner or repository');

  let branch = null;
  if (parts[2] === 'tree' && parts.length >= 4) branch = parts.slice(3).join('/');
  else if (parts[2] && parts[2] !== 'tree')
    throw new Error('P0 accepts repository URLs and /tree/<branch> URLs only');

  return {
    owner,
    repo,
    branch,
    url: `https://github.com/${owner}/${repo}`,
  };
}

async function fetchJson(url, { signal, fetchImpl }) {
  const response = await fetchImpl(url, {
    signal,
    headers: { Accept: 'application/vnd.github+json' },
  });
  if (!response.ok) {
    if (response.status === 404) throw new Error('GitHub repository not found, or it is private');
    if (response.status === 403 || response.status === 429)
      throw new Error('GitHub API rate limit reached. Try again later.');
    throw new Error(`GitHub request failed (${response.status})`);
  }
  return response.json();
}

function extensionOf(name) {
  const lower = name.toLowerCase();
  const dot = lower.lastIndexOf('.');
  return dot >= 0 ? lower.slice(dot) : '';
}

function isCandidate(name) {
  return EXTS.has(extensionOf(name)) || ['Dockerfile', 'Makefile', '.gitignore'].includes(name);
}

function basicCandidate(name) {
  return !isCandidate(name) && maybeBasicName(name);
}

function ignoredByGitignore(path, matcher) {
  return matcher ? matcher(path) : false;
}

async function fetchTextFile(owner, repo, branch, path, { signal, fetchImpl }) {
  const rawPath = path.split('/').map(encodeURIComponent).join('/');
  const rawBranch = branch.split('/').map(encodeURIComponent).join('/');
  const url = `https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${rawBranch}/${rawPath}`;
  const response = await fetchImpl(url, { signal });
  if (!response.ok) throw new Error(`Unable to fetch GitHub file: ${path} (${response.status})`);
  return response.text();
}

async function mapConcurrent(items, worker, concurrency) {
  const results = new Array(items.length);
  let cursor = 0;
  async function run() {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run));
  return results;
}

export async function importGithubRepository(value, options = {}) {
  const { includeSensitive = false, signal, onProgress, fetchImpl = fetch } = options;
  const parsed = parseGithubUrl(value);

  onProgress?.({ phase: 'metadata', current: 0, total: 1, path: null });
  const metadata = await fetchJson(
    `https://api.github.com/repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}`,
    { signal, fetchImpl },
  );
  const branch = parsed.branch || metadata.default_branch;
  if (!branch) throw new Error('GitHub repository has no default branch');

  const commit = await fetchJson(
    `https://api.github.com/repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}/commits/${encodeURIComponent(branch)}`,
    { signal, fetchImpl },
  );
  const commitSha = commit.sha || branch;

  onProgress?.({ phase: 'tree', current: 0, total: 1, path: null });
  const tree = await fetchJson(
    `https://api.github.com/repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
    { signal, fetchImpl },
  );
  if (tree.truncated)
    throw new Error(
      'GitHub returned a truncated repository tree. This P0 importer cannot safely analyze a repository of this size yet.',
    );

  const entries = (tree.tree || []).filter((entry) => entry.type === 'blob');
  const rootIgnore = entries.find((entry) => entry.path === '.gitignore');
  let rootIgnoreContent = null;
  let ignoreMatcher = null;
  if (rootIgnore) {
    rootIgnoreContent = await fetchTextFile(parsed.owner, parsed.repo, branch, '.gitignore', {
      signal,
      fetchImpl,
    });
    ignoreMatcher = gitignoreMatcher(rootIgnoreContent);
  }

  const candidates = entries.filter((entry) => {
    const name = entry.path.split('/').pop();
    if (ignoredByGitignore(entry.path, ignoreMatcher)) return false;
    if (entry.path.split('/').some((part) => IGN.has(part))) return false;
    if (!isCandidate(name) && !basicCandidate(name)) return false;
    if (!includeSensitive && sensitiveName.test(entry.path)) return false;
    if (typeof entry.size === 'number' && entry.size > MAX_TEXT_BYTES) return false;
    return true;
  });

  const selected = candidates.slice(0, MAX_FILES);
  onProgress?.({ phase: 'download', current: 0, total: selected.length, path: null });

  const files = await mapConcurrent(
    selected,
    async (entry, index) => {
      if (signal?.aborted) throw new DOMException('Import cancelled', 'AbortError');
      const name = entry.path.split('/').pop();
      let content =
        entry.path === '.gitignore' && rootIgnoreContent !== null
          ? rootIgnoreContent
          : await fetchTextFile(parsed.owner, parsed.repo, branch, entry.path, {
              signal,
              fetchImpl,
            });
      if (content.length > MAX_TEXT_BYTES) content = content.slice(0, MAX_TEXT_BYTES + 1);
      let ext = extensionOf(name);
      let text = content.length <= MAX_TEXT_BYTES;

      if (text && !isCandidate(name) && basicCandidate(name)) {
        if (looksLikeBasic(content.slice(0, 4096))) ext = '.b';
        else text = false;
      }

      onProgress?.({
        phase: 'download',
        current: index + 1,
        total: selected.length,
        path: entry.path,
      });

      return text
        ? {
            name,
            path: entry.path,
            ext,
            text: true,
            content,
            size: entry.size ?? content.length,
            lastModified: 0,
          }
        : null;
    },
    FETCH_CONCURRENCY,
  );

  const filtered = files.filter(Boolean);
  const extStats = {};
  for (const file of filtered) extStats[file.ext] = (extStats[file.ext] || 0) + 1;

  return {
    name: metadata.name || parsed.repo,
    description: metadata.description || '',
    files: filtered,
    stats: { ext: extStats },
    openedAt: Date.now(),
    source: {
      type: 'github',
      url: parsed.url,
      owner: parsed.owner,
      repo: parsed.repo,
      branch,
      commit: commitSha,
      defaultBranch: metadata.default_branch,
    },
    truncated: candidates.length > MAX_FILES,
    github: {
      stars: metadata.stargazers_count || 0,
      forks: metadata.forks_count || 0,
      language: metadata.language || null,
      private: Boolean(metadata.private),
      htmlUrl: metadata.html_url || parsed.url,
    },
  };
}
