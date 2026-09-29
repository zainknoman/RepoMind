import { describe, expect, it, vi } from 'vitest';
import { importGithubRepository } from './githubImport';
import { parseGithubUrl } from './githubImport';

describe('parseGithubUrl', () => {
  it('parses a repository URL', () => {
    expect(parseGithubUrl('https://github.com/zainknoman/RepoMind/')).toEqual({
      owner: 'zainknoman',
      repo: 'RepoMind',
      branch: null,
      url: 'https://github.com/zainknoman/RepoMind',
    });
  });

  it('parses a .git URL and branch URL', () => {
    expect(parseGithubUrl('https://github.com/acme/app.git/tree/feature/api')).toMatchObject({
      owner: 'acme',
      repo: 'app',
      branch: 'feature/api',
    });
  });

  it('rejects non-GitHub and file URLs', () => {
    expect(() => parseGithubUrl('https://gitlab.com/acme/app')).toThrow(/Only/);
    expect(() => parseGithubUrl('https://github.com/acme/app/blob/main/README.md')).toThrow(
      /repository URLs/,
    );
  });

  it('rejects missing repositories', () => {
    expect(() => parseGithubUrl('https://github.com/acme')).toThrow(/owner.*repository/i);
  });
});

describe('importGithubRepository', () => {
  it('imports supported files, applies ignore rules and keeps GitHub source metadata', async () => {
    const responses = new Map([
      [
        'metadata',
        {
          name: 'demo',
          default_branch: 'main',
          description: 'Demo',
          html_url: 'https://github.com/acme/demo',
        },
      ],
      ['commit', { sha: 'abc123' }],
      [
        'tree',
        {
          truncated: false,
          tree: [
            { path: '.gitignore', type: 'blob', size: 9 },
            { path: 'src/App.jsx', type: 'blob', size: 31 },
            { path: 'src/ignored.txt', type: 'blob', size: 7 },
            { path: 'ignored/file.js', type: 'blob', size: 7 },
            { path: '.env', type: 'blob', size: 12 },
          ],
        },
      ],
    ]);

    const fetchImpl = vi.fn(async (url) => {
      if (url.includes('/repos/acme/demo/git/trees/')) {
        return { ok: true, json: async () => responses.get('tree') };
      }
      if (url.includes('/repos/acme/demo/commits/')) {
        return { ok: true, json: async () => responses.get('commit') };
      }
      if (url.includes('/repos/acme/demo') && !url.includes('raw.')) {
        return { ok: true, json: async () => responses.get('metadata') };
      }
      if (url.endsWith('/main/.gitignore'))
        return {
          ok: true,
          text: async () => 'src/ignored.txt\nignored/\n',
        };
      if (url.endsWith('/main/src/App.jsx'))
        return { ok: true, text: async () => 'export default function App() {}' };
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const project = await importGithubRepository('https://github.com/acme/demo', {
      fetchImpl,
    });

    expect(project.source).toMatchObject({
      type: 'github',
      owner: 'acme',
      repo: 'demo',
      branch: 'main',
      commit: 'abc123',
    });
    expect(project.files.map((file) => file.path)).toEqual(['.gitignore', 'src/App.jsx']);
    expect(fetchImpl).toHaveBeenCalledTimes(5);
  });
});
