import { useState } from 'react';
import { buildProjectIndex } from './projectAnalysis';

export function Analyze({ p }) {
  const [index, setIndex] = useState(null),
    [busy, setBusy] = useState(false),
    [q, setQ] = useState(''),
    [kind, setKind] = useState('all');
  async function build() {
    setBusy(true);
    try {
      setIndex(await buildProjectIndex(p));
    } finally {
      setBusy(false);
    }
  }
  const symbols = (index?.symbols || []).filter(
      (x) => (kind === 'all' || x.type === kind) && x.name.toLowerCase().includes(q.toLowerCase()),
    ),
    imports = (index?.imports || []).filter((x) => x.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <section>
      <div className="head">
        <div>
          <h1>🧠 Analyze</h1>
          <small>
            Project Index + JavaScript/TypeScript symbol analysis, running locally in your browser.
          </small>
        </div>
        <button onClick={build} disabled={!p || busy}>
          {busy ? '⏳ Indexing...' : '⚙ Build Project Index'}
        </button>
      </div>
      {!p && <div className="empty">📂 Open a local folder first.</div>}
      {index && (
        <>
          <div className="analytics-panel">
            <h2>Project Index</h2>
            <div className="cards">
              <article>
                <b>{index.files.length}</b>
                <span>Indexed files</span>
              </article>
              <article>
                <b>{index.stats.lines}</b>
                <span>Lines</span>
              </article>
              <article>
                <b>{index.stats.jsFiles}</b>
                <span>JS/TS files</span>
              </article>
              <article>
                <b>{index.stats.functions}</b>
                <span>Functions</span>
              </article>
              <article>
                <b>{index.stats.classes}</b>
                <span>Classes</span>
              </article>
              <article>
                <b>{index.stats.imports}</b>
                <span>Imports</span>
              </article>
            </div>
          </div>
          <div className="search">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search symbols, imports or files"
            />
            <select value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="all">All symbols</option>
              <option value="function">Functions</option>
              <option value="arrow">Arrow functions</option>
              <option value="class">Classes</option>
            </select>
          </div>
          <div className="analyze-grid">
            <div className="analytics-panel">
              <h2>Symbols</h2>
              {symbols.slice(0, 300).map((x, i) => (
                <div className="index-row" key={i}>
                  <b>{x.name}</b>
                  <span>{x.type}</span>
                  <small>
                    {x.path}:{x.line}
                  </small>
                </div>
              ))}
            </div>
            <div className="analytics-panel">
              <h2>Imports</h2>
              {imports.slice(0, 200).map((x, i) => (
                <div className="index-row" key={i}>
                  <b>{x.name}</b>
                  <span>{x.binding}</span>
                  <small>
                    {x.path}:{x.line}
                  </small>
                </div>
              ))}
            </div>
          </div>
          <div className="analytics-panel">
            <h2>Indexed Files</h2>
            {index.files
              .filter((x) => x.path.toLowerCase().includes(q.toLowerCase()))
              .slice(0, 300)
              .map((x) => (
                <div className="index-row" key={x.path}>
                  <b>{x.path}</b>
                  <span>{x.ext}</span>
                  <small>{x.lines} lines</small>
                </div>
              ))}
          </div>
        </>
      )}
    </section>
  );
}
