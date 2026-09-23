import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import './styles.css';

const API = 'http://localhost:8000';

function App() {
  const [root, setRoot] = useState('');
  const [project, setProject] = useState(null);
  const [selected, setSelected] = useState(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [tab, setTab] = useState('overview');
  const [compiled, setCompiled] = useState('');
  const [splitInput, setSplitInput] = useState('');
  const [splitFiles, setSplitFiles] = useState([]);
  const [error, setError] = useState('');
  const [viewerMode, setViewerMode] = useState('rendered');
  const [activeOccurrence, setActiveOccurrence] = useState(0);
  const viewerRef = useRef(null);

  const files = project?.files || [];

  async function scan() {
    setError('');
    try {
      const r = await fetch(API + '/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ root })
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.detail || 'Scan failed');
      setProject(d);
      setSelected(null);
      setResults([]);
    } catch (e) {
      setError(e.message);
    }
  }

  async function openFile(path, focusLine = null) {
    setError('');
    try {
      const r = await fetch(API + '/file?root=' + encodeURIComponent(root) + '&path=' + encodeURIComponent(path));
      const d = await r.json();
      if (!r.ok) throw Error(d.detail || 'Read failed');
      setSelected(d);
      setTab('viewer');
      setActiveOccurrence(0);
      if (isMarkdown(path)) setViewerMode('rendered');
      else setViewerMode('raw');
      if (focusLine) {
        setTimeout(() => {
          const el = document.getElementById('line-' + focusLine);
          el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }, 60);
      }
    } catch (e) {
      setError(e.message);
    }
  }

  async function search() {
    if (!root || !query.trim()) return;
    setSearching(true);
    setError('');
    try {
      const r = await fetch(API + '/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ root, query, case_sensitive: caseSensitive })
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.detail || 'Search failed');
      setResults(d.results || []);
      setTab('search');
    } catch (e) {
      setError(e.message);
    } finally {
      setSearching(false);
    }
  }

  async function compile() {
    try {
      setError('');
      const chosen = files.filter(f => f.text).slice(0, 30);
      const payload = [];
      for (const f of chosen) {
        const r = await fetch(API + '/file?root=' + encodeURIComponent(root) + '&path=' + encodeURIComponent(f.path));
        const d = await r.json();
        if (r.ok) payload.push({ name: f.path, content: d.content });
      }
      const r = await fetch(API + '/compile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: payload })
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.detail || 'Compile failed');
      setCompiled(d.content || '');
      setTab('transform');
    } catch (e) {
      setError(e.message);
    }
  }

  async function split() {
    try {
      const r = await fetch(API + '/split', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: splitInput })
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.detail || 'Split failed');
      setSplitFiles(d.files || []);
    } catch (e) {
      setError(e.message);
    }
  }

  const ext = useMemo(
    () => Object.entries(project?.statistics?.extensions || {}).sort((a, b) => b[1] - a[1]).slice(0, 8),
    [project]
  );

  const occurrenceCount = useMemo(() => {
    if (!selected || !query.trim()) return 0;
    return findOccurrences(selected.content, query, caseSensitive).length;
  }, [selected, query, caseSensitive]);

  useEffect(() => {
    if (activeOccurrence >= occurrenceCount) setActiveOccurrence(Math.max(0, occurrenceCount - 1));
  }, [occurrenceCount, activeOccurrence]);

  function nextOccurrence() {
    if (!occurrenceCount) return;
    if (isMarkdown(selected?.path)) setViewerMode('raw');
    setActiveOccurrence(i => (i + 1) % occurrenceCount);
    scrollToOccurrence((activeOccurrence + 1) % occurrenceCount);
  }

  function previousOccurrence() {
    if (!occurrenceCount) return;
    if (isMarkdown(selected?.path)) setViewerMode('raw');
    const next = (activeOccurrence - 1 + occurrenceCount) % occurrenceCount;
    setActiveOccurrence(next);
    scrollToOccurrence(next);
  }

  function scrollToOccurrence(index) {
    setTimeout(() => {
      const el = document.querySelector(`[data-occurrence="${index}"]`);
      el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, 30);
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const area = document.createElement('textarea');
      area.value = text;
      document.body.appendChild(area);
      area.select();
      document.execCommand('copy');
      area.remove();
    }
  }

  function downloadText(filename, text) {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div className="app">
      <header>
        <div>
          <div className="brand">Codebase Workbench</div>
          <div className="tag">Analyze · Search · Inspect · Transform · Understand · Export</div>
        </div>
        <button onClick={scan}>Scan Project</button>
      </header>

      <div className="toolbar">
        <input value={root} onChange={e => setRoot(e.target.value)} placeholder="Absolute project path, e.g. D:\\Projects\\SchoolOS" />
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && search()}
          placeholder="Search code..."
        />
        <label className="check"><input type="checkbox" checked={caseSensitive} onChange={e => setCaseSensitive(e.target.checked)} /> Case sensitive</label>
        <button onClick={search} disabled={!root || !query.trim()}>{searching ? 'Searching…' : 'Search'}</button>
      </div>

      {error && <div className="error">{error}</div>}

      <nav>{[['overview','Overview'],['explorer','Explorer'],['search','Search'],['viewer','Viewer'],['transform','Transform']].map(([id, label]) => (
        <button className={tab === id ? 'active' : ''} onClick={() => setTab(id)} key={id}>{label}</button>
      ))}</nav>

      <main>
        {tab === 'overview' && <section>
          <h1>{project?.project?.name || 'Project Intelligence'}</h1>
          <p className="muted">{project?.project?.root || 'Scan a local repository to begin.'}</p>
          <div className="cards"><Card n={project?.statistics?.files ?? '—'} t="Files" /><Card n={format(project?.statistics?.bytes)} t="Bytes" /><Card n={ext.length || '—'} t="File Types" /></div>
          <h2>Top file types</h2>
          <div className="list">{ext.map(([k, v]) => <div className="row" key={k}><span>{k}</span><b>{v}</b></div>)}</div>
        </section>}

        {tab === 'explorer' && <section>
          <h1>Explorer</h1>
          <div className="filelist">{files.map(f => <button key={f.path} onClick={() => openFile(f.path)}>{f.path}<span>{format(f.size)}</span></button>)}</div>
        </section>}

        {tab === 'search' && <section>
          <div className="section-head"><div><h1>Search Results</h1><p className="muted">{results.length ? `${results.length} matching lines` : 'Run a search from the top bar.'}</p></div></div>
          <div className="results">{results.length ? results.map((x, i) => <button key={i} onClick={() => openFile(x.path, x.line)}>
            <div><strong>{x.path}</strong><span className="line-badge">Line {x.line}</span></div><code>{highlightText(x.text, query, caseSensitive)}</code>
          </button>) : <p className="muted">No results.</p>}</div>
        </section>}

        {tab === 'viewer' && <Viewer
          selected={selected}
          query={query}
          caseSensitive={caseSensitive}
          mode={viewerMode}
          setMode={setViewerMode}
          activeOccurrence={activeOccurrence}
          occurrenceCount={occurrenceCount}
          nextOccurrence={nextOccurrence}
          previousOccurrence={previousOccurrence}
          onCopy={() => selected && copyText(selected.content)}
          onDownload={() => selected && downloadText(selected.path.split('/').pop(), selected.content)}
        />}

        {tab === 'transform' && <section>
          <h1>Transform</h1>
          <div className="panel">
            <div className="section-head"><div><h2>Combine project files</h2><p className="muted">ReCodeX-style consolidated output with Copy and Download.</p></div><button onClick={compile} disabled={!project}>Compile first 30 text files</button></div>
            <div className="actionbar"><button className="ghost" onClick={() => copyText(compiled)} disabled={!compiled}>Copy</button><button className="ghost" onClick={() => downloadText('compiled_output.txt', compiled)} disabled={!compiled}>Download</button></div>
            <textarea value={compiled} onChange={e => setCompiled(e.target.value)} placeholder="Compiled output appears here..." />
            {compiled && <div className="compiled-preview"><div className="preview-label">Consolidated preview</div><RawViewer content={compiled} query={query} caseSensitive={caseSensitive} activeOccurrence={activeOccurrence} /></div>}
          </div>
          <div className="panel"><h2>Reverse split</h2><textarea value={splitInput} onChange={e => setSplitInput(e.target.value)} placeholder="Paste ReCodeX-style compiled content..." /><button onClick={split}>Split Files</button>{splitFiles.map(f => <div className="split" key={f.name}><b>{f.name}</b><pre>{f.content.slice(0, 500)}</pre></div>)}</div>
        </section>}
      </main>
    </div>
  );
}

