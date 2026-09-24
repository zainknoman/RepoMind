import React, { useMemo, useState } from 'react';
import {
  buildRepositoryIndex,
  attachFileHandles,
  buildContext,
  detectCycles,
  findDependencies,
  findDependents,
  estimateTokens
} from '../../services/repository';

const cp = value => navigator.clipboard?.writeText(value);

export default function CodebasePanel({ project }) {
  const [index, setIndex] = useState(null);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');
  const [view, setView] = useState('overview');
  const [selected, setSelected] = useState(new Set());
  const [context, setContext] = useState('');
  const [contextTokens, setContextTokens] = useState(0);
  const [metadata, setMetadata] = useState(true);
  const [error, setError] = useState('');

  async function indexProject() {
    if (!project) return;
    setBusy(true);
    setError('');
    try {
      const next = attachFileHandles(await buildRepositoryIndex(project), project);
      setIndex(next);
      setSelected(new Set(next.files.slice(0, Math.min(25, next.files.length)).map(file => file.path)));
      setContext('');
    } catch (e) {
      setError(e?.message || 'Unable to index repository');
    } finally {
      setBusy(false);
    }
  }

  const files = useMemo(() => (index?.files || []).filter(file =>
    !query || file.path.toLowerCase().includes(query.toLowerCase()) ||
    file.language.toLowerCase().includes(query.toLowerCase())
  ), [index, query]);

  const symbols = useMemo(() => (index?.symbols || []).filter(symbol =>
    !query || symbol.name.toLowerCase().includes(query.toLowerCase()) ||
    symbol.path.toLowerCase().includes(query.toLowerCase())
  ), [index, query]);

  const dependencies = useMemo(() => (index?.dependencies || []).filter(edge =>
    !query || edge.from.toLowerCase().includes(query.toLowerCase()) ||
    edge.to.toLowerCase().includes(query.toLowerCase())
  ), [index, query]);

  const cycles = useMemo(() => detectCycles(index), [index]);

  function toggle(path) {
    setSelected(previous => {
      const next = new Set(previous);
      if (next.has(path)) next.delete(path); else next.add(path);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set((index?.files || []).map(file => file.path)));
  }

  function clearSelection() {
    setSelected(new Set());
  }

  async function generateContext() {
    if (!index) return;
    setBusy(true);
    try {
      const result = await buildContext(index, [...selected], { includeMetadata: metadata });
      setContext(result.content);
      setContextTokens(result.tokens);
    } catch (e) {
      setError(e?.message || 'Unable to generate context');
    } finally {
      setBusy(false);
    }
  }

  function downloadContext() {
    if (!context) return;
    const blob = new Blob([context], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (project?.name || 'repository') + '-context.md';
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!project) {
    return <section><div className="empty">📂 Open a local folder first to build its codebase index.</div></section>;
  }

  return <section className="codebase-intelligence">
    <div className="head">
      <div>
        <h1>🧠 Codebase Intelligence</h1>
        <small>One local index powers symbols, imports, dependencies and AI-ready context.</small>
      </div>
      <button onClick={indexProject} disabled={busy}>{busy ? '⏳ Indexing...' : '⚙ Build / Refresh Index'}</button>
    </div>

    {error && <div className="error">{error}</div>}

    {!index && <div className="panel">
      <h2>Repository Index</h2>
      <p className="muted">RepoMind scans the selected folder locally. Nothing is uploaded.</p>
      <button onClick={indexProject}>🚀 Build Project Index</button>
    </div>}

    {index && <>
      <div className="cards intelligence-cards">
        <article><b>{index.stats.files}</b><span>Files</span></article>
        <article><b>{index.stats.lines.toLocaleString()}</b><span>Lines</span></article>
        <article><b>{index.stats.symbols}</b><span>Symbols</span></article>
        <article><b>{index.stats.imports}</b><span>Imports</span></article>
        <article><b>{index.stats.internalEdges}</b><span>Internal edges</span></article>
        <article><b>{index.stats.tokens.toLocaleString()}</b><span>Estimated tokens</span></article>
      </div>

      <div className="tabs">
        {[
          ['overview','Overview'],
          ['files','Files'],
          ['symbols','Symbols'],
          ['dependencies','Dependencies'],
          ['context','Context Builder']
        ].map(([key,label]) =>
          <button key={key} className={view === key ? 'active' : ''} onClick={() => setView(key)}>{label}</button>
        )}
      </div>

      {view !== 'context' && <div className="search">
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Filter indexed files, symbols or dependencies"/>
        <button onClick={() => setQuery('')}>✕ Clear</button>
      </div>}

      {view === 'overview' && <div className="analyze-grid">
        <div className="analytics-panel">
          <h2>Languages</h2>
          {Object.entries(index.languages).sort((a,b) => b[1] - a[1]).map(([language,count]) =>
            <div className="index-row" key={language}><b>{language}</b><span>{count} files</span><small>{Math.round(count / index.stats.files * 100)}%</small></div>
          )}
        </div>
        <div className="analytics-panel">
          <h2>Repository Health Signals</h2>
          <div className="index-row"><b>Unresolved relative imports</b><span>{index.unresolvedImports.length}</span><small>{index.unresolvedImports.length ? 'Review' : 'None detected'}</small></div>
          <div className="index-row"><b>External imports</b><span>{index.externalDependencies.length}</span><small>Packages / modules</small></div>
          <div className="index-row"><b>Circular dependency paths</b><span>{cycles.length}</span><small>{cycles.length ? 'Review' : 'None detected'}</small></div>
          <div className="index-row"><b>Indexed at</b><span>{new Date(index.generatedAt).toLocaleTimeString()}</span><small>Local</small></div>
        </div>
      </div>}

      {view === 'files' && <div className="analytics-panel">
        <h2>Indexed Files</h2>
        {files.slice(0, 500).map(file =>
          <div className="index-row" key={file.path}>
            <b>{file.path}</b><span>{file.language}</span><small>{file.lines} lines · ~{file.tokens.toLocaleString()} tokens</small>
          </div>
        )}
        {!files.length && <p className="muted">No matching files.</p>}
      </div>}

      {view === 'symbols' && <div className="analytics-panel">
        <h2>Symbols</h2>
        {symbols.slice(0, 500).map((symbol, i) =>
          <div className="index-row" key={symbol.path + symbol.line + symbol.name + i}>
            <b>{symbol.name}</b><span>{symbol.kind}</span><small>{symbol.path}:{symbol.line}</small>
          </div>
        )}
        {!symbols.length && <p className="muted">No matching symbols.</p>}
      </div>}

      {view === 'dependencies' && <div className="analytics-panel">
        <h2>Dependency Graph</h2>
        <p className="muted">Deterministic relative-import edges resolved against the indexed files.</p>
        {dependencies.slice(0, 500).map((edge, i) =>
          <div className="index-row" key={edge.from + edge.to + i}>
            <b>{edge.from}</b><span>→</span><small>{edge.to}</small>
          </div>
        )}
        <h3>Impact lookup</h3>
        <div className="search">
          <select onChange={e => setQuery(e.target.value)}>
            <option value="">Select a file</option>
            {index.files.map(file => <option key={file.path} value={file.path}>{file.path}</option>)}
          </select>
        </div>
        {query && <div className="impact-grid">
          <div className="panel"><b>Dependencies</b>{findDependencies(index, query).map(path => <div key={path}>{path}</div>) || <small>None</small>}</div>
          <div className="panel"><b>Imported by</b>{findDependents(index, query).map(path => <div key={path}>{path}</div>) || <small>None</small>}</div>
        </div>}
      </div>}

      {view === 'context' && <div className="context-builder">
        <div className="panel">
          <div className="transform-toolbar">
            <b>AI Context Builder</b>
            <span className="muted">{selected.size} selected · ~{[...selected].reduce((sum,path) => sum + (index.files.find(file => file.path === path)?.tokens || 0), 0).toLocaleString()} tokens</span>
            <button onClick={selectAll}>☑ Select All</button>
            <button onClick={clearSelection}>☐ Clear</button>
          </div>
          <div className="search">
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Filter files to select"/>
            <button onClick={() => setQuery('')}>✕ Clear</button>
          </div>
          <div className="file-checks">
            {files.map(file =>
              <label key={file.path}>
                <input type="checkbox" checked={selected.has(file.path)} onChange={() => toggle(file.path)}/>
                {file.path}
              </label>
            )}
          </div>
          <label className="context-option"><input type="checkbox" checked={metadata} onChange={e => setMetadata(e.target.checked)}/> Include file metadata</label>
          <div className="tool-run-strip">
            <button onClick={generateContext} disabled={!selected.size || busy}>{busy ? '⏳ Generating...' : '▶ Generate Context'}</button>
            <button onClick={() => cp(context)} disabled={!context}>📋 Copy</button>
            <button onClick={downloadContext} disabled={!context}>⬇ Download</button>
          </div>
        </div>
        <div className="panel">
          <div className="transform-toolbar"><b>Generated Context</b><span className="muted">~{contextTokens.toLocaleString()} tokens</span></div>
          <textarea className="context-output" value={context} readOnly placeholder="Select files and generate context."/>
        </div>
      </div>}
    </>}
  </section>;
}
