import { useMemo, useState } from 'react';
import { AI_PROVIDERS, saveAISettings } from '../../services/ai';
import { TOKEN_BUDGETS, exportablePrompt } from '../../services/aiContext';
import { MAX_SAVED_CONTEXTS } from '../../services/savedContexts';
import { cp, dl } from '../../lib/text';
import { toast } from '../../lib/toast';

const tokens = (n) => '~' + (n || 0).toLocaleString() + ' tokens';

function ContextOptions({ ai, analyzersRun }) {
  const { options, setOption } = ai;
  const check = (key, label, note) => (
    <label className="context-option">
      <input
        type="checkbox"
        checked={!!options[key]}
        onChange={(e) => setOption(key, e.target.checked)}
      />{' '}
      {label}
      {note && <small className="muted"> {note}</small>}
    </label>
  );
  return (
    <div className="context-options">
      <label className="context-option">
        Token budget
        <select
          value={options.budget}
          onChange={(e) => setOption('budget', Number(e.target.value))}
        >
          {TOKEN_BUDGETS.map((b) => (
            <option key={b} value={b}>
              {b.toLocaleString()}
            </option>
          ))}
        </select>
      </label>
      {check('includeDependencies', 'Include direct dependencies')}
      {check('includeDependents', 'Include direct importers')}
      {check('repoMap', 'Repository map')}
      {check(
        'findings',
        'Analyzer findings',
        analyzersRun ? `(${analyzersRun} run)` : '(run analyzers first)',
      )}
    </div>
  );
}

/** What went into a context: included files (with why), truncations, omissions, redactions. */
function ContextSummary({ context }) {
  if (!context) return null;
  return (
    <div className="context-summary">
      <p className="muted">
        {context.files.length} file{context.files.length === 1 ? '' : 's'} ·{' '}
        {tokens(context.tokens)} of {context.budget.toLocaleString()}
        {context.redactions > 0 &&
          ` · ${context.redactions} line${context.redactions === 1 ? '' : 's'} with likely secrets masked`}
      </p>
      {context.files.map((f) => (
        <div className="index-row context-file" key={f.path}>
          <b title={f.path}>{f.path}</b>
          <span>{f.truncated ? `lines 1–${f.shownLines} of ${f.lines}` : `${f.lines} lines`}</span>
          <small>{f.reason}</small>
        </div>
      ))}
      {context.omitted.length > 0 && (
        <p className="muted">
          Left out (over budget): {context.omitted.map((x) => x.path).join(', ')}
        </p>
      )}
    </div>
  );
}

export function ContextBuilderView({ ai, index, projectName, analyzersRun }) {
  const [query, setQuery] = useState('');
  const files = useMemo(
    () =>
      (index?.files || []).filter(
        (f) => !query || f.path.toLowerCase().includes(query.toLowerCase()),
      ),
    [index, query],
  );
  const { selected, setSelected, context } = ai;
  const toggle = (path) =>
    setSelected((s) => {
      const n = new Set(s);
      n.has(path) ? n.delete(path) : n.add(path);
      return n;
    });
  return (
    <div className="context-builder">
      <div className="panel">
        <div className="transform-toolbar">
          <b>AI Context Builder</b>
          <span className="muted">{selected.size} selected</span>
          <button onClick={() => setSelected(new Set(index.files.map((f) => f.path)))}>
            ☑ Select All
          </button>
          <button onClick={() => setSelected(new Set())}>☐ Clear</button>
        </div>
        <div className="search">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter files"
          />
          <button onClick={() => setQuery('')}>✕ Clear</button>
        </div>
        <div className="file-checks">
          {files.map((f) => (
            <label key={f.path}>
              <input
                type="checkbox"
                checked={selected.has(f.path)}
                onChange={() => toggle(f.path)}
              />
              {f.path}
            </label>
          ))}
        </div>
        <ContextOptions ai={ai} analyzersRun={analyzersRun} />
        <div className="tool-run-strip">
          <button onClick={ai.generateContext} disabled={!selected.size || ai.busy}>
            {ai.busy ? '⏳ Generating...' : '▶ Generate Context'}
          </button>
          <button
            onClick={() => cp(context?.content, 'Context copied to clipboard')}
            disabled={!context}
          >
            📋 Copy
          </button>
          <button
            onClick={() =>
              dl((projectName || 'repository') + '-context.md', context.content, 'text/markdown')
            }
            disabled={!context}
          >
            ⬇ Download
          </button>
          <SaveContext ai={ai} />
        </div>
        {ai.error && <div className="error">{ai.error}</div>}
      </div>
      <div className="panel">
        <div className="transform-toolbar">
          <b>Generated Context</b>
          <span>
            {context ? tokens(context.tokens) + ' · ' + context.files.length + ' files' : ''}
          </span>
        </div>
        <ContextSummary context={context} />
        <textarea className="context-output" value={context?.content || ''} readOnly />
      </div>
    </div>
  );
}

