export function IndexProgress({ progress }) {
  if (!progress) return null;
  return (
    <div className="index-progress">
      <div>
        <b>
          {{ read: 'Reading', analyze: 'Indexing' }[progress.phase] || 'Finalizing'}{' '}
          {progress.current || 0}/{progress.total || 0}
        </b>
        <span>{progress.path || ''}</span>
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