function Viewer({ selected, query, caseSensitive, mode, setMode, activeOccurrence, occurrenceCount, nextOccurrence, previousOccurrence, onCopy, onDownload }) {
  if (!selected) return <section><h1>Viewer</h1><p className="muted">Select a text file from Explorer or Search.</p></section>;
  const md = isMarkdown(selected.path);
  return <section>
    <div className="viewer-header">
      <div><h1>{selected.path}</h1><p className="muted">{md ? 'Markdown document' : 'Text/code file'}{query ? ` · ${occurrenceCount} occurrence${occurrenceCount === 1 ? '' : 's'}` : ''}</p></div>
      <div className="actionbar">
        {md && <><button className={mode === 'rendered' ? 'active-action' : 'ghost'} onClick={() => setMode('rendered')}>Rendered</button><button className={mode === 'raw' ? 'active-action' : 'ghost'} onClick={() => setMode('raw')}>Raw</button></>}
        {query && <><button className="ghost" onClick={previousOccurrence} disabled={!occurrenceCount}>↑ Previous</button><button className="ghost" onClick={nextOccurrence} disabled={!occurrenceCount}>↓ Next</button></>}
        <button className="ghost" onClick={onCopy}>Copy</button><button className="ghost" onClick={onDownload}>Download</button>
      </div>
    </div>
    {md && mode === 'rendered' ? <MarkdownViewer content={selected.content} /> : <RawViewer content={selected.content} query={query} caseSensitive={caseSensitive} activeOccurrence={activeOccurrence} />}
  </section>;
}

