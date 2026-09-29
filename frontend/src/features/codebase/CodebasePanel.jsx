import { useEffect, useMemo, useState } from 'react';
import { getSymbolDetails } from '../../services/repository';
import { readGitRepository, gitStatusSummary, gitActivity } from '../../services/git';
import { listAnalyzers, runAnalyzers, analyzerSummary } from '../../services/analyzers';
// Registers the Temenos analyzers; they are listed only for indexes with BASIC sources.
import '../../services/temenos';
import { buildDocumentationReport, buildModuleReport } from '../../services/documentation';
import { buildArchitectureMermaid, renderMermaid } from '../../services/diagram';
import { fileCoupling } from '../../services/health';
import { IndexProgress, indexSourceLabel } from './IndexProgress';
import { AnalyzersView } from './AnalyzersView';
import { ImpactView } from './ImpactView';
import { GitView } from './GitView';
import { AIWorkspace, ContextBuilderView } from './AIViews';
import { useAIContext } from './useAIContext';
import { cp, dl } from '../../lib/text';
import { toast } from '../../lib/toast';
import { PaginatedList } from '../../components/PaginatedList';

const IMPORT_LEVELS = {
  resolved: 'resolved by name',
  relative: 'relative paths and tsconfig aliases',
  modules: 'modules resolved',
  none: 'none',
};

const RESOLUTION_LABELS = {
  import: 'Resolved through an import',
  local: 'Resolved to a declaration in scope',
  'name-match': 'Guessed: a top-level symbol with this name; nothing imports it',
  this: 'A method of the enclosing class or one of its superclasses',
  'member-type': "A method of the object's class (from new or a type annotation)",
  'member-guess': "Guessed: a method with this name; the object's class is unknown",
};

const CONFIDENCE_ORDER = { high: 0, medium: 1, low: 2, none: 3 };
const byConfidence = (refs) =>
  [...refs].sort(
    (a, b) => (CONFIDENCE_ORDER[a.confidence] ?? 0) - (CONFIDENCE_ORDER[b.confidence] ?? 0),
  );

