import { useState } from 'react';
import { read } from '../../lib/files';
import { cp, dl } from '../../lib/text';
import { combineFiles, splitCombined } from '../../lib/transform';
import { downloadZip } from '../../lib/zip';
import { toast } from '../../lib/toast';

export function Transform({ p, state, setState, onError }) {
  const { compiled, split, parts } = state;
  const set = (patch) => setState((s) => ({ ...s, ...patch }));
  const [selected, setSelected] = useState([]),
    [find, setFind] = useState(''),
    [busy, setBusy] = useState(false);
  const textFiles = p?.files.filter((f) => f.text) || [];

  async function build() {
    if (!p) return;
    setBusy(true);
    try {
      const chosen = textFiles.filter((f) => selected.includes(f.path));
      const files = [];
      for (const f of chosen) files.push({ path: f.path, content: await read(f) });
      set({ compiled: combineFiles(files) });
      toast.success(`Compiled ${files.length} file${files.length === 1 ? '' : 's'}`);
    } catch (e) {
      onError?.(e.message);
      toast.error('Compile failed: ' + e.message);
    } finally {
      setBusy(false);
    }
  }
  async function zip(items) {
    try {
      await downloadZip(items, 'recovered_files.zip');
    } catch (e) {
      onError?.('Unable to create ZIP: ' + e.message);
      toast.error('Unable to create ZIP: ' + e.message);
    }
  }
  const filtered = parts.filter((x) => !find || x.name.toLowerCase().includes(find.toLowerCase()));
  return (
    <section>
      <div className="head">
        <div>
          <h1>🧩 Transform</h1>
          <small>
            Combine files into one bundle, then split a bundle back into files or a ZIP.
          </small>
        </div>
      </div>
      <div className="transform-panel">
        <div className="transform-toolbar">
          <b>Combine Files</b>
          <button onClick={() => setSelected(textFiles.map((f) => f.path))} disabled={!p}>
            ☑ Select All
          </button>
          <button onClick={() => setSelected([])}>☐ Clear</button>
          <button onClick={build} disabled={!selected.length || busy}>
            {busy ? '⏳ Compiling…' : '⚙ Compile'}
          </button>
          <button
            onClick={() => cp(compiled, 'Compiled output copied to clipboard')}
            disabled={!compiled}
          >
            📋 Copy
          </button>
          <button onClick={() => dl('compiled_output.txt', compiled)} disabled={!compiled}>
            ⬇ Download
          </button>
        </div>
        {!p && <div className="empty">📂 Open a local folder to combine its files.</div>}
        <div className="file-checks">
          {textFiles.map((f) => (
            <label key={f.path}>
              <input
                type="checkbox"
                checked={selected.includes(f.path)}
                onChange={(e) =>
                  setSelected(
                    e.target.checked ? [...selected, f.path] : selected.filter((x) => x !== f.path),
                  )
                }
              />
              {f.path}
            </label>
          ))}
        </div>
        <textarea
          aria-label="Compiled output"
          value={compiled}
          onChange={(e) => set({ compiled: e.target.value })}
          placeholder="Compiled output appears here"
        />
      </div>
      <div className="transform-panel">
        <div className="transform-toolbar">
          <b>Reverse Split</b>
          <button
            onClick={() => {
              const next = splitCombined(split);
              set({ parts: next });
              if (next.length)
                toast.success(`Split into ${next.length} file${next.length === 1 ? '' : 's'}`);
              else toast.info('No files found in the bundle');
            }}
            disabled={!split}
          >
            🔄 Split
          </button>
          <button onClick={() => zip(filtered)} disabled={!filtered.length}>
            📦 Download ZIP
          </button>
        </div>
        <textarea
          aria-label="Bundle to split"
          value={split}
          onChange={(e) => set({ split: e.target.value })}
          placeholder="Paste a combined bundle here"
        />
        <div className="transform-search">
          <input
            value={find}
            onChange={(e) => setFind(e.target.value)}
            placeholder="Filter split files by name"
          />
          <span>{parts.length ? `${filtered.length} of ${parts.length} files` : ''}</span>
        </div>
        {filtered.map((x, i) => (
          <div className="split-file" key={x.name + i}>
            <div>
              <b>📄 {x.name}</b>
              <span>{x.content.length} chars</span>
            </div>
            <div>
              <button
                onClick={() => cp(x.content, x.name.split('/').pop() + ' copied to clipboard')}
              >
                📋 Copy
              </button>
              <button onClick={() => dl(x.name.split('/').pop(), x.content)}>⬇ Download</button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
