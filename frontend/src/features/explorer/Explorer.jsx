import { PaginatedList } from '../../components/PaginatedList';

export function Explorer({ p, open }) {
  return (
    <section>
      <div className="head">
        <div>
          <h1>Explorer</h1>
          <small>Browse local project files.</small>
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