// The index itself (build, cache, cycles, health) is owned by App through useCodebaseIndex so the
// Dashboard shares it. The active view and selected file are lifted too, so other workspaces can
// open a specific Codebase view.
export default function CodebasePanel({
  project,
  codebase,
  view,
  setView,
  selectedFile,
  setSelectedFile,
  onOpenFile,
}) {
  const { index, indexing, progress, source: indexSource, cycles, health } = codebase;
  const [selectedSymbol, setSelectedSymbol] = useState(null),
    [impactSymbol, setImpactSymbol] = useState(null),
    [error, setError] = useState('');
  const [diagram, setDiagram] = useState(''),
    [analyzerResults, setAnalyzerResults] = useState({}),
    // null, true (running all) or the id of the analyzer running.
    [analyzerBusy, setAnalyzerBusy] = useState(null),
    [git, setGit] = useState(null),
    [gitBusy, setGitBusy] = useState(false),
    [report, setReport] = useState(''),
    [diagramSvg, setDiagramSvg] = useState(''),
    [diagramError, setDiagramError] = useState(''),
    [diagramBusy, setDiagramBusy] = useState(false);
  const ai = useAIContext({ index, project, analyzerResults });
  // Impact and Change Impact hand their analysis to the AI view as an investigation.
  const explainWithAI = (investigation) => {
    setView('ai');
    ai.investigate(investigation);
  };
  // Every new index (fresh or restored from cache) resets the selection that depends on it.
  useEffect(() => {
    if (!index) return;
    setSelectedSymbol(null);
    setAnalyzerResults({});
  }, [index]);
  async function refreshGit() {
    if (!project?.rootHandle) return;
    setGitBusy(true);
    try {
      const meta = await readGitRepository(project.rootHandle, project.files);
      const status = await gitStatusSummary(project.rootHandle, project.files);
      const activity = await gitActivity(project.rootHandle);
      setGit({ ...meta, status, activity });
    } catch (e) {
      setGit({ available: false, error: e?.message || 'Git metadata unavailable' });
    } finally {
      setGitBusy(false);
    }
  }
  useEffect(() => {
    if (project?.rootHandle) refreshGit();
    // Runs once per project: the panel is remounted (keyed) when another folder is opened.
  }, [project]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (index) setDiagram(buildArchitectureMermaid(index));
  }, [index]);
  useEffect(() => {
    let active = true;
    if (view !== 'diagram' || !diagram) return;
    setDiagramBusy(true);
    setDiagramError('');
    renderMermaid(diagram)
      .then((result) => {
        if (active) setDiagramSvg(result.svg || '');
      })
      .catch((e) => {
        if (active) {
          setDiagramSvg('');
          setDiagramError(e?.message || 'Unable to render Mermaid diagram');
        }
      })
      .finally(() => {
        if (active) setDiagramBusy(false);
      });
    return () => {
      active = false;
    };
  }, [view, diagram]);
  const architecture = useMemo(() => fileCoupling(index), [index]),
    details = useMemo(() => getSymbolDetails(index, selectedSymbol), [index, selectedSymbol]);
  const profile = useMemo(
    () => ({
      frameworks: index?.project?.frameworks || [],
      languages: Object.entries(index?.languages || {}).sort((a, b) => b[1] - a[1]),
    }),
    [index],
  );
  const analyzerCatalog = useMemo(() => listAnalyzers(index), [index]),
    resolutionSummary = useMemo(() => analyzerSummary(index), [index]),
    analyzersRun = Object.keys(analyzerResults).length,
    securityScanned = !!analyzerResults.security && !analyzerResults.security.error,
    securityCount = analyzerResults.security?.findings.length || 0;
  const openFile = (path) => {
    const file = index?._fileHandles?.get(path);
    if (file) onOpenFile?.(file);
  };
  function generateReport() {
    if (!index) return;
    setReport(
      buildDocumentationReport(index, {
        name: project.name,
        cycles,
        routes: analyzerResults.routes?.findings || [],
        security: securityScanned ? analyzerResults.security.findings : null,
      }),
    );
    setView('reports');
    toast.success('Project report generated');
  }
  function generateModuleReport() {
    if (!index || !selectedFile) return;
    setReport(buildModuleReport(index, selectedFile));
    setView('reports');
    toast.success('Module report generated for ' + selectedFile.split('/').pop());
  }

  async function runAnalyzerIds(ids) {
    if (!index) return;
    setAnalyzerBusy(ids.length === 1 ? ids[0] : true);
    setError('');
    try {
      await runAnalyzers(index, ids, {
        onResult: (id, result) => setAnalyzerResults((s) => ({ ...s, [id]: result })),
      });
    } catch (e) {
      setError(e?.message || 'Analyzer failed');
    } finally {
      setAnalyzerBusy(null);
    }
  }
  if (!project)
    return (
      <section>
        <div className="empty">📂 Open a local folder first to build its codebase index.</div>
      </section>
    );
  return (
    <section className="codebase-intelligence">
      <div className="head">
        <div>
          <h1>🧠 Codebase Intelligence</h1>
          <small>
            Local repository intelligence: symbols, search, architecture, APIs, security and
            AI-ready context.
          </small>
        </div>
        <div className="index-actions">
          <button onClick={indexing ? codebase.cancel : codebase.build}>
            {indexing ? '✕ Cancel' : '⚙ Build / Refresh Index'}
          </button>
          {index && <button onClick={codebase.clear}>♻ Clear Cache</button>}
        </div>
      </div>
      {codebase.error && <div className="error">{codebase.error}</div>}
      {error && <div className="error">{error}</div>}
      {indexing && <IndexProgress progress={progress} />}
      {!index ? (
        <div className="panel">
          <h2>Repository Intelligence</h2>
          <p className="muted">Build one local index. Source stays in your browser.</p>
          <button onClick={codebase.build} disabled={indexing}>
            🚀 Build Project Index
          </button>
        </div>
      ) : (
        <>
          <div className="index-source">
            <span>{indexSourceLabel(indexSource, index.stats)}</span>{' '}
            <small>
              ·{' '}
              {index.cachedAt
                ? new Date(index.cachedAt).toLocaleString()
                : index.generatedAt
                  ? new Date(index.generatedAt).toLocaleString()
                  : ''}
            </small>
          </div>
          <div className="cards intelligence-cards">
            <article>
              <b>{index.stats.files}</b>
              <span>Files</span>
            </article>
            <article>
              <b>{index.stats.symbols}</b>
              <span>Symbols</span>
            </article>
            <article>
              <b>{index.stats.references}</b>
              <span>References</span>
            </article>
            <article>
              <b>{index.stats.resolvedReferences}</b>
              <span>Resolved</span>
            </article>
            <article>
              <b>{index.stats.internalEdges}</b>
              <span>Internal edges</span>
            </article>
            <article title={securityScanned ? undefined : 'Run the security scan in Analyzers'}>
              <b>{securityScanned ? securityCount : '—'}</b>
              <span>{securityScanned ? 'Security findings' : 'Security: not scanned'}</span>
            </article>
          </div>
          <div className="tabs">
            {[
              ['overview', 'Overview'],
              ['symbols', 'Symbols'],
              ['dependencies', 'Dependencies'],
              ['impact', 'Impact'],
              ['health', 'Health'],
              ['analyzers', 'Analyzers'],
              ['git', 'Git'],
              ['diagram', 'Diagram'],
              ['reports', 'Reports'],
              ['context', 'Context Builder'],
              ['ai', 'AI'],
            ].map(([k, l]) => (
              <button key={k} className={view === k ? 'active' : ''} onClick={() => setView(k)}>
                {l}
              </button>
            ))}
          </div>

          {view === 'overview' && (
            <div className="analyze-grid">
              <div className="analytics-panel">
                <h2>Project Profile</h2>
                {profile.frameworks.map((x) => (
                  <div className="index-row" key={x.name}>
                    <b>{x.name}</b>
                    <span>detected</span>
                    <small>{x.evidence}</small>
                  </div>
                ))}
                {(index.project?.packages || []).slice(0, 20).map((x) => (
                  <div className="index-row" key={x.package}>
                    <b>{x.package}</b>
                    <span>{x.version}</span>
                    <small>{x.category}</small>
                  </div>
                ))}
                {profile.languages.map(([l, c]) => (
                  <div className="index-row" key={l}>
                    <b>{l}</b>
                    <span>{c} files</span>
                    <small>{Math.round((c / index.stats.files) * 100)}%</small>
                  </div>
                ))}
              </div>
              <div className="analytics-panel">
                <h2>Health Signals</h2>
                <Metric
                  label="Unresolved relative imports"
                  value={index.unresolvedImports.length}
                />
                <Metric label="Circular dependency paths" value={cycles.length} />
                <Metric label="Unresolved references" value={index.stats.unresolvedReferences} />
                <Metric
                  label="Parser errors"
                  value={index.files.reduce((s, f) => s + (f.parseErrors?.length || 0), 0)}
                />
                <Metric label="External imports" value={index.externalDependencies.length} />
                <Metric
                  label="Security findings"
                  value={securityScanned ? securityCount : '—'}
                  note={securityScanned ? undefined : 'Run the scan in Analyzers'}
                />
              </div>
              <div className="analytics-panel">
                <h2>Analysis Coverage</h2>
                <p className="muted">
                  What the index extracted per language. Dependencies, Impact and AI context are
                  only as complete as this.
                </p>
                {(index.coverage || []).map((c) => (
                  <div className={'coverage-row' + (c.gap ? ' gap' : '')} key={c.language}>
                    <b>{c.language}</b>
                    <span>
                      {c.files} files · imports {IMPORT_LEVELS[c.imports]} · references{' '}
                      {c.references ? 'linked' : 'not extracted'}
                    </span>
                    <small>{c.note}</small>
                  </div>
                ))}
                {!index.coverage?.length && <p className="muted">No source files indexed.</p>}
              </div>
            </div>
          )}
          {view === 'symbols' && (
            <div className="analytics-panel">
              <h2>Symbol Intelligence</h2>
              <PaginatedList
                items={index.symbols || []}
                searchPlaceholder="Search symbols"
                getSearchText={(s) => [s.name, s.path, s.kind, s.parent].filter(Boolean).join(' ')}
                renderItem={(s) => (
                  <button
                    className="index-row clickable"
                    key={s.definitionKey}
                    onClick={() => setSelectedSymbol(s.definitionKey)}
                  >
                    <b>{s.name}</b>
                    <span>
                      {s.kind}
                      {s.parent ? ' · ' + s.parent : ''}
                    </span>
                    <small>
                      {s.path}:{s.line}
                    </small>
                  </button>
                )}
              />
              {details && (
                <SymbolDetails
                  details={details}
                  onClose={() => setSelectedSymbol(null)}
                  onImpact={(symbol) => {
                    setSelectedFile(symbol.path);
                    setImpactSymbol(symbol.definitionKey);
                    setView('impact');
                  }}
                />
              )}
            </div>
          )}
          {view === 'dependencies' && (
            <div className="analyze-grid">
              <div className="analytics-panel">
                <h2>Dependency Hotspots</h2>
                <PaginatedList
                  items={architecture}
                  searchPlaceholder="Search dependency hotspots"
                  getSearchText={(x) => x.path}
                  renderItem={(x) => (
                    <button
                      className="index-row clickable"
                      key={x.path}
                      onClick={() => {
                        setSelectedFile(x.path);
                        setView('impact');
                      }}
                    >
                      <b>{x.path}</b>
                      <span>
                        {x.dependencies} out · {x.dependents} in
                      </span>
                      <small>
                        {x.symbols} symbols · ~{x.tokens.toLocaleString()} tokens
                      </small>
                    </button>
                  )}
                />
              </div>
              <div className="analytics-panel">
                <h2>Circular Dependencies</h2>
                {cycles.map((c, i) => (
                  <div className="cycle-row" key={i}>
                    {c.join(' → ')}
                  </div>
                ))}
                {!cycles.length && <p className="muted">No circular dependency paths detected.</p>}
              </div>
            </div>
          )}
          {view === 'health' && <HealthView health={health} />}
          {view === 'reports' && (
            <div className="analytics-panel">
              <div className="transform-toolbar">
                <b>📄 Documentation & Reports</b>
                <span className="muted">
                  Generate local Markdown documentation from the current index.
                </span>
                <button onClick={generateReport}>▶ Project Report</button>
                <button onClick={generateModuleReport} disabled={!selectedFile}>
                  ▶ Module Report
                </button>
                <button onClick={() => cp(report, 'Report copied to clipboard')} disabled={!report}>
                  📋 Copy
                </button>
                <button
                  onClick={() =>
                    dl((project.name || 'repository') + '-report.md', report, 'text/markdown')
                  }
                  disabled={!report}
                >
                  ⬇ Download
                </button>
              </div>
              <div className="search">
                <select value={selectedFile} onChange={(e) => setSelectedFile(e.target.value)}>
                  <option value="">Select a module/file</option>
                  {index.files.map((f) => (
                    <option key={f.path}>{f.path}</option>
                  ))}
                </select>
              </div>
              <textarea
                className="context-output report-output"
                value={report}
                onChange={(e) => setReport(e.target.value)}
                placeholder="Generate a project or module report."
              />
            </div>
          )}
          {view === 'analyzers' && (
            <AnalyzersView
              catalog={analyzerCatalog}
              results={analyzerResults}
              summary={resolutionSummary}
              busy={analyzerBusy}
              onRun={runAnalyzerIds}
              onOpenFile={openFile}
            />
          )}
          {view === 'impact' && (
            <ImpactView
              index={index}
              selectedFile={selectedFile}
              setSelectedFile={setSelectedFile}
              impactSymbol={impactSymbol}
              setImpactSymbol={setImpactSymbol}
              onOpenFile={openFile}
              onExplain={explainWithAI}
            />
          )}
          {view === 'diagram' && (
            <div className="analytics-panel">
              <div className="transform-toolbar">
                <b>🏗️ Architecture Diagram</b>
                <span className="muted">Mermaid.js renderer</span>
                <button
                  onClick={() => {
                    setDiagram(buildArchitectureMermaid(index, { limit: 150 }));
                    toast.success('Architecture diagram generated');
                  }}
                >
                  ▶ Generate
                </button>
                <button
                  onClick={() => {
                    setDiagramSvg('');
                    setDiagramError('');
                    setView('diagram');
                  }}
                  disabled={!diagram || diagramBusy}
                >
                  ↻ Re-render
                </button>
                <button onClick={() => cp(diagram, 'Mermaid source copied to clipboard')}>
                  📋 Copy
                </button>
                <button
                  onClick={() => dl((project.name || 'repository') + '-architecture.mmd', diagram)}
                >
                  ⬇ Download
                </button>
              </div>
              <textarea
                className="diagram-output"
                value={diagram}
                onChange={(e) => setDiagram(e.target.value)}
              />
              {diagramBusy && <p className="muted">⏳ Rendering Mermaid diagram…</p>}
              {diagramError && <div className="error">{diagramError}</div>}
              <div className="diagram-preview">
                {diagramSvg ? (
                  <div className="mermaid-svg" dangerouslySetInnerHTML={{ __html: diagramSvg }} />
                ) : (
                  <pre>{diagram}</pre>
                )}
              </div>
              <p className="muted">
                RepoMind renders the diagram with Mermaid.js in the browser. Mermaid is loaded only
                when this tab is opened.
              </p>
            </div>
          )}
          {view === 'git' && (
            <GitView
              git={git}
              busy={gitBusy}
              onRefresh={refreshGit}
              project={project}
              index={index}
              onOpenFile={openFile}
              onExplain={explainWithAI}
              onSelect={(path) => {
                setSelectedFile(path);
                setView('impact');
              }}
            />
          )}
          {view === 'ai' && (
            <AIWorkspace
              ai={ai}
              projectName={project.name}
              analyzersRun={analyzersRun}
              onOpenFile={openFile}
            />
          )}
          {view === 'context' && (
            <ContextBuilderView
              ai={ai}
              index={index}
              projectName={project.name}
              analyzersRun={analyzersRun}
            />
          )}
        </>
      )}
    </section>
  );
}
function Metric({ label, value, note }) {
  return (
    <div className="index-row">
      <b>{label}</b>
      <span>{value}</span>
      <small>{note || (value ? 'Review' : 'None detected')}</small>
    </div>
  );
}
function SymbolDetails({ details, onClose, onImpact }) {
  const { symbol } = details;
  return (
    <div className="symbol-inspector panel">
      <div className="transform-toolbar">
        <div>
          <b>{symbol.name}</b>
          <span className="muted">
            {' '}
            · {symbol.kind} · {symbol.path}:{symbol.line}
          </span>
        </div>
        <div>
          <button onClick={() => onImpact(symbol)}>Show impact</button>
          <button onClick={onClose}>✕ Close</button>
        </div>
      </div>
      <div className="analyze-grid">
        <div>
          <h3>Definition</h3>
          <p className="muted">
            {symbol.path}:{symbol.line}:{symbol.column}
          </p>
          <h3>Methods</h3>
          {details.methods.length ? (
            details.methods.map((x) => (
              <div className="mini-row" key={x.definitionKey}>
                {x.name}()
              </div>
            ))
          ) : (
            <p className="muted">No class methods.</p>
          )}
        </div>
        <div>
          <h3>References ({details.references.length})</h3>
          <PaginatedList
            items={byConfidence(details.references)}
            searchPlaceholder="Search references"
            getSearchText={(r) =>
              [r.from, r.receiver, r.confidence, r.resolution].filter(Boolean).join(' ')
            }
            renderItem={(r, i) => (
              <div className="mini-row" key={r.from + ':' + r.line + ':' + i}>
                {r.from}:{r.line}:{r.column}
                {r.receiver && <code> {r.receiver}.</code>}
                {r.confidence && (
                  <span
                    className={'confidence conf-' + r.confidence}
                    title={RESOLUTION_LABELS[r.resolution] || ''}
                  >
                    {r.confidence}
                  </span>
                )}
              </div>
            )}
          />
        </div>
      </div>
      <h3>Imported by ({details.importedBy.length})</h3>
      <PaginatedList
        items={details.importedBy}
        searchPlaceholder="Search imported-by references"
        getSearchText={(x) => [x.from, x.local, x.imported].filter(Boolean).join(' ')}
        renderItem={(x, i) => (
          <div className="index-row" key={x.from + ':' + x.line + ':' + i}>
            <b>{x.from}</b>
            <span>{x.local}</span>
            <small>
              {x.imported} · line {x.line}
            </small>
          </div>
        )}
      />
    </div>
  );
}

