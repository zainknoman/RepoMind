// Header navigation: [group, [[tab id, label], …]].
// Codebase is the centre of the product. Tools is a deliberately small, secondary group: RepoMind
// is a codebase intelligence workspace, not a collection of utilities.
// Tab ids key App state and ?tool= deep links, so rename labels, never ids.
// The Engineering workspace is intentionally absent; it still opens from ?tool=eng.
export const NAV_GROUPS = [
  [
    'Understand',
    [
      ['dashboard', 'Dashboard'],
      ['codebase', 'Codebase'],
    ],
  ],
  [
    'Explore',
    [
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
    ],
  ],
  [
    'Tools',
    [
      ['tools', 'Developer Tools'],
      ['ofs', 'Temenos / OFS'],
      ['mdviewer', 'Markdown'],
    ],
  ],
];

export const PRIMARY_TAB = 'codebase';
export const SECONDARY_GROUP = 'Tools';
