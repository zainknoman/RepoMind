# GitHub Intelligence (P1) Implementation Plan

> P1 follows the completed P0 public GitHub import. Private repositories and OAuth are explicitly P2.

## Goal

Make a public GitHub import a first-class RepoMind Git workspace without changing the local-first indexing model.

## Scope

- Repository metadata
- Branches
- Commits
- Pull Requests
- Issues
- Releases
- GitHub links for source records
- Change Impact for commits and pull requests using the current RepoMind dependency graph
- Pagination, loading/error states and API rate-limit handling
- Documentation, Help and tests

## Constraints

- Public repositories only.
- Read-only GitHub API usage.
- No OAuth or private repository support.
- No backend.
- Historical GitHub source is never represented as analysed unless it exists in the current imported index.
- Exactly one final push to main after all P1 work and validation is complete.

## Outcome

Implementation complete: GitHub Intelligence is available for public imports, with read-only resource browsing and commit/PR change-impact integration. Validation is represented by the repository test suite and CI after the final main update. Private repositories/OAuth remain P2.

## Acceptance

- A GitHub-imported repository shows Repository, Branches, Commits, Pull Requests, Issues, Releases and Change Impact under Codebase › Git.
- Commit and PR records link to GitHub.
- Commit/PR Change Impact uses the existing dependency graph and reports direct/transitive affected files plus blind spots.
- Local-folder Git Intelligence remains unchanged.
- Unit tests cover GitHub API routing/filtering and graph integration.
- Format, lint, unit tests, build and E2E are green before the single final push.
