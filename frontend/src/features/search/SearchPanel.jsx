import { useEffect, useMemo, useRef, useState } from 'react';
import { cp, dl, esc } from '../../lib/text';
import { renderMarkdown } from '../../lib/markdown';

export function SearchPanel({
  p,
  q,
  setQ,
  search,
  res,
  open,
  searchView,
  setSearchView,
  onEdit,
  searching,
}) {
  return (
    <section>
      <div className="search-results">
        <div className="head">
          <div>
            <h1>Search</h1>
            <small>Find text across your local project.</small>
          </div>
          <button onClick={() => setQ('')}>✕ Clear</button>
        </div>
        <div className="search">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && search()}
            placeholder="Find text"
          />
          <button onClick={search} disabled={searching}>
            {searching ? '⏳ Searching…' : '🔎 Search'}
          </button>
        </div>
        {res.truncated && (
          <p className="muted">
            Showing the first {res.length} matches. Refine the search to see more.
          </p>
        )}
        {!searching && res.query && res.query === q && !res.length && (
          <p className="muted">No matches.</p>
        )}
        <div className="list">
          {res.map((r, i) => (
            <button
              key={r.path + '-' + r.line + '-' + i}
              onClick={() =>
                open(
                  p.files.find((f) => f.path === r.path),
                  true,
                )
              }
            >
              <b>
                {r.path} · Line {r.line}
              </b>
              <code>{r.text}</code>
            </button>
          ))}
        </div>
      </div>
      {searchView && (
        <SearchFileView data={searchView} setSearchView={setSearchView} onEdit={onEdit} />
      )}
    </section>
  );
}

export function SearchFileView({ data, setSearchView, onEdit }) {
  const { file, query } = data;
  const lines = useMemo(() => file.content.split(/\r?\n/), [file.content]);
  const [active, setActive] = useState(0),
    [rendered, setRendered] = useState(file.ext === '.md'),
    refs = useRef([]),
    matches = useMemo(() => {
      let a = [],
        r = query ? new RegExp(esc(query), 'ig') : null;
      lines.forEach((l, i) => {
        if (!r) return;
        let m;
        while ((m = r.exec(l)) !== null) a.push({ line: i, index: m.index });
      });
      return a;
    }, [lines, query]);
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
              className={
                matches.some((m) => m.line === i) && matches[active]?.line === i
                  ? 'active-line'
                  : ''
              }
            >
              <span>{i + 1}</span>
              <code>{highlightAll(l, query)}</code>
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

export function highlightAll(line, term) {
  if (!term) return line;
  let re = new RegExp('(' + esc(term) + ')', 'ig'),
    parts = line.split(re);
  return parts.map((x, i) =>
    i % 2 ? (
      <mark className="all-match" key={i}>
        {x}
      </mark>
    ) : (
      x
    ),
  );
}
