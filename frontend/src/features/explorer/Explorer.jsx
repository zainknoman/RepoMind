import { useMemo } from 'react';
import { PaginatedList } from '../../components/PaginatedList';

export function Explorer({ p, q, setQ, open }) {
  const visible = useMemo(
    () => (p?.files || []).filter((f) => f.path.toLowerCase().includes(q.toLowerCase())),
    [p, q],
  );
  return (
    <section>
      <div className="head">
        <div>
          <h1>Explorer</h1>
          <small>Browse local project files.</small>
        </div>
        <div className="search">
          <input
            aria-label="Filter files"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter files"
          />
          <button onClick={() => setQ('')}>✕ Clear</button>
        </div>
      </div>
      {!p && <div className="empty">📂 Open a local folder to browse its files.</div>}
      {p && (
        <>
          <PaginatedList
          className="list"
          items={p.files || []}
          searchPlaceholder="Filter files"
          getSearchText={(f) => [f.path, f.ext].filter(Boolean).join(' ')}
          renderItem={(f) => (
            <button
              onClick={() => open(f)}
              disabled={!f.text}
              title={f.text ? f.path : 'Binary, too large or sensitive file'}
            >
              <span>📄 {f.path}</span>
              <small>{f.ext}</small>
            </button>
          )}
        />
        </>
      )}
    </section>
  );
}
