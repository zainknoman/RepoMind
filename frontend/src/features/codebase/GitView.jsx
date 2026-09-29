import { useState } from 'react';
import { commitChanges, workingTreeChanges } from '../../services/gitChanges';
import { changeImpact, changeImpactMarkdown } from '../../services/changeImpact';
import { changeBriefing, changeFiles, changeTask } from '../../services/aiInvestigation';
import { cp, dl } from '../../lib/text';
import { GitHubView } from './GitHubView';

const ROW_LIMIT = 200;

// What uncommitted work or one commit could affect: changed symbols, affected code with
// confidence, broken references and blind spots. Everything is read locally from .git.
function ChangeImpact({ state, onOpenFile, projectName, onExplain }) {
  if (!state) return null;
  if (state.loading)
    return (
      <div className="analytics-panel">
        <h2>Change Impact</h2>
        <p className="muted">Reading {state.title.toLowerCase()}…</p>
      </div>
    );
  if (state.error)
    return (
      <div className="analytics-panel">
        <h2>Change Impact</h2>
        <p className="coverage-note">{state.error}</p>
      </div>
    );
  const { result, title, markdown } = state;
  const { counts } = result;
  const fileName = `${projectName || 'repository'}-change-impact.md`;
  return (
    <div className="analytics-panel change-impact">
      <div className="transform-toolbar">
        <b>Change Impact · {title}</b>
        <button onClick={() => cp(markdown, 'Change impact report copied')}>Copy report</button>
        <button onClick={() => dl(fileName, markdown, 'text/markdown')}>Download</button>
        {onExplain && (
          <button
            className="primary"
            title="Builds an AI prompt from this analysis and the diff; nothing is sent until you ask"
            onClick={() =>
              onExplain({
                title,
                task: changeTask(title),
                files: changeFiles(result),
                sections: (budget) =>
                  changeBriefing(result, state.changes, title, {
                    reportTokens: Math.round(budget * 0.1),
                    maxTokens: Math.round(budget * 0.25),
                  }),
              })
            }
          >
            🤖 Explain this change with AI
          </button>
        )}
      </div>
      <p className="muted">
        Traced through the current index. {state.note || ''}
        {state.truncated ? ' Only the first 500 changed files were read.' : ''}
      </p>
      <div className="impact-counts">
        {[
          ['changed files', counts.files],
          ['changed symbols', counts.symbols],
          ['affected', counts.affected],
          ['high', counts.high],
          ['medium', counts.medium],
          ['low', counts.low],
          ['broken', counts.broken],
        ].map(([label, value]) => (
          <span key={label}>
            <b>{value}</b> {label}
          </span>
        ))}
      </div>
      <div className="analyze-grid">
        <div>
          <h3>Changed</h3>
          {!result.files.length && !result.skipped.length && !result.nonCode.length && (
            <p className="muted">No changes.</p>
          )}
          {result.files.map((f) => (
            <div className="changed-file" key={f.path}>
              <button className="mini-row clickable" onClick={() => onOpenFile(f.path)}>
                {f.path} <small>({f.status})</small>
              </button>
              {f.symbols.map((s) => (
                <div className="changed-symbol" key={`${s.kind}|${s.parent}|${s.name}`}>
                  <code>{s.name}</code> <small>{s.kind}</small>
                  <span className={'change-tag change-' + s.change}>{s.change}</span>
                </div>
              ))}
              {f.moduleLevel && <div className="changed-symbol muted">module-level code</div>}
            </div>
          ))}
          {[...result.skipped, ...result.nonCode].map((c) => (
            <div className="mini-row muted" key={c.path}>
              {c.path} <small>({c.status}, not analysed)</small>
            </div>
          ))}
        </div>
        <div>
          <h3>Affected</h3>
          {result.affected.slice(0, ROW_LIMIT).map((a) => (
            <button
              className="impact-row clickable"
              key={a.key || 'file:' + a.path}
              onClick={() => onOpenFile(a.path)}
              title={`Because of: ${a.because.join(', ')}`}
            >
              <b>{a.name || '(module)'}</b>
              <span>{a.path}</span>
              <small>level {a.depth}</small>
              <span className={'confidence conf-' + a.confidence}>{a.confidence}</span>
            </button>
          ))}
          {!result.affected.length && (
            <p className="muted">Nothing in the index depends on the changed code.</p>
          )}
          {result.affected.length > ROW_LIMIT && (
            <p className="muted">
              Showing {ROW_LIMIT} of {result.affected.length}; the report lists all.
            </p>
          )}
          {!!result.broken.length && (
            <>
              <h3>Broken references</h3>
              {result.broken.map((b, i) => (
                <button className="mini-row clickable" key={i} onClick={() => onOpenFile(b.path)}>
                  {b.path}:{b.line} — {b.reason}
                </button>
              ))}
            </>
          )}
          {!!result.blindSpots.length && (
            <>
              <h3>Blind spots</h3>
              {result.blindSpots.map((spot) => (
                <p className="coverage-note" key={spot.kind}>
                  {spot.message}
                </p>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function GitView({ git, busy, onRefresh, onSelect, project, index, onOpenFile, onExplain }) {
  const [impact, setImpact] = useState(null);
  if (project?.source?.type === 'github') return <GitHubView project={project} index={index} />;

  async function analyse(title, load, note) {
    setImpact({ title, loading: true });
    try {
      const changes = await load();
      if (!changes.available) throw new Error('No .git directory found.');
      if (changes.error) throw new Error(changes.error);
      const result = changeImpact(index, changes.changes);
      setImpact({
        title,
        note,
        result,
        changes: changes.changes,
        truncated: changes.truncated,
        markdown: changeImpactMarkdown(result, title),
      });
    } catch (e) {
      setImpact({ title, error: e?.message || 'Could not read the changes.' });
    }
  }
  const uncommitted = () =>
    analyse(
      'Uncommitted changes',
      () => workingTreeChanges(project.rootHandle, project.files),
      'Rebuild the index after editing so it matches the files on disk.',
    );
  const commit = (entry) =>
    analyse(
      `Commit ${entry.hash.slice(0, 10)}`,
      () => commitChanges(project.rootHandle, entry.hash),
      'Symbols changed by an older commit are traced through today’s code.',
    );

  if (!git?.available)
    return (
      <div className="analytics-panel">
        <div className="transform-toolbar">
          <b>🌿 Git Intelligence</b>
          <button onClick={onRefresh} disabled={busy}>
            {busy ? '⏳' : '↻ Refresh'}
          </button>
        </div>
        <p className="muted">
          {git?.error ||
            'No .git directory detected. Git intelligence stays local and never indexes .git contents.'}
        </p>
      </div>
    );
  const s = git.status || {};
  return (
    <div className="git-workspace">
      <div className="analyze-grid">
        <div className="analytics-panel">
          <div className="transform-toolbar">
            <b>🌿 Repository</b>
            <button onClick={onRefresh} disabled={busy}>
              {busy ? '⏳ Refreshing...' : '↻ Refresh'}
            </button>
          </div>
          <div className="index-row">
            <b>Branch</b>
            <span>{git.branch || 'Detached HEAD'}</span>
            <small>{git.head?.slice(0, 12)}</small>
          </div>
          <div className="index-row">
            <b>Remote</b>
            <span>{git.remote || 'Local only'}</span>
            <small>metadata only</small>
          </div>
          <div className="git-stat-grid">
            <article>
              <b>{s.modified?.length || 0}</b>
              <span>Modified</span>
            </article>
            <article>
              <b>{s.untracked?.length || 0}</b>
              <span>Untracked</span>
            </article>
            <article>
              <b>{s.deleted?.length || 0}</b>
              <span>Deleted</span>
            </article>
            <article>
              <b>{git.activity?.length || 0}</b>
              <span>Activity</span>
            </article>
          </div>
          <button className="primary" onClick={uncommitted} disabled={impact?.loading}>
            Impact of uncommitted changes
          </button>
        </div>
        <div className="analytics-panel">
          <h2>Working Tree</h2>
          {[
            ['Modified', s.modified],
            ['Untracked', s.untracked],
            ['Deleted', s.deleted],
          ].map(([label, items]) => (
            <div key={label}>
              <h3>
                {label} ({items?.length || 0})
              </h3>
              {(items || []).slice(0, 30).map((x) => (
                <button className="mini-row clickable" key={x} onClick={() => onSelect?.(x)}>
                  {x}
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
      <ChangeImpact
        state={impact}
        onOpenFile={onOpenFile}
        projectName={project?.name}
        onExplain={onExplain}
      />
      <div className="analytics-panel">
        <h2>Recent Git Activity</h2>
        <p className="muted">
          From the local reflog. Impact reads that commit from .git on this device; nothing is
          uploaded.
        </p>
        {(git.activity || []).slice(0, 20).map((x, i) => (
          <div className="git-activity" key={i}>
            <code>{x.hash?.slice(0, 10)}</code>
            <span>{x.message || x.action}</span>
            <small>{x.date ? new Date(x.date).toLocaleString() : ''}</small>
            {/^[0-9a-f]{40}$/.test(x.hash || '') && (
              <button onClick={() => commit(x)} disabled={impact?.loading}>
                Impact
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
