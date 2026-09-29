import { useEffect, useState } from 'react';
import {
  fetchGithubBranches, fetchGithubCommit, fetchGithubCommits, fetchGithubIssues,
  fetchGithubPullRequestFiles, fetchGithubPullRequests, fetchGithubReleases,
  fetchGithubRepository, githubFileImpact,
} from '../../services/githubIntelligence';

const LABELS = { branches: 'Branches', commits: 'Commits', pulls: 'Pull Requests', issues: 'Issues', releases: 'Releases' };
const LOADERS = { branches: fetchGithubBranches, commits: fetchGithubCommits, pulls: fetchGithubPullRequests, issues: fetchGithubIssues, releases: fetchGithubReleases };
const date = (v) => (v ? new Date(v).toLocaleString() : '');
const Link = ({ href, children }) => <a href={href} target='_blank' rel='noreferrer'>{children}</a>;

function LoadState({ loading, error, empty, children }) {
  if (loading) return <p className='muted'>Loading…</p>;
  if (error) return <div className='error'>{error}</div>;
  if (empty) return <p className='muted'>No items found.</p>;
  return children;
}
function Pager({ page, setPage, hasNext, children }) {
  return <><>{children}</><div className='transform-toolbar'><button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>← Previous</button><span className='muted'>Page {page}</span><button onClick={() => setPage((p) => p + 1)} disabled={!hasNext}>Next →</button></div></>;
}
function useResource(loader, source) {
  const [page, setPage] = useState(1); const [items, setItems] = useState([]); const [state, setState] = useState({ loading: true });
  useEffect(() => { let active = true; setState({ loading: true }); loader(source, page).then((data) => { if (active) { setItems(data); setState({ loading: false }); } }).catch((e) => active && setState({ loading: false, error: e.message })); return () => { active = false; }; }, [loader, source, page]);
  return { page, setPage, items, state };
}

function Repository({ repo, source }) {
  return <div className='analyze-grid'>
    <div className='analytics-panel'><h2>{repo.full_name || source.owner + '/' + source.repo}</h2><p>{repo.description || 'No repository description.'}</p>
      <div className='git-stat-grid'><article><b>{repo.stargazers_count || 0}</b><span>Stars</span></article><article><b>{repo.forks_count || 0}</b><span>Forks</span></article><article><b>{repo.open_issues_count || 0}</b><span>Open issues</span></article><article><b>{repo.watchers_count || 0}</b><span>Watchers</span></article></div>
      <div className='index-row'><b>Default branch</b><span>{repo.default_branch || source.branch}</span><small>{repo.language || 'Unknown language'}</small></div>
      <div className='index-row'><b>License</b><span>{repo.license?.name || 'Not specified'}</span><small>{repo.visibility || 'public'}</small></div>
      <div className='index-row'><b>Last pushed</b><span>{date(repo.pushed_at)}</span><small>{repo.size ? repo.size + ' KB' : ''}</small></div>
      <p className='muted'>Imported revision: <code>{source.branch}</code> @ <code>{source.commit?.slice(0, 12)}</code></p><Link href={repo.html_url}>Open repository on GitHub ↗</Link>
    </div>
    <div className='analytics-panel'><h2>Repository metadata</h2><div className='index-row'><b>Topics</b><span>{(repo.topics || []).join(' · ') || 'None'}</span></div><div className='index-row'><b>Homepage</b><span>{repo.homepage || '—'}</span></div><div className='index-row'><b>Created</b><span>{date(repo.created_at)}</span></div><div className='index-row'><b>Archived</b><span>{repo.archived ? 'Yes' : 'No'}</span></div></div>
  </div>;
}

