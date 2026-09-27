import { useEffect, useMemo, useRef, useState } from 'react';
import { renderMarkdown } from '../../lib/markdown';
import { renderMermaidBlocks } from '../../services/diagram';

export function MDViewer() {
  const [value, setValue] = useState('');
  const [diagramError, setDiagramError] = useState('');
  const html = useMemo(() => renderMarkdown(value), [value]);
  const viewer = useRef(null);
  useEffect(() => {
    let active = true;
    renderMermaidBlocks(viewer.current)
      .then(() => active && setDiagramError(''))
      .catch((e) => active && setDiagramError(e.message));
    return () => {
      active = false;
    };
  }, [html]);
  return (
    <section className="md-workspace">
      <div className="md-head">
        <div>
          <h1>📖 Markdown</h1>
          <small>Paste Markdown and render it instantly, including Mermaid flowcharts.</small>
        </div>
        <button onClick={() => setValue('')}>🧹 Clear</button>
      </div>
      <textarea
        aria-label="Markdown source"
        className="md-input"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Paste Markdown here..."
      />
      {diagramError && <div className="error">{diagramError}</div>}
      <div ref={viewer} className="md-viewer" dangerouslySetInnerHTML={{ __html: html }} />
    </section>
  );
}