function HealthView({ health }) {
  if (!health)
    return (
      <div className="analytics-panel">
        <p className="muted">Build an index first.</p>
      </div>
    );
  return (
    <div className="ai-health">
      <div className="cards intelligence-cards">
        {health.signals.map((x) => (
          <article key={x.id}>
            <b>{x.count}</b>
            <span>{x.label}</span>
            <small className={'severity ' + x.severity}>{x.severity}</small>
          </article>
        ))}
      </div>
      <div className="analyze-grid">
        <div className="analytics-panel">
          <h2>Architecture Risk Signals</h2>
          {health.signals.map((x) => (
            <div className="index-row" key={x.id}>
              <b>{x.label}</b>
              <span>{x.count}</span>
              <small>{x.detail}</small>
            </div>
          ))}
        </div>
        <div className="analytics-panel">
          <h2>Hotspot Files</h2>
          <PaginatedList
            items={health.hotspots || []}
            searchPlaceholder="Search hotspot files"
            getSearchText={(x) => x.path}
            renderItem={(x) => (
              <div className="index-row" key={x.path}>
                <b>{x.path}</b>
                <span>{x.score} edges</span>
                <small>
                  {x.dependencies} out · {x.dependents} in · {x.symbols} symbols
                </small>
              </div>
            )}
          />
        </div>
      </div>
    </div>
  );
}