function SaveContext({ ai }) {
  const [name, setName] = useState('');
  return (
    <>
      <input
        className="context-name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Snapshot name"
      />
      <button
        onClick={() => {
          if (ai.save(name)) setName('');
        }}
        disabled={!ai.context}
        title="Saves the file list and options, not the source"
      >
        💾 Save Snapshot
      </button>
    </>
  );
}

const CITATION_LABELS = {
  verified: 'verified',
  'outside-context': 'not in the context sent',
  'bad-line': 'line past end of file',
  'unknown-file': 'no such file',
};

function GroundingCheck({ grounding, onOpenFile }) {
  if (!grounding) return null;
  const { citations, counts } = grounding;
  const problems = citations.filter((c) => c.status !== 'verified');
  return (
    <div className="grounding-check">
      <div className="transform-toolbar">
        <b>Grounding check</b>
        <span className="muted">
          {citations.length
            ? `${counts.verified} of ${citations.length} file references verified`
            : 'The answer cites no files — treat it as unverified.'}
        </span>
      </div>
      {citations.map((c) => (
        <div className={'index-row citation ' + c.status} key={c.text}>
          {c.status === 'unknown-file' ? (
            <b>{c.text}</b>
          ) : (
            <b>
              <button className="link-button" onClick={() => onOpenFile?.(c.path, c.line)}>
                {c.text}
              </button>
            </b>
          )}
          <span>{c.status === 'verified' ? '✓' : '⚠'}</span>
          <small>{CITATION_LABELS[c.status]}</small>
        </div>
      ))}
      {problems.length > 0 && (
        <p className="muted">
          Check flagged references before relying on them: the model may have guessed.
        </p>
      )}
    </div>
  );
}

