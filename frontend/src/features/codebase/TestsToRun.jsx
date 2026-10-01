// Test files a change or a symbol reaches (by naming convention): what to run before merging.
export function TestsToRun({ tests, onOpenFile }) {
  if (!tests?.length) return null;
  return (
    <div className="tests-to-run">
      <h3>Tests to run ({tests.length})</h3>
      {tests.map((t) => (
        <button
          className="mini-row clickable"
          key={t.path}
          onClick={() => onOpenFile(t.path)}
          title={t.because.join(', ')}
        >
          {t.path} <small className="muted">— {t.because.join(', ')}</small>
        </button>
      ))}
    </div>
  );
}
