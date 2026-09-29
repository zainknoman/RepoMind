import { useMemo, useState } from 'react';

export const DATA_LIST_PAGE_SIZE = 30;

export function PaginatedList({
  items = [],
  renderItem,
  getSearchText = (item) => item,
  searchPlaceholder = 'Search records',
  emptyText = 'No records found.',
  pageSize = DATA_LIST_PAGE_SIZE,
  className = '',
  search = true,
}) {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => String(getSearchText(item) ?? '').toLowerCase().includes(q));
  }, [items, query, getSearchText]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const start = (safePage - 1) * pageSize;
  const visible = filtered.slice(start, start + pageSize);

  const updateQuery = (value) => {
    setQuery(value);
    setPage(1);
  };

  return (
    <div className={'paginated-list ' + className}>
      {search && (
        <div className="search" aria-label={searchPlaceholder}>
          <input
            value={query}
            onChange={(e) => updateQuery(e.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
          />
          {query && <button onClick={() => updateQuery('')}>✕ Clear</button>}
          <span className="muted">
            {filtered.length
              ? start + 1 === Math.min(start + pageSize, filtered.length)
                ? start + 1 + ' of ' + filtered.length + ' files'
                : start + 1 + '–' + Math.min(start + pageSize, filtered.length) + ' of ' + filtered.length
              : '0 records'}
          </span>
        </div>
      )}

      {visible.length ? visible.map((item, index) => renderItem(item, start + index)) : <p className="muted">{emptyText}</p>}

      {filtered.length > pageSize && (
        <div className="transform-toolbar" aria-label="Pagination">
          <button onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={safePage === 1}>
            ← Previous
          </button>
          <span className="muted">
            Page {safePage} of {pageCount}
          </span>
          <button onClick={() => setPage((value) => Math.min(pageCount, value + 1))} disabled={safePage === pageCount}>
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