function ListView({ kind, source, onImpact }) {
  const loaders = { branches: fetchGithubBranches, commits: fetchGithubCommits, pulls: fetchGithubPullRequests, issues: fetchGithubIssues, releases: fetchGithubReleases };
  const loader = loaders[kind]; const { page, setPage, items, state } = useResource(loader, source);
  return <LoadState {...state} empty={!items.length}><Pager page={page} setPage={setPage} hasNext={items.length === 30}>
    {items.map((item) => {
      if (kind === 'branches') return <div className='index-row' key={item.name}><b>{item.name}</b><span>{item.commit?.sha?.slice(0, 12)}</span><small>{item.protected ? 'protected' : 'unprotected'}</small></div>;
      if (kind === 'commits') return <div className='git-activity' key={item.sha}><code>{item.sha.slice(0, 10)}</code><span>{item.commit?.message?.split(/\r?\n/)[0]}</span><small>{item.commit?.author?.name} · {date(item.commit?.author?.date)}</small><Link href={item.html_url}>GitHub ↗</Link><button onClick={() => onImpact({ type: 'commit', id: item.sha, title: 'Commit ' + item.sha.slice(0, 10) + ' · ' + (item.commit?.message?.split(/\r?\n/)[0] || '') })}>Impact</button></div>;
      if (kind === 'pulls') return <div className='git-activity' key={item.id}><b>#{item.number}</b><span>{item.title}</span><small>{item.state} · updated {date(item.updated_at)}</small><Link href={item.html_url}>GitHub ↗</Link><button onClick={() => onImpact({ type: 'pull', id: item.number, title: 'PR #' + item.number + ' · ' + item.title })}>Impact</button></div>;
      if (kind === 'issues') return <div className='git-activity' key={item.id}><b>#{item.number}</b><span>{item.title}</span><small>{item.state} · updated {date(item.updated_at)}</small><Link href={item.html_url}>GitHub ↗</Link></div>;
      return <div className='git-activity' key={item.id}><b>{item.tag_name}</b><span>{item.name || 'Untitled release'}</span><small>{item.draft ? 'draft' : item.prerelease ? 'pre-release' : 'published'} · {date(item.published_at || item.created_at)}</small><Link href={item.html_url}>GitHub ↗</Link></div>;
    })}
  </Pager></LoadState>;
}

function Impact({ source, index, selected }) {
  const [state, setState] = useState(null); const [loading, setLoading] = useState(false);
  if (!selected) return <div className='analytics-panel'><h2>GitHub Change Impact</h2><p className='muted'>Select Impact on a commit or pull request.</p></div>;
  async function analyse() {
    setLoading(true); setState(null);
    try {
      const files = selected.type === 'commit' ? ((await fetchGithubCommit(source, selected.id)).files || []) : await fetchGithubPullRequestFiles(source, selected.id);
      setState(githubFileImpact(index, files));
    } catch (e) { setState({ error: e?.message || 'Unable to read changed files.' }); } finally { setLoading(false); }
  }
  return <div className='analytics-panel'><h2>GitHub Change Impact</h2><p className='muted'>{selected.title}</p><button className='primary' onClick={analyse} disabled={loading}>{loading ? '⏳ Analysing…' : '▶ Analyse change impact'}</button>
    {state?.error && <div className='error'>{state.error}</div>}
    {state && !state.error && <><div className='impact-counts'><span><b>{state.counts.files}</b> changed files</span><span><b>{state.counts.direct}</b> direct dependents</span><span><b>{state.counts.transitive}</b> transitive dependents</span></div><h3>Changed files</h3>{state.files.map((f) => <div className='index-row' key={f.path}><b>{f.path}</b><span>{f.status}</span><small>+{f.additions} −{f.deletions}</small></div>)}<h3>Affected files</h3>{state.affected.map((f) => <div className='index-row' key={f.path}><b>{f.path}</b><span>level {f.depth}</span><small>via {f.via}</small></div>)}{!state.affected.length && <p className='muted'>No dependent files were found in the current index.</p>}{state.blindSpots.map((s) => <p className='coverage-note' key={s.kind}>{s.message}</p>)}</>}
  </div>;
}

export function GitHubView({ project, index }) {
  const source = project.source; const [view, setView] = useState('repository'); const [repo, setRepo] = useState(project.github || null); const [repoState, setRepoState] = useState({ loading: !repo }); const [selected, setSelected] = useState(null);
  useEffect(() => { let active = true; fetchGithubRepository(source).then((data) => active && (setRepo(data), setRepoState({ loading: false }))).catch((e) => active && setRepoState({ loading: false, error: e.message })); return () => { active = false; }; }, [source]);
  const tabs = ['repository', 'branches', 'commits', 'pulls', 'issues', 'releases', 'impact'];
  return <div className='git-workspace'><div className='analytics-panel'><div className='transform-toolbar'><b>🐙 GitHub Intelligence</b><span className='muted'>{source.owner}/{source.repo} · {source.branch}</span></div><div className='tabs'>{tabs.map((key) => <button key={key} className={view === key ? 'active' : ''} onClick={() => setView(key)}>{key === 'repository' ? 'Repository' : LABELS[key] || 'Change Impact'}</button>)}</div></div>
    {view === 'repository' && <LoadState {...repoState} empty={!repo}><Repository repo={repo} source={source} /></LoadState>}
    {view !== 'repository' && view !== 'impact' && <div className='analytics-panel'><h2>{LABELS[view]}</h2><ListView kind={view} source={source} onImpact={(item) => { setSelected(item); setView('impact'); }} /></div>}
    {view === 'impact' && <Impact source={source} index={index} selected={selected} />}
  </div>;
}
