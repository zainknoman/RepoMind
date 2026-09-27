import { useState } from 'react';
import { read } from '../../lib/files';
import { cp, dl } from '../../lib/text';

export function CodeIngest({ p }) {
  const [summary, setSummary] = useState(''),
    [structure, setStructure] = useState(''),
    [content, setContent] = useState(''),
    [busy, setBusy] = useState(false);
  async function generate() {
    if (!p) return;
    setBusy(true);
    try {
      const files = p.files.filter((f) => f.text),
        counts = {};
      files.forEach((f) => (counts[f.ext] = (counts[f.ext] || 0) + 1));
      const s =
        '# ' +
        p.name +
        '\n\n## Summary\n\n- Total files: ' +
        files.length +
        '\n- File types: ' +
        Object.keys(counts).length +
        '\n- Local-first analysis: yes\n\n### File Types\n' +
        Object.entries(counts)
          .sort((a, b) => b[1] - a[1])
          .map(([k, v]) => '- `' + k + '`: ' + v)
          .join('\n');
      const d =
        'Directory structure:\n' +
        buildTree(
          files.map((f) => f.path),
          p.name,
        );
      const all = [];
      for (const f of files)
        all.push(
          '/* --- Start of file: ' +
            f.path +
            ' --- */\n' +
            (await read(f)) +
            '\n/* --- End of file: ' +
            f.path +
            ' --- */',
        );
      setSummary(s);
      setStructure(d);
      setContent(all.join('\n\n'));
    } finally {
      setBusy(false);
    }
  }
  function buildTree(paths, root) {
    const tree = { files: [], dirs: {} };
    paths.forEach((path) => {
      const parts = path.split('/').filter(Boolean);
      let node = tree;
      parts.forEach((part, i) => {
        if (i === parts.length - 1) node.files.push(part);
        else {
          node.dirs[part] ??= { files: [], dirs: {} };
          node = node.dirs[part];
        }
      });
    });
    const lines = [root + '/'];
    function walk(node, prefix) {
      const entries = [
        ...Object.keys(node.dirs).map((name) => ({ name, dir: true })),
        ...node.files.map((name) => ({ name, dir: false })),
      ];
      entries.forEach((x, i) => {
        const last = i === entries.length - 1;
        lines.push(prefix + (last ? '└── ' : '├── ') + x.name + (x.dir ? '/' : ''));
        if (x.dir) walk(node.dirs[x.name], prefix + (last ? '    ' : '│   '));
      });
    }
    walk(tree, '');
    return lines.slice(0, 1).concat(lines.slice(1)).join('\n');
  }
  const all = summary + '\n\n' + structure + '\n\n# File Content\n\n' + content;
  return (
    <section className="code-ingest">
      <div className="head">
        <div>
          <h1>🍽️ Code Ingest</h1>
          <small>
            Gitingest-style local codebase summary, directory structure and combined file content.
          </small>
        </div>
        <button onClick={generate} disabled={!p || busy}>
          {busy ? '⏳ Generating...' : '⚙ Generate'}
        </button>
      </div>
      {!p && <div className="empty">📂 Open a local folder first.</div>}
      <div className="ingest-top-grid">
        <div className="ingest-section">
          <div className="ingest-toolbar">
            <h2>📋 Summary</h2>
            <button onClick={() => cp(summary)}>📋 Copy</button>
          </div>
          <textarea value={summary} readOnly placeholder="Generate to create summary" />
        </div>
        <div className="ingest-section">
          <div className="ingest-toolbar">
            <h2>🗂️ Directory Structure</h2>
            <button onClick={() => cp(structure)}>📋 Copy</button>
          </div>
          <textarea
            value={structure}
            readOnly
            placeholder="Generate to create directory structure"
          />
        </div>
      </div>
      <div className="ingest-section">
        <div className="ingest-toolbar">
          <h2>📄 File Content</h2>
          <div>
            <button onClick={() => cp(content)}>📋 Copy</button>
            <button onClick={() => dl((p?.name || 'project') + '_gitingest.md', all)}>
              ⬇ Download All
            </button>
          </div>
        </div>
        <textarea
          value={content}
          readOnly
          placeholder="Combined code files using Transform format"
        />
      </div>
    </section>
  );
}
