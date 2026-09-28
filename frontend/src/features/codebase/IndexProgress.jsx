/** How the index on screen was obtained, e.g. "✓ Updated index (3 changed, 1,497 unchanged)". */
export function indexSourceLabel(source, stats) {
  if (source === 'cached') return '⚡ Cached index';
  const reused = stats?.reusedFiles || 0;
  if (!reused) return '✓ Fresh index';
  const changed = (stats.files || 0) - reused;
  return `✓ Updated index (${changed.toLocaleString()} changed, ${reused.toLocaleString()} unchanged)`;
}

export function IndexProgress({ progress }) {
  if (!progress) return null;
  return (
    <div className="index-progress">
      <div>
        <b>
          {{ read: 'Reading', analyze: 'Indexing' }[progress.phase] || 'Finalizing'}{' '}
          {progress.current || 0}/{progress.total || 0}
        </b>
        <span>
          {progress.reused ? `${progress.reused.toLocaleString()} unchanged · ` : ''}
          {progress.path || ''}
        </span>
      </div>
      <i>
        <b
          style={{
            width: Math.max(4, ((progress.current || 0) / (progress.total || 1)) * 100) + '%',
          }}
        />
      </i>
    </div>
  );
}
