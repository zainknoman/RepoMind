import React, { useMemo, useState } from 'react';
import {
  buildRepositoryIndex, attachFileHandles, buildContext, detectCycles,
  findDependencies, findDependents, getSymbolDetails, getArchitecture, estimateTokens
} from '../../services/repository';

const cp = value => value && navigator.clipboard?.writeText(value);

export default function CodebasePanel({ project, onOpenFile }) {
  const [index, setIndex] = useState(null);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');
  const [view, setView] = useState('overview');
  const [selected, setSelected] = useState(new Set());
  const [selectedSymbol, setSelectedSymbol] = useState(null);
  const [selectedFile, setSelectedFile] = useState('');
  const [context, setContext] = useState('');
  const [contextTokens, setContextTokens] = useState(0);
  const [contextFiles, setContextFiles] = useState(0);
  const [metadata, setMetadata] = useState(true);
  const [includeDeps, setIncludeDeps] = useState(true);
  const [includeDependents, setIncludeDependents] = useState(false);
  const [error, setError] = useState('');

  async function indexProject() {
    if (!project) return;
    setBusy(true); setError('');
    try {
      const next = attachFileHandles(await buildRepositoryIndex(project), project);
      setIndex(next);
      setSelected(new Set(next.files.slice(0, Math.min(25, next.files.length)).map(file => file.path)));
      setContext(''); setSelectedSymbol(null);
    } catch (e) { setError(e?.message || 'Unable to index repository'); }
    finally { setBusy(false); }
  }

  const files = useMemo(() => (index?.files || []).filter(file =>
    !query || file.path.toLowerCase().includes(query.toLowerCase()) || file.language.toLowerCase().includes(query.toLowerCase())
  ), [index, query]);

  const symbols = useMemo(() => (index?.symbols || []).filter(symbol =>
    !query || symbol.name.toLowerCase().includes(query.toLowerCase()) || symbol.path.toLowerCase().includes(query.toLowerCase())
  ), [index, query]);

  const dependencies = useMemo(() => (index?.dependencies || []).filter(edge =>
    !query || edge.from.toLowerCase().includes(query.toLowerCase()) || edge.to.toLowerCase().includes(query.toLowerCase())
  ), [index, query]);

  const architecture = useMemo(() => getArchitecture(index), [index]);
  const cycles = useMemo(() => detectCycles(index), [index]);
  const details = useMemo(() => getSymbolDetails(index, selectedSymbol), [index, selectedSymbol]);

  function toggle(path) {
    setSelected(previous => {
      const next = new Set(previous);
      if (next.has(path)) next.delete(path); else next.add(path);
      return next;
    });
  }

  function selectAll() { setSelected(new Set((index?.files || []).map(file => file.path))); }
  function clearSelection() { setSelected(new Set()); }

  async function generateContext() {
    if (!index) return;
    setBusy(true);
    try {
      const result = await buildContext(index, [...selected], {
        includeMetadata: metadata, includeDependencies: includeDeps, includeDependents
      });
      setContext(result.content); setContextTokens(result.tokens); setContextFiles(result.files.length);
    } catch (e) { setError(e?.message || 'Unable to generate context'); }
    finally { setBusy(false); }
  }

  function downloadContext() {
    if (!context) return;
    const blob = new Blob([context], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = (project?.name || 'repository') + '-context.md'; a.click();
    URL.revokeObjectURL(url);
  }

  if (!project) return <section><div className="empty">📂 Open a local folder first to build its codebase index.</div></section>;

  return <section className="codebase-intelligence">
    <div className="head">
      <div><h1>🧠 Codebase Intelligence</h1><small>Local repository graph for symbols, references, architecture and AI-ready context.</small></div>
      <button onClick={indexProject} disabled={busy}>{busy ? '⏳ Indexing...' : '⚙ Build / Refresh Index'}</button>
    </div>
    {error && <div className="error">{error}</div>}
    {!index && <div className="panel"><h2>Repository Intelligence</h2><p className="muted">Build one local index. Source stays in your browser.</p><button onClick={indexProject}>🚀 Build Project Index</button></div>}
    {index && <>
      <div className="cards intelligence-cards">
        <article><b>{index.stats.files}</b><span>Files</span></article>
        <article><b>{index.stats.symbols}</b><span>Symbols</span></article>
        <article><b>{index.stats.references}</b><span>References</span></article>
        <article><b>{index.stats.resolvedReferences}</b><span>Resolved</span></article>
        <article><b>{index.stats.internalEdges}</b><span>Internal edges</span></article>
        <article><b>{index.stats.tokens.toLocaleString()}</b><span>Tokens</span></article>
      </div>
      <div className="tabs">
        {[
          ['overview','Overview'],['files','Files'],['symbols','Symbols'],['architecture','Architecture'],
          ['impact','Impact'],['context','Context Builder']
        ].map(([key,label]) => <button key={key} className={view === key ? 'active' : ''} onClick={() => setView(key)}>{label}</button>)}
      </div>
      {view !== 'context' && <div className="search">
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search files, symbols, references or dependencies"/>
        <button onClick={() => setQuery('')}>✕ Clear</button>
      </div>}

      {view === 'overview' && <div className="analyze-grid">
        <div className="analytics-panel">
          <h2>Project Profile</h2>
          {(index.project?.frameworks || []).map(item => <div className="index-row" key={item.name}><b>{item.name}</b><span>detected</span><small>{item.evidence}</small></div>)}
          {Object.entries(index.languages).sort((a,b) => b[1] - a[1]).map(([language,count]) =>
            <div className="index-row" key={language}><b>{language}</b><span>{count} files</span><small>{Math.round(count / index.stats.files * 100)}%</small></div>
          )}
        </div>
        <div className="analytics-panel">
          <h2>Health Signals</h2>
          <div className="index-row"><b>Unresolved relative imports</b><span>{index.unresolvedImports.length}</span><small>{index.unresolvedImports.length ? 'Review' : 'None detected'}</small></div>
          <div className="index-row"><b>Circular dependency paths</b><span>{cycles.length}</span><small>{cycles.length ? 'Review' : 'None detected'}</small></div>
          <div className="index-row"><b>Unresolved references</b><span>{index.stats.unresolvedReferences}</span><small>Conservative AST resolution</small></div>
          <div className="index-row"><b>Parser errors</b><span>{index.files.reduce((sum, file) => sum + (file.parseErrors?.length || 0), 0)}</span><small>Fallback keeps files searchable</small></div>
          <div className="index-row"><b>External imports</b><span>{index.externalDependencies.length}</span><small>Packages / modules</small></div>
          <div className="index-row"><b>Indexed</b><span>{new Date(index.generatedAt).toLocaleTimeString()}</span><small>Local</small></div>
        </div>
      </div>}

      {view === 'files' && <div className="analytics-panel"><h2>Indexed Files</h2>
        {files.slice(0,500).map(file => <div className="index-row" key={file.path} onClick={() => setSelectedFile(file.path)}>
          <b>{file.path}</b><span>{file.language}</span><small>{file.lines} lines · ~{file.tokens.toLocaleString()} tokens · {file.symbols.length} symbols</small>
        </div>)}
        {!files.length && <p className="muted">No matching files.</p>}
      </div>}

      {view === 'symbols' && <div className="analytics-panel"><h2>Symbol Intelligence</h2>
        {symbols.slice(0,500).map(symbol => <button className="index-row clickable" key={symbol.definitionKey} onClick={() => setSelectedSymbol(symbol.definitionKey)}>
          <b>{symbol.name}</b><span>{symbol.kind}{symbol.parent ? ` · ${symbol.parent}` : ''}</span><small>{symbol.path}:{symbol.line}</small>
        </button>)}
        {!symbols.length && <p className="muted">No matching symbols.</p>}
        {details && <SymbolDetails details={details} onClose={() => setSelectedSymbol(null)} />}
      </div>}

      {view === 'architecture' && <div className="analyze-grid">
        <div className="analytics-panel">
          <h2>Architecture Hotspots</h2>
          <p className="muted">Files are ranked by incoming + outgoing dependency edges.</p>
          {architecture.slice(0,100).map(item => <div className="index-row" key={item.path} onClick={() => { setSelectedFile(item.path); setView('impact'); }}>
            <b>{item.path}</b><span>{item.dependencies} out · {item.dependents} in</span><small>{item.symbols} symbols · ~{item.tokens.toLocaleString()} tokens</small>
          </div>)}
        </div>
        <div className="analytics-panel">
          <h2>Cycles</h2>
          {cycles.map((cycle,i) => <div className="cycle-row" key={i}>{cycle.join(' → ')}</div>)}
          {!cycles.length && <p className="muted">No circular dependency paths detected.</p>}
        </div>
      </div>}

      {view === 'impact' && <div className="analyze-grid">
        <div className="analytics-panel">
          <h2>File Impact</h2>
          <select value={selectedFile} onChange={e => setSelectedFile(e.target.value)}>
            <option value="">Select a file</option>
            {index.files.map(file => <option key={file.path} value={file.path}>{file.path}</option>)}
          </select>
          {selectedFile && <>
            <h3>Dependencies</h3>{findDependencies(index, selectedFile).map(path => <div className="index-row" key={path}><b>{path}</b><span>outgoing</span></div>)}
            <h3>Imported by</h3>{findDependents(index, selectedFile).map(path => <div className="index-row" key={path}><b>{path}</b><span>incoming</span></div>)}
          </>}
        </div>
        <div className="analytics-panel">
          <h2>Symbol References</h2>
          {selectedFile ? index.symbols.filter(s => s.path === selectedFile).map(s => <button className="index-row clickable" key={s.definitionKey} onClick={() => {setSelectedSymbol(s.definitionKey);setView('symbols')}}><b>{s.name}</b><span>{s.references.length} refs</span><small>{s.importedBy.length} importers</small></button>) : <p className="muted">Select a file to inspect its symbols.</p>}
        </div>
      </div>}

      {view === 'context' && <div className="context-builder">
        <div className="panel">
          <div className="transform-toolbar"><b>AI Context Builder</b><span className="muted">{selected.size} selected · ~{[...selected].reduce((sum,path) => sum + (index.files.find(file => file.path === path)?.tokens || 0),0).toLocaleString()} tokens</span><button onClick={selectAll}>☑ Select All</button><button onClick={clearSelection}>☐ Clear</button></div>
          <div className="search"><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Filter files to select"/><button onClick={() => setQuery('')}>✕ Clear</button></div>
          <div className="file-checks">{files.map(file => <label key={file.path}><input type="checkbox" checked={selected.has(file.path)} onChange={() => toggle(file.path)}/>{file.path}</label>)}</div>
          <label className="context-option"><input type="checkbox" checked={metadata} onChange={e => setMetadata(e.target.checked)}/> Include file metadata</label>
          <label className="context-option"><input type="checkbox" checked={includeDeps} onChange={e => setIncludeDeps(e.target.checked)}/> Include direct dependencies</label>
          <label className="context-option"><input type="checkbox" checked={includeDependents} onChange={e => setIncludeDependents(e.target.checked)}/> Include direct importers</label>
          <div className="tool-run-strip"><button onClick={generateContext} disabled={!selected.size || busy}>{busy ? '⏳ Generating...' : '▶ Generate Context'}</button><button onClick={() => cp(context)} disabled={!context}>📋 Copy</button><button onClick={downloadContext} disabled={!context}>⬇ Download</button></div>
        </div>
        <div className="panel"><div className="transform-toolbar"><b>Generated Context</b><span className="muted">~{contextTokens.toLocaleString()} tokens · {contextFiles} files</span></div><textarea className="context-output" value={context} readOnly placeholder="Select files and generate context."/></div>
      </div>}
    </>}
  </section>;
}

function SymbolDetails({ details, onClose }) {
  const { symbol } = details;
  return <div className="symbol-inspector panel">
    <div className="transform-toolbar"><div><b>{symbol.name}</b><span className="muted"> · {symbol.kind} · {symbol.path}:{symbol.line}</span></div><button onClick={onClose}>✕ Close</button></div>
    <div className="analyze-grid">
      <div><h3>Definition</h3><p className="muted">{symbol.path}:{symbol.line}:{symbol.column}</p><h3>Methods</h3>{details.methods.length ? details.methods.map(x => <div className="mini-row" key={x.definitionKey}>{x.name}()</div>) : <p className="muted">No class methods.</p>}</div>
      <div><h3>References ({details.references.length})</h3>{details.references.slice(0,100).map((r,i) => <div className="mini-row" key={i}>{r.from}:{r.line}:{r.column}</div>)}{!details.references.length && <p className="muted">No resolved references.</p>}</div>
    </div>
    <h3>Imported by ({details.importedBy.length})</h3>
    {details.importedBy.map((item,i) => <div className="index-row" key={i}><b>{item.from}</b><span>{item.local}</span><small>{item.imported} · line {item.line}</small></div>)}
    <h3>Exports</h3>
    {details.exports.map((item,i) => <div className="index-row" key={i}><b>{item.name}</b><span>{item.kind}</span><small>{item.path}:{item.line}</small></div>)}
  </div>;
}