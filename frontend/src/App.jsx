import './styles.css';
import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MAX_FILES, applyGitignore, read, supportsFolderAccess, walk } from './lib/files';
import { searchProject } from './services/search';
import { buildDashboardData } from './features/dashboard/dashboardData';
import { Dashboard } from './features/dashboard/Dashboard';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Toaster } from './components/Toaster';
import { toast } from './lib/toast';
import { TOOL_IDS } from './features/tools/runTool';
import { NAV_GROUPS, PRIMARY_TAB, SECONDARY_GROUP } from './navigation';
import { useCodebaseIndex } from './features/codebase/useCodebaseIndex';

// Workspaces are loaded on first use so the initial bundle only carries the shell and the dashboard.
const named = (loader, name) => lazy(() => loader().then((m) => ({ default: m[name] })));
const CodebasePanel = React.memo(lazy(() => import('./features/codebase/CodebasePanel')));
const Explorer = named(() => import('./features/explorer/Explorer'), 'Explorer');
const SearchPanel = named(() => import('./features/search/SearchPanel'), 'SearchPanel');
const Editor = named(() => import('./features/editor/Editor'), 'Editor');
const MDViewer = named(() => import('./features/markdown/MDViewer'), 'MDViewer');
const CodeIngest = named(() => import('./features/ingest/CodeIngest'), 'CodeIngest');
const Analyze = named(() => import('./features/analysis/Analyze'), 'Analyze');
const Transform = named(() => import('./features/transform/Transform'), 'Transform');
const Diff = named(() => import('./features/compare/Diff'), 'Diff');
const Tools = named(() => import('./features/tools/Tools'), 'Tools');
const OFSWorkspace = named(() => import('./features/tools/EmbeddedTools'), 'OFSWorkspace');
const EngineeringWorkspace = named(
  () => import('./features/tools/EmbeddedTools'),
  'EngineeringWorkspace',
);
const HelpPage = named(() => import('./features/help/HelpPage'), 'HelpPage');

const MAX_SEARCH_RESULTS = 2000;

function initialState() {
  const queryTool = new URLSearchParams(window.location.search).get('tool') || '';
  const tab =
    queryTool === 'ofs'
      ? 'ofs'
      : queryTool === 'eng'
        ? 'engineering'
        : TOOL_IDS.includes(queryTool)
          ? 'tools'
          : 'dashboard';
  return { tab, tool: TOOL_IDS.includes(queryTool) ? queryTool : 'json' };
}

