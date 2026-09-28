import { useMemo } from 'react';
import { findDependencies } from '../../services/repository';
import { coverageFor } from '../../services/coverage';
import { fileImpact, symbolImpact } from '../../services/impact';

const ROW_LIMIT = 200;

function BlindSpots({ spots }) {
  if (!spots?.length) return null;
  return (
    <>
      <h3>Blind spots</h3>
      {spots.map((spot) => (
        <p className="coverage-note" key={spot.kind}>
          {spot.message}
        </p>
      ))}
    </>
  );
}

function Counts({ items }) {
  return (
    <div className="impact-counts">
      {items.map(([label, value]) => (
        <span key={label}>
          <b>{value}</b> {label}
        </span>
      ))}
    </div>
  );
}

// Change impact of the selected file (importers, transitively) and of one of its symbols (callers,
// transitively, with confidence). Blind spots say what the analysis cannot see.
export function ImpactView({
  index,
  selectedFile,
  setSelectedFile,
  impactSymbol,
  setImpactSymbol,
  onOpenFile,
}) {
  const files = useMemo(
    () => (selectedFile ? fileImpact(index, selectedFile) : null),
    [index, selectedFile],
  );
  const fileSymbols = useMemo(
    () =>
      index.symbols.filter(
        (s) => s.path === selectedFile && !(s.kind === 'variable' && s.scopeStart !== undefined),
      ),
    [index, selectedFile],
  );
  const symbol = useMemo(() => {
    const result = impactSymbol ? symbolImpact(index, impactSymbol) : null;
    return result?.root.path === selectedFile ? result : null;
  }, [index, impactSymbol, selectedFile]);
  const coverage = selectedFile ? coverageFor(index, selectedFile) : null;
  const deepest = files?.affected.reduce((max, a) => Math.max(max, a.depth), 0) || 0;

  return (
    <div className="analyze-grid">
      <div className="analytics-panel">
        <h2>File Impact</h2>
        <select value={selectedFile} onChange={(e) => setSelectedFile(e.target.value)}>
          <option value="">Select a file</option>
          {index.files.map((f) => (
            <option key={f.path}>{f.path}</option>
          ))}
        </select>
        {coverage?.gap && <p className="coverage-note">{coverage.note}</p>}
        {files && (
          <>
            <Counts
              items={[
                ['direct importers', files.direct],
                ['transitive', files.transitive],
                ['deepest level', deepest],
              ]}
            />
            <h3>Dependencies</h3>
            {findDependencies(index, selectedFile).map((p) => (
              <div className="index-row" key={p}>
                <b>{p}</b>
                <span>outgoing</span>
              </div>
            ))}
            <h3>Imported by</h3>
            {files.affected.slice(0, ROW_LIMIT).map((a) => (
              <button
                className="index-row clickable"
                key={a.path}
                onClick={() => setSelectedFile(a.path)}
                title="Show this file's impact"
              >
                <b>{a.path}</b>
                <span>{a.depth === 1 ? 'direct' : `level ${a.depth}`}</span>
                <small>{a.depth === 1 ? '' : `via ${a.via}`}</small>
              </button>
            ))}
            {!files.affected.length && <p className="muted">No file imports this one.</p>}
            <BlindSpots spots={files.blindSpots} />
          </>
        )}
      </div>
      <div className="analytics-panel">
        <h2>Symbol Impact</h2>
        {!selectedFile && <p className="muted">Select a file.</p>}
        {selectedFile && !symbol && (
          <>
            <p className="muted">Choose a symbol to see what uses it, directly and indirectly.</p>
            {fileSymbols.map((s) => (
              <button
                className="index-row clickable"
                key={s.definitionKey}
                onClick={() => setImpactSymbol(s.definitionKey)}
              >
                <b>{s.name}</b>
                <span>{s.kind}</span>
                <small>{s.references.length} refs</small>
              </button>
            ))}
            {!fileSymbols.length && <p className="muted">No symbols in this file.</p>}
          </>
        )}
        {symbol && (
          <>
            <div className="transform-toolbar">
              <b>
                {symbol.root.name} · {symbol.root.kind}
              </b>
              <button onClick={() => setImpactSymbol(null)}>← Symbols</button>
            </div>
            <Counts
              items={[
                ['affected', symbol.affected.length],
                ['files', symbol.files.length],
                ['high', symbol.counts.high],
                ['medium', symbol.counts.medium],
                ['low', symbol.counts.low],
              ]}
            />
            {symbol.affected.slice(0, ROW_LIMIT).map((a) => (
              <button
                className="impact-row clickable"
                key={a.key}
                onClick={() => onOpenFile(a.path)}
                title={`${a.via.name} is used at ${a.via.path}:${a.via.line}`}
              >
                <b>{a.name || '(module code)'}</b>
                <span>
                  {a.path}:{a.via.line}
                </span>
                <small>level {a.depth}</small>
                <span className={'confidence conf-' + a.confidence}>{a.confidence}</span>
              </button>
            ))}
            {!symbol.affected.length && <p className="muted">Nothing uses this symbol.</p>}
            {symbol.truncated && (
              <p className="muted">Showing the first {symbol.affected.length} affected items.</p>
            )}
            <BlindSpots spots={symbol.blindSpots} />
          </>
        )}
      </div>
    </div>
  );
}
