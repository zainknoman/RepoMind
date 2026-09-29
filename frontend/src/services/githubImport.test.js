import { describe, expect, it } from 'vitest';
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