function App() {
  const initial = useMemo(initialState, []);
  const folderSupported = useMemo(supportsFolderAccess, []);
  const [includeSensitive, setIncludeSensitive] = useState(false),
    [p, setP] = useState(),
    [dashboardData, setDashboardData] = useState(null),
    [sel, setSel] = useState(),
    [tab, setTab] = useState(initial.tab),
    [explorerQ, setExplorerQ] = useState(''),
    [searchQ, setSearchQ] = useState(''),
    [searchOptions, setSearchOptions] = useState({ regex: false, caseSensitive: false }),
    [res, setRes] = useState(null),
    [searching, setSearching] = useState(false),
    [text, setText] = useState(''),
    [dirty, setDirty] = useState(false),
    [toolState, setToolState] = useState({
      tool: initial.tool,
      input: '',
      regex: '',
      regexText: '',
      output: '',
    }),
    [transformState, setTransformState] = useState({ compiled: '', split: '', parts: [] }),
    [diff, setDiff] = useState(null),
    [err, setErr] = useState(''),
    [notice, setNotice] = useState(''),
    [searchView, setSearchView] = useState(null),
    [codebaseMounted, setCodebaseMounted] = useState(false),
    [codebaseView, setCodebaseView] = useState('overview'),
    [codebaseFile, setCodebaseFile] = useState('');
  // One index per opened folder, shared by the Dashboard and the Codebase workspace.
  const codebase = useCodebaseIndex(p);

  // Opens a Codebase view, optionally focused on one file (used by the Dashboard's investigation links).
  // Search is one workspace for the whole product, so a 'search' link opens it rather than a view.
  const investigate = useCallback((view, file) => {
    if (view === 'search') return setTab('search');
    setCodebaseView(view);
    if (file !== undefined) setCodebaseFile(file);
    setTab('codebase');
  }, []);

  // The Codebase panel is mounted on first visit and then kept alive (hidden) so its index survives
  // tab switches. Opening another folder remounts it via its key.
  useEffect(() => {
    if (tab === 'codebase') setCodebaseMounted(true);
  }, [tab]);

  // Warn before closing the tab with unsaved editor changes.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  function confirmDiscard() {
    return (
      !dirty ||
      window.confirm(`You have unsaved changes to ${sel?.path || 'the open file'}. Discard them?`)
    );
  }

  async function folder() {
    if (!confirmDiscard()) return;
    try {
      const h = await window.showDirectoryPicker({ mode: 'readwrite' });
      const listed = await walk(h, '', [], includeSensitive);
      const fs = await applyGitignore(listed);
      const ex = {};
      for (const f of fs) ex[f.ext] = (ex[f.ext] || 0) + 1;
      setP({ name: h.name, files: fs, stats: { ext: ex }, rootHandle: h, openedAt: Date.now() });
      setCodebaseMounted(false);
      setCodebaseView('overview');
      setCodebaseFile('');
      setSel(null);
      setText('');
      setDirty(false);
      setSearchView(null);
      setRes(null);
      setDiff(null);
      setTab('dashboard');
      setErr('');
      setNotice(
        listed.truncated
          ? `This folder has more than ${MAX_FILES.toLocaleString()} files. Only the first ${MAX_FILES.toLocaleString()} were loaded; open a subfolder for complete results.`
          : '',
      );
      setDashboardData(null);
      buildDashboardData(fs)
        .then(setDashboardData)
        .catch(() => {});
    } catch (e) {
      if (e.name !== 'AbortError') setErr(e.message);
    }
  }

  async function open(f, fromSearch = false) {
    if (!f?.text) return setErr('Binary, sensitive or unsupported file');
    if (sel?.path !== f.path && !confirmDiscard()) return;
    try {
      const c = await read(f),
        x = { ...f, content: c };
      setSel(x);
      setText(c);
      setDirty(false);
      if (fromSearch) {
        setSearchView({ file: x, query: res?.query || '', options: res?.options });
        setTab('search');
      } else {
        setSearchView(null);
        setTab('editor');
      }
      setErr('');
    } catch (e) {
      setErr(e.message);
    }
  }

  // Stable callback for the memoized Codebase panel; always calls the latest `open`.
  const openRef = useRef(open);
  openRef.current = open;
  const openFromCodebase = useCallback((f) => openRef.current(f), []);

  function editFromSearch(file) {
    if (sel?.path !== file.path && !confirmDiscard()) return;
    setSel(file);
    setText(file.content);
    setDirty(false);
    setTab('editor');
  }

  async function save() {
    try {
      const w = await sel.handle.createWritable();
      await w.write(text);
      await w.close();
      const x = { ...sel, content: text };
      setSel(x);
      setDirty(false);
      if (searchView?.file.path === sel.path) setSearchView({ ...searchView, file: x });
      toast.success('Saved ' + sel.name);
    } catch (e) {
      setErr('Unable to save: ' + e.message);
      toast.error('Unable to save: ' + e.message);
    }
  }

  async function search() {
    if (!p || !searchQ.trim()) return;
    setSearching(true);
    try {
      setRes(
        await searchProject({
          files: p.files,
          index: codebase.index,
          query: searchQ,
          options: searchOptions,
          limit: MAX_SEARCH_RESULTS,
        }),
      );
      setSearchView(null);
      setTab('search');
    } finally {
      setSearching(false);
    }
  }

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header>
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            ◈
          </div>
          <div>
            <b>RepoMind</b>
            <small>Local-first codebase intelligence workspace</small>
          </div>
        </div>
        <div className="header-actions">
          <button onClick={() => setTab('help')} aria-current={tab === 'help' ? 'page' : undefined}>
            <span aria-hidden="true">❔</span> Help
          </button>
          <label className="sensitive-toggle">
            <input
              type="checkbox"
              checked={includeSensitive}
              onChange={(e) => setIncludeSensitive(e.target.checked)}
            />{' '}
            Include sensitive files
          </label>
          <button onClick={folder} disabled={!folderSupported}>
            <span aria-hidden="true">📂</span> Open Folder
          </button>
        </div>
      </header>
      {!folderSupported && (
        <div className="notice unsupported-browser" role="status">
          <b>Opening local folders needs a Chromium-based browser</b> such as Chrome or Edge
          (desktop). This browser does not support the File System Access API. The Markdown viewer
          and the Developer Tools still work here.
        </div>
      )}
      <div className="status" role="status">
        {p ? (
          <>
            <b>📁 {p.name}</b>
            <span>📄 {p.files.length.toLocaleString()} files</span>
            <span>✓ Local only</span>
          </>
        ) : (
          <span>{folderSupported ? 'Select a local folder to begin' : 'No folder open'}</span>
        )}
      </div>
      {notice && (
        <div className="notice" role="status">
          {notice}
        </div>
      )}
      {err && (
        <div className="error" role="alert">
          {err}
          <button className="dismiss" onClick={() => setErr('')} aria-label="Dismiss error">
            ✕
          </button>
        </div>
      )}
      <nav className="workspace-nav" aria-label="Workspaces">
        {NAV_GROUPS.map(([group, items]) => (
          <div
            className={group === SECONDARY_GROUP ? 'nav-group secondary' : 'nav-group'}
            key={group}
          >
            <span>{group}</span>
            {items.map(([id, label]) => (
              <button
                key={id}
                className={
                  [tab === id && 'active', id === PRIMARY_TAB && 'nav-primary']
                    .filter(Boolean)
                    .join(' ') || undefined
                }
                aria-current={tab === id ? 'page' : undefined}
                onClick={() => setTab(id)}
              >
                {label}
              </button>
            ))}
          </div>
        ))}
      </nav>
      <main id="main" tabIndex={-1}>
        <Suspense fallback={<p className="muted loading">Loading workspace…</p>}>
          {(tab === 'codebase' || codebaseMounted) && (
            <div className="codebase-host" hidden={tab !== 'codebase'}>
              <ErrorBoundary>
                <CodebasePanel
                  key={p?.openedAt || 'no-project'}
                  project={p}
                  codebase={codebase}
                  view={codebaseView}
                  setView={setCodebaseView}
                  selectedFile={codebaseFile}
                  setSelectedFile={setCodebaseFile}
                  onOpenFile={openFromCodebase}
                />
              </ErrorBoundary>
            </div>
          )}
          {tab !== 'codebase' && (
            <ErrorBoundary key={tab}>
              {tab === 'dashboard' && (
                <Dashboard
                  p={p}
                  data={dashboardData}
                  open={open}
                  codebase={codebase}
                  onInvestigate={investigate}
                  onOpenFolder={folder}
                  folderSupported={folderSupported}
                  onRefresh={() => {
                    if (!p) return;
                    setDashboardData(null);
                    buildDashboardData(p.files)
                      .then(setDashboardData)
                      .catch(() => {});
                  }}
                />
              )}
              {tab === 'explorer' && (
                <Explorer p={p} q={explorerQ} setQ={setExplorerQ} open={open} />
              )}
              {tab === 'search' && (
                <SearchPanel
                  p={p}
                  q={searchQ}
                  setQ={setSearchQ}
                  options={searchOptions}
                  setOptions={setSearchOptions}
                  indexed={Boolean(codebase.index)}
                  indexing={codebase.indexing}
                  onBuildIndex={codebase.build}
                  search={search}
                  searching={searching}
                  res={res}
                  open={open}
                  searchView={searchView}
                  setSearchView={setSearchView}
                  onEdit={editFromSearch}
                />
              )}
              {tab === 'editor' && (
                <Editor
                  sel={sel}
                  text={text}
                  setText={(x) => {
                    setText(x);
                    setDirty(true);
                  }}
                  dirty={dirty}
                  save={save}
                />
              )}
              {tab === 'mdviewer' && <MDViewer />}
              {tab === 'ingest' && <CodeIngest p={p} />}
              {tab === 'analyze' && <Analyze p={p} onOpenCodebase={() => setTab('codebase')} />}
              {tab === 'transform' && (
                <Transform
                  p={p}
                  state={transformState}
                  setState={setTransformState}
                  onError={setErr}
                />
              )}
              {tab === 'diff' && <Diff p={p} diff={diff} setDiff={setDiff} />}
              {tab === 'tools' && <Tools state={toolState} setState={setToolState} />}
              {tab === 'ofs' && <OFSWorkspace />}
              {tab === 'engineering' && <EngineeringWorkspace />}
              {tab === 'help' && <HelpPage />}
            </ErrorBoundary>
          )}
        </Suspense>
      </main>
      <footer>© {new Date().getFullYear()} RepoMind · Zain Kamali</footer>
      <Toaster />
    </>
  );
}

export default App;
