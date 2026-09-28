import { IndexProgress, indexSourceLabel } from '../codebase/IndexProgress';

// Open Repository → Index → Understand → Investigate → Analyze → Report / AI.
// The last four steps open the matching Codebase view once an index exists.
export const WORKFLOW = [
  { id: 'open', title: 'Open', text: 'Select a local repository folder.' },
  { id: 'index', title: 'Index', text: 'Build the local code index. It is cached for next time.' },
  {
    id: 'understand',
    title: 'Understand',
    text: 'Overview, symbols and dependencies.',
    view: 'overview',
  },
  {
    id: 'investigate',
    title: 'Investigate',
    text: 'Trace impact and search code.',
    view: 'impact',
  },
  { id: 'analyze', title: 'Analyze', text: 'Health signals and analyzers.', view: 'health' },
  { id: 'report', title: 'Report / AI', text: 'Reports, context and AI.', view: 'reports' },
];

// Which Codebase view explains each health signal.
const SIGNAL_VIEWS = {
  'unresolved-imports': ['health', 'Health'],
  'unresolved-references': ['analyzers', 'Analyzers'],
  cycles: ['dependencies', 'Dependencies'],
  'parser-errors': ['health', 'Health'],
  'external-imports': ['overview', 'Overview'],
};

const NEXT_STEPS = [
  ['symbols', '🔣 Explore symbols'],
  ['search', '🔎 Search code'],
  ['analyzers', '🧪 Run analyzers'],
  ['diagram', '🗺️ Dependency diagram'],
  ['reports', '📄 Project report'],
  ['context', '🧩 Build AI context'],
];

export function Workflow({ opened, indexed, onStep }) {
  const done = { open: opened, index: indexed };
  const current = WORKFLOW.find((step) => !done[step.id])?.id;
  return (
    <ol className="workflow" aria-label="Investigation workflow">
      {WORKFLOW.map((step, i) => {
        const state = done[step.id] ? 'done' : step.id === current ? 'current' : '';
        const body = (
          <>
            <span className="workflow-num" aria-hidden="true">
              {done[step.id] ? '✓' : i + 1}
            </span>
            <b>{step.title}</b>
            <small>{step.text}</small>
          </>
        );
        return (
          <li
            key={step.id}
            className={state}
            aria-current={state === 'current' ? 'step' : undefined}
          >
            {indexed && step.view ? (
              <button onClick={() => onStep(step.view)}>{body}</button>
            ) : (
              <div>{body}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

export function Investigation({ codebase, onInvestigate }) {
  const { index, indexing, progress, source, error, cycles, health, build, cancel } = codebase;
  return (
    <section className="analytics-panel investigate" aria-labelledby="investigate-title">
      <div className="transform-toolbar">
        <div>
          <h2 id="investigate-title">🔎 Investigate</h2>
          {index ? (
            <small>
              {indexSourceLabel(source, index.stats)} · {index.stats.files.toLocaleString()} files ·{' '}
              {index.stats.symbols.toLocaleString()} symbols ·{' '}
              {index.stats.references.toLocaleString()} references
            </small>
          ) : (
            <small>Index the code to see what needs attention.</small>
          )}
        </div>
        {indexing ? (
          <button onClick={cancel}>✕ Cancel</button>
        ) : index ? (
          <button onClick={build}>↻ Refresh index</button>
        ) : (
          <button className="primary" onClick={build}>
            🚀 Build Project Index
          </button>
        )}
      </div>
      <Workflow opened indexed={!!index} onStep={(view) => onInvestigate(view)} />
      {error && <div className="error">{error}</div>}
      {indexing && <IndexProgress progress={progress} />}
      {!index && !indexing && (
        <p className="muted">
          Building the index parses every readable file locally. Unresolved imports, circular
          dependencies, dependency hotspots and parser errors then appear here, each linked to the
          Codebase view that explains it. Source never leaves this browser.
        </p>
      )}
      {index && health && (
        <>
          <div className="investigate-signals">
            {health.signals.map((signal) => {
              const [view, label] = SIGNAL_VIEWS[signal.id] || ['health', 'Health'];
              return (
                <button
                  key={signal.id}
                  className={'investigate-signal severity-' + signal.severity}
                  onClick={() => onInvestigate(view)}
                  title={signal.detail}
                >
                  <b>{signal.count.toLocaleString()}</b>
                  <span>{signal.label}</span>
                  <small>Open {label} →</small>
                </button>
              );
            })}
          </div>
          <div className="investigate-lists">
            <div>
              <h3>Dependency hotspots</h3>
              {health.hotspots
                .filter((x) => x.score > 0)
                .slice(0, 5)
                .map((x) => (
                  <button
                    className="index-row clickable"
                    key={x.path}
                    onClick={() => onInvestigate('impact', x.path)}
                  >
                    <b>{x.path}</b>
                    <span>
                      {x.dependents} in · {x.dependencies} out
                    </span>
                  </button>
                ))}
              {!health.hotspots.some((x) => x.score > 0) && (
                <p className="muted">No internal dependencies between indexed files.</p>
              )}
            </div>
            <div>
              <h3>Unresolved imports</h3>
              {index.unresolvedImports.slice(0, 5).map((x, i) => (
                <button
                  className="index-row clickable"
                  key={x.from + ':' + x.line + ':' + i}
                  onClick={() => onInvestigate('impact', x.from)}
                >
                  <b>{x.module}</b>
                  <small>
                    {x.from}:{x.line}
                  </small>
                </button>
              ))}
              {!index.unresolvedImports.length && (
                <p className="muted">None. Every relative import resolves to an indexed file.</p>
              )}
            </div>
            <div>
              <h3>Circular dependencies</h3>
              {cycles.slice(0, 3).map((cycle, i) => (
                <button
                  className="index-row clickable"
                  key={i}
                  onClick={() => onInvestigate('dependencies')}
                >
                  <small>{cycle.join(' → ')}</small>
                </button>
              ))}
              {!cycles.length && <p className="muted">None detected.</p>}
            </div>
          </div>
          <div className="investigate-actions">
            <span className="muted">Next:</span>
            {NEXT_STEPS.map(([view, label]) => (
              <button key={view} onClick={() => onInvestigate(view)}>
                {label}
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
