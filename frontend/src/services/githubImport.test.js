import JSZip from 'jszip';
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
    const zip = new JSZip();
    zip.file('demo-main/.gitignore', 'ignored/\n');
    zip.file('demo-main/src/App.jsx', 'export default function App() {}');
    zip.file('demo-main/src/ignored.txt', 'ignored');
    zip.file('demo-main/ignored/file.js', 'ignored');
    zip.file('demo-main/.env', 'SECRET=value');
    const blob = await zip.generateAsync({ type: 'blob' });

    const fetchImpl = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          name: 'demo',
          default_branch: 'main',
          description: 'Demo',
          html_url: 'https://github.com/acme/demo',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ sha: 'abc123' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        blob: async () => blob,
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
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
});
