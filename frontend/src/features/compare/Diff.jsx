import React, { useState } from 'react';
import { read } from '../../lib/files';
import { lineDiff } from '../../lib/diff';
import { cp, dl } from '../../lib/text';

export function Diff({ p, diff, setDiff }) {
  const [a, setA] = useState(''),
    [b, setB] = useState(''),
    [filter, setFilter] = useState('all'),
    [q, setQ] = useState('');
  async function go() {
    let f = p?.files.find((x) => x.path === a),
      g = p?.files.find((x) => x.path === b);
    if (!f || !g) return;
    const A = (await read(f)).split(/\r?\n/),
      B = (await read(g)).split(/\r?\n/);
    setDiff({ a, b, rows: lineDiff(A, B) });
  }
  const rows = (diff?.rows || [])
    .filter((r) => filter === 'all' || r.type === filter)
    .filter(
      (r) =>
        !q ||
        r.l.toLowerCase().includes(q.toLowerCase()) ||
        r.r.toLowerCase().includes(q.toLowerCase()),
    );
  const changed = (diff?.rows || []).filter((r) => r.type !== 'same'),
    compact = changed
      .map((r) =>
        r.type === 'add' ? '+ ' + r.r : r.type === 'del' ? '- ' + r.l : '~ ' + r.l + ' → ' + r.r,
      )
      .join('\n');
  return (
    <section>
      <h1>📊 Compare</h1>
      <p className="muted">
        Line-level comparison with change filters, search and compact AI-friendly output.
      </p>
      <div className="compare-select">
        <label>
          Left
          <select value={a} onChange={(e) => setA(e.target.value)}>
            <option value="">Select file</option>
            {p?.files
              .filter((f) => f.text)
              .map((f) => (
                <option key={f.path} value={f.path}>
                  {f.path}
                </option>
              ))}
          </select>
        </label>
        <label>
          Right
          <select value={b} onChange={(e) => setB(e.target.value)}>
            <option value="">Select file</option>
            {p?.files
              .filter((f) => f.text)
              .map((f) => (
                <option key={f.path} value={f.path}>
                  {f.path}
                </option>
              ))}
          </select>
        </label>
        <button onClick={go}>🔍 Compare</button>
        <button
          onClick={() => {
            setA('');
            setB('');
            setDiff(null);
          }}
        >
          ✕ Clear
        </button>
      </div>
      {diff && (
        <>
          <div className="diff-summary">
            📊 {changed.length} {changed.length === 1 ? 'difference' : 'differences'} · 🟢{' '}
            {diff.rows.filter((x) => x.type === 'add').length} added · 🔴{' '}
            {diff.rows.filter((x) => x.type === 'del').length} removed · 🟡{' '}
            {diff.rows.filter((x) => x.type === 'change').length} modified
          </div>
          <div className="search diff-controls">
            <select value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="all">All lines</option>
              <option value="add">Added</option>
              <option value="del">Removed</option>
              <option value="change">Modified</option>
              <option value="same">Unchanged</option>
            </select>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search diff" />
          </div>
          <div className="diff-grid">
            <div className="diff-head">Left: {diff.a}</div>
            <div className="diff-head">Right: {diff.b}</div>
            {rows.map((r) => (
              <React.Fragment key={r.key}>
                <div className={'diff-line ' + r.type}>
                  <span>{r.li ?? ''}</span>
                  <code>{r.l || ' '}</code>
                </div>
                <div className={'diff-line ' + r.type}>
                  <span>{r.ri ?? ''}</span>
                  <code>{r.r || ' '}</code>
                </div>
              </React.Fragment>
            ))}
          </div>
          <div className="analytics-panel">
            <div className="transform-toolbar">
              <b>Compact Diff</b>
              <button onClick={() => cp(compact)}>📋 Copy</button>
              <button onClick={() => dl('repomind-diff.txt', compact)}>⬇ Download</button>
            </div>
            <textarea value={compact} readOnly />
          </div>
        </>
      )}
    </section>
  );
}
