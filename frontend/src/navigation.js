// Header navigation: [group, [[tab id, label], …]].
// RepoMind has two top-level workflows: Workspace for repository navigation and Analyze for
// code understanding, transformation and documentation. Codebase is the centre of the product.
export const NAV_GROUPS = [
  [
    'Workspace',
    [
      ['dashboard', 'Dashboard'],
      ['codebase', 'Codebase'],
      ['explorer', 'Explorer'],
      ['search', 'Search'],
      ['editor', 'Editor'],
    ],
  ],
  [
    'Analyze',
    [
      ['ingest', 'Ingest'],
      ['analyze', 'Quick Analysis'],
      ['transform', 'Transform'],
      ['diff', 'Compare'],
      ['mdviewer', 'Markdown'],
    ],
  ],
];

export const PRIMARY_TAB = 'codebase';
