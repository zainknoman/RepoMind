import JSZip from 'jszip';
import {
  EXTS,
  IGN,
  MAX_FILES,
  maybeBasicName,
  looksLikeBasic,
  sensitiveName,
  gitignoreMatcher,
} from '../lib/files';

const GITHUB_HOST = 'github.com';

export function parseGithubUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) throw new Error('Enter a GitHub repository URL');

  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('Enter a valid GitHub repository URL');
  }

  if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== GITHUB_HOST)
    throw new Error('Only https://github.com repository URLs are supported');

  const parts = url.pathname
    .split('/')
    .filter(Boolean)
    .map((part) => decodeURIComponent(part));

  if (parts.length < 2) throw new Error('GitHub URL must look like https://github.com/owner/repository');

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
    if (response.status === 404)
      throw new Error('GitHub repository not found, or it is private');
    if (response.status === 403 || response.status === 429)
      throw new Error('GitHub API rate limit reached. Try again later.');
    throw new Error(`GitHub request failed (${response.status})`);
  }
  return response.json();
}

function archivePath(name) {
  const normalized = name.replace(/\\/g, '/').replace(/^\/+/, '');
  const slash = normalized.indexOf('/');
  return slash >= 0 ? normalized.slice(slash + 1) : normalized;
}

function shouldIgnorePath(path) {
  return path.split('/').some((part) => IGN.has(part));
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

export async function importGithubRepository(value, options = {}) {
  const {
    includeSensitive = false,
    signal,
    onProgress,
    fetchImpl = fetch,
  } = options;
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

  onProgress?.({ phase: 'download', current: 0, total: 1, path: null });
  const archiveUrl =
    `https://codeload.github.com/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}/zip/refs/heads/${branch
      .split('/')
      .map(encodeURIComponent)
      .join('/')}`;
  const archiveResponse = await fetchImpl(archiveUrl, { signal });
  if (!archiveResponse.ok)
    throw new Error(
      archiveResponse.status === 404
        ? `Unable to download branch "${branch}" from GitHub`
        : `GitHub archive download failed (${archiveResponse.status})`,
    );

  const zip = await JSZip.loadAsync(await archiveResponse.blob());
  const files = [];
  const entries = Object.values(zip.files).filter((entry) => !entry.dir);
  const candidates = entries.filter((entry) => {
    const path = archivePath(entry.name);
    return path && !shouldIgnorePath(path) && (isCandidate(path.split('/').pop()) || basicCandidate(path.split('/').pop()));
  });

  onProgress?.({ phase: 'extract', current: 0, total: candidates.length, path: null });
  for (let i = 0; i < candidates.length && files.length < MAX_FILES; i++) {
    if (signal?.aborted) throw new DOMException('Import cancelled', 'AbortError');

    const entry = candidates[i];
    const path = archivePath(entry.name);
    const name = path.split('/').pop();
    let ext = extensionOf(name);
    let text = true;

    if (!includeSensitive && sensitiveName.test(path)) text = false;
    if (!text) {
      onProgress?.({ phase: 'extract', current: i + 1, total: candidates.length, path });
      continue;
    }

    let content = '';
    try {
      content = await entry.async('string');
    } catch {
      text = false;
    }

    if (text && content.length > 2 * 1024 * 1024) text = false;

    if (text && !isCandidate(name) && basicCandidate(name)) {
      if (looksLikeBasic(content.slice(0, 4096))) ext = '.b';
      else text = false;
    }

    if (text) {
      files.push({
        name,
        path,
        ext,
        text: true,
        content,
        size: content.length,
        lastModified: entry.date?.getTime?.() || 0,
      });
    }
    onProgress?.({ phase: 'extract', current: i + 1, total: candidates.length, path });
  }

  const gitignore = files.find((file) => file.path === '.gitignore');
  const filtered = gitignore
    ? files.filter((file) => file.path === '.gitignore' || !gitignoreMatcher(gitignore.content)(file.path))
    : files;

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
