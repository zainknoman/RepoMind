import { useState } from 'react';
import { Investigation, Workflow } from './Investigation';
import { PaginatedList } from '../../components/PaginatedList';

export function Dashboard({
  p,
  data,
  open,
  onRefresh,
  codebase,
  onInvestigate,
  onOpenFolder,
  folderSupported,
}) {
  const [selectedType, setSelectedType] = useState('all'),
    [view, setView] = useState('overview'),
    [sort, setSort] = useState('lines'),
    [chart, setChart] = useState('types');
  if (!p)
    return (
      <section className="dashboard-empty">
        <div className="hero-badge">🧠 Repository Dashboard</div>
        <h1>Understand any codebase locally</h1>
        <p>
          Open a repository folder, build its code index, then investigate dependencies, impact and
          health signals. Everything runs in this browser; nothing is uploaded.
        </p>
        <button className="dashboard-open" onClick={onOpenFolder} disabled={!folderSupported}>
          📂 Open Repository Folder
        </button>
        <Workflow opened={false} indexed={false} />
      </section>
    );
  if (!data)
    return (
      <section>
        <div className="head">
          <div>
            <h1>📊 {p.name} Dashboard</h1>
            <small>Analyzing repository structure and readable source files locally…</small>
          </div>
        </div>
        <Investigation codebase={codebase} onInvestigate={onInvestigate} />
        <div className="analytics-panel">
          <h2>⏳ Building repository insights</h2>
          <p className="muted">
            Scanning file types, code volume, tests, configuration and project signals.
          </p>
        </div>
      </section>
    );
  const filteredFiles = p.files
    .filter((f) => selectedType === 'all' || f.ext === selectedType)
    .sort((a, b) => (sort === 'name' ? a.path.localeCompare(b.path) : 0));
  const maxType = Math.max(...data.types.map((x) => x.count), 1),
    maxDir = Math.max(...data.dirs.map((x) => x.count), 1),
    maxSize = Math.max(...data.sizeBuckets.map((x) => x.count), 1),
    maxLine = Math.max(...data.lineBuckets.map((x) => x.count), 1);
  const chartRows =
    chart === 'types'
      ? data.types
      : chart === 'dirs'
        ? data.dirs
        : chart === 'size'
          ? data.sizeBuckets
          : data.lineBuckets;
  const chartLabel = (x) => x.ext || x.name || 'no extension';
  const chartMax =
    chart === 'types' ? maxType : chart === 'dirs' ? maxDir : chart === 'size' ? maxSize : maxLine;
  return (
    <section className="dashboard">
      <div className="dashboard-hero">
        <div>
          <div className="hero-badge">🧠 Local Repository Intelligence</div>
          <h1>{p.name}</h1>
          <p>
            Start with <b>Investigate</b>: build the index, review what needs attention, then open
            the Codebase view that explains it. Everything is generated locally from this folder.
          </p>
        </div>
        <div className="dashboard-hero-actions">
          <div className="dashboard-score">
            <strong>{data.readability}%</strong>
            <span>readable files</span>
          </div>
          <button onClick={onRefresh}>↻ Refresh</button>
        </div>
      </div>
      <Investigation codebase={codebase} onInvestigate={onInvestigate} />
      <h2 className="dashboard-section-title">Repository profile</h2>
      <div className="dashboard-tabs">
        {[
          ['overview', 'Overview'],
          ['structure', 'Structure'],
          ['quality', 'Quality'],
          ['files', 'Files'],
        ].map(([x, label]) => (
          <button className={view === x ? 'active' : ''} key={x} onClick={() => setView(x)}>
            {label}
          </button>
        ))}
      </div>
      <div className="cards dashboard-cards">
        <article>
          <b>📄 {data.totalFiles.toLocaleString()}</b>
          <span>Total files</span>
        </article>
        <article>
          <b>💻 {data.textFiles.toLocaleString()}</b>
          <span>Readable files</span>
        </article>
        <article>
          <b>📏 {data.totalLines.toLocaleString()}</b>
          <span>Lines</span>
        </article>
        <article>
          <b>🧩 {Object.keys(data.types).length}</b>
          <span>File types</span>
        </article>
        <article>
          <b>🧪 {data.tests}</b>
          <span>Test signals</span>
        </article>
        <article>
          <b>📝 {data.todos}</b>
          <span>Open markers</span>
        </article>
      </div>
      {view === 'overview' && (
        <>
          <div className="dashboard-chart-grid">
            <div className="analytics-panel">
              <div className="transform-toolbar">
                <div>
                  <h2>📊 Repository Composition</h2>
                  <small>Click chart categories to filter files.</small>
                </div>
                <div className="dashboard-chart-switch">
                  {[
                    ['types', 'Types'],
                    ['dirs', 'Folders'],
                    ['size', 'File Size'],
                    ['lines', 'Line Count'],
                  ].map(([x, label]) => (
                    <button
                      className={chart === x ? 'active' : ''}
                      key={x}
                      onClick={() => setChart(x)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="dashboard-chart">
                {chartRows.map((x) => {
                  const value = x.count;
                  const label = chartLabel(x);
                  return (
                    <button
                      className="dashboard-chart-row"
                      key={label}
                      onClick={() => chart === 'types' && setSelectedType(x.ext)}
                    >
                      <span>{label}</span>
                      <i>
                        <b
                          style={{ width: Math.max(4, Math.round((value / chartMax) * 100)) + '%' }}
                        />
                      </i>
                      <strong>{value}</strong>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="analytics-panel">
              <h2>🍩 Project Composition</h2>
              <div className="dashboard-donut">
                <div
                  className="dashboard-donut-ring"
                  style={{
                    background: `conic-gradient(var(--accent,#0369a1) 0 ${((data.composition.find((x) => x.name === 'Source')?.count || 0) / data.totalFiles) * 100}%,#7c3aed 0 ${(data.composition.slice(0, 2).reduce((s, x) => s + x.count, 0) / data.totalFiles) * 100}%,#0f766e 0 ${(data.composition.slice(0, 3).reduce((s, x) => s + x.count, 0) / data.totalFiles) * 100}%,#d97706 0 ${(data.composition.slice(0, 4).reduce((s, x) => s + x.count, 0) / data.totalFiles) * 100}%,#94a3b8 0 100%)`,
                  }}
                >
                  <div>
                    {data.totalFiles}
                    <small>files</small>
                  </div>
                </div>
                <div className="dashboard-legend">
                  {data.composition.map((x) => (
                    <div key={x.name}>
                      <span>{x.name}</span>
                      <strong>{x.count}</strong>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <div className="dashboard-grid">
            <div className="analytics-panel">
              <h2>💡 Key Insights</h2>
              <div className="dashboard-insights">
                {data.insights.map((x, i) => (
                  <article key={i}>
                    <div>{x.icon}</div>
                    <section>
                      <b>{x.title}</b>
                      <span>{x.text}</span>
                    </section>
                  </article>
                ))}
              </div>
            </div>
            <div className="analytics-panel">
              <h2>📐 Code Metrics</h2>
              <div className="dashboard-health">
                <div>
                  <span>Documentation</span>
                  <strong>{data.docs}</strong>
                </div>
                <div>
                  <span>Configuration</span>
                  <strong>{data.configs}</strong>
                </div>
                <div>
                  <span>Comments</span>
                  <strong>{data.commentLines.toLocaleString()}</strong>
                </div>
                <div>
                  <span>Blank lines</span>
                  <strong>{data.blankLines.toLocaleString()}</strong>
                </div>
                <div>
                  <span>Characters</span>
                  <strong>{data.totalChars.toLocaleString()}</strong>
                </div>
                <div>
                  <span>Review signals</span>
                  <strong>{data.todos + data.sensitive}</strong>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
      {view === 'structure' && (
        <>
          <div className="dashboard-grid">
            <div className="analytics-panel">
              <h2>🗂️ Top-level folders</h2>
              <PaginatedList
                items={data.dirs}
                searchPlaceholder="Search folders"
                getSearchText={(x) => x.name}
                renderItem={(x) => (
                  <div className="dashboard-folder-row" key={x.name}>
                    <span>📁 {x.name}</span>
                    <i>
                      <b style={{ width: Math.max(4, Math.round((x.count / maxDir) * 100)) + '%' }} />
                    </i>
                    <strong>{x.count}</strong>
                  </div>
                )}
              />
            </div>
            <div className="analytics-panel">
              <h2>📄 Largest files</h2>
              <PaginatedList
                items={data.largest}
                searchPlaceholder="Search largest files"
                getSearchText={(x) => x.path}
                renderItem={(x) => (
                  <div className="index-row" key={x.path}>
                    <b>{x.path}</b>
                    <span>{x.lines.toLocaleString()} lines</span>
                    <small>{Math.round(x.size / 1024)} KB</small>
                  </div>
                )}
              />
            </div>
          </div>
        </>
      )}
      {view === 'quality' && (
        <div className="dashboard-grid">
          <div className="analytics-panel">
            <h2>🧪 Quality Signals</h2>
            <div className="dashboard-quality-grid">
              <div>
                <b>{data.tests}</b>
                <span>Test files</span>
              </div>
              <div>
                <b>{data.configs}</b>
                <span>Config/manifest files</span>
              </div>
              <div>
                <b>{data.docs}</b>
                <span>Documentation files</span>
              </div>
              <div>
                <b>{data.todos}</b>
                <span>TODO/FIXME/HACK markers</span>
              </div>
              <div>
                <b>{data.sensitive}</b>
                <span>Sensitive filename signals</span>
              </div>
              <div>
                <b>{data.commentLines.toLocaleString()}</b>
                <span>Comment lines</span>
              </div>
            </div>
          </div>
          <div className="analytics-panel">
            <h2>📏 Line distribution</h2>
            {data.lineBuckets.map((x) => (
              <div className="dashboard-folder-row" key={x.name}>
                <span>{x.name} lines</span>
                <i>
                  <b style={{ width: Math.max(4, Math.round((x.count / maxLine) * 100)) + '%' }} />
                </i>
                <strong>{x.count}</strong>
              </div>
            ))}
          </div>
        </div>
      )}
      {view === 'files' && (
        <div className="analytics-panel">
          <div className="transform-toolbar">
            <div>
              <h2>🗂️ Repository Files</h2>
              <small>{filteredFiles.length} matching files</small>
            </div>
            <div className="dashboard-file-controls">
              <select value={sort} onChange={(e) => setSort(e.target.value)}>
                <option value="lines">Source order</option>
                <option value="name">Name A–Z</option>
              </select>
              <button onClick={() => setSelectedType('all')}>All types</button>
            </div>
          </div>
          <PaginatedList
            className="dashboard-file-list"
            items={filteredFiles}
            searchPlaceholder="Search repository files"
            getSearchText={(f) => [f.path, f.ext].filter(Boolean).join(' ')}
            renderItem={(f) => (
              <button key={f.path} onClick={() => open(f)}>
                <span>📄 {f.path}</span>
                <small>{f.ext}</small>
              </button>
            )}
          />
        </div>
      )}
    </section>
  );
}
