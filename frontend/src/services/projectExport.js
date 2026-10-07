import { serializeIndex } from './indexCache';

export const PROJECT_EXPORT_SCHEMA_VERSION = '1.0';

function cleanSource(source) {
  if (!source) return { type: 'local' };
  return {
    type: source.type || 'local',
    owner: source.owner || null,
    repo: source.repo || null,
    branch: source.branch || null,
    ref: source.ref || null,
    commit: source.commit || null,
    url: source.url || null,
  };
}

/**
 * Builds the complete portable RepoMind project snapshot.
 * File-system handles and source contents are intentionally excluded; the export contains the
 * analyzed repository model needed by consumers such as TEP.
 */
export function buildProjectExport(project, index, { exportedAt = new Date().toISOString() } = {}) {
  if (!project) throw new Error('A project must be open before exporting');
  if (!index) throw new Error('Build the project index before exporting');

  const snapshot = serializeIndex(index);
  return {
    schemaVersion: PROJECT_EXPORT_SCHEMA_VERSION,
    toolVersion: 'repomind-ui-0.11.0',
    exportedAt,
    project: {
      name: project.name,
      source: cleanSource(project.source),
      openedAt: project.openedAt || null,
      truncated: Boolean(project.truncated),
    },
    ...snapshot,
  };
}

export function downloadProjectExport(project, index) {
  const snapshot = buildProjectExport(project, index);
  const json = JSON.stringify(snapshot, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${project.name || 'repository'}-repomind-export.json`;
  anchor.click();
  URL.revokeObjectURL(url);
  return snapshot;
}