function MarkdownViewer({ content }) {
  const html = useMemo(() => DOMPurify.sanitize(marked.parse(content)), [content]);
  return <article className="markdown-body" dangerouslySetInnerHTML={{ __html: html }} />;
}

function RawViewer({ content, query, caseSensitive, activeOccurrence = 0 }) {
  const lines = content.split(/\r?\n/);
  let occurrenceIndex = 0;
  return <div className="code numbered-code">
    {lines.map((line, i) => {
      const parts = highlightParts(line, query, caseSensitive, occurrenceIndex);
      occurrenceIndex = parts.nextIndex;
      return <div className="line" id={'line-' + (i + 1)} key={i}>
        <div className="ln">{i + 1}</div>
        <div className="content">{parts.nodes.map((node, j) => node.type === 'match' ? <mark key={j} className={node.index === activeOccurrence ? 'match active-match' : 'match'} data-occurrence={node.index}>{node.text}</mark> : <React.Fragment key={j}>{node.text}</React.Fragment>)}</div>
      </div>;
    })}
  </div>;
}

function highlightParts(text, query, caseSensitive, startIndex) {
  if (!query) return { nodes: [{ type: 'text', text }], nextIndex: startIndex };
  const needle = caseSensitive ? query : query.toLowerCase();
  const haystack = caseSensitive ? text : text.toLowerCase();
  if (!needle) return { nodes: [{ type: 'text', text }], nextIndex: startIndex };
  const nodes = [];
  let cursor = 0;
  let occurrenceIndex = startIndex;
  while (true) {
    const at = haystack.indexOf(needle, cursor);
    if (at < 0) break;
    if (at > cursor) nodes.push({ type: 'text', text: text.slice(cursor, at) });
    nodes.push({ type: 'match', text: text.slice(at, at + query.length), index: occurrenceIndex++ });
    cursor = at + query.length;
  }
  if (cursor < text.length) nodes.push({ type: 'text', text: text.slice(cursor) });
  return { nodes, nextIndex: occurrenceIndex };
}

function highlightText(text, query, caseSensitive) {
  const parts = highlightParts(text, query, caseSensitive, 0).nodes;
  return <>{parts.map((p, i) => p.type === 'match' ? <mark key={i}>{p.text}</mark> : <React.Fragment key={i}>{p.text}</React.Fragment>)}</>;
}

function findOccurrences(text, query, caseSensitive) {
  const found = [];
  if (!query) return found;
  const needle = caseSensitive ? query : query.toLowerCase();
  const haystack = caseSensitive ? text : text.toLowerCase();
  let from = 0;
  while (true) {
    const at = haystack.indexOf(needle, from);
    if (at < 0) break;
    found.push(at);
    from = at + Math.max(1, needle.length);
  }
  return found;
}

function isMarkdown(path = '') { return path.toLowerCase().endsWith('.md'); }
const Card = ({ n, t }) => <div className="card"><strong>{n}</strong><span>{t}</span></div>;
const format = n => typeof n === 'number' ? new Intl.NumberFormat().format(n) : '—';
createRoot(document.getElementById('root')).render(<App />);
