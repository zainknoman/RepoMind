import { useState } from 'react';
import { SEVERITIES, countBySeverity } from '../../services/analyzers';

const ROW_LIMIT = 100;

// Every registered analyzer, with one findings table per analyzer (columns declared by the
// analyzer). Clicking a file opens it in the Editor.
export function AnalyzersView({ catalog, results, summary, busy, onRun, onOpenFile }) {
  const ran = catalog.filter((a) => results[a.id]).length;
  return (
    <div className="analyzer-registry">
      <div className="cards intelligence-cards">
        <article>
          <b>{summary.resolved}</b>
          <span>Resolved refs</span>
        </article>
        <article>
          <b>{summary.ambiguous}</b>
          <span>Ambiguous refs</span>
        </article>
        <article>
          <b>{summary.unresolved}</b>
          <span>Unresolved refs</span>
        </article>
        <article>
          <b>
            {ran}/{catalog.length}
          </b>
          <span>Analyzers run</span>
        </article>
      </div>
      <div className="transform-toolbar">
        <b>🧪 Analyzers</b>
        <span className="muted">Local and heuristic. Findings feed reports and AI context.</span>
        <button onClick={() => onRun(catalog.map((a) => a.id))} disabled={!!busy}>
          {busy ? '⏳ Running…' : '▶ Run All'}
        </button>
      </div>
      {catalog.map((a) => (
        <AnalyzerPanel
          key={a.id}
          analyzer={a}
          result={results[a.id]}
          running={busy === a.id || busy === true}
          disabled={!!busy}
          onRun={() => onRun([a.id])}
          onOpenFile={onOpenFile}
        />
      ))}
    </div>
  );
}

function AnalyzerPanel({ analyzer, result, running, disabled, onRun, onOpenFile }) {
  const [showAll, setShowAll] = useState(false);
  const findings = result?.findings || [];
  const counts = countBySeverity(findings);
  const rows = showAll ? findings : findings.slice(0, ROW_LIMIT);
  const cols = { '--cols': analyzer.columns.length };
  return (
    <div className="analytics-panel" data-analyzer={analyzer.id}>
      <div className="transform-toolbar">
        <b>{analyzer.name}</b>
        <small className="muted">
          {analyzer.category} · {analyzer.scope === 'source' ? 'reads source' : 'index only'}
        </small>
        {result && !result.error && (
          <span>
            {findings.length} finding{findings.length === 1 ? '' : 's'}
            {SEVERITIES.filter((s) => s !== 'info' && counts[s]).map((s) => (
              <small key={s} className={'severity ' + s}>
                {' '}
                {counts[s]} {s}
              </small>
            ))}
            <small className="muted"> · {result.ms} ms</small>
          </span>
        )}
        <button onClick={onRun} disabled={disabled}>
          {running ? '⏳ Running…' : '▶ Run'}
        </button>
      </div>
      <p className="muted">{analyzer.description}</p>
      {result?.error && <div className="error">Analyzer failed: {result.error}</div>}
      {!result && (
        <p className="muted">No result yet. Run this analyzer against the current index.</p>
      )}
      {result && !result.error && !findings.length && <p className="muted">No findings.</p>}
      {rows.length > 0 && (
        <div className="analyzer-table" role="table">
          <div className="analyzer-row analyzer-head" role="row" style={cols}>
            {analyzer.columns.map(([key, label]) => (
              <span key={key} role="columnheader">
                {label}
              </span>
            ))}
          </div>
          {rows.map((f, i) => (
            <div className="index-row analyzer-row" role="row" key={i} style={cols}>
              {analyzer.columns.map(([key]) => (
                <Cell key={key} name={key} finding={f} onOpenFile={onOpenFile} />
              ))}
            </div>
          ))}
        </div>
      )}
      {findings.length > ROW_LIMIT && (
        <button className="link-button" onClick={() => setShowAll(!showAll)}>
          {showAll ? 'Show first ' + ROW_LIMIT : `Show all ${findings.length} findings`}
        </button>
      )}
    </div>
  );
}

function Cell({ name, finding, onOpenFile }) {
  const value = finding[name];
  if (name === 'file' && value)
    return (
      <span title={value}>
        <button
          className="link-button"
          onClick={() => onOpenFile?.(value, finding.line)}
          title="Open in Editor"
        >
          {value}
        </button>
      </span>
    );
  if (name === 'severity') return <span className={'severity ' + value}>{value}</span>;
  return <span title={String(value ?? '')}>{String(value ?? '')}</span>;
}
