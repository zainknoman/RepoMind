import { useState } from 'react';

/**
 * Renders only the rows visible in a fixed-height scroll container, so file lists with tens of
 * thousands of entries stay responsive. Rows must have a uniform height.
 */
export function VirtualList({
  items,
  rowHeight = 38,
  height = 520,
  overscan = 8,
  className = '',
  renderRow,
}) {
  const [scrollTop, setScrollTop] = useState(0);
  const total = items.length * rowHeight;
  const first = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const last = Math.min(items.length, Math.ceil((scrollTop + height) / rowHeight) + overscan);
  return (
    <div
      className={'virtual-list ' + className}
      style={{ maxHeight: height, overflowY: 'auto' }}
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
    >
      <div style={{ height: total, position: 'relative' }}>
        {items.slice(first, last).map((item, i) => (
          <div
            key={first + i}
            className="virtual-row"
            style={{
              position: 'absolute',
              top: (first + i) * rowHeight,
              left: 0,
              right: 0,
              height: rowHeight,
            }}
          >
            {renderRow(item, first + i)}
          </div>
        ))}
      </div>
    </div>
  );
}