function AISettings({ ai, onClose }) {
  const { aiSettings, setAiSettings } = ai;
  const provider = AI_PROVIDERS[aiSettings.provider || 'openai'];
  return (
    <div className="ai-settings">
      <label>
        Provider
        <select
          value={aiSettings.provider || 'openai'}
          onChange={(e) => setAiSettings({ ...aiSettings, provider: e.target.value, model: '' })}
        >
          {Object.entries(AI_PROVIDERS).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Model
        <input
          value={aiSettings.model || ''}
          onChange={(e) => setAiSettings({ ...aiSettings, model: e.target.value })}
          placeholder={provider?.modelHint}
        />
      </label>
      <label>
        Endpoint
        <input
          value={aiSettings.endpoint || ''}
          onChange={(e) => setAiSettings({ ...aiSettings, endpoint: e.target.value })}
          placeholder={provider?.endpoint}
        />
      </label>
      <label>
        API Key
        <input
          type="password"
          value={aiSettings.apiKey || ''}
          onChange={(e) => setAiSettings({ ...aiSettings, apiKey: e.target.value })}
          placeholder="Stored only in this browser"
        />
      </label>
      <div className="tool-run-strip">
        <button
          onClick={() => {
            try {
              setAiSettings(saveAISettings(aiSettings));
              toast.success('AI settings saved');
              onClose();
            } catch (e) {
              toast.error('Unable to save AI settings: ' + e.message);
            }
          }}
        >
          💾 Save Settings
        </button>
        <span className="muted">
          Direct browser calls require provider CORS support. Never use a shared/public browser
          profile for secrets.
        </span>
      </div>
    </div>
  );
}

export function AIWorkspace({ ai, projectName, analyzersRun, onOpenFile }) {
  const [showSettings, setShowSettings] = useState(false);
  const { context, prompt } = ai;
  return (
    <div className="ai-workspace">
      <div className="analyze-grid">
        <div className="analytics-panel">
          <div className="transform-toolbar">
            <b>🤖 Ask RepoMind</b>
            <span className="muted">Provider-neutral</span>
          </div>
          <p className="muted">
            Ask a question about the code. RepoMind picks the relevant files from the index, adds a
            repository map and analyzer findings, masks likely secrets, and asks the model to cite
            file:line for every claim. You can copy the prompt instead of calling a provider.
          </p>
          <textarea
            className="ai-task"
            value={ai.task}
            onChange={(e) => ai.setTask(e.target.value)}
            placeholder="What do you want to understand or change?"
          />
          <div className="context-source" role="radiogroup" aria-label="Context files">
            <label className="context-option">
              <input
                type="radio"
                checked={ai.source === 'question'}
                onChange={() => ai.setSource('question')}
              />{' '}
              Files relevant to the question
            </label>
            <label className="context-option">
              <input
                type="radio"
                checked={ai.source === 'selection'}
                onChange={() => ai.setSource('selection')}
              />{' '}
              Context Builder selection ({ai.selected.size} files)
            </label>
            {ai.investigation && (
              <label className="context-option">
                <input
                  type="radio"
                  checked={ai.source === 'investigation'}
                  onChange={() => ai.setSource('investigation')}
                />{' '}
                Investigation: {ai.investigation.title} ({ai.investigation.files.length} files and
                RepoMind&apos;s analysis)
              </label>
            )}
          </div>
          <ContextOptions ai={ai} analyzersRun={analyzersRun} />
          <div className="tool-run-strip">
            <button onClick={ai.buildPrompt} disabled={ai.busy}>
              {ai.busy ? '⏳ Building…' : '▶ Build Prompt'}
            </button>
            <button onClick={ai.ask} disabled={ai.aiBusy || ai.busy}>
              {ai.aiBusy ? '⏳ Asking...' : '🤖 Ask AI'}
            </button>
            <button onClick={() => setShowSettings(!showSettings)}>⚙ AI Settings</button>
            <button
              onClick={() => cp(exportablePrompt(prompt), 'Prompt copied to clipboard')}
              disabled={!prompt}
            >
              📋 Copy Prompt
            </button>
            <button
              onClick={() =>
                dl(
                  (projectName || 'repository') + '-ai-prompt.md',
                  exportablePrompt(prompt),
                  'text/markdown',
                )
              }
              disabled={!prompt}
            >
              ⬇ Export
            </button>
          </div>
          {ai.error && <div className="error">{ai.error}</div>}
          {ai.notice && <p className="muted">{ai.notice}</p>}
          {showSettings && <AISettings ai={ai} onClose={() => setShowSettings(false)} />}
        </div>
        <div className="analytics-panel">
          <h2>Context</h2>
          {context ? (
            <ContextSummary context={context} />
          ) : (
            <p className="muted">Build the prompt to see which files are included and why.</p>
          )}
        </div>
      </div>
      <div className="analytics-panel">
        <div className="transform-toolbar">
          <b>Generated Prompt</b>
          <span className="muted">{prompt ? tokens(Math.ceil(prompt.length / 4)) : ''}</span>
        </div>
        <textarea
          className="ai-output"
          value={prompt}
          onChange={(e) => ai.setPrompt(e.target.value)}
          placeholder="Build a prompt to create an AI-ready task context."
        />
        <h3>AI Response</h3>
        <textarea
          className="ai-response"
          value={ai.answer}
          readOnly
          placeholder="Ask AI to analyze the current context."
        />
        <GroundingCheck grounding={ai.grounding} onOpenFile={onOpenFile} />
        <div className="transform-toolbar">
          <SaveContext ai={ai} />
        </div>
      </div>
      <SavedContexts ai={ai} />
    </div>
  );
}

function SavedContexts({ ai }) {
  return (
    <div className="analytics-panel">
      <div className="transform-toolbar">
        <b>Saved Contexts</b>
        <span>
          {ai.saved.length}/{MAX_SAVED_CONTEXTS}
        </span>
      </div>
      <p className="muted">
        A saved context keeps the question, file list and options — not the source. Loading it
        rebuilds the context from the files as they are now.
      </p>
      {ai.saved.map((item) => (
        <div className="saved-context" key={item.id}>
          <div>
            <b>{item.name}</b>
            <small>
              {item.legacy
                ? 'Saved by an older version with the source inside; the source was removed from browser storage.'
                : `${item.repository ? item.repository + ' · ' : ''}${item.paths.length} files · ${tokens(item.tokens)} · ${new Date(item.createdAt).toLocaleString()}`}
            </small>
          </div>
          <div>
            <button onClick={() => ai.load(item)} disabled={item.legacy || ai.busy}>
              Load
            </button>
            <button onClick={() => ai.remove(item.id)}>Delete</button>
          </div>
        </div>
      ))}
      {!ai.saved.length && <p className="muted">No saved contexts yet.</p>}
    </div>
  );
}
