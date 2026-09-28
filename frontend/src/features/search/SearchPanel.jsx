import { useEffect, useMemo, useRef, useState } from 'react';
import { cp, dl } from '../../lib/text';
import { renderMarkdown } from '../../lib/markdown';
import { searchPattern } from '../../services/search';

export function SearchPanel({
  p,
  q,
  setQ,
  options,
  setOptions,
  search,
  res,
  open,
  searchView,
  setSearchView,
  onEdit,
  searching,
  indexed,
  indexing,
  onBuildIndex,
}) {
  const option = (key) => (e) => setOptions({ ...options, [key]: e.target.checked });
  const openPath = (path) =>
    open(
      p.files.find((f) => f.path === path),
      true,
    );
  const current = res && res.query === q.trim();
  const empty = res && !res.error && !res.symbols.length && !res.files.length && !res.text.length;
  return (
    <section>
      <div className="search-results">
        <div className="head">
          <div>
            <h1>Search</h1>
            <small>
              {indexed
                ? 'Symbols, files and text across your local project.'
                : 'Files and text across your local project.'}
            </small>
          </div>
          <button onClick={() => setQ('')}>✕ Clear</button>
        </div>
        <div className="search">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && search()}
            placeholder="Find symbols, files and text"
            aria-label="Search query"
          />
          <button onClick={search} disabled={searching}>
            {searching ? '⏳ Searching…' : '🔎 Search'}
          </button>
        </div>
        <div className="search-options">
          <label>
            <input type="checkbox" checked={options.regex} onChange={option('regex')} /> Regex
          </label>
          <label>
            <input
              type="checkbox"
              checked={options.caseSensitive}
              onChange={option('caseSensitive')}
            />{' '}
            Match case
          </label>
          {p && !indexed && (
            <span className="muted">
              {indexing ? (
                'Building the code index… Search again when it is ready to include symbols.'
              ) : (
                <>
                  Build the code index to also find symbols.{' '}
                  <button className="link-button" onClick={onBuildIndex}>
                    Build index
                  </button>
                </>
              )}
            </span>
          )}
        </div>
        {res?.error && <div className="error">{res.error}</div>}
        {!searching && current && empty && <p className="muted">No matches.</p>}
        {res?.symbols.length > 0 && (
          <>
            <h2 className="search-group">Symbols ({res.symbols.length})</h2>
            <div className="list">
              {res.symbols.map((s) => (
                <button
                  key={`${s.path}|${s.name}|${s.kind}|${s.line}`}
                  onClick={() => openPath(s.path)}
                >
                  <b>
                    {s.name} <span className="muted">· {s.kind}</span>
                  </b>
                  <code>
                    {s.path}:{s.line} · {s.references} refs
                  </code>
                </button>
              ))}
            </div>
          </>
        )}
        {res?.files.length > 0 && (
          <>
            <h2 className="search-group">Files ({res.files.length})</h2>
            <div className="list">
              {res.files.map((f) => (
                <button key={f.path} onClick={() => openPath(f.path)}>
                  <b>{f.path}</b>
                  <code>{f.language}</code>
                </button>
              ))}
            </div>
          </>
        )}
        {res?.text.length > 0 && (
          <>
            <h2 className="search-group">Text ({res.text.length.toLocaleString()})</h2>
            {res.truncated && (
              <p className="muted">
                Showing the first {res.text.length.toLocaleString()} matches. Refine the search to
                see more.
              </p>
            )}
            <div className="list">
              {res.text.map((r, i) => (
                <button key={r.path + '-' + r.line + '-' + i} onClick={() => openPath(r.path)}>
                  <b>
                    {r.path} · Line {r.line}
                  </b>
                  <code>{r.text}</code>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
      {searchView && (
        <SearchFileView data={searchView} setSearchView={setSearchView} onEdit={onEdit} />
      )}
    </section>
  );
}

/** A global pattern for highlighting, or null for an empty or invalid query. */
function highlightPattern(query, options) {
  if (!query) return null;
  try {
    return searchPattern(query, options, 'g');
  } catch {
    return null;
  }
}

export function SearchFileView({ data, setSearchView, onEdit }) {
  const { file, query, options } = data;
  const lines = useMemo(() => file.content.split(/\r?\n/), [file.content]);
  const pattern = useMemo(() => highlightPattern(query, options), [query, options]);
  const [active, setActive] = useState(0),
    [rendered, setRendered] = useState(file.ext === '.md'),
    refs = useRef([]),
    matches = useMemo(() => {
      const a = [];
      if (!pattern) return a;
      lines.forEach((l, i) => {
        for (const m of l.matchAll(pattern)) if (m[0]) a.push({ line: i, index: m.index });
      });
      return a;
    }, [lines, pattern]);
  useEffect(() => setActive(0), [file.path, query]);
  useEffect(() => {
    refs.current[matches[active]?.line]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [active, matches]);
  const next = () => matches.length && setActive((x) => (x + 1) % matches.length),
    prev = () => matches.length && setActive((x) => (x - 1 + matches.length) % matches.length);
  function edit() {
    onEdit(file);
  }
  return (
    <div className="searched-file">
      <div className="file-toolbar">
        <div>
          <b>📄 {file.path}</b>
          <small>{file.ext === '.md' ? 'Markdown Viewer + Editor' : 'Search result viewer'}</small>
        </div>
        <div className="toolbar-actions">
          <button onClick={edit}>✏️ Editor</button>
          <button onClick={() => cp(file.content)}>📋 Copy</button>
          <button onClick={() => dl(file.name, file.content)}>⬇ Download</button>
          <button onClick={() => document.getElementById('viewer-find')?.focus()}>
            🔎 Find Text
          </button>
          {file.ext === '.md' && (
            <button onClick={() => setRendered(!rendered)}>{rendered ? 'Raw' : 'Rendered'}</button>
          )}
        </div>
      </div>
      <div className="viewer-find">
        <input id="viewer-find" value={query} readOnly />
        <strong>
          {matches.length ? active + 1 : 0}/{matches.length}
        </strong>
      </div>
      {file.ext === '.md' && rendered ? (
        <div
          className="markdown-view mermaid-markdown"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(file.content) }}
        />
      ) : (
        <div className="highlight-view">
          {lines.map((l, i) => (
            <div
              key={i}
              ref={(el) => (refs.current[i] = el)}
              className={matches[active]?.line === i ? 'active-line' : ''}
            >
              <span>{i + 1}</span>
              <code>{highlightAll(l, pattern)}</code>
            </div>
          ))}
        </div>
      )}
      <div className="match-controller">
        <button onClick={prev}>◀ Previous</button>
        <strong>
          {matches.length ? active + 1 : 0}/{matches.length}
        </strong>
        <button onClick={next}>Next ▶</button>
      </div>
    </div>
  );
}

/** Wraps every non-empty match of a global pattern in <mark>. */
export function highlightAll(line, pattern) {
  if (!pattern) return line;
  const parts = [];
  let last = 0;
  for (const m of line.matchAll(pattern)) {
    if (!m[0]) continue;
    if (m.index > last) parts.push(line.slice(last, m.index));
    parts.push(
      <mark className="all-match" key={m.index}>
        {m[0]}
      </mark>,
    );
    last = m.index + m[0].length;
  }
  if (!parts.length) return line;
  if (last < line.length) parts.push(line.slice(last));
  return parts;
}